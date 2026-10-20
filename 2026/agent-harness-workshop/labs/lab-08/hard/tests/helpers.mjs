// Helpers for the free checks of Lab 08 · hard: the case schema, run events in the shapes of
// `copilot -p … --output-format json`, the flags of an argument list, and numbers that must be near each other.
import fs from 'node:fs';
import path from 'node:path';

export { scanHarness, present, LAYERS } from '../../../_harness/scorecard.mjs';

/** The `expect` vocabulary and the type of each rule's value. */
export const RULE_TYPES = { tool: 'string', noTool: 'string', skill: 'string', denied: 'boolean', answerMatches: 'string', answerNotMatches: 'string' };
/** Permissions an eval run must never grant. */
export const WRITE_PERMISSION = /^(write|shell|bash|powershell|edit|create)\b|^\*$|^all$/i;
/** The layers a run can exercise (the others are measured by the scorecard, not by a prompt). */
export const RUNTIME_LAYERS = ['instructions', 'skills', 'agents', 'mcp', 'hooks'];

export const casesOf = (cfg) => (Array.isArray(cfg) ? cfg : Array.isArray(cfg?.cases) ? cfg.cases : null);
export const near = (a, b, eps = 1e-6) => typeof a === 'number' && Math.abs(a - b) <= eps;
export const show = (x) => (typeof x === 'number' ? String(Math.round(x * 1e6) / 1e6) : JSON.stringify(x));

/** The problems of one case, as sentences. */
export function caseProblems(c, i, ids, layerIds) {
  const at = `case ${typeof c?.id === 'string' && c.id ? `"${c.id}"` : `#${i + 1}`}`;
  if (!c || typeof c !== 'object' || Array.isArray(c)) return [`${at} is not an object.`];
  const out = [];
  if (typeof c.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(c.id)) out.push(`${at}: the id must be lowercase letters, digits and hyphens (it names the recorded file).`);
  else if (ids.has(c.id)) out.push(`${at}: the id is used twice.`);
  ids.add(c.id);
  if (!layerIds.includes(c.layer)) out.push(`${at}: layer must be one of ${layerIds.join(', ')}.`);
  if (typeof c.prompt !== 'string' || !c.prompt.trim()) out.push(`${at}: the prompt is missing.`);
  if (c.agent !== undefined && (typeof c.agent !== 'string' || !c.agent.trim())) out.push(`${at}: agent must be the name of a custom agent.`);
  if (c.allow !== undefined && (!Array.isArray(c.allow) || c.allow.some((a) => typeof a !== 'string'))) out.push(`${at}: allow must be a list of tool permissions.`);
  else if ((c.allow ?? []).some((a) => WRITE_PERMISSION.test(a))) out.push(`${at}: an eval run is read-only, so allow can't grant ${c.allow.filter((a) => WRITE_PERMISSION.test(a)).join(', ')}.`);
  if (c.credits !== undefined && !(Number.isInteger(c.credits) && c.credits >= 1 && c.credits <= 30)) out.push(`${at}: credits must be a whole number from 1 to 30.`);
  if (!Array.isArray(c.expect) || !c.expect.length) return [...out, `${at}: expect needs at least one rule, like { "answerMatches": "…" }.`];
  for (const rule of c.expect) {
    const keys = rule && typeof rule === 'object' && !Array.isArray(rule) ? Object.keys(rule) : [];
    if (keys.length !== 1 || !(keys[0] in RULE_TYPES)) { out.push(`${at}: ${JSON.stringify(rule)} is not a rule. One key per rule, one of: ${Object.keys(RULE_TYPES).join(', ')}.`); continue; }
    const [key] = keys;
    if (typeof rule[key] !== RULE_TYPES[key] || rule[key] === '') { out.push(`${at}: ${key} needs a ${RULE_TYPES[key]}, got ${JSON.stringify(rule[key])}.`); continue; }
    if (key.startsWith('answer')) { try { new RegExp(rule[key], 'i'); } catch (e) { out.push(`${at}: ${key} is not a valid regular expression: ${e.message}`); } }
  }
  return out;
}

