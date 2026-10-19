// Free checks for Lab 00 · hard++: build the loop. The checks run YOUR agent/mini-agent.mjs against the reference fake
// model and tools (agent/fake-model.mjs, agent/tools.mjs) and the reference scenarios, watch every request it sends
// and every tool it runs, and read the events it logs with the format rules and with your own scripts/run-stats.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import { SCENARIOS, scenario, scenarioFile, modules, runScenario, complaint, formatProblems, realStreams, noCopilotEnv, withoutCopilot } from './helpers.mjs';

const show = (v) => JSON.stringify(v);
const AGENT = 'agent/mini-agent.mjs';
const cli = (t, name, extra = []) => t.node([AGENT, scenarioFile(t, name), ...extra], { timeout: 20000, env: noCopilotEnv(t) });
const lastSay = (s) => s.steps[s.steps.length - 1].say;
/** The result, or why it isn't the scripted answer. */
const answered = (name, s, r, turns) => {
  if (r.answer !== lastSay(s)) return `The ${name} scenario should end with the model's scripted answer ("${lastSay(s)}"), got ${show(r.answer)}.${complaint(r.answer)}`;
  if (r.stop !== 'done' || r.exitCode !== 0) return `The ${name} scenario should stop "done" with exitCode 0, got ${show({ stop: r.stop, exitCode: r.exitCode })}.`;
  return r.turns === turns || `The ${name} scenario takes ${turns} turn(s), got ${show(r.turns)}.`;
};
const usageOf = (call) => (call.response?.usage?.inputTokens ?? 0) + (call.response?.usage?.outputTokens ?? 0);

const GATE = [
  ['view', 'read', { path: 'grades.js' }, {}, true, null],
  ['edit', 'write', { path: 'grades.js' }, {}, false, null],
  ['edit', 'write', { path: 'grades.js' }, { allow: ['write'] }, true, 'write'],
  ['edit', 'write', { path: 'grades.js' }, { allow: ['write'], deny: ['edit'] }, false, 'edit'],
  ['view', 'read', { path: '.env' }, { deny: ['read'] }, false, 'read'],
  ['bash', 'shell', { command: 'npm test' }, { allow: ['shell(npm test)'] }, true, 'shell(npm test)'],
  ['bash', 'shell', { command: 'npm test -- --watch' }, { allow: ['shell(npm test)'] }, true, 'shell(npm test)'],
  ['bash', 'shell', { command: 'npm testing' }, { allow: ['shell(npm test)'] }, false, null],
  ['bash', 'shell', { command: 'git status' }, { allow: ['shell(git:*)'] }, true, 'shell(git:*)'],
  ['bash', 'shell', { command: 'gitk' }, { allow: ['shell(git:*)'] }, false, null],
  ['bash', 'shell', { command: 'npm test && rm -rf build' }, { allow: ['shell(npm test)'] }, false, null],
  ['bash', 'shell', { command: 'npm test && git log' }, { allow: ['shell(npm test)', 'shell(git:*)'] }, true, 'shell(npm test)'],
  ['bash', 'shell', { command: 'ls | rm -rf build' }, { allow: ['shell'], deny: ['shell(rm)'] }, false, 'shell(rm)'],
  ['bash', 'shell', { command: 'echo hi' }, { allow: ['bash'] }, true, 'bash'],
  ['bash', 'shell', { command: 'echo hi' }, { allow: ['shell'], deny: ['bash'] }, false, 'bash'],
  ['view', 'read', { path: '.env' }, { deny: ['read(.env)'] }, false, 'read(.env)'],
  ['view', 'read', { path: 'grades.js' }, { deny: ['read(.env)'] }, true, null],
  ['view', 'read', { path: 'config/.env' }, { deny: ['read(**/.env)'] }, false, 'read(**/.env)'],
  ['edit', 'write', { path: 'grades.js' }, { allow: ['write'], deny: ['write(grades.js)'] }, false, 'write(grades.js)'],
  ['edit', 'write', { path: 'build/app.js' }, { allow: ['write(build)'] }, true, 'write(build)'],
  ['edit', 'write', { path: 'grades.js' }, { allow: ['write(build/*)'] }, false, null],
  ['view', 'read', { path: '.env' }, { deny: ['view(.env)'] }, false, 'view(.env)'],
  ['view', 'read', { path: 'grades.js' }, { deny: ['read('] }, false, 'read('],
  ['bash', 'shell', { command: 'npm test' }, { allow: ['shell(npm test)'], deny: ['shell(npm test'] }, false, 'shell(npm test'],
];

