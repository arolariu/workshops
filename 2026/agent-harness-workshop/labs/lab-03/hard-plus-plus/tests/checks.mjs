// Free checks for Lab 03 · hard++: your agent team runs in a temp copy of your folder, with a fake Copilot that replays
// the recorded run (tests/fixtures/run/: each agent's answer, and the artifacts it left). No credits are spent.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { GOAL, artifact, fakeTeam, flag, norm } from './helpers.mjs';
import { offline } from '../../../_harness/fixtures/lab-03/offline.mjs';

const BROKEN = JSON.parse(fs.readFileSync(new URL('./fixtures/broken-artifacts.json', import.meta.url), 'utf8')).artifacts;
const TEAM = 'scripts/team.mjs';
const PIPELINE = 'scripts/team/pipeline.json';
const ORDER = ['plan', 'approve', 'implement', 'test', 'review'];
const WRITES = { plan: 'plan.json', implement: 'changes.patch', test: 'test-report.json', review: 'verdict.json' };
const CONTRACT = { plan: 'plan', test: 'test-report', review: 'verdict' };
const NEW_AGENTS = ['planner', 'implementer', 'tester'];
const GUARDED = ['write(approval.json)', 'write(plan.json)', 'write(package.json)', 'shell(git push)'];
const RUN = '.agent-logs/team/run-1';
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const recorded = (name) => JSON.parse(artifact(name));
const reference = (t) => import(`${pathToFileURL(path.join(t.solDir, 'scripts', 'audit-agents.mjs')).href}?v=${Date.now()}`);
const stageOf = (pipeline, id) => (pipeline.stages ?? []).find((s) => s.id === id);

/** A temp copy of your folder, your team.mjs loaded from inside it, and a fresh run in .agent-logs/team/run-1/. */
async function workspace(t, { budget } = {}) {
  const work = t.copy(t.tmp());
  let team;
  try { team = await import(`${pathToFileURL(path.join(work, TEAM)).href}?v=${Date.now()}${Math.random()}`); } catch (e) { t.fail(`\`${TEAM}\` could not be loaded: ${String(e.message).split('\n')[0]}`); }
  const pipeline = JSON.parse(fs.readFileSync(path.join(work, PIPELINE), 'utf8'));
  if (budget != null) pipeline.budget = budget;
  const runDir = path.join(work, ...RUN.split('/'));
  team.startRun({ runDir, goal: GOAL, pipeline });
  const file = (f) => path.join(runDir, f);
  const json = (f) => JSON.parse(fs.readFileSync(file(f), 'utf8'));
  return { t, work, team, pipeline, runDir, file, json };
}
/** What a person would do: approve plan.json as it is now (the format of approval.json). */
const writeApproval = (w) => fs.writeFileSync(w.file('approval.json'), JSON.stringify({ by: 'Ana', at: '2026-10-20T10:00:00.000Z', plan: sha(w.file('plan.json')) }));
/** advance(), with the real Copilot out of reach: a free check must never start a paid call. */
const advance = (w, fake) => offline(w.t, () => w.team.advance(w.runDir, { pipeline: w.pipeline, run: fake.run, cwd: w.work }));
/** The whole recorded run: plan, the gate, a person approves, implement, test, review. */
async function fullRun(t, options = {}) {
  const w = await workspace(t, options);
  const fake = fakeTeam(w.work, t.sol('deadlines.js'), options);
  const first = await advance(w, fake);
  if (first?.status !== 'awaiting-approval') t.fail(`The first advance() should stop at the gate ("awaiting-approval"), got ${JSON.stringify(first)}.`);
  writeApproval(w);
  const second = await advance(w, fake);
  return { ...w, fake, first, second };
}
const newCalls = (fake, from) => fake.calls.slice(from).map((c) => c.agent).join(' → ') || 'no calls';

