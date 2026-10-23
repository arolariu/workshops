// Helpers for Lab 00 · hard++: run the learner's loop against the reference fake model and tools, watch what it sends
// and runs, and check the events it logs against Copilot's format.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const SCENARIOS = ['answer', 'tool-call', 'malformed', 'denied', 'loop', 'budget'];
/** The reference copy of a scenario: editing your own copies can't change what the checks expect. */
export const scenarioFile = (t, name) => path.join(t.solDir, 'agent', 'scenarios', `${name}.json`);
export const scenario = (t, name) => JSON.parse(fs.readFileSync(scenarioFile(t, name), 'utf8'));

/** The learner's mini-agent, with the reference fake model and tools. */
export async function modules(t, ...names) {
  const agent = await t.import('agent/mini-agent.mjs');
  for (const n of names) if (typeof agent[n] !== 'function') t.fail(`agent/mini-agent.mjs must export ${n}().`);
  const ref = (f) => import(pathToFileURL(path.join(t.solDir, 'agent', f)).href);
  const { fakeModel } = await ref('fake-model.mjs');
  const { TOOLS } = await ref('tools.mjs');
  return { agent, fakeModel, TOOLS };
}

const MAX_CALLS = 40;
/** The model, watched: every request (a snapshot) and response. It yields to the event loop, and stops a runaway loop. */
export function spy(model) {
  const calls = [];
  return {
    name: model.name,
    calls,
    async complete(request) {
      await new Promise((resolve) => setImmediate(resolve));
      if (calls.length >= MAX_CALLS) throw new Error(`the loop called the model ${MAX_CALLS} times without stopping`);
      const snapshot = structuredClone(request);
      const response = await model.complete(request);
      calls.push({ request: snapshot, response: structuredClone(response) });
      return response;
    },
  };
}

/** The tools, counted: every run of every tool, with its arguments. */
export function counted(tools) {
  const runs = [];
  return { runs, tools: tools.map((tool) => ({ ...tool, run: (args, ws) => { runs.push({ name: tool.name, args }); return tool.run(args, ws); } })) };
}

/** runAgent() on a scenario, with the scenario's own settings unless `overrides` says otherwise. */
export async function runScenario(t, name, overrides = {}) {
  const { agent, fakeModel, TOOLS } = await modules(t, 'runAgent');
  const s = scenario(t, name);
  const model = spy(fakeModel(s));
  const { tools, runs } = counted(TOOLS);
  const events = [];
  let result;
  try {
    result = await agent.runAgent({
      prompt: s.prompt, model, tools, files: s.files ?? {},
      permissions: { allow: s.run?.allow ?? [], deny: s.run?.deny ?? [] },
      maxTurns: s.run?.maxTurns ?? 10, budget: s.run?.budget ?? 20000,
      log: (type, data) => events.push({ type, data }),
      ...overrides,
    });
  } catch (e) {
    t.fail(`runAgent() on the ${name} scenario threw: ${e.message}`);
  }
  if (!result || typeof result !== 'object') t.fail(`runAgent() on the ${name} scenario returned nothing yet.`);
  return { s, result, calls: model.calls, runs, events };
}

/** "[fake model] …" when the fake model complained: it says what the loop did wrong. */
export const complaint = (answer) => (/^\[fake model\]/.test(String(answer ?? '')) ? ` The fake model said: ${answer}` : '');

// Copilot's event types come in families (session.*, assistant.*, tool.*, user.*, model.*, …), plus the flat `result`.
// The replays in labs/_harness/replays/ add their own harness.* notes.
const COPILOT_TYPE = /^(session|model|assistant|tool|user|subagent|hook|skill|permission|system|harness)\.[a-z0-9_.]+$/;
const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/**
 * What breaks Copilot's format in a JSONL stream (at most 5 problems); [] when it reads like a real run. The shared
 * rules hold for every stream Copilot prints (and for the replays): a real run must pass them, and a check makes sure
 * it does. `strict` adds what this level's mini agent must log on top: an id and a timestamp on every event, the model
 * and the turnId on assistant messages and tool events, and every turn and tool call finished.
 */