export default (t) => {
  // Every check runs where nothing can start the real Copilot, whatever the code under test does.
  const check = (name, fn, opts) => t.check(name, () => withoutCopilot(t, fn), opts);
  return [
  check('toolSchemas(): one schema per tool, and only what the model needs', async () => {
    const { agent, TOOLS } = await modules(t, 'toolSchemas');
    const schemas = agent.toolSchemas(TOOLS);
    if (!Array.isArray(schemas) || schemas.length !== TOOLS.length) return `toolSchemas() returned ${Array.isArray(schemas) ? schemas.length : 'no'} schemas; agent/tools.mjs has ${TOOLS.length} tools.`;
    for (const [i, s] of schemas.entries()) {
      const tool = TOOLS[i];
      if (s?.type !== 'function' || s.function?.name !== tool.name || s.function.description !== tool.description || !same(s.function.parameters, tool.parameters)) return `Schema ${i + 1} should be { type: 'function', function: { name: '${tool.name}', description, parameters } }, got ${show(s).slice(0, 160)}.`;
      if ('run' in s.function || 'kind' in s.function || 'run' in s || 'kind' in s) return `Schema ${i + 1} leaks run or kind: the model only gets the name, the description and the parameters.`;
    }
    return true;
  }, { milestone: 'M1' }),
  check('The scenarios are fixtures with their own tests: valid, and the fake model is deterministic', () => {
    const r = t.unitTests({ files: ['agent/fake-model.test.mjs'] });
    if (r.total < 6) return `node --test agent/fake-model.test.mjs ran ${r.total} test(s): agent/fake-model.test.mjs ships with the level (start over with x if you deleted it).`;
    return r.fail === 0 || `The fake model's own tests fail (${r.failing.slice(0, 2).join(' | ')}): did agent/fake-model.mjs or a scenario change?`;
  }, { milestone: 'M1' }),
  check('One turn: the model gets the system prompt, your prompt and the tool schemas, and answers', async () => {
    const { s, result, calls } = await runScenario(t, 'answer');
    const first = calls[0]?.request;
    if (!first) return 'runAgent() never called model.complete().';
    const m = first.messages ?? [];
    if (m[0]?.role !== 'system' || !String(m[0].content ?? '').trim()) return `The first message is your system prompt ({ role: 'system', content }), got ${show(m[0]).slice(0, 120)}.`;
    if (m[1]?.role !== 'user' || m[1].content !== s.prompt) return `The second message is the user's prompt ({ role: 'user', content: prompt }), got ${show(m[1]).slice(0, 120)}.`;
    if ((first.tools ?? []).map((x) => x?.function?.name).join(',') !== 'view,glob,edit,bash') return `Send the tool schemas with every request (tools: toolSchemas(tools)), got ${show(first.tools).slice(0, 120)}.`;
    if (calls.length !== 1) return `A plain answer takes one model call; the loop made ${calls.length}.`;
    const r = answered('answer', s, result, 1);
    if (r !== true) return r;
    return (result.usage?.inputTokens > 0 && result.usage.outputTokens > 0) || `Add up the usage the model reports: got ${show(result.usage)}.`;
  }, { milestone: 'M1' }),

  check('parseArguments() reads the JSON the model wrote, and says when it can\'t', async () => {
    const { agent } = await modules(t, 'parseArguments');
    const good = agent.parseArguments('{"path":"grades.js"}');
    if (!good?.ok || good.value?.path !== 'grades.js') return `parseArguments('{"path":"grades.js"}') should be { ok: true, value: { path: 'grades.js' } }, got ${show(good)}.`;
    for (const text of ['{"path": "grades.js"', '[1, 2]', '"grades.js"', '', 'null']) {
      const r = agent.parseArguments(text);
      if (r?.ok !== false || !/^invalid arguments/i.test(String(r.error ?? ''))) return `parseArguments(${show(text)}) should be { ok: false, error: 'Invalid arguments: …' } (only a JSON object counts), got ${show(r)}.`;
    }
    return true;
  }, { milestone: 'M2' }),
  check('Two tool calls in one turn: both run, both results go back, and the whole history is re-sent', async () => {
    const { s, result, calls, runs } = await runScenario(t, 'tool-call');
    if (calls.length >= 2 && calls[1].request.messages.length <= calls[0].request.messages.length) return `The second request had ${calls[1].request.messages.length} message(s), no more than the first: the model is stateless, so without the whole history it starts over. Append its message and the tool results, and send everything.`;
    const r = answered('tool-call', s, result, 2);
    if (r !== true) return r;
    if (runs.map((x) => `${x.name} ${x.args?.path}`).join(', ') !== 'view grades.js, view grades.test.js') return `The tools that ran: ${show(runs)}; expected view grades.js and view grades.test.js.`;
    const [a, b] = calls.map((c) => c.request.messages);
    if (show(b.slice(0, a.length)) !== show(a)) return 'The second request should start with everything the first one had: the model is stateless, so it gets the whole history every turn.';
    const rest = b.slice(a.length);
    const ids = (rest[0]?.tool_calls ?? []).map((c) => c.id);
    if (rest[0]?.role !== 'assistant' || ids.length !== 2) return 'After the first request, the history gets the model\'s message, with its tool_calls, as it came.';
    return show(rest.slice(1).map((m) => [m.role, m.tool_call_id])) === show(ids.map((id) => ['tool', id])) || `Then one { role: 'tool', tool_call_id, content } per call, in order: got ${show(rest.slice(1).map((m) => ({ role: m.role, tool_call_id: m.tool_call_id })))}.`;
  }, { milestone: 'M2' }),
  check('A broken tool call is a failed result, not a crash: the model tries again', async () => {
    const { s, result, runs } = await runScenario(t, 'malformed');
    const r = answered('malformed', s, result, 3);
    if (r !== true) return r;
    return runs.length === 1 || `Only the second call (valid JSON) may run; ${runs.length} tool run(s) happened.`;
  }, { milestone: 'M2' }),

  check('gate() follows Copilot\'s permission rules', async () => {
    const { agent } = await modules(t, 'gate');
    for (const [name, kind, args, perms, allowed, rule] of GATE) {
      const g = agent.gate({ name, kind, arguments: args }, perms);
      const label = `gate(${name} ${show(args)}, ${show(perms)})`;
      if (g?.allowed !== allowed) return `${label} should be ${allowed ? 'allowed' : 'denied'}, got ${show(g)}.`;
      if ((g.rule ?? null) !== rule) return `${label}: the deciding rule is ${show(rule)}, got ${show(g.rule)}.`;
      if (!allowed && !String(g.reason ?? '').trim()) return `${label}: a denial needs a reason (the model reads it).`;
      if (!allowed && rule === null && !/no interactive user/i.test(g.reason)) return `${label}: with no rule for it, deny like Copilot does in a script: "${'Permission denied because no interactive user response was available.'}"`;
    }
    return true;
  }, { milestone: 'M3' }),
  check('The gate stops rm -rf build, the model hears why, and the build survives', async () => {
    const { s, result, runs } = await runScenario(t, 'denied');
    const r = answered('denied', s, result, 4);
    if (r !== true) return r;
    const ran = runs.map((x) => `${x.name} ${x.args?.command ?? x.args?.path}`);
    return show(ran) === show(['bash npm test', 'view build/app.js']) || `Only npm test (allowed by shell(npm test)) and the view may run: ${show(ran)}.`;
  }, { milestone: 'M3' }),

  check('Max turns: a model that never stops is stopped', async () => {
    const { result, calls } = await runScenario(t, 'loop');
    if (result.stop !== 'max-turns' || result.exitCode !== 1) return `With maxTurns 4, the loop scenario should stop "max-turns" with exitCode 1, got ${show({ stop: result.stop, exitCode: result.exitCode })}.${complaint(result.answer)}`;
    return (result.turns === 4 && calls.length === 4) || `maxTurns 4 means 4 model calls and turns: got ${calls.length} call(s) and turns ${show(result.turns)}.`;
  }, { milestone: 'M4' }),
  check('The budget: the run stops at the first model call that reaches it, and that reply\'s tools never run', async () => {
    const { s, result, calls, runs } = await runScenario(t, 'budget');
    if (result.stop !== 'budget' || result.exitCode !== 1) return `With a budget of ${s.run.budget} tokens, the budget scenario should stop "budget" with exitCode 1, got ${show({ stop: result.stop, exitCode: result.exitCode })}.${complaint(result.answer)}`;
    const totals = calls.map((_, i) => calls.slice(0, i + 1).reduce((n, c) => n + usageOf(c), 0));
    if (!(totals.at(-1) >= s.run.budget && (totals.at(-2) ?? 0) < s.run.budget)) return `Stop right after the call that brings input + output tokens to the budget: the running totals were ${show(totals)} (budget ${s.run.budget}).`;
    if (!same({ inputTokens: result.usage?.inputTokens, outputTokens: result.usage?.outputTokens }, { inputTokens: calls.reduce((n, c) => n + c.response.usage.inputTokens, 0), outputTokens: calls.reduce((n, c) => n + c.response.usage.outputTokens, 0) })) return `runAgent() should return the usage it added up, got ${show(result.usage)}.`;
    return runs.length === 2 * (calls.length - 1) || `The last reply's tool calls must not run (the budget is spent): ${runs.length} tool run(s) for ${calls.length} model call(s).`;
  }, { milestone: 'M4' }),
  check('Without limits given, the defaults still stop a runaway loop', async () => {
    const { result, calls } = await runScenario(t, 'loop', { maxTurns: undefined, budget: undefined });
    return (['max-turns', 'budget'].includes(result.stop) && calls.length <= 20) || `runAgent() without maxTurns and budget should still stop (default limits), got ${show({ stop: result.stop })} after ${calls.length} model call(s).`;
  }, { milestone: 'M4' }),

  check('The format rules accept Copilot\'s own runs (the replays and the recorded fixtures)', () => {
    for (const file of realStreams(t)) {
      const p = formatProblems(fs.readFileSync(file, 'utf8'));
      if (p.length) return `tests/helpers.mjs rejects a real Copilot stream, ${path.basename(path.dirname(file))}/${path.basename(file)}: ${p.join(' · ')}. That's a bug in the checks, not in your work: please report it.`;
    }
    return true;
  }, { milestone: 'M5' }),
  check('Every scenario logs Copilot\'s events, in Copilot\'s format', () => {
    for (const name of SCENARIOS) {
      const r = cli(t, name);
      const want = scenario(t, name).run?.maxTurns || scenario(t, name).run?.budget ? 1 : 0;
      if (r.code !== want) return `node ${AGENT} agent/scenarios/${name}.json should exit ${want}, got ${r.code}. ${r.stderr.trim().slice(0, 200)}`;
      const p = formatProblems(r.stdout, { strict: true });
      if (p.length) return `The ${name} scenario's events: ${p.join(' · ')}`;
    }
    return true;
  }, { milestone: 'M5' }),
  check('Your run-stats.mjs reads every run: tools, outcomes, turns, tokens', async () => {
    const { summarize } = await t.import('scripts/run-stats.mjs');
    if (typeof summarize !== 'function') return 'scripts/run-stats.mjs (from Lab 00 hard) must export summarize().';
    const tool = (calls, ok, failed, denied) => ({ calls, ok, failed, denied });
    const want = {
      answer: { tools: {}, turns: 1, exitCode: 0, outcome: 'ok' },
      'tool-call': { tools: { view: tool(2, 2, 0, 0) }, turns: 2, exitCode: 0, outcome: 'ok' },
      malformed: { tools: { view: tool(2, 1, 1, 0) }, turns: 3, exitCode: 0, outcome: 'ok' },
      denied: { tools: { bash: tool(2, 1, 0, 1), view: tool(1, 1, 0, 0) }, turns: 4, exitCode: 0, outcome: 'ok' },
      loop: { tools: { view: tool(4, 4, 0, 0) }, turns: 4, exitCode: 1, outcome: 'failed' },
    };
    const pick = (x) => Object.fromEntries(Object.entries(x ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, tool(v.calls, v.ok, v.failed, v.denied)]));
    for (const name of SCENARIOS) {
      const s = summarize(cli(t, name).stdout.split(/\r?\n/));
      if (s.model !== 'fake-1' || !(s.tokens?.input > 0)) return `${name}: run-stats should find the model ("fake-1") and the tokens, got ${show({ model: s.model, tokens: s.tokens })}.`;
      const got = { tools: pick(s.tools), turns: s.turns?.length, exitCode: s.exitCode, outcome: s.outcome };
      const k = 2 * (got.turns - 1);
      const w = want[name] ?? { tools: k ? { view: tool(k, k, 0, 0) } : {}, turns: got.turns, exitCode: 1, outcome: 'failed' };
      if (!same(got, { ...w, tools: pick(w.tools) })) return `${name}: run-stats read ${show(got)}, expected ${show({ ...w, tools: pick(w.tools) })}.`;
      if ((s.exitCode === 1) !== (s.errors?.length === 1)) return `${name}: a run stopped by a limit logs one session.error that says why (and a finished run none); run-stats found ${show(s.errors)}.`;
    }
    return true;
  }, { milestone: 'M5' }),
  check('The CLI: flags override the scenario, and --out writes the run to a file', () => {
    const two = cli(t, 'loop', ['--max-turns', '2']);
    const turns = (two.stdout.match(/"assistant\.turn_start"/g) ?? []).length;
    if (two.code !== 1 || turns !== 2) return `--max-turns 2 on the loop scenario should stop after 2 turns (exit 1), got exit ${two.code} after ${turns} turn(s).`;
    const denied = cli(t, 'tool-call', ['--deny-tool', 'view']);
    if ((denied.stdout.match(/"code":"denied"/g) ?? []).length !== 2) return '--deny-tool view should deny both views of the tool-call scenario.';
    const out = path.join(t.tmp(), 'run.jsonl');
    const r = cli(t, 'answer', ['--out', out]);
    if (r.code !== 0 || r.stdout.trim()) return `With --out, the events go to the file and stdout stays empty (exit ${r.code}, stdout ${show(r.stdout.slice(0, 80))}).`;
    return (fs.existsSync(out) && formatProblems(fs.readFileSync(out, 'utf8'), { strict: true }).length === 0) || '--out should write the same events to the file.';
  }, { milestone: 'M5' }),
];
};
