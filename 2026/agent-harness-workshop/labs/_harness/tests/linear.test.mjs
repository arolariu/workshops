import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { runLinear } from '../linear.mjs';
import { KEYMAP } from '../keys.mjs';
import { loadCatalog, exerciseByKey } from '../catalog.mjs';
import { loadCourse } from '../course.mjs';
import { computeChain, writeChain } from '../chain.mjs';
import { progressStore, captureEvidence } from '../progress.mjs';
import { fixtureWorkshop, chainCourse } from './helpers.mjs';

function session(lines, opts = {}) {
  const { labsDir } = opts.labsDir ? opts : fixtureWorkshop();
  const input = new PassThrough();
  const output = new PassThrough();
  let text = '';
  output.write = (s) => { text += String(s); return true; };
  const done = runLinear({ labsDir, input, output, deps: opts.deps });
  input.end(lines.map((l) => `${l}\n`).join(''));
  return done.then((code) => ({ code, text, labsDir }));
}

test('end of input closes the session cleanly', async () => {
  const { code, text } = await session([]);
  assert.equal(code, 0);
  assert.match(text, /Goodbye/);
});

test('a whole exercise can be worked line by line, with no escape codes', async () => {
  const { labsDir } = fixtureWorkshop();
  const file = path.join(labsDir, 'lab-04', 'medium', 'src', 'README.md');
  const { code, text } = await session([
    'list path=deeper mcp',
    'open 1',
    'checks',
    'details 1',
    'hint',
    'checkpoint first',
    'bookmark',
    'restore checkpoint:first',
    'yes',
    'compare',
    'next',
    'quit',
  ], { labsDir });
  assert.equal(code, 0);
  assert.doesNotMatch(text, /\x1b/);
  assert.match(text, /1\. Lab 04 MCP servers, Medium/);
  assert.match(text, /Open: Lab 04 MCP servers, Medium/);
  assert.match(text, /0 of 1 checks passed/);
  assert.match(text, /Check 1: done\.txt exists\. Status: fail/);
  assert.match(text, /Hint 1 of 1: First hint/);
  assert.match(text, /Checkpoint first saved/);
  assert.match(text, /Bookmarked/);
  assert.match(text, /Done\. Backup:/);
  assert.match(text, /not a byte-for-byte target/);
  assert.ok(fs.existsSync(file));
});

test('agent checks need an explicit yes', async () => {
  const started = [];
  const deps = {
    loadAgentChecks: async () => [{ name: 'asks', prompt: 'hi', expect: () => true }],
    runAgentChecks: async () => { started.push(1); return { state: 'pass', allPass: true, results: [], runId: 'r1', dir: null }; },
  };
  const declined = await session(['open lab-00 easy', 'agent', 'no', 'quit'], { deps });
  assert.match(declined.text, /Configured cap: 30 AI credits/);
  assert.match(declined.text, /Nothing was run/);
  assert.deepEqual(started, []);
  const accepted = await session(['open lab-00 easy', 'agent', 'yes', 'quit'], { deps });
  assert.match(accepted.text, /Agent checks: passed/);
  assert.deepEqual(started, [1]);
  const eof = await session(['open lab-00 easy', 'agent'], { deps });
  assert.match(eof.text, /Nothing was run/, 'end of input never counts as yes');
  assert.deepEqual(started, [1]);
});

test('unknown commands and invalid input are explained', async () => {
  const { text } = await session(['frobnicate', 'open lab-00 hamster', 'list level=hamster', 'path nowhere', 'details 1', 'checks']);
  assert.match(text, /Unknown command "frobnicate"/);
  assert.match(text, /"hamster" is not a difficulty/);
  assert.match(text, /"nowhere" is not a learning path/);
  assert.match(text, /Run "checks" first/);
  assert.match(text, /No exercise is open/);
});

test('--ascii keeps the linear mode to plain ASCII', async () => {
  const { setAscii } = await import('../ui.mjs');
  setAscii(true);
  try {
    const { text } = await session(['list path=security', 'open 1', 'show', 'hint', 'quit']);
    assert.match(text, /^[\x00-\x7f]*$/);
    assert.match(text, /Soft rules|Lab 05/);
  } finally {
    setAscii(false);
  }
});

const M_TODO = '# 🔴 Hard · M\n\n> 🕐 30 min\n\n## 🎯 Mission\nGo.\n\n## 🧭 Milestones\n### M1 · First\n- one\n### M2 · Second\n- two\n\n## 💡 Hints\n### M1\n<details><summary>Hint for one</summary>\n\nx\n\n</details>\n### M2\n<details><summary>Hint for two</summary>\n\ny\n\n</details>\n';