export function formatProblems(text, { strict = false } = {}) {
  const p = [];
  const events = [];
  String(text).split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    let e;
    try { e = JSON.parse(line); } catch { p.push(`line ${i + 1} is not JSON (keep stdout for events only; print anything else to stderr): ${line.slice(0, 60)}`); return; }
    if (!isObject(e) || typeof e.type !== 'string') p.push(`line ${i + 1} is not an event: { type, data, id, timestamp, parentId }`);
    else events.push(e);
  });
  if (p.length) return p.slice(0, 5);
  const firstTurn = events.findIndex((e) => e.type === 'assistant.turn_start');
  const prompt = events.findIndex((e) => e.type === 'user.message');
  if (prompt < 0 || (firstTurn >= 0 && prompt > firstTurn)) p.push('user.message (the prompt) comes before the first assistant.turn_start');
  if (events.at(-1)?.type !== 'result') p.push('the last event is result');
  // Copilot's custom tools (apply_patch) carry their arguments as text; the mini agent's tools always take an object.
  const argsOk = (a) => isObject(a) || (!strict && typeof a === 'string');
  let open = null;
  const requested = new Set();
  const started = new Map();
  events.forEach((e, i) => {
    const bad = (msg) => p.push(`event ${i + 1} (${e.type}): ${msg}`);
    if (e.type === 'result') {
      if ('data' in e) bad('result is flat: exitCode and usage sit next to type, not inside data');
      if (!Number.isInteger(e.exitCode) || !isObject(e.usage)) bad('result has exitCode (a number) and usage (an object)');
      if (i !== events.length - 1) bad('result is the last event');
      return;
    }
    if (!COPILOT_TYPE.test(e.type)) return bad(`"${e.type}" is not one of the events this level logs (Copilot's types start with session., assistant., tool., user. or model.)`);
    const d = e.data;
    if (!isObject(d)) return bad('every event but result has a data object');
    if (strict && (typeof e.id !== 'string' || Number.isNaN(Date.parse(e.timestamp ?? '')))) bad('every event has an id and an ISO timestamp (emitter() adds them)');
    const inTurn = (what) => {
      if (d.turnId !== undefined && d.turnId !== open) bad(`data.turnId (${d.turnId}) is not the open turn (${open})`);
      else if (strict && d.turnId === undefined) bad(`${what} carries the turnId of its turn`);
    };
    if (e.type === 'user.message' && typeof d.content !== 'string') bad('data.content is the prompt');
    if (e.type === 'assistant.turn_start') {
      if (typeof d.turnId !== 'string') bad('data.turnId is a string ("0", "1", …)');
      if (open !== null) bad(`turn ${open} never ended`);
      open = d.turnId;
    }
    if (e.type === 'assistant.turn_end') {
      if (d.turnId !== open) bad(`it doesn't close the open turn (${open})`);
      open = null;
    }
    if (e.type === 'assistant.message') {
      if (typeof d.content !== 'string' || !Array.isArray(d.toolRequests)) return bad('data has content (text) and toolRequests (a list)');
      for (const r of d.toolRequests) {
        if (typeof r?.toolCallId !== 'string' || typeof r.name !== 'string' || !argsOk(r.arguments)) bad(strict ? 'each toolRequest is { toolCallId, name, arguments }, with arguments as an object, not JSON text' : 'each toolRequest is { toolCallId, name, arguments }');
        else requested.add(r.toolCallId);
      }
      if (strict && (typeof d.model !== 'string' || !d.model)) bad('data.model names the model');
      inTurn('an assistant.message');
    }
    if (e.type === 'tool.execution_start') {
      if (!requested.has(d.toolCallId)) bad('a tool starts after the assistant.message that requested it (same toolCallId)');
      if (typeof d.toolName !== 'string' || !argsOk(d.arguments)) bad('data has toolName and arguments (an object)');
      inTurn('a tool event');
      started.set(d.toolCallId, false);
    }
    if (e.type === 'tool.execution_complete') {
      if (started.get(d.toolCallId) !== false) bad('it completes a started tool call, once (same toolCallId)');
      started.set(d.toolCallId, true);
      if (typeof d.success !== 'boolean') bad('data.success is true or false');
      else if (d.success && typeof d.result?.content !== 'string') bad('a success has result: { content }');
      else if (!d.success && (typeof d.error?.message !== 'string' || typeof d.error?.code !== 'string')) bad('a failure has error: { message, code }');
      inTurn('a tool event');
    }
    if (e.type === 'session.usage_checkpoint') {
      const mm = d.accountingSnapshot?.modelMetrics;
      if (!isObject(mm) || !Object.keys(mm).length || !Object.values(mm).every((m) => Number.isFinite(m?.usage?.inputTokens) && Number.isFinite(m?.usage?.outputTokens))) bad('data.accountingSnapshot.modelMetrics[model].usage has inputTokens and outputTokens');
    }
    if (e.type === 'session.error' && (typeof d.errorType !== 'string' || typeof d.message !== 'string')) bad('data has errorType and message');
  });
  if (strict) {
    for (const [id, done] of started) if (!done) p.push(`tool call ${id} never completed`);
    if (open !== null) p.push(`turn ${open} never ended`);
  }
  return p.slice(0, 5);
}

/** Copilot's own streams, for the self-test: the replays the app ships, and the recorded runs in the reference. */
export function realStreams(t) {
  const replays = path.join(t.exDir, '..', '..', '_harness', 'replays');
  const files = fs.existsSync(replays) ? fs.readdirSync(replays).filter((f) => f.endsWith('.jsonl')).map((f) => path.join(replays, f)) : [];
  for (const f of ['ok', 'denied', 'failed']) files.push(path.join(t.solDir, 'fixtures', `${f}.jsonl`));
  for (const k of [1, 2, 3]) files.push(path.join(t.solDir, 'fixtures', 'flight', `run-${k}`, 'events.jsonl'));
  return files;
}
