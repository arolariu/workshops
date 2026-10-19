#!/usr/bin/env node
// 🔁 mini-agent: an agent loop in one file. It sends a scripted fake model (agent/fake-model.mjs) the whole
// conversation and the tool schemas every turn, parses the tool calls it writes, asks a permission gate, runs the
// tools (agent/tools.mjs), feeds the results back, and stops when the model answers, after too many turns, or over
// budget. Every step is logged as a JSON event in Copilot's format, so scripts/run-stats.mjs can read the run.
//   node agent/mini-agent.mjs agent/scenarios/tool-call.json [--max-turns N] [--budget N]
//        [--allow-tool RULE]… [--deny-tool RULE]… [--out run.jsonl]
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fakeModel, loadScenario } from './fake-model.mjs';
import { TOOLS, workspace } from './tools.mjs';

export const SYSTEM = 'You are mini-agent, a coding agent for the StudyBuddy project. Use the tools to look before you answer, and answer briefly.';
export const DEFAULTS = { maxTurns: 10, budget: 20000 };
export const NO_USER = 'Permission denied because no interactive user response was available.';

/** The tools as the model sees them: name, description and JSON Schema parameters (never `kind` or `run`). */
export function toolSchemas(tools) {
  return tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
}

/** A tool call's arguments are JSON text the model wrote: { ok: true, value } or { ok: false, error }. */
export function parseArguments(text) {
  let value;
  try { value = JSON.parse(String(text ?? '')); } catch (e) { return { ok: false, error: `Invalid arguments: ${e.message}` }; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, error: 'Invalid arguments: expected a JSON object.' };
  return { ok: true, value };
}

const SPLIT = /\s*(?:&&|\|\||;|\|)\s*/;
/** A rule ("shell", "shell(npm test)", "read(.env)", "write(build)", "view", …) as { head, arg }, or null when it can't be read. */
function parseRule(rule) {
  const m = String(rule ?? '').trim().match(/^([\w-]+)(?:\((.*)\))?$/);
  return m ? { head: m[1], arg: m[2]?.trim() || null } : null;
}
const slash = (p) => String(p ?? '').replace(/\\/g, '/').replace(/^\.\//, '');
/** A path pattern: * matches inside one folder, ** across folders, and a folder covers everything in it. */
function pathMatches(pattern, file) {
  const glob = slash(pattern).replace(/\/$/, '').replace(/[.+^$()|[\]\\{}]/g, '\\$&').replace(/\*\*/g, '\0').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\0/g, '.*');
  return new RegExp(`^${glob}(?:/.*)?$`).test(slash(file));
}
/** Does the parsed rule cover `part` of `call`? Shell rules match commands; read and write rules match the path. */
function covers(rule, call, part) {
  if (rule.head !== call.kind && rule.head !== call.name) return false;
  if (!rule.arg) return true;
  if (call.kind === 'shell') {
    if (rule.arg.endsWith(':*')) return part.split(/\s+/)[0] === rule.arg.slice(0, -2);
    return part === rule.arg || part.startsWith(`${rule.arg} `);
  }
  return typeof call.arguments?.path === 'string' && pathMatches(rule.arg, call.arguments.path);
}

/**
 * The permission gate, with Copilot's rules: a deny rule wins; then every part of the call must be covered by an
 * allow rule; reads need no rule; anything else is denied, because a script has nobody to ask. A deny rule the gate
 * can't read denies every call: a guard that can't understand its rules fails closed.
 */
export function gate(call, { allow = [], deny = [] } = {}) {
  const unreadable = deny.find((rule) => !parseRule(rule));
  if (unreadable !== undefined) return { allowed: false, rule: unreadable, reason: `The deny rule "${unreadable}" can't be read, so every call is denied (fail closed).` };
  const parts = call.kind === 'shell' ? String(call.arguments?.command ?? '').split(SPLIT).map((p) => p.trim()).filter(Boolean) : [''];
  if (!parts.length) parts.push('');
  const denied = deny.find((rule) => parts.some((p) => covers(parseRule(rule), call, p)));
  if (denied) return { allowed: false, rule: denied, reason: `Denied by the rule "${denied}".` };
  const rules = parts.map((p) => allow.find((rule) => { const r = parseRule(rule); return r && covers(r, call, p); }));
  if (rules.every(Boolean)) return { allowed: true, rule: rules[0], reason: null };
  if (call.kind === 'read') return { allowed: true, rule: null, reason: null };
  return { allowed: false, rule: null, reason: NO_USER };
}

const checkpoint = (model, usage) => ({
  accountingSnapshot: { modelMetrics: { [model]: { requests: { count: usage.requests }, usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens } } } },
});

/**
 * Run the loop until the model answers (stop "done", exit 0), the turns run out ("max-turns") or the tokens reach the
 * budget ("budget"), both exit 1. Returns { stop, turns, answer, usage: { inputTokens, outputTokens }, exitCode }.
 */