export default (t) => [
  // M1 · Stage contracts
  t.check("The recorded run's artifacts keep their contracts", async () => {
    const { contractProblems } = await t.import(TEAM);
    for (const [kind, name] of [['plan', 'plan.json'], ['test-report', 'test-report.json'], ['verdict', 'verdict.json']]) {
      const problems = contractProblems(kind, recorded(name)) ?? [];
      if (problems.length) return `The recorded ${name} breaks your ${kind} contract: ${problems.slice(0, 2).join('; ')}`;
    }
    return true;
  }, { milestone: 'M1' }),
  t.check('The schemas reject broken artifacts', async () => {
    const { checkSchema, loadSchema } = await t.import(TEAM);
    const missed = BROKEN.filter((b) => !b.cross && !(checkSchema(b.value, loadSchema(b.kind)) ?? []).length);
    return !missed.length || `contracts/${missed[0].kind}.schema.json accepts ${missed[0].why}${missed.length > 1 ? ` (and ${missed.length - 1} more broken artifacts)` : ''}. See tests/fixtures/broken-artifacts.json.`;
  }, { milestone: 'M1' }),
  t.check("contractProblems() adds the rules a schema can't say", async () => {
    const { contractProblems } = await t.import(TEAM);
    const missed = BROKEN.filter((b) => !(contractProblems(b.kind, b.value) ?? []).length);
    return !missed.length || `contractProblems('${missed[0].kind}', …) accepts ${missed[0].why}${missed.length > 1 ? ` (and ${missed.length - 1} more)` : ''}.`;
  }, { milestone: 'M1' }),

  // M2 · A team with separate duties
  t.check('The pipeline: plan → approve (a person) → implement → test → review', () => {
    const p = t.json(PIPELINE);
    const ids = (p.stages ?? []).map((s) => s.id);
    if (!same(ids, ORDER)) return `The stages should be ${ORDER.join(' → ')}, got ${ids.join(' → ') || 'none'}.`;
    const gate = stageOf(p, 'approve');
    if (gate.human !== true || gate.agent) return 'approve is a person\'s job: "human": true, and no agent.';
    const agents = ORDER.filter((id) => id !== 'approve').map((id) => stageOf(p, id));
    for (const s of agents) {
      if (!s.agent) return `The ${s.id} stage needs an agent.`;
      if (!(Number.isInteger(s.credits) && s.credits >= 30)) return `The ${s.id} stage needs a credit cap of 30 or more ("credits"), got ${JSON.stringify(s.credits)}.`;
      if (s.writes !== WRITES[s.id]) return `The ${s.id} stage writes ${WRITES[s.id]}, got ${JSON.stringify(s.writes)}.`;
      if (CONTRACT[s.id] && s.contract !== CONTRACT[s.id]) return `The ${s.id} stage's output keeps the "${CONTRACT[s.id]}" contract: "contract": "${CONTRACT[s.id]}".`;
      if (!String(s.prompt ?? '').trim() || /\bTODO\b/.test(s.prompt)) return `Write the ${s.id} stage's prompt.`;
    }
    const names = agents.map((s) => s.agent);
    if (new Set(names).size !== names.length) return `Every stage needs its own agent (separation of duties), got ${names.join(', ')}.`;
    if (!(stageOf(p, 'review').reads ?? []).includes('tests.patch')) return 'The reviewer should see what the tester changed too: add "tests.patch" to the review stage\'s reads (and its prompt).';
    const total = agents.reduce((n, s) => n + s.credits, 0);
    return (Number.isInteger(p.budget) && p.budget >= total) || `The run's "budget" (${p.budget}) should cover one pass of every stage (${total}).`;
  }, { milestone: 'M2' }),
  t.check('Separate duties: planner and reviewer only read, nobody delegates, the new agents run only from the script', async () => {
    const ref = await reference(t);
    const p = t.json(PIPELINE);
    const policy = ref.loadPolicy(t.path('.github/policies/roles.json'));
    const agent = (id) => ref.parseAgentFile(t.need(`.github/agents/${id}.agent.md`, `Create .github/agents/${id}.agent.md.`), id);
    const stages = ORDER.filter((id) => id !== 'approve').map((id) => stageOf(p, id));
    if (stages.some((s) => !s?.agent)) return 'Give the plan, implement, test and review stages their agents in pipeline.json first.';
    for (const s of stages) {
      const a = agent(s.agent);
      if (/\bTODO\b/.test(`${a.description}\n${a.body}`)) return `Replace the TODOs in ${s.agent}.agent.md.`;
      const c = ref.capabilities(a.tools, policy);
      if (c.all || c.caps.includes('agent')) return `${s.agent} can hand work to other agents: in a team, the script hands work on, not the agents.`;
      if (['plan', 'review'].includes(s.id) && c.caps.some((x) => !['read', 'search'].includes(x))) return `${s.agent} (${s.id}) may only read and search, it has ${c.caps.join(', ')}: the one who judges never changes things.`;
      if (s.id === 'implement' && !(c.caps.includes('edit') && c.caps.includes('execute'))) return `${s.agent} has to change files and run the tests: edit and execute.`;
      if (s.id === 'test' && !c.caps.includes('execute')) return `${s.agent} has to run the tests: execute.`;
    }
    const open = NEW_AGENTS.filter((id) => !agent(id).explicit);
    return !open.length || `Only the script runs these: add disable-model-invocation: true to ${open.join(', ')}.`;
  }, { milestone: 'M2' }),
  t.check('The hard+ audit finds nothing, with the team in roles.json', async () => {
    const ref = await reference(t);
    const found = ref.audit(ref.loadAgents(t.path('.github/agents')), ref.loadPolicy(t.path('.github/policies/roles.json')));
    return !found.length || `The audit (node scripts/audit-agents.mjs) finds: ${found.slice(0, 3).map((f) => f.message).join(' | ')}`;
  }, { milestone: 'M2' }),
  t.check("stageArgs(): each stage's agent, artifacts, cap and permissions", async () => {
    const { stageArgs } = await t.import(TEAM);
    const p = t.json(PIPELINE);
    const stages = ORDER.filter((id) => id !== 'approve').map((id) => stageOf(p, id));
    if (stages.some((s) => !s?.agent)) return 'Give the plan, implement, test and review stages their agents in pipeline.json first.';
    for (const s of stages) {
      const a = stageArgs(s, RUN, GOAL) ?? [];
      const n = norm(a);
      const prompt = flag(a, '-p') ?? '';
      if (flag(a, '--agent') !== s.agent) return `stageArgs(${s.id}) should run --agent ${s.agent}.`;
      const missing = (s.reads ?? []).filter((f) => !prompt.includes(`${RUN}/${f}`));
      if (missing.length) return `The ${s.id} prompt should name its inputs in the run folder: ${missing.map((f) => `${RUN}/${f}`).join(', ')}.`;
      if (s.id === 'plan' && !prompt.includes(GOAL)) return 'The plan prompt should carry the run\'s goal ({goal}).';
      if (!a.includes('-s') || !a.includes('--no-ask-user')) return `stageArgs(${s.id}) needs -s and --no-ask-user: nobody is there to answer.`;
      if (Number(flag(a, '--max-ai-credits')) !== s.credits) return `stageArgs(${s.id}) should cap the call at the stage's ${s.credits} credits.`;
      if (a.some((x) => /^--(allow-all|yolo|allow-all-tools)/.test(x)) || n.some((x) => /^--allow-tool=shell(\(\))?$/.test(x))) return `stageArgs(${s.id}): no --allow-all and no bare shell permission.`;
      if (n.some((x) => /^--allow-tool=shell\(node/.test(x))) return `stageArgs(${s.id}) allows node: an agent could run node scripts/team.mjs approve itself.`;
      if (['plan', 'review'].includes(s.id) && n.some((x) => /^--allow-tool=(write|shell)/.test(x))) return `The ${s.id} stage gets no write or shell permission.`;
      if (['implement', 'test'].includes(s.id)) {
        if (!n.includes('--allow-tool=write') || !n.includes('--allow-tool=shell(npm test)')) return `The ${s.id} stage needs --allow-tool=write and --allow-tool=shell(npm test).`;
        const wider = n.filter((x) => /^--allow-tool=shell\(/.test(x) && x !== '--allow-tool=shell(npm test)');
        if (wider.length) return `The ${s.id} stage allows ${wider[0].slice('--allow-tool='.length)}: only npm test. (npm:* also allows npm exec and npm run, which run any code.)`;
        const missing = GUARDED.filter((d) => !n.includes(`--deny-tool=${d}`));
        if (missing.length) return `The ${s.id} stage should deny ${missing.join(', ')}: the gate's files, the test script, and pushing.`;
      }
    }
    return true;
  }, { milestone: 'M2' }),

  // M3 · Run the stages
  t.check('The first advance plans, then waits for a person', async () => {
    const w = await workspace(t);
    const fake = fakeTeam(w.work, t.sol('deadlines.js'));
    const r = await advance(w, fake);
    if (fake.agents() !== 'planner') return `Before approval only the planner may run, got ${fake.agents()}.`;
    if (r?.status !== 'awaiting-approval') return `advance() should return { status: "awaiting-approval" } at the gate, got ${JSON.stringify(r)}.`;
    if (!fs.existsSync(w.file('plan.json'))) return 'No plan.json in the run folder.';
    if (!same(w.json('plan.json'), recorded('plan.json'))) return 'plan.json should hold the JSON of the planner\'s answer (the recording\'s plan).';
    const want = norm(w.team.stageArgs(stageOf(w.pipeline, 'plan'), w.runDir, GOAL));
    return same(norm(fake.calls[0].args), want) || 'The planner was called with other arguments than stageArgs(plan stage, runDir, goal).';
  }, { milestone: 'M3' }),
  t.check('After approval: implement → test → review, with the artifacts of the recorded run', async () => {
    const w = await fullRun(t);
    if (w.fake.agents() !== 'planner → implementer → tester → reviewer') return `Expected planner → implementer → tester → reviewer, got ${w.fake.agents()}.`;
    if (w.second?.status !== 'done') return `After the review advance() should return { status: "done" }, got ${JSON.stringify(w.second)}.`;
    if (!fs.existsSync(w.file('changes.patch'))) return 'No changes.patch in the run folder.';
    const patch = fs.readFileSync(w.file('changes.patch'), 'utf8').replace(/\r\n/g, '\n');
    if (patch !== artifact('changes.patch')) return 'changes.patch should be unifiedDiff(file, before, after) of each file in the plan, from the baseline to the result (it differs from the recording).';
    if (!fs.existsSync(w.file('tests.patch'))) return 'No tests.patch in the run folder: the test stage writes what the tester changed (empty when it changed nothing).';
    if (fs.readFileSync(w.file('tests.patch'), 'utf8') !== artifact('tests.patch')) return 'In the recording the tester changed no test, so tests.patch is empty.';
    for (const f of ['test-report.json', 'verdict.json']) if (!fs.existsSync(w.file(f)) || !same(w.json(f), recorded(f))) return `${f} should hold the JSON of the agent's answer (the recording's ${f}).`;
    for (const c of w.fake.calls) {
      const s = w.pipeline.stages.find((x) => x.agent === c.agent);
      if (!same(norm(c.args), norm(w.team.stageArgs(s, w.runDir, GOAL)))) return `${c.agent} was called with other arguments than stageArgs(${s.id}).`;
    }
    return true;
  }, { milestone: 'M3' }),
  t.check('state.json: every stage, its output and inputs, and the credits spent', async () => {
    const w = await fullRun(t);
    const state = w.json('state.json');
    const agents = w.pipeline.stages.filter((s) => s.agent);
    const total = agents.reduce((n, s) => n + s.credits, 0);
    if (state.spent !== total) return `state.spent should be ${total} (the caps of the stages that ran), got ${state.spent}.`;
    if (state.stages?.approve?.status !== 'done') return 'The approve stage should be "done" once the gate opened.';
    for (const s of agents) {
      const st = state.stages?.[s.id] ?? {};
      if (st.status !== 'done' || st.output !== s.writes) return `state.stages.${s.id} should be { status: "done", output: "${s.writes}", … }, got ${JSON.stringify(st).slice(0, 120)}.`;
      if (st.sha256 !== sha(w.file(s.writes))) return `state.stages.${s.id}.sha256 should be the sha256 of ${s.writes}.`;
      const want = Object.fromEntries((s.reads ?? []).map((f) => [f, sha(w.file(f))]));
      if (!same(Object.keys(st.inputs ?? {}).sort(), Object.keys(want).sort()) || Object.entries(want).some(([f, h]) => st.inputs[f] !== h)) return `state.stages.${s.id}.inputs should map each file it reads to its sha256: ${JSON.stringify(want).slice(0, 120)}.`;
    }
    return true;
  }, { milestone: 'M3' }),
  t.check('A stage that would pass the budget never starts', async () => {
    const p = t.json(PIPELINE);
    const budget = stageOf(p, 'plan').credits + stageOf(p, 'implement').credits;
    const w = await fullRun(t, { budget });
    if (w.fake.calls.some((c) => c.agent === stageOf(p, 'test').agent)) return `With a budget of ${budget}, the test stage can't be paid for, but ${stageOf(p, 'test').agent} was called.`;
    if (w.second?.status !== 'stopped' || w.second?.stage !== 'test' || !/budget/i.test(w.second?.reason ?? '')) return `Expected { status: "stopped", stage: "test", reason: "budget: …" }, got ${JSON.stringify(w.second)}.`;
    return w.json('state.json').spent === budget || `state.spent should be ${budget}: the stages that ran.`;
  }, { milestone: 'M3' }),
  t.check('A broken artifact, or a change outside the plan, stops the run', async () => {
    const w = await workspace(t);
    const fake = fakeTeam(w.work, t.sol('deadlines.js'), { answers: { planner: '```json\n{ "goal": "Fix the bugs in BUGS.md", "files": ["deadlines.js"], "steps": [] }\n```' } });
    const r = await advance(w, fake);
    if (r?.status !== 'stopped' || r?.stage !== 'plan' || !/contract/i.test(r?.reason ?? '')) return `A plan without steps should stop the run: { status: "stopped", stage: "plan", reason: "contract: …" }, got ${JSON.stringify(r)}.`;
    if (fs.existsSync(w.file('plan.json'))) return 'A plan that breaks its contract must not be saved as plan.json.';
    const out = await fullRun(t, { extraEdits: { 'grades.js': '// rewritten by the implementer\n' } });
    if (out.second?.status !== 'stopped' || out.second?.stage !== 'implement' || !/grades\.js/.test(out.second?.reason ?? '')) return `An implementer that also changes grades.js (not in the plan) should stop the run at implement, naming grades.js; got ${JSON.stringify(out.second)}.`;
    return !out.fake.calls.some((c) => c.agent === 'tester') || 'After the implementer broke the plan, the tester ran anyway.';
  }, { milestone: 'M3' }),
  t.check('The tester changes test files only, and the reviewer sees what it changed', async () => {
    const addTest = (text) => `${text}\ntest('upcoming keeps an item due today', () => {\n  assert.deepEqual(upcoming(list, '2026-10-20', 0).map((a) => a.id), ['A1']);\n});\n`;
    const w = await fullRun(t, { testerEdits: { 'deadlines.test.js': addTest } });
    if (w.second?.status !== 'done') return `A tester that adds a test is doing its job: the run should finish, got ${JSON.stringify(w.second)}.`;
    const tests = fs.existsSync(w.file('tests.patch')) ? fs.readFileSync(w.file('tests.patch'), 'utf8') : '';
    if (!/\+\+\+ b\/deadlines\.test\.js/.test(tests) || !/^\+test\('upcoming keeps an item due today'/m.test(tests)) return 'tests.patch should hold the diff of every test file the tester changed (here deadlines.test.js), from the baseline.';
    const review = w.fake.calls.find((c) => c.agent === 'reviewer');
    if (!(flag(review?.args ?? [], '-p') ?? '').includes(`${RUN}/tests.patch`)) return 'The reviewer\'s prompt should point at tests.patch.';
    const bad = await fullRun(t, { testerEdits: { 'grades.js': '// "fixed" by the tester\n' } });
    if (bad.second?.status !== 'stopped' || bad.second?.stage !== 'test' || !/grades\.js/.test(bad.second?.reason ?? '')) return `A tester that changes grades.js (library code) should stop the run at test, naming grades.js; got ${JSON.stringify(bad.second)}.`;
    return !bad.fake.calls.some((c) => c.agent === 'reviewer') || 'After the tester changed library code, the reviewer ran anyway.';
  }, { milestone: 'M3' }),
  t.check('No agent may touch the run folder during its call', async () => {
    const forged = (text) => { const p = JSON.parse(text); p.files.push('grades.js'); return `${JSON.stringify(p, null, 2)}\n`; };
    const w = await fullRun(t, { extraEdits: { [`${RUN}/approval.json`]: '{ "by": "implementer", "at": "now", "plan": "0" }\n', [`${RUN}/plan.json`]: forged } });
    if (w.second?.status !== 'stopped' || w.second?.stage !== 'implement' || !/approval\.json|plan\.json/.test(w.second?.reason ?? '')) return `An implementer that rewrites approval.json (with any tool, even through a test it runs) should stop the run at implement, naming the file; got ${JSON.stringify(w.second)}.`;
    return !w.fake.calls.some((c) => c.agent === 'tester') || 'After the implementer touched the run folder, the tester ran anyway.';
  }, { milestone: 'M3' }),

  // M4 · The approval gate
  t.check('No approval, no implementer: advance() waits and calls nobody', async () => {
    const w = await workspace(t);
    const fake = fakeTeam(w.work, t.sol('deadlines.js'));
    await advance(w, fake);
    if (fake.agents() !== 'planner') return `The first advance() should call the planner and stop at the gate (M3), got ${fake.agents()}.`;
    const again = await advance(w, fake);
    if (fake.agents() !== 'planner') return `Without an approval, advance() went on: ${fake.agents()}.`;
    return again?.status === 'awaiting-approval' || `Still waiting: expected "awaiting-approval", got ${JSON.stringify(again)}.`;
  }, { milestone: 'M4' }),
  t.check("approve() binds a person's name to the plan as it is", async () => {
    const w = await workspace(t);
    fs.writeFileSync(w.file('plan.json'), artifact('plan.json'));
    const a = w.team.approve(w.runDir, { by: 'Ana', pipeline: w.pipeline, now: () => '2026-10-20T10:00:00.000Z' });
    const want = { by: 'Ana', at: '2026-10-20T10:00:00.000Z', plan: sha(w.file('plan.json')) };
    if (!same(a, want)) return `approve() should return ${JSON.stringify(want).slice(0, 80)}…, got ${JSON.stringify(a)}.`;
    if (!fs.existsSync(w.file('approval.json')) || !same(w.json('approval.json'), want)) return 'approve() should write the same object to approval.json.';
    return w.team.approvalProblem(w.runDir) === null || `With that approval, approvalProblem() should be null, got ${JSON.stringify(w.team.approvalProblem(w.runDir))}.`;
  }, { milestone: 'M4' }),
  t.check("approve() refuses no name, an agent's name, and a broken plan", async () => {
    const w = await workspace(t);
    fs.writeFileSync(w.file('plan.json'), artifact('plan.json'));
    const refuses = (by) => { try { w.team.approve(w.runDir, { by, pipeline: w.pipeline, now: () => '2026-10-20T10:00:00.000Z' }); return false; } catch { return true; } };
    if (!refuses('')) return 'approve() without a name should throw: say who approves.';
    if (!refuses('Implementer')) return 'approve() by "Implementer" should throw: an agent of the team never approves (whatever the case).';
    if (fs.existsSync(w.file('approval.json'))) return 'A refused approval must not write approval.json.';
    if (refuses('Ana')) return 'approve() by "Ana" of a valid plan should work.';
    fs.rmSync(w.file('approval.json'));
    fs.writeFileSync(w.file('plan.json'), '{ "goal": "Fix it", "files": [], "steps": [] }\n');
    if (!refuses('Ana')) return 'approve() of a plan that breaks its contract should throw.';
    return !fs.existsSync(w.file('approval.json')) || 'A refused approval must not write approval.json.';
  }, { milestone: 'M4' }),
  t.check('Editing plan.json after approval sends the run back to the gate', async () => {
    const w = await workspace(t);
    const fake = fakeTeam(w.work, t.sol('deadlines.js'));
    await advance(w, fake);
    if (!fs.existsSync(w.file('plan.json'))) return 'No plan.json after the first advance(): make the plan stage work first (M3).';
    writeApproval(w);
    const plan = w.json('plan.json');
    plan.steps.push({ id: 'S4', file: 'deadlines.js', change: 'export a helper that deletes every assignment' });
    fs.writeFileSync(w.file('plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
    const r = await advance(w, fake);
    if (fake.agents() !== 'planner') return `The plan changed after the approval, and ${fake.agents()} ran anyway.`;
    return (r?.status === 'awaiting-approval' && /plan/i.test(r?.reason ?? '')) || `Expected "awaiting-approval" with a reason about the plan, got ${JSON.stringify(r)}.`;
  }, { milestone: 'M4' }),

  // M5 · Runs that resume
  t.check('Resume: a deleted verdict re-runs only the reviewer', async () => {
    const w = await fullRun(t, { budget: 10000 });
    const before = w.fake.calls.length;
    const spent = w.json('state.json').spent;
    fs.rmSync(w.file('verdict.json'));
    const r = await advance(w, w.fake);
    if (newCalls(w.fake, before) !== 'reviewer') return `Only the reviewer's output is missing, but resuming called ${newCalls(w.fake, before)}.`;
    if (r?.status !== 'done' || !fs.existsSync(w.file('verdict.json'))) return `Expected the run to be done again with a new verdict.json, got ${JSON.stringify(r)}.`;
    const review = stageOf(w.pipeline, 'review').credits;
    return w.json('state.json').spent === spent + review || `state.spent should keep counting: ${spent} + ${review}, got ${w.json('state.json').spent}.`;
  }, { milestone: 'M5' }),
  t.check('A stage left running, or one that failed, runs again; one whose inputs are the same does not', async () => {
    const w = await fullRun(t, { budget: 10000 });
    const state = w.json('state.json');
    state.stages.implement.status = 'running';
    fs.writeFileSync(w.file('state.json'), JSON.stringify(state, null, 2));
    const before = w.fake.calls.length;
    await advance(w, w.fake);
    if (newCalls(w.fake, before) !== 'implementer') return `implement was left "running" (a crash), so it runs again; its patch is the same, so test and review don't. Got ${newCalls(w.fake, before)}.`;
    const f = await workspace(t);
    await advance(f, fakeTeam(f.work, t.sol('deadlines.js'), { answers: { planner: 'I could not finish the plan.' } }));
    const good = fakeTeam(f.work, t.sol('deadlines.js'));
    const r = await advance(f, good);
    return (good.agents() === 'planner' && r?.status === 'awaiting-approval') || `After a failed plan, resuming should ask the planner again and stop at the gate; got ${good.agents()} and ${JSON.stringify(r)}.`;
  }, { milestone: 'M5' }),
  t.check('A changed input re-runs every stage after it', async () => {
    const w = await fullRun(t, { budget: 10000 });
    const plan = w.json('plan.json');
    plan.steps[2].change = 'daysBetween() throws a RangeError that names the bad date';
    fs.writeFileSync(w.file('plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
    writeApproval(w);
    const before = w.fake.calls.length;
    await advance(w, w.fake);
    return newCalls(w.fake, before) === 'implementer → tester → reviewer' || `plan.json changed (and was approved again), so every stage that reads it runs again: expected implementer → tester → reviewer, got ${newCalls(w.fake, before)}.`;
  }, { milestone: 'M5' }),
  t.check("Resuming can't get a change outside the plan through, and the plan counts as it is now", async () => {
    const w = await fullRun(t, { budget: 10000, extraEdits: { 'grades.js': '// rewritten by the implementer\n' } });
    if (w.second?.status !== 'stopped' || w.second?.stage !== 'implement') return `An implementer that changes grades.js (not in the plan) should stop the run at implement; got ${JSON.stringify(w.second)}.`;
    const again = await advance(w, w.fake);
    if (again?.status !== 'stopped' || again?.stage !== 'implement' || !/grades\.js/.test(again?.reason ?? '')) return `Resuming changes nothing about grades.js: it still differs from the run's baseline, so the run must stop again, naming it. Got ${JSON.stringify(again)}. Compare every file with the baseline, not with the moment before the call.`;
    const plan = w.json('plan.json');
    const wider = { ...plan, files: [...plan.files, 'grades.js'], steps: [...plan.steps, { id: 'S4', file: 'grades.js', change: 'grades.js gets the header comment the team asked for' }] };
    fs.writeFileSync(w.file('plan.json'), `${JSON.stringify(wider, null, 2)}\n`);
    writeApproval(w);
    const ok = await advance(w, w.fake);
    if (ok?.status !== 'done') return `Once a person approves a plan that lists grades.js, the change is in the plan: the run should finish; got ${JSON.stringify(ok)}. Read the plan's files from plan.json as it is now.`;
    if (!/\+\+\+ b\/grades\.js/.test(fs.readFileSync(w.file('changes.patch'), 'utf8'))) return 'changes.patch should now include grades.js (from the baseline), since the plan lists it.';
    fs.writeFileSync(w.file('plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
    writeApproval(w);
    const narrow = await advance(w, w.fake);
    return (narrow?.status === 'stopped' && narrow?.stage === 'implement' && /grades\.js/.test(narrow?.reason ?? '')) || `A plan that no longer lists grades.js makes its change outside the plan again; got ${JSON.stringify(narrow)}.`;
  }, { milestone: 'M5' }),
];
