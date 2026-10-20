// 🎯 One run, scored: what happened in it (facts), whether it did what a case expects (score), and how a case is run
// (evalArgs, plan). The events are the JSON lines of `copilot -p … --output-format json`, the same ones Lab 00's
// run-stats read.

/** The credit cap of one run when a case doesn't set its own `credits`. */
export const CAP = 15;
/** The most one run of a case may be allowed to spend. */
export const MAX_CAP = 30;
/** The layers a case can belong to (the X-ray's layers). */
export const LAYERS = ['instructions', 'skills', 'agents', 'mcp', 'hooks', 'distribution', 'workflows', 'governance'];
/** The rules a case's `expect` can use, and the type of their value. */
export const RULES = {
  tool: 'string', // a call to this tool finished successfully ("studybuddy-get_deadlines", "studybuddy-*")
  noTool: 'string', // no call to this tool was even attempted ("edit", "create")
  skill: 'string', // this skill was loaded ("ects-grades")
  denied: 'boolean', // true: at least one call was denied; false: none was
  answerMatches: 'string', // the final answer matches this regular expression (case-insensitive)
  answerNotMatches: 'string', // ...and doesn't match this one
};
/** Permissions a read-only eval run must never grant. */
export const WRITE_PERMISSION = /^(write|shell|bash|powershell|edit|create)\b|^\*$|^all$/i;

/**
 * Split a recorded file (one or more runs of one case, appended) into runs of parsed events. A run ends with its
 * `result` event; whatever comes after the last one is a run that never finished. Lines that aren't JSON are skipped.
 * @param {string} text
 * @returns {object[][]}
 */
export function splitRuns(text) {
  const runs = [];
  let run = [];
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (!e || typeof e !== 'object' || Array.isArray(e)) continue;
    run.push(e);
    if (e.type === 'result') { runs.push(run); run = []; }
  }
  if (run.length) runs.push(run);
  return runs;
}

/**
 * What happened in one run: the prompt, every tool call (name, arguments, outcome), the skills loaded, how many calls
 * were denied, the final answer (the last assistant message with text), the tokens and whether the run finished.
 * @param {object[]} events
 */
export function facts(events) {
  const f = { prompt: null, tools: [], skills: [], denied: 0, answer: '', tokens: { input: 0, output: 0 }, exitCode: null, complete: false };
  const calls = new Map();
  let usage = null;
  for (const e of events ?? []) {
    const d = e?.data ?? {};
    switch (e?.type) {
      case 'user.message':
        if (f.prompt === null) f.prompt = String(d.content ?? '');
        break;
      case 'tool.execution_start': {
        const call = { name: String(d.toolName ?? ''), args: d.arguments ?? {}, outcome: 'running' };
        calls.set(d.toolCallId, call);
        f.tools.push(call);
        break;
      }
      case 'tool.execution_complete': {
        const call = calls.get(d.toolCallId);
        if (!call || call.outcome !== 'running') break;
        call.outcome = d.success ? 'ok' : d.error?.code === 'denied' ? 'denied' : 'failed';
        if (call.outcome === 'denied') f.denied++;
        if (call.name === 'skill' && call.outcome === 'ok' && call.args?.skill) f.skills.push(String(call.args.skill));
        break;
      }
      case 'assistant.message':
        if (String(d.content ?? '').trim()) f.answer = String(d.content);
        break;
      case 'session.usage_checkpoint':
        usage = d;
        break;
      case 'result':
        f.complete = true;
        f.exitCode = Number.isFinite(Number(e.exitCode)) ? Number(e.exitCode) : null;
        break;
      default:
        break;
    }
  }
  for (const m of Object.values(usage?.accountingSnapshot?.modelMetrics ?? {})) {
    f.tokens.input += Number(m?.usage?.inputTokens) || 0;
    f.tokens.output += Number(m?.usage?.outputTokens) || 0;
  }
  return f;
}

/** Does a tool name match a pattern? `*` matches anything: "studybuddy-*" matches every tool of that server. */
export const toolMatches = (pattern, name) => new RegExp(`^${String(pattern).split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`).test(String(name));