export async function runAgent({ prompt, model, tools = TOOLS, files = {}, permissions = {}, maxTurns = DEFAULTS.maxTurns, budget = DEFAULTS.budget, system = SYSTEM, log = () => {} }) {
  const ws = workspace(files);
  const schemas = toolSchemas(tools);
  const messages = [{ role: 'system', content: system }, { role: 'user', content: prompt }];
  const usage = { inputTokens: 0, outputTokens: 0, requests: 0 };
  let answer = '';
  let stop = null;
  let turns = 0;
  log('user.message', { content: prompt });
  while (!stop) {
    if (turns >= maxTurns) {
      stop = 'max-turns';
      log('session.error', { errorType: 'max_turns', message: `Stopped after ${turns} turns: the limit is ${maxTurns}.` });
      break;
    }
    const turnId = String(turns++);
    log('assistant.turn_start', { turnId });
    const { message, usage: used } = await model.complete({ messages, tools: schemas });
    usage.inputTokens += used?.inputTokens ?? 0;
    usage.outputTokens += used?.outputTokens ?? 0;
    usage.requests++;
    messages.push(message);
    const calls = (message.tool_calls ?? []).map((c) => ({ id: c.id, name: c.function?.name, args: parseArguments(c.function?.arguments) }));
    if (String(message.content ?? '').trim()) answer = message.content;
    log('assistant.message', {
      content: message.content ?? '',
      toolRequests: calls.map((c) => ({ toolCallId: c.id, name: c.name, arguments: c.args.ok ? c.args.value : {} })),
      model: model.name,
      turnId,
    });
    log('session.usage_checkpoint', checkpoint(model.name, usage));
    if (usage.inputTokens + usage.outputTokens >= budget) {
      stop = 'budget';
      log('assistant.turn_end', { turnId });
      log('session.error', { errorType: 'budget', message: `Stopped: ${usage.inputTokens + usage.outputTokens} tokens used, the budget is ${budget}.` });
      break;
    }
    if (!calls.length) {
      stop = 'done';
      log('assistant.turn_end', { turnId });
      break;
    }
    for (const c of calls) {
      log('tool.execution_start', { toolCallId: c.id, toolName: c.name, arguments: c.args.ok ? c.args.value : {}, turnId });
      const tool = tools.find((t) => t.name === c.name);
      let result;
      if (!c.args.ok) result = { ok: false, code: 'failure', error: c.args.error };
      else if (!tool) result = { ok: false, code: 'failure', error: `There is no tool called ${c.name}.` };
      else {
        const verdict = gate({ name: tool.name, kind: tool.kind, arguments: c.args.value }, permissions);
        if (!verdict.allowed) result = { ok: false, code: 'denied', error: verdict.reason };
        else {
          const r = tool.run(c.args.value, ws);
          result = r.ok ? { ok: true, content: r.content } : { ok: false, code: 'failure', error: r.error };
        }
      }
      log('tool.execution_complete', result.ok
        ? { toolCallId: c.id, success: true, result: { content: result.content }, turnId }
        : { toolCallId: c.id, success: false, error: { message: result.error, code: result.code }, turnId });
      messages.push({ role: 'tool', tool_call_id: c.id, content: result.ok ? result.content : result.error });
    }
    log('assistant.turn_end', { turnId });
  }
  const exitCode = stop === 'done' ? 0 : 1;
  log('result', { exitCode, usage: { premiumRequests: 0 } });
  return { stop, turns, answer, usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }, exitCode };
}

// ---------- plumbing: you don't need to change anything below this line ----------

/** log(type, data) that writes one JSON event per line, like Copilot: { type, data, id, timestamp, parentId }. */
export function emitter(write, sessionId = crypto.randomUUID()) {
  let parentId = null;
  return (type, data = {}) => {
    const timestamp = new Date().toISOString();
    if (type === 'result') return write(`${JSON.stringify({ type, timestamp, sessionId, ...data })}\n`);
    const id = crypto.randomUUID();
    write(`${JSON.stringify({ type, data, id, timestamp, parentId })}\n`);
    parentId = id;
  };
}

// Run as a script, not imported? Compare real paths: a symlink, a junction or a short 8.3 name must still count.
const isMain = (() => {
  try { return Boolean(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isMain) {
  const args = process.argv.slice(2);
  const many = (name) => args.flatMap((a, i) => (a === name && i + 1 < args.length ? [args[i + 1]] : []));
  const one = (name) => many(name).at(-1);
  const file = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
  if (!file) {
    console.error('Usage: node agent/mini-agent.mjs <scenario.json> [--max-turns N] [--budget N] [--allow-tool RULE]… [--deny-tool RULE]… [--out run.jsonl]');
    process.exit(2);
  }
  let scenario;
  try { scenario = loadScenario(file); } catch (e) { console.error(e.message); process.exit(2); }
  const run = scenario.run ?? {};
  const out = one('--out');
  const fd = out ? fs.openSync(out, 'w') : null;
  const write = (s) => (fd === null ? process.stdout.write(s) : fs.writeSync(fd, s));
  const allow = many('--allow-tool');
  const deny = many('--deny-tool');
  const result = await runAgent({
    prompt: scenario.prompt,
    model: fakeModel(scenario),
    tools: TOOLS,
    files: scenario.files ?? {},
    permissions: { allow: allow.length ? allow : run.allow ?? [], deny: deny.length ? deny : run.deny ?? [] },
    maxTurns: Number(one('--max-turns') ?? run.maxTurns ?? DEFAULTS.maxTurns),
    budget: Number(one('--budget') ?? run.budget ?? DEFAULTS.budget),
    log: emitter(write),
  });
  if (fd !== null) fs.closeSync(fd);
  process.exitCode = result?.exitCode ?? 1;
}