const MODEL = 'gpt-6.1-sol';
let n = 0;
/**
 * The events of one run. tools: [{ name, args, outcome: 'ok' | 'denied' | 'failed' }]; answers: the assistant's
 * messages in order (the last one with text is the answer); finished: false leaves out the result event.
 */
export function runEvents({ prompt = 'A question', tools = [], answers = ['An answer.'], exitCode = 0, finished = true, input = 1000, output = 10 } = {}) {
  const at = () => new Date(Date.UTC(2026, 9, 20, 9, 0, 0) + (n++) * 700).toISOString();
  const ev = [{ type: 'user.message', data: { content: prompt, interactionId: 'i-1' }, timestamp: at() }];
  tools.forEach((t, i) => {
    const id = `call_check${i}`;
    const [server, ...rest] = t.name.split('-');
    ev.push({ type: 'tool.execution_start', data: { toolCallId: id, toolName: t.name, arguments: t.args ?? {}, turnId: String(i), model: MODEL, ...(rest.length ? { mcpServerName: server, mcpToolName: rest.join('-') } : {}) }, timestamp: at() });
    const outcome = t.outcome ?? 'ok';
    ev.push({ type: 'tool.execution_complete', data: { toolCallId: id, model: MODEL, turnId: String(i), success: outcome === 'ok', ...(outcome === 'ok' ? { result: { content: 'done' } } : { error: { message: outcome === 'denied' ? 'Denied by preToolUse hook: blocked.' : 'Something failed.', code: outcome } }) }, timestamp: at() });
  });
  answers.forEach((content, i) => ev.push({ type: 'assistant.message', data: { messageId: `m-${i}`, model: MODEL, content, toolRequests: [], turnId: String(tools.length + i) }, timestamp: at() }));
  ev.push({ type: 'session.usage_checkpoint', data: { totalPremiumRequests: 1, accountingSnapshot: { modelMetrics: { [MODEL]: { requests: { count: 1, cost: 1 }, usage: { inputTokens: input, outputTokens: output, cacheReadTokens: 0 } } } } }, timestamp: at() });
  if (finished) ev.push({ type: 'result', timestamp: at(), sessionId: 's-1', exitCode, usage: { premiumRequests: 1 } });
  return ev;
}

// Accept both "--flag=value" and "--flag", "value" (two array items).
const VALUE_FLAGS = new Set(['-p', '--prompt', '--agent', '--allow-tool', '--deny-tool', '--max-ai-credits', '--output-format', '--model', '--available-tools', '--excluded-tools']);
export const norm = (args) => {
  const out = [];
  const list = Array.isArray(args) ? args.map(String) : [];
  for (let i = 0; i < list.length; i++) {
    if (VALUE_FLAGS.has(list[i]) && i + 1 < list.length) out.push(`${list[i]}=${list[++i]}`);
    else out.push(list[i]);
  }
  return out;
};
export const flag = (args, name) => {
  const hit = norm(args).find((a) => a.startsWith(`${name}=`));
  return hit === undefined ? undefined : hit.slice(name.length + 1);
};
export const flags = (args, name) => norm(args).filter((a) => a.startsWith(`${name}=`)).map((a) => a.slice(name.length + 1));

/** Run the learner's eval.mjs (cwd: their folder unless given) and read a JSON file it wrote. */
export function evalCli(t, args, opts = {}) {
  const r = t.node(['scripts/eval.mjs', ...args], { timeout: 60000, ...opts });
  return { ...r, out: `${r.stdout}\n${r.stderr}`.trim() };
}
export function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}
export const tail = (s, n = 300) => (s.length > n ? `…${s.slice(-n)}` : s);

/** The reference recordings and cases, from this level's reference solution (stable whatever you record). */
export const reference = (t) => ({
  cases: path.join(t.solDir, 'evals', 'cases.json'),
  full: path.join(t.solDir, 'evals', 'runs', 'full'),
  runs: path.join(t.solDir, 'evals', 'runs'),
});