/** The problems of a cases file (an array, or { cases: [...] }), as sentences; [] when it can be run. */
export function checkCases(cfg) {
  const cases = Array.isArray(cfg) ? cfg : cfg?.cases;
  if (!Array.isArray(cases)) return ['evals/cases.json must be an array of cases, or { "cases": [...] }.'];
  const problems = [];
  const seen = new Set();
  cases.forEach((c, i) => {
    const at = `case ${typeof c?.id === 'string' && c.id ? `"${c.id}"` : `#${i + 1}`}`;
    if (!c || typeof c !== 'object') return problems.push(`${at} is not an object.`);
    if (typeof c.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(c.id)) problems.push(`${at}: id must be lowercase letters, digits and hyphens.`);
    else if (seen.has(c.id)) problems.push(`${at}: the id is used twice.`);
    seen.add(c.id);
    if (!LAYERS.includes(c.layer)) problems.push(`${at}: layer must be one of ${LAYERS.join(', ')}.`);
    if (typeof c.prompt !== 'string' || !c.prompt.trim()) problems.push(`${at}: prompt is missing.`);
    if (c.agent !== undefined && (typeof c.agent !== 'string' || !c.agent.trim())) problems.push(`${at}: agent must be a name.`);
    if (c.allow !== undefined && (!Array.isArray(c.allow) || c.allow.some((a) => typeof a !== 'string' || WRITE_PERMISSION.test(a)))) problems.push(`${at}: allow is a list of read-only tools (never write or shell).`);
    if (c.credits !== undefined && !(Number.isInteger(c.credits) && c.credits >= 1 && c.credits <= MAX_CAP)) problems.push(`${at}: credits must be a whole number from 1 to ${MAX_CAP}.`);
    if (!Array.isArray(c.expect) || !c.expect.length) return problems.push(`${at}: expect needs at least one rule.`);
    for (const rule of c.expect) {
      const keys = rule && typeof rule === 'object' ? Object.keys(rule) : [];
      if (keys.length !== 1 || !(keys[0] in RULES)) { problems.push(`${at}: ${JSON.stringify(rule)} is not a rule (one of ${Object.keys(RULES).join(', ')}).`); continue; }
      const value = rule[keys[0]];
      if (typeof value !== RULES[keys[0]] || value === '') { problems.push(`${at}: ${keys[0]} needs a ${RULES[keys[0]]}.`); continue; }
      if (/^answer/.test(keys[0])) { try { new RegExp(value, 'i'); } catch (e) { problems.push(`${at}: ${keys[0]} is not a valid regular expression (${e.message}).`); } }
    }
  });
  return problems;
}

const RULE_CHECKS = {
  tool: (f, name) => f.tools.some((t) => t.outcome === 'ok' && toolMatches(name, t.name)),
  noTool: (f, name) => !f.tools.some((t) => toolMatches(name, t.name)),
  skill: (f, name) => f.skills.includes(name),
  denied: (f, want) => (f.denied > 0) === want,
  answerMatches: (f, re) => new RegExp(re, 'i').test(f.answer),
  answerNotMatches: (f, re) => !new RegExp(re, 'i').test(f.answer),
};

/**
 * Score one run against a case's `expect` rules. A run passes when it finished (a `result` event with exit code 0)
 * and every rule holds.
 * @param {object[]} events - the run's events
 * @param {object[]} expect - e.g. [{ "skill": "ects-grades" }, { "answerMatches": "8\\.75 \\(B\\)" }]
 * @returns {{ pass: boolean, failed: string[] }} failed: what didn't hold, one entry per rule
 */
export function score(events, expect) {
  const f = facts(events);
  const failed = [];
  if (!f.complete || f.exitCode !== 0) failed.push('the run finished (a result event, exit code 0)');
  for (const rule of expect ?? []) {
    const [key, value] = Object.entries(rule ?? {})[0] ?? [];
    const check = RULE_CHECKS[key];
    if (!check || !check(f, value)) failed.push(JSON.stringify(rule));
  }
  return { pass: failed.length === 0, failed };
}

/**
 * The arguments of one eval run: prompt mode, quiet, JSON events, never waits for a human, capped, and read-only
 * (no file writes, no shell), plus the case's custom agent and the read-only tools it may use without asking.
 * @param {{ prompt: string, agent?: string, allow?: string[], credits?: number }} c
 * @returns {string[]}
 */
export function evalArgs(c) {
  const allow = c.allow ?? [];
  const unsafe = allow.filter((a) => WRITE_PERMISSION.test(String(a)));
  if (unsafe.length) throw new Error(`An eval run is read-only: it can't allow ${unsafe.join(', ')}.`);
  const cap = c.credits ?? CAP;
  if (!(Number.isInteger(cap) && cap >= 1 && cap <= MAX_CAP)) throw new Error(`credits must be a whole number from 1 to ${MAX_CAP}.`);
  return [
    ...(c.agent ? ['--agent', c.agent] : []),
    '-p', c.prompt, '-s',
    '--no-ask-user',
    '--output-format', 'json',
    `--max-ai-credits=${cap}`,
    ...allow.map((a) => `--allow-tool=${a}`),
    '--deny-tool=write',
    '--deny-tool=shell',
  ];
}

/**
 * What a real run of these cases would cost at most: every run spends at most its cap.
 * @param {object[]} cases
 * @param {{ runs: number, budget: number }} options
 * @returns {{ cases: { id: string, runs: number, credits: number }[], runs: number, worstCase: number, budget: number, ok: boolean }}
 */
export function plan(cases, { runs, budget }) {
  const rows = cases.map((c) => ({ id: c.id, runs, credits: c.credits ?? CAP }));
  const worstCase = rows.reduce((n, r) => n + r.runs * r.credits, 0);
  return { cases: rows, runs: rows.length * runs, worstCase, budget, ok: worstCase <= budget };
}
