// 🤖 A scripted fake model: deterministic, free, and stateless like a real one. Every call gets the whole request,
// { messages, tools }, and answers from that alone: it finds its place in the script by counting the assistant
// messages in the history you send. So a loop that forgets the history starts over, a loop that doesn't send a
// tool's result back gets a complaint, and a tool whose schema you didn't send can't be called.
//
// A scenario (agent/scenarios/*.json):
//   { "name": "tool-call", "about": "…", "prompt": "…", "files": { "grades.js": "…" },
//     "run": { "maxTurns": 4, "budget": 3000, "allow": ["shell(npm test)"], "deny": [] },   (all optional)
//     "steps": [ { "say": "…", "calls": [{ "name": "view", "arguments": "{\"path\":\"grades.js\"}" }] },
//                { "expect": { "resultIncludes": "hasPassed" }, "say": "…" } ] }
// Step k answers the k-th call. "arguments" is the JSON text the model writes (it can be broken on purpose).
// "expect.resultIncludes": the results of the previous step's calls must mention it (case doesn't matter).
// "repeat": true on the last step makes the model repeat it forever. A step without calls is a final answer.
import fs from 'node:fs';

export const MODEL_NAME = 'fake-1';
const NAME = /^[a-z0-9-]+$/;
const tokens = (value) => Math.ceil(JSON.stringify(value ?? null).length / 4);
const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);
export const callId = (step, i) => `call_${step}_${i}`;

/** What is wrong with a scenario (one sentence each); [] when it's valid. */
export function validateScenario(s) {
  const problems = [];
  if (!s || typeof s !== 'object' || Array.isArray(s)) return ['a scenario is a JSON object'];
  if (typeof s.name !== 'string' || !NAME.test(s.name)) problems.push('"name" is lowercase letters, digits and dashes');
  if (typeof s.about !== 'string' || !s.about.trim()) problems.push('"about" says what the scenario shows');
  if (typeof s.prompt !== 'string' || !s.prompt.trim()) problems.push('"prompt" is the user\'s prompt');
  if (s.files !== undefined && (typeof s.files !== 'object' || Array.isArray(s.files) || Object.values(s.files).some((v) => typeof v !== 'string'))) problems.push('"files" maps paths to their text');
  if (s.run !== undefined) {
    const r = s.run;
    if (typeof r !== 'object' || Array.isArray(r)) problems.push('"run" is an object');
    else {
      for (const k of ['maxTurns', 'budget']) if (r[k] !== undefined && !(Number.isInteger(r[k]) && r[k] > 0)) problems.push(`"run.${k}" is a positive whole number`);
      for (const k of ['allow', 'deny']) if (r[k] !== undefined && !(Array.isArray(r[k]) && r[k].every((x) => typeof x === 'string'))) problems.push(`"run.${k}" is a list of rules`);
      for (const k of Object.keys(r)) if (!['maxTurns', 'budget', 'allow', 'deny'].includes(k)) problems.push(`"run.${k}" is not a setting`);
    }
  }
  if (!Array.isArray(s.steps) || !s.steps.length) return [...problems, '"steps" is a non-empty list'];
  s.steps.forEach((step, i) => {
    const at = `step ${i}`;
    if (!step || typeof step !== 'object') { problems.push(`${at} is an object`); return; }
    for (const k of Object.keys(step)) if (!['say', 'calls', 'expect', 'repeat'].includes(k)) problems.push(`${at}: "${k}" is not a step field`);
    if (step.say !== undefined && typeof step.say !== 'string') problems.push(`${at}: "say" is text`);
    const calls = step.calls ?? [];
    if (!Array.isArray(calls) || calls.some((c) => !c || typeof c.name !== 'string' || typeof c.arguments !== 'string')) problems.push(`${at}: every call has a "name" and "arguments" (JSON text)`);
    if (!calls.length && i < s.steps.length - 1) problems.push(`${at} has no calls, so it ends the run: the steps after it can never happen`);
    if (step.repeat !== undefined && (step.repeat !== true || i !== s.steps.length - 1 || !calls.length)) problems.push(`${at}: only the last step can "repeat", and only when it calls a tool`);
    if (step.expect !== undefined) {
      const prev = s.steps[i - 1];
      if (i === 0 || !(prev?.calls ?? []).length) problems.push(`${at}: "expect" needs a previous step with calls`);
      if (typeof step.expect?.resultIncludes !== 'string' || !step.expect.resultIncludes) problems.push(`${at}: "expect.resultIncludes" is text`);
    }
  });
  return problems;
}

/** Read and validate a scenario file (throws, naming every problem, when it isn't valid). */
export function loadScenario(file) {
  let s;
  try { s = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new Error(`${file}: ${e.message}`); }
  const problems = validateScenario(s);
  if (problems.length) throw new Error(`${file}: ${problems.join('; ')}`);
  return s;
}

/** The fake model for one scenario: { name, complete(request) → Promise<{ message, usage }> }. */
export function fakeModel(scenario) {
  const steps = scenario.steps;
  const last = steps.length - 1;
  const reply = (message, request) => ({ message, usage: { inputTokens: tokens(request), outputTokens: tokens(message) } });
  return {
    name: MODEL_NAME,
    async complete(request) {
      const complain = (why) => reply({ role: 'assistant', content: `[fake model] ${why}`, tool_calls: [] }, request);
      const messages = Array.isArray(request?.messages) ? request.messages : null;
      if (!messages) return complain('I got no messages: send { messages, tools }.');
      if (messages[0]?.role !== 'system' || !String(messages[0].content ?? '').trim()) return complain('the first message should be your system prompt (role "system").');
      if (!messages.some((m) => m?.role === 'user' && m.content === scenario.prompt)) return complain('I got no user message with the prompt.');
      const step = messages.filter((m) => m?.role === 'assistant').length;
      if (step > last && !steps[last].repeat) return complain('my script is over: there is nothing more to say.');
      const s = steps[Math.min(step, last)];
      if (step > 0) {
        const prev = steps[Math.min(step - 1, last)];
        const ids = (prev.calls ?? []).map((_, i) => callId(step - 1, i));
        const results = ids.map((id) => messages.find((m) => m?.role === 'tool' && m.tool_call_id === id));
        const missing = ids.filter((_, i) => !results[i]);
        if (missing.length) return complain(`I never got the result of ${missing.join(', ')}: send each result back as a "tool" message with its tool_call_id.`);
        const want = s.expect?.resultIncludes;
        if (want && !results.some((m) => String(m.content ?? '').toLowerCase().includes(want.toLowerCase()))) {
          return complain(`I expected the result of ${ids.join(', ')} to mention "${want}", but it says: ${clip(results.map((m) => String(m.content ?? '')).join(' | '), 160)}`);
        }
      }
      const offered = new Set((Array.isArray(request.tools) ? request.tools : []).map((t) => t?.function?.name));
      const notOffered = (s.calls ?? []).map((c) => c.name).filter((n) => !offered.has(n));
      if (notOffered.length) return complain(`I can't call ${notOffered.join(', ')}: it's not in the tools you sent.`);
      const toolCalls = (s.calls ?? []).map((c, i) => ({ id: callId(step, i), type: 'function', function: { name: c.name, arguments: c.arguments } }));
      return reply({ role: 'assistant', content: s.say ?? '', tool_calls: toolCalls }, request);
    },
  };
}