test('show says where a level starts and lists its milestones; hint follows the current milestone', async () => {
  const { labsDir } = fixtureWorkshop();
  fs.writeFileSync(path.join(labsDir, 'lab-05/hard/todo.md'), M_TODO);
  const { text } = await session(['open lab-01 medium', 'show', 'open lab-00 easy', 'open lab-05 hard', 'hint', 'hint', 'quit'], { labsDir });
  assert.match(text, /Starts from: Lab 01, Easy \(reference\)/);
  assert.match(text, /Shape it\. Optional homework\./);
  assert.match(text, /Starts from: the plain app, the start of the chain/);
  assert.match(text, /Milestones:/);
  assert.match(text, /M1, First: not checked yet/);
  assert.match(text, /M1, Hint 1 of 2: Hint for one/);
  assert.match(text, /All hints for M1 are revealed/);
  assert.doesNotMatch(text, /Hint for two/);
});

test('bring shows the plan and asks first; nothing changes without yes', async () => {
  const none = await session(['open lab-01 easy', 'bring', 'quit']);
  assert.match(none.text, /no seed record/);
  const labsDir = chainCourse({
    'lab-00/easy': { src: { 'app.js': 'v1\n' }, sol: { 'app.js': 'v1\n', 'done.txt': 'x\n' } },
    'lab-01/easy': { src: {}, sol: { 'done.txt': 'x\n' } },
  });
  writeChain({ labsDir, result: computeChain({ catalog: loadCatalog(labsDir), course: loadCourse(labsDir), manifest: null, bootstrap: true }) });
  const { ex } = exerciseByKey(loadCatalog(labsDir), 'lab-00/easy');
  fs.writeFileSync(path.join(ex.src, 'done.txt'), 'x\n');
  fs.writeFileSync(path.join(ex.src, 'AGENTS.md'), 'mine\n');
  progressStore(labsDir).recordChecks(ex.key, { state: 'pass', allPass: true, passed: 1, total: 1, results: [] }, captureEvidence(ex));
  const declined = await session(['open lab-01 easy', 'bring', 'no', 'quit'], { labsDir });
  assert.match(declined.text, /AGENTS\.md\s+← lab-00 easy/);
  assert.match(declined.text, /Nothing was changed/);
  const target = path.join(labsDir, 'lab-01', 'easy', 'src', 'AGENTS.md');
  assert.ok(!fs.existsSync(target));
  const accepted = await session(['open lab-01 easy', 'bring', 'yes', 'show', 'quit'], { labsDir });
  assert.match(accepted.text, /Brought 1 file\(s\) in/);
  assert.match(accepted.text, /plus your work brought in on/);
  assert.equal(fs.readFileSync(target, 'utf8'), 'mine\n');
});

