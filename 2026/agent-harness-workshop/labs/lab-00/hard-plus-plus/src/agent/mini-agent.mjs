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
  // TODO(M1): one { type: 'function', function: { name, description, parameters } } per tool.
  return [];
}

/** A tool call's arguments are JSON text the model wrote: { ok: true, value } or { ok: false, error }. */
export function parseArguments(text) {
  // TODO(M2): JSON.parse inside try/catch; only a plain object counts. The error starts with "Invalid arguments:".
  return { ok: false, error: 'Invalid arguments: parseArguments() is not written yet.' };
}

/**
 * The permission gate, with Copilot's rules: a deny rule wins; then every part of the call must be covered by an
 * allow rule; reads need no rule; anything else is denied, because a script has nobody to ask. A deny rule the gate
 * can't read denies every call: a guard that can't understand its rules fails closed.
 */
export function gate(call, { allow = [], deny = [] } = {}) {
  // TODO(M3): call is { name, kind, arguments }. Rules: "shell", "shell(npm test)", "shell(git:*)", "read",
  //           "read(.env)", "write", "write(build)" or a tool's name. Split a shell command on && || ; | and check
  //           every part; read(…) and write(…) match the call's path. Return { allowed, rule, reason }: the rule
  //           that decided (or null), and the reason for a denial (NO_USER when no rule allows it).
  return { allowed: true, rule: null, reason: null };
}

/** The usage checkpoint event's data, in Copilot's shape: the running totals of one model. */
const checkpoint = (model, usage) => ({
  accountingSnapshot: { modelMetrics: { [model]: { requests: { count: usage.requests }, usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens } } } },
});

/**
 * Run the loop until the model answers (stop "done", exit 0), the turns run out ("max-turns") or the tokens reach the
 * budget ("budget"), both exit 1. Returns { stop, turns, answer, usage: { inputTokens, outputTokens }, exitCode }.
 */
export async function runAgent({ prompt, model, tools = TOOLS, files = {}, permissions = {}, maxTurns = DEFAULTS.maxTurns, budget = DEFAULTS.budget, system = SYSTEM, log = () => {} }) {
  const ws = workspace(files);
  const messages = [];
  const usage = { inputTokens: 0, outputTokens: 0, requests: 0 };
  // TODO(M1): the history starts with { role: 'system', content: system } and { role: 'user', content: prompt }.
  //           A turn sends the model the WHOLE history and the tool schemas: model.complete({ messages, tools:
  //           toolSchemas(tools) }) → { message, usage }. Add up the usage, append the message to the history. A
  //           message without tool_calls is the answer: stop "done".
  // TODO(M2): loop. For each of message.tool_calls ({ id, function: { name, arguments } }): parseArguments(), find
  //           the tool, run it (tool.run(args, ws) → { ok, content } or { ok, error }), and append
  //           { role: 'tool', tool_call_id: id, content } to the history (a failure's content is its error).
  // TODO(M3): before running a tool, ask gate({ name, kind, arguments }, permissions); a denial is a result too:
  //           its reason goes back to the model.
  // TODO(M4): stop rules. Before a turn: "max-turns" once maxTurns turns are done. After each model call:
  //           "budget" once inputTokens + outputTokens reach the budget (that reply's tool calls never run).
  // TODO(M5): log every step with log(type, data), in Copilot's format (todo.md lists the events and their data),
  //           and end with log('result', { exitCode, usage: { premiumRequests: 0 } }).
  return { stop: null, turns: 0, answer: '', usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }, exitCode: 1 };
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