test('changes lists your changes since the last commit, or says why it cannot', async () => {
  const none = await session(['open lab-01 easy', 'changes', 'quit']);
  assert.match(none.text, /not in a git repository[\s\S]*git init/);
  const files = [{ path: 'a.js', status: 'changed', binary: false, diff: '@@ -1 +1 @@\n-old\n+new\n', note: null }, { path: 'logo.png', status: 'new', binary: true, diff: '', note: 'A binary file: no line-by-line view.' }];
  const some = await session(['open lab-01 easy', 'changes', 'quit'], { deps: { changesDiff: () => ({ ok: true, files }) } });
  assert.match(some.text, /2 file\(s\) changed since your latest commit/);
  assert.match(some.text, /Changed: a\.js\n[\s\S]*-old\n\+new/);
  assert.match(some.text, /New: logo\.png\. A binary file/);
});
test('after a pass: the takeaway and the question; answer N gives feedback; quiz asks again', async () => {
  const { labsDir } = fixtureWorkshop();
  fs.writeFileSync(path.join(labsDir, 'lab-03/easy/todo.md'), '# 🟢 Easy · Q\n\n> 🕐 10 min\n\n## 🎯 Mission\nGo.\n\n## 🧠 Takeaway\nA tool list is a guarantee.\n\n## ❓ Check yourself\nWhy read-only?\n1. A wish.\n2. A guarantee.\n\n<details><summary>Answer</summary>\n\n**2.** The schema never reaches the model.\n\n</details>\n');
  const passAll = async () => ({ state: 'pass', allPass: true, complete: true, results: [{ idx: 0, name: 'done', status: 'pass', message: '' }], passed: 1, failed: 0, skipped: 0, blocked: 0, total: 1, fatal: null, stdout: '', stderr: '', planMilestones: [null], milestones: {} });
  const locked = await session(['open lab-03 easy', 'quiz', 'quit'], { labsDir });
  assert.match(locked.text, /unlock when your checks pass/);
  const { text } = await session(['open lab-03 easy', 'checks', 'answer 1', 'answer 2', 'quiz', 'answer 9', 'quit'], { labsDir, deps: { runChecks: passAll } });
  assert.match(text, /Takeaway: A tool list is a guarantee\.[\s\S]*Check yourself: Why read-only\?\n {2}1\. A wish\.\n {2}2\. A guarantee\.\nType "answer N"/);
  assert.match(text, /Not quite: the answer is 2\. The schema never reaches the model\./);
  assert.match(text, /Right\. The schema never reaches the model\./);
  assert.match(text, /There is no option 9/);
  assert.equal(progressStore(labsDir).get('lab-03/easy').quiz, 'wrong', 'the first answer is the one recorded');
});
test('show includes the time on the level; past 1.5x the suggestion, one nudge toward a hint', async () => {
  const { labsDir } = fixtureWorkshop();
  let now = 5_000_000;
  const input = new PassThrough();
  const output = new PassThrough();
  let text = '';
  output.write = (s) => { text += String(s); return true; };
  const done = runLinear({ labsDir, input, output, deps: { now: () => now } });
  const send = async (line) => { input.write(`${line}\n`); await new Promise((r) => setTimeout(r, 30)); };
  await send('open lab-01 easy');
  now += 12 * 60_000;
  await send('show');
  assert.match(text, /⏱ 12 min here · suggested 10/);
  now += 5 * 60_000;
  await send('show');
  assert.match(text, /⏱ 17 min here[\s\S]*A hint \(type "hint"\) could save you time/);
  now += 60_000;
  await send('show');
  assert.equal((text.match(/could save you time/g) ?? []).length, 1, 'only one nudge');
  input.end('quit\n');
  await done;
  assert.equal(progressStore(labsDir).get('lab-01/easy').activeMs, 18 * 60_000);
});

test('history starts with the credit meter', async () => {
  const startedAt = new Date().toISOString();
  const runs = [{ runId: 'r1', startedAt, state: 'pass', budget: { cases: [{ configuredCap: 30 }] }, cases: [{ name: 'one', status: 'pass', startedAt, launched: true }] }];
  const { text } = await session(['open lab-01 easy', 'history', 'quit'], { deps: { listRuns: () => runs } });
  assert.match(text, /💳 1 agent-check run this month · at most 30 credits · \/usage has the real number/);
});
test('glossary works in linear mode too', async () => {
  const { labsDir } = fixtureWorkshop();
  fs.writeFileSync(path.join(labsDir, 'glossary.md'), '- **Hook**: your code that runs before a tool call. (Lab 05)\n');
  const { text } = await session(['glossary hook', 'glossary zebra', 'quit'], { labsDir });
  assert.match(text, /Hook: your code that runs before a tool call\. \(Lab 05\)/);
  assert.match(text, /No term matches "zebra"/);
});
test('xray works line by line too', async () => {
  const { text } = await session(['open lab-03 easy', 'xray', 'xray sol', 'quit']);
  assert.match(text, /X-ray of your work[\s\S]*CONTEXT BUDGET[\s\S]*MATURITY · L0 Bare/);
  assert.match(text, /X-ray of the reference solution/);
  assert.doesNotMatch(text, /\x1b/);
});
test('linear agent and history print each case timeline', async () => {
  const timeline = '⛔ powershell rm -rf x (denied by a hook) · 💬 answer';
  const deps = {
    loadAgentChecks: async () => [{ name: 'guard', prompt: 'hi', expect: () => true }, { name: 'plain', prompt: 'hi', expect: () => true }],
    runAgentChecks: async ({ onEvent }) => {
      onEvent({ type: 'result', idx: 0, name: 'guard', status: 'pass', traced: true, timeline });
      onEvent({ type: 'result', idx: 1, name: 'plain', status: 'pass', traced: false, output: 'A plain answer.' });
      return { state: 'pass', allPass: true, results: [], runId: 'r1', dir: null };
    },
    listRuns: () => [{ runId: 'r1', startedAt: new Date().toISOString(), state: 'pass', cases: [{ name: 'guard', status: 'pass', timeline }] }],
  };
  const { text } = await session(['open lab-00 easy', 'agent', 'yes', 'history', 'quit'], { deps });
  assert.match(text, /What happened: ⛔ powershell rm -rf x \(denied by a hook\)/);
  assert.match(text, /No JSON trace, so there is no timeline/);
  assert.match(text, /What happened in "guard": ⛔ powershell/);
});
test('linear replay prints the turns of either recording', async () => {
  const { text } = await session(['replay', 'replay harnessed', 'replay hamster', 'quit']);
  assert.match(text, /The agent loop, No harness: 6 turns/);
  assert.match(text, /Now compare it with the other run: replay harnessed/);
  assert.match(text, /denied by a hook: Recursive force-deletes/);
  assert.match(text, /There is no recording "hamster"/);
});
test('linear checks print the inherited group after the result, and it changes nothing that is recorded', async () => {
  const { labsDir } = fixtureWorkshop();
  fs.mkdirSync(path.join(labsDir, 'lab-05/easy/src/.github/skills/x'), { recursive: true });
  fs.writeFileSync(path.join(labsDir, 'lab-05/easy/src/.github/skills/x/SKILL.md'), '---\nname: wrong\ndescription: Helps.\n---\n1.\n');
  fs.writeFileSync(path.join(labsDir, 'lab-05/easy/src/done.txt'), 'x\n');
  const { text } = await session(['open lab-05 easy', 'checks', 'quit'], { labsDir });
  assert.match(text, /All 1 checks passed\.[\s\S]*YOUR HARNESS SO FAR · advisory[\s\S]*Skills name "wrong"/);
  assert.equal(progressStore(labsDir).get('lab-05/easy').checks, 'pass', 'a failing inherited rule never turns the pass into a fail');
});
test('present works in linear mode too: the slides as text', async () => {
  const { labsDir } = fixtureWorkshop();
  fs.writeFileSync(path.join(labsDir, 'lab-02', 'readme.md'), '# Lab 02 · 🧩 Skills — Know-how on demand\n\n## In one minute\nA skill is a recipe.\n\n## 🔬 Under the hood\nOnly the description is always on.\n\n## Anatomy of a skill\nA folder with SKILL.md.\n');
  const { text } = await session(['present lab-02', 'present lab-42', 'quit'], { labsDir });
  assert.match(text, /1\/\d+ · Lab 02[^\n]*In one minute/);
  assert.match(text, /Anatomy of a skill/);
  assert.match(text, /"lab-42" is not a lab/);
  assert.doesNotMatch(text, /\x1b\[/);
});

// Linear mode (screen readers, simple terminals) can do everything the app can: every action of the key table maps to
// a linear command, or says why it doesn't apply to a line-by-line session.
const NA = (why) => ({ na: why });
const LINEAR_FOR = {
  'home.prev': 'list', 'home.nextItem': 'list', 'home.jump': 'open', 'home.open': 'open', 'home.next': 'next', 'home.search': 'list',
  'home.path': 'path', 'home.doctor': 'doctor', 'home.export': 'export', 'home.replay': 'replay', 'home.page': NA('no screen to page'),
  'lab.prev': 'list', 'lab.nextItem': 'list', 'lab.tier': 'open', 'lab.open': 'open', 'lab.guide': 'guide', 'lab.search': 'list', 'lab.back': NA('no screens'), 'lab.page': NA('no screen to page'),
  'browse.prev': 'list', 'browse.nextItem': 'list', 'browse.open': 'open', 'browse.search': 'list', 'browse.level': 'list', 'browse.status': 'list', 'browse.time': 'list',
  'browse.path': 'path', 'browse.bookmarked': 'list', 'browse.next': 'next', 'browse.back': NA('no screens'), 'browse.page': NA('no screen to page'),
  'scroll.scroll': NA('every line is printed'), 'scroll.back': NA('no screens'),
  'doctor.scroll': NA('every line is printed'), 'doctor.again': 'doctor', 'doctor.back': NA('no screens'),
  'export.markdown': 'export', 'export.json': 'export', 'export.back': NA('no screens'),
  'exercise.scroll': NA('every line is printed'), 'exercise.checks': 'checks', 'exercise.copilot': 'copilot', 'exercise.hint': 'hint', 'exercise.agent': 'agent',
  'exercise.bring': 'bring', 'exercise.changes': 'changes', 'exercise.learn': 'quiz', 'exercise.xray': 'xray', 'exercise.more': NA('every item is its own command'),
  'exercise.watch': NA('a line-by-line session runs the checks when you type checks; watching a folder would interleave output with typing'),
  'exercise.guide': 'guide', 'exercise.solution': 'compare', 'exercise.recovery': 'recovery', 'exercise.bookmark': 'bookmark', 'exercise.history': 'history',
  'exercise.open': 'show', 'exercise.copy': 'show', 'exercise.doctor': 'doctor', 'exercise.export': 'export', 'exercise.next': 'next', 'exercise.tier': 'open',
  'exercise.search': 'list', 'exercise.back': NA('no screens'),
  'menu.prev': NA('no menu'), 'menu.nextItem': NA('no menu'), 'menu.doIt': NA('no menu'), 'menu.item': NA('every item is its own command'), 'menu.back': NA('no screens'),
  'checks.prev': 'details', 'checks.nextItem': 'details', 'checks.page': NA('no screen to page'), 'checks.details': 'details', 'checks.again': 'checks', 'checks.output': 'output',
  'checks.watch': NA('see exercise.watch'), 'checks.copilot': 'copilot', 'checks.agent': 'agent', 'checks.next': 'next', 'checks.doctor': 'doctor', 'checks.back': NA('no screens'), 'checks.answer': 'answer',
  'checksRunning.cancel': NA('Ctrl+C cancels a run'),
  'checkDetail.scroll': NA('every line is printed'), 'checkDetail.nextCheck': 'details', 'checkDetail.prevCheck': 'details', 'checkDetail.hint': 'hint', 'checkDetail.output': 'output',
  'checkDetail.copilot': 'copilot', 'checkDetail.doctor': 'doctor', 'checkDetail.back': NA('no screens'),
  'agent.scroll': NA('every line is printed'), 'agent.again': 'agent', 'agent.history': 'history', 'agent.back': NA('no screens'),
  'agentConfirm.yes': 'agent', 'agentConfirm.no': 'agent', 'agentLoading.no': 'agent', 'agentRunning.cancel': NA('Ctrl+C cancels a run'),
  'history.prev': 'history', 'history.nextItem': 'history', 'history.page': NA('no screen to page'), 'history.toggle': 'history', 'history.back': NA('no screens'),
  'confirmSolution.show': 'compare', 'confirmSolution.hint': 'hint', 'confirmSolution.back': NA('no screens'),
  'bring.scroll': NA('every line is printed'), 'bring.yes': 'bring', 'bring.back': 'bring',
  'solution.nextFile': 'compare', 'solution.prevFile': 'compare', 'solution.toggle': 'compare', 'solution.scroll': NA('every line is printed'), 'solution.back': NA('no screens'),
  'changes.nextFile': 'changes', 'changes.prevFile': 'changes', 'changes.scroll': NA('every line is printed'), 'changes.back': NA('no screens'),
  'learn.answer': 'answer', 'learn.scroll': NA('every line is printed'), 'learn.back': NA('no screens'),
  'xray.scroll': NA('every line is printed'), 'xray.side': 'xray', 'xray.again': 'xray', 'xray.back': NA('no screens'),
  'replay.nextTurn': 'replay', 'replay.prevTurn': 'replay', 'replay.switch': 'replay', 'replay.scroll': NA('every line is printed'), 'replay.back': NA('no screens'),
  'present.nextSlide': 'present', 'present.prevSlide': 'present', 'present.first': 'present', 'present.last': 'present', 'present.back': NA('no screens'),
  'recovery.prev': 'recovery', 'recovery.nextItem': 'recovery', 'recovery.page': NA('no screen to page'), 'recovery.restore': 'restore', 'recovery.save': 'checkpoint', 'recovery.back': NA('no screens'),
  'recoveryConfirm.yes': 'restore', 'recoveryConfirm.keep': 'restore', 'recoveryResult.back': NA('no screens'),
};

test('linear mode covers every action of the app: each key-table action has a linear command (or a reason it does not apply)', async () => {
  const actions = Object.entries(KEYMAP).flatMap(([state, list]) => list.map((b) => `${state}.${b.id}`));
  assert.deepEqual(actions.filter((a) => !(a in LINEAR_FOR)), [], 'actions with no linear command and no reason');
  const { text } = await session(['help', 'quit']);
  const commands = [...new Set(Object.values(LINEAR_FOR).filter((v) => typeof v === 'string'))];
  for (const c of commands) assert.match(text, new RegExp(`^  ${c}\\b`, 'm'), `linear help lists "${c}"`);
});

test('guide prints a lab guide in linear mode', async () => {
  const { text } = await session(['open lab-01 easy', 'guide', 'guide lab-02', 'guide lab-42', 'quit']);
  assert.match(text, /Instructions in one minute/);
  assert.match(text, /Skills in one minute/);
  assert.match(text, /"lab-42" is not a lab/);
});
