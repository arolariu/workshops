import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { startTui } from '../tui.mjs';
import { loadCatalog, exerciseByKey } from '../catalog.mjs';
import { progressStore, captureEvidence } from '../progress.mjs';
import { inline, stripAnsi, renderMarkdown, setAscii, width } from '../ui.mjs';
import { loadCourse } from '../course.mjs';
import { computeChain, writeChain } from '../chain.mjs';
import { fixtureWorkshop, waitFor, chainCourse } from './helpers.mjs';

function terminal({ columns = 80, rows = 24 } = {}) {
  const input = new PassThrough();
  input.isTTY = true;
  input.rawCalls = [];
  input.setRawMode = (on) => { input.rawCalls.push(on); return input; };
  const output = new PassThrough();
  Object.assign(output, { columns, rows, isTTY: true, writes: [] });
  output.write = (s) => { output.writes.push(String(s)); return true; };
  return { input, output };
}
const frame = (output) => stripAnsi(output.writes.filter((w) => w.startsWith('\x1b[H')).at(-1) ?? '').split('\r\n').map((l) => l.replace(/\x1b\[K/g, ''));
const text = (output) => frame(output).join('\n');
const press = (input, str, name = str, extra = {}) => input.emit('keypress', str, { name, ...extra });
const tick = () => new Promise((r) => setImmediate(r));

async function app(opts = {}) {
  const { labsDir } = opts.labsDir ? opts : fixtureWorkshop();
  const term = terminal(opts.size);
  const exits = [];
  const deps = {
    inspectEnvironment: async () => ({ ready: true, coreReady: true, items: [{ id: 'copilot', label: 'GitHub Copilot CLI', status: 'ready', required: true, category: 'workshop' }] }),
    copyToClipboard: async () => 'system',
    openFolder: async () => 'your file manager',
    ...opts.deps,
  };
  const catalog = loadCatalog(labsDir);
  const open = opts.open ? exerciseByKey(catalog, opts.open) : null;
  const a = await startTui({ labsDir, input: term.input, output: term.output, anim: false, intro: false, ascii: Boolean(opts.ascii), path: opts.path, open, deps, onExit: (c) => exits.push(c) });
  await waitFor(() => a.state.env);
  return { ...a, ...term, labsDir, catalog, exits };
}

test('confirming twice starts one paid suite, and c cancels it', async () => {
  const startedSuites = [];
  let suiteResult;
  const t = await app({
    open: 'lab-00/easy',
    deps: {
      loadAgentChecks: async () => [{ name: 'asks Copilot', prompt: 'hi', expect: () => true }],
      runAgentChecks: ({ signal }) => {
        startedSuites.push(Date.now());
        suiteResult = new Promise((resolve) => signal.addEventListener('abort', () => resolve({ runId: 'run-1', state: 'cancelled', allPass: false, results: [{ name: 'asks Copilot', status: 'cancelled', message: 'Cancelled while the agent was running.' }] })));
        return suiteResult;
      },
    },
  });
  press(t.input, 'a');
  await waitFor(() => t.state.agent?.phase === 'confirm');
  assert.match(text(t.output), /Configured cap: 30 AI credits/);
  press(t.input, 'y');
  press(t.input, 'y');
  await waitFor(() => startedSuites.length === 1);
  await tick();
  assert.equal(startedSuites.length, 1);
  press(t.input, 'c');
  assert.equal((await suiteResult).state, 'cancelled');
  await waitFor(() => t.state.agent.phase === 'done');
  assert.match(text(t.output), /Cancelled/);
  assert.doesNotMatch(text(t.output), /Agent check passed/);
  assert.equal(progressStore(t.labsDir).get('lab-00/easy').agent, undefined, 'a cancelled suite records no result');
  t.quit();
});

test('leaving the confirmation before admission never launches a suite', async () => {
  const startedSuites = [];
  let release;
  const t = await app({
    open: 'lab-00/easy',
    deps: {
      loadAgentChecks: () => new Promise((r) => { release = () => r([{ name: 'x', prompt: 'hi', expect: () => true }]); }),
      runAgentChecks: async () => { startedSuites.push(1); return { state: 'pass', allPass: true, results: [], runId: 'r' }; },
    },
  });
  press(t.input, 'a');
  await waitFor(() => release);
  press(t.input, 'b');
  release();
  await tick();
  await tick();
  assert.equal(t.state.screen, 'exercise');
  press(t.input, 'y');
  await tick();
  assert.deepEqual(startedSuites, []);
  release = null;
  press(t.input, 'a');
  await waitFor(() => release);
  release();
  await waitFor(() => t.state.agent?.phase === 'confirm');
  press(t.input, 'n');
  press(t.input, 'y');
  await tick();
  assert.deepEqual(startedSuites, []);
  t.quit();
});

test('the checks screen shows the runner\'s authoritative outcome', async () => {
  const outcomes = [
    { state: 'interrupted', complete: false, fatal: 'The checks stopped early (exit code 1) after 1 of 2 checks.', expect: /stopped early/, reject: /Still green|ALL CHECKS PASSED/ },
    { state: 'blocked', complete: true, fatal: null, expect: /Blocked/, reject: /ALL CHECKS PASSED/ },
    { state: 'skipped', complete: true, fatal: null, expect: /Not complete/, reject: /ALL CHECKS PASSED/ },
  ];
  for (const o of outcomes) {
    const t = await app({
      open: 'lab-00/easy',
      deps: { runChecks: async () => ({ state: o.state, allPass: false, complete: o.complete, results: [{ idx: 0, name: 'a', status: 'pass', message: '', optional: false, detail: {}, files: [], output: '' }], passed: 1, failed: 0, skipped: 0, blocked: 0, total: 2, fatal: o.fatal, stdout: '', stderr: '' }) },
    });
    press(t.input, 't');
    await waitFor(() => t.state.run && !t.state.run.running);
    assert.match(text(t.output), o.expect, o.state);
    assert.doesNotMatch(text(t.output), o.reject, o.state);
    assert.notEqual(progressStore(t.labsDir).get('lab-00/easy').checks, 'pass');
    t.quit();
  }
});

test('the checks screen fills in live, and c cancels a running check', async () => {
  let release;
  const t = await app({
    open: 'lab-00/easy',
    deps: {
      runChecks: ({ onEvent, signal }) => new Promise((resolve) => {
        onEvent({ type: 'plan', total: 2, names: ['first', 'second'] });
        onEvent({ type: 'start', idx: 0, name: 'first' });
        onEvent({ type: 'result', idx: 0, name: 'first', status: 'pass', message: '', optional: false });
        onEvent({ type: 'start', idx: 1, name: 'second' });
        release = resolve;
        signal.addEventListener('abort', () => resolve({ state: 'cancelled', allPass: false, complete: false, results: [{ idx: 0, name: 'first', status: 'pass', message: '', optional: false, detail: {}, files: [], output: '' }], passed: 1, failed: 0, skipped: 0, blocked: 0, total: 2, fatal: 'The checks were cancelled.', stdout: '', stderr: '' }));
      }),
    },
  });
  press(t.input, 't');
  await waitFor(() => release);
  assert.match(text(t.output), /✅ first/);
  assert.match(text(t.output), /second/);
  press(t.input, 'c');
  await waitFor(() => !t.state.run.running);
  assert.match(text(t.output), /Cancelled/);
  assert.equal(progressStore(t.labsDir).get('lab-00/easy').checks, undefined, 'a cancelled run records no result');
  t.quit();
});

test('a selected check shows its requirement, observation, evidence, files and output', async () => {
  const t = await app({
    open: 'lab-00/easy',
    size: { columns: 100, rows: 60 },
    deps: {
      runChecks: async () => ({
        state: 'fail', allPass: false, complete: true, passed: 0, failed: 1, skipped: 0, blocked: 0, total: 1, fatal: null, stdout: 'checking\n', stderr: '',
        results: [{ idx: 0, name: 'Totals add up', status: 'fail', message: 'Wrong total in `README.md`.', optional: false, detail: { expected: 42, actual: 41 }, files: ['README.md'], output: 'looked at README.md\n' }],
      }),
    },
  });
  press(t.input, 't');
  await waitFor(() => t.state.run && !t.state.run.running);
  press(t.input, '\r', 'return');
  const shown = text(t.output);
  for (const re of [/REQUIREMENT/, /Totals add up/, /WHAT WAS OBSERVED/, /Wrong total/, /expected\s+42/, /actual\s+41/, /RELEVANT FILES/, /README\.md/, /OUTPUT FROM THIS CHECK/, /looked at README\.md/, /HINTS/]) assert.match(shown, re);
  press(t.input, 'o');
  assert.match(text(t.output), /STANDARD OUTPUT[\s\S]*checking/);
  t.quit();
});

test('Next and the home screen use fresh evidence, including updates from the CLI', async () => {
  const t = await app();
  const cli = progressStore(t.labsDir);
  const { ex } = exerciseByKey(t.catalog, 'lab-00/easy');
  fs.writeFileSync(path.join(ex.src, 'done.txt'), 'done\n');
  cli.recordChecks(ex.key, { state: 'pass', allPass: true, passed: 1, total: 1, results: [] }, captureEvidence(ex));
  press(t.input, 'n');
  assert.equal(t.catalog[t.state.lab].levels[t.state.level].key, 'lab-01/easy', 'the CLI pass is seen');
  const { ex: ex1 } = exerciseByKey(t.catalog, 'lab-01/easy');
  fs.writeFileSync(path.join(ex1.src, 'done.txt'), 'done\n');
  cli.recordChecks(ex1.key, { state: 'pass', allPass: true, passed: 1, total: 1, results: [] }, captureEvidence(ex1));
  press(t.input, 'b');
  press(t.input, 'b');
  assert.match(text(t.output), /2\/24/);
  fs.appendFileSync(path.join(ex.src, 'README.md'), 'edited elsewhere\n');
  press(t.input, 'n');
  assert.equal(t.catalog[t.state.lab].levels[t.state.level].key, 'lab-00/easy', 'the edit made it stale: your last level passes, so Next is the first unfinished easy level');
  press(t.input, 'b');
  press(t.input, 'b');
  assert.match(text(t.output), /1\/24/);
  t.quit();
});

test('a corrupt progress file is reported, kept, and the app still works', async () => {
  const { labsDir } = fixtureWorkshop();
  fs.writeFileSync(path.join(labsDir, '.progress.json'), '{ broken');
  const t = await app({ labsDir });
  assert.match(text(t.output), /could not be read/);
  assert.ok(fs.readdirSync(labsDir).some((f) => f.startsWith('.progress.corrupt-')));
  press(t.input, 'n');
  assert.equal(t.state.screen, 'exercise');
  t.quit();
});

test('the selection stays visible at 40x16, 80x24 and 120x40', async () => {
  for (const size of [{ columns: 40, rows: 16 }, { columns: 80, rows: 24 }, { columns: 120, rows: 40 }]) {
    const t = await app({ size });
    press(t.input, 'k', 'up');
    const rows = frame(t.output);
    assert.equal(rows.length, size.rows);
    assert.ok(rows.some((r) => /❯\s+07/.test(r)), `last lab selected and visible at ${size.columns}x${size.rows}`);
    assert.ok(rows.every((r) => [...r].length <= size.columns), 'nothing is wider than the terminal');
    press(t.input, '/');
    press(t.input, '\r', 'return');
    for (let i = 0; i < 30; i++) press(t.input, 'j', 'down');
    const browse = text(t.output);
    assert.match(browse, /❯[^\n]*Lab 07/, `last search result visible at ${size.columns}x${size.rows}`);
    press(t.input, '\r', 'return');
    assert.equal(t.catalog[t.state.lab].levels[t.state.level].key, 'lab-07/hard');
    assert.ok(frame(t.output).some((r) => /q quit|\? all keys/.test(r)), 'the footer keeps its keys');
    t.quit();
  }
});

test('search and filters lead to an exercise', async () => {
  const t = await app();
  press(t.input, '/');
  for (const ch of 'mcp') press(t.input, ch);
  press(t.input, '\r', 'return');
  assert.match(text(t.output), /3 matches/);
  press(t.input, 'v');
  press(t.input, 'v');
  assert.match(text(t.output), /1 match\b/);
  press(t.input, '\r', 'return');
  assert.equal(t.catalog[t.state.lab].levels[t.state.level].key, 'lab-04/medium');
  t.quit();
});

test('--no-anim is static: nothing is repainted while idle', async () => {
  const t = await app();
  await new Promise((r) => setTimeout(r, 50));
  const before = t.output.writes.length;
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(t.output.writes.length, before);
  t.quit();
});

test('ASCII mode keeps difficulties and statuses apart with plain characters', async () => {
  const t = await app({ ascii: true });
  const shown = frame(t.output).join('\n');
  assert.match(shown, /^[\x00-\x7f]*$/);
  assert.match(shown, /\[ \]/);
  assert.match(shown, /E EASY/);
  t.quit();
  setAscii(false);
});

test('restoring needs an explicit y; any other key keeps the work', async () => {
  const t = await app({ open: 'lab-00/easy' });
  const { ex } = exerciseByKey(t.catalog, 'lab-00/easy');
  press(t.input, 'x');
  assert.equal(t.state.screen, 'recovery');
  fs.writeFileSync(path.join(ex.src, 'README.md'), 'my attempt\n');
  press(t.input, '\r', 'return');
  assert.ok(t.state.recovery.confirm);
  press(t.input, '\r', 'return');
  assert.equal(t.state.recovery.confirm, null);
  assert.equal(fs.readFileSync(path.join(ex.src, 'README.md'), 'utf8'), 'my attempt\n');
  press(t.input, '\r', 'return');
  press(t.input, 'y');
  assert.equal(t.state.recovery.result?.ok, true, t.state.recovery.result?.reason);
  assert.notEqual(fs.readFileSync(path.join(ex.src, 'README.md'), 'utf8'), 'my attempt\n');
  assert.match(text(t.output), /previous files are safe/);
  t.quit();
});

test('quitting restores the terminal', async () => {
  const t = await app();
  press(t.input, 'q');
  assert.equal(await t.closed, 0);
  assert.deepEqual(t.exits, [0]);
  const all = t.output.writes.join('');
  assert.ok(all.lastIndexOf('\x1b[?1049l') > all.lastIndexOf('\x1b[?1049h'), 'left the alternate screen');
  assert.ok(all.lastIndexOf('\x1b[?25h') > all.lastIndexOf('\x1b[?25l'), 'cursor shown again');
  assert.equal(t.input.rawCalls.at(-1), false, 'raw mode switched off');
  assert.equal(t.input.listenerCount('keypress'), 0);
});

test('Markdown keeps link destinations and wraps code instead of cutting it', () => {
  assert.match(stripAnsi(inline('See [the docs](https://example.com/x).')), /the docs \(https:\/\/example\.com\/x\)/);
  const code = renderMarkdown('```\nconst value = "a fairly long line of code that will not fit";\n```', 30).map(stripAnsi);
  assert.ok(code.length > 1);
  assert.match(code.map((l) => l.replace(/^\s*↪?/, '')).join(''), /code that will not fit";$/);
  const table = renderMarkdown('| Key | What it does |\n|---|---|\n| **t** | run the free checks with a long explanation that needs room |', 24).map(stripAnsi);
  assert.ok(table.every((l) => l.length <= 24), table.join('\n'));
  for (const word of ['run', 'free', 'checks', 'explanation', 'room']) assert.match(table.join(' '), new RegExp(word));
  const stacked = renderMarkdown('| Key | What it does |\n|---|---|\n| **t** | run the free checks |', 14).map(stripAnsi);
  assert.ok(stacked.every((l) => l.length <= 14), stacked.join('\n'));
  assert.match(stacked.join(' '), /Key: t[\s\S]*What it\s+does:\s+run the\s+free\s+checks/);
});

// ---------- Phase 1: tiers, the chain, bring and milestones ----------
const widest = (output) => Math.max(...frame(output).map((l) => width(l)));

test('home: two counts, 👥/🏠 over the tiers, readable at 80 and 120 columns', async () => {
  for (const columns of [80, 120]) {
    const t = await app({ size: { columns, rows: 40 } });
    const s = text(t.output);
    assert.match(s, /Workshop 0\/8/, `${columns} columns`);
    assert.match(s, /Homework 0\/16/, `${columns} columns`);
    assert.match(s, /👥/);
    assert.match(s, /🏠/);
    assert.match(s, /07 {2}🚀 {2}Agentic workflows/, 'lab names are not cut off');
    assert.match(s, /q quit/, 'the footer keeps its last key');
    assert.ok(widest(t.output) <= columns, `${columns} columns`);
    t.quit();
  }
});

test('lab and mission screens show the tier theme, time and where the level starts; 1-5 pick a tier', async () => {
  const t = await app({ open: 'lab-01/medium' });
  assert.match(text(t.output), /Starts from: Lab 01 · 🟢 Easy \(reference\)/);
  assert.match(text(t.output), /Shape it · 🏠 homework/);
  press(t.input, 'b');
  assert.equal(t.state.screen, 'lab');
  assert.match(text(t.output), /Use it · 🕐 10 min · 👥 together, live/);
  press(t.input, '3');
  assert.equal(t.state.screen, 'exercise');
  assert.equal(t.catalog[t.state.lab].levels[t.state.level].level, 'hard');
  press(t.input, '5');
  assert.match(text(t.output), /no Hard\+\+ level yet/);
  assert.equal(t.catalog[t.state.lab].levels[t.state.level].level, 'hard', 'a missing tier changes nothing');
  t.quit();
});

test('the first level says it is the start of the chain; n on an easy level moves down the live track', async () => {
  const t = await app({ open: 'lab-00/easy' });
  assert.match(text(t.output), /start of the chain/);
  press(t.input, 'n');
  assert.equal(t.catalog[t.state.lab].levels[t.state.level].key, 'lab-01/easy', 'even though lab-00/easy is not finished');
  t.quit();
});

const M_TODO = '# 🔴 Hard · M\n\n> 🕐 30 min\n\n## 🎯 Mission\nGo.\n\n## 🧭 Milestones\n### M1 · First\n- one\n### M2 · Second\n- two\n\n## 💡 Hints\n### M1\n<details><summary>Hint for one</summary>\n\nx\n\n</details>\n### M2\n<details><summary>Hint for two</summary>\n\ny\n\n</details>\n';
const res = (idx, name, status, milestone) => ({ idx, name, status, milestone, message: status === 'pass' ? '' : 'not yet', optional: false, detail: {}, files: [], output: '' });

test('checks are grouped by milestone, finished ones fold, and h follows the current milestone', async () => {
  const { labsDir } = fixtureWorkshop();
  fs.writeFileSync(path.join(labsDir, 'lab-05/hard/todo.md'), M_TODO);
  const results = [res(0, 'alpha', 'pass', 'M1'), res(1, 'beta', 'pass', 'M1'), res(2, 'gamma', 'fail', 'M2')];
  const runChecks = async ({ onEvent }) => {
    onEvent({ type: 'plan', total: 3, names: ['alpha', 'beta', 'gamma'], milestones: ['M1', 'M1', 'M2'] });
    return { state: 'fail', allPass: false, complete: true, results, passed: 2, failed: 1, skipped: 0, blocked: 0, total: 3, fatal: null, stdout: '', stderr: '', planMilestones: ['M1', 'M1', 'M2'], milestones: { M1: 'pass', M2: 'fail' } };
  };
  const t = await app({ labsDir, open: 'lab-05/hard', deps: { runChecks } });
  assert.match(text(t.output), /MILESTONES/);
  press(t.input, 't');
  await waitFor(() => t.state.run && !t.state.run.running);
  const s = text(t.output);
  assert.match(s, /✅ M1 · First\s+▰▰ 2\/2/);
  assert.doesNotMatch(s, /alpha/, 'a finished milestone folds into one line');
  assert.match(s, /🧭 M2 · Second\s+▱ 0\/1/);
  assert.match(s, /gamma/);
  assert.match(s, /M1 · First is done!/, 'finishing a milestone is celebrated');
  press(t.input, 'b');
  press(t.input, 'h');
  assert.match(text(t.output), /M2 · Hint for two/);
  assert.doesNotMatch(text(t.output), /Hint for one/);
  t.quit();
});

test('i shows the bring plan; y brings the files in, backs up first, then checks', async () => {
  const labsDir = chainCourse({
    'lab-00/easy': { src: { 'app.js': 'v1\n' }, sol: { 'app.js': 'v1\n', 'done.txt': 'x\n' } },
    'lab-01/easy': { src: {}, sol: { 'done.txt': 'x\n' } },
  });
  writeChain({ labsDir, result: computeChain({ catalog: loadCatalog(labsDir), course: loadCourse(labsDir), manifest: null, bootstrap: true }) });
  const catalog = loadCatalog(labsDir);
  const { ex } = exerciseByKey(catalog, 'lab-00/easy');
  fs.writeFileSync(path.join(ex.src, 'done.txt'), 'x\n');
  fs.writeFileSync(path.join(ex.src, 'AGENTS.md'), 'my rules\n');
  progressStore(labsDir).recordChecks(ex.key, { state: 'pass', allPass: true, passed: 1, total: 1, results: [] }, captureEvidence(ex));
  let checked = 0;
  const runChecks = async () => { checked++; return { state: 'fail', allPass: false, complete: true, results: [res(0, 'done.txt exists', 'fail', null)], passed: 0, failed: 1, skipped: 0, blocked: 0, total: 1, fatal: null, stdout: '', stderr: '', planMilestones: [null], milestones: {} }; };
  const t = await app({ labsDir, open: 'lab-01/easy', deps: { runChecks } });
  press(t.input, 'i');
  assert.equal(t.state.screen, 'bring');
  assert.match(text(t.output), /AGENTS\.md\s+← lab-00 easy\s+new/);
  press(t.input, 'y');
  await waitFor(() => checked === 1 && t.state.run && !t.state.run.running);
  const target = exerciseByKey(catalog, 'lab-01/easy').ex;
  assert.equal(fs.readFileSync(path.join(target.src, 'AGENTS.md'), 'utf8'), 'my rules\n');
  assert.ok(fs.readdirSync(path.join(labsDir, '.recovery', 'lab-01-easy', 'backups')).length >= 1, 'a backup was taken first');
  assert.deepEqual(progressStore(labsDir).get('lab-01/easy').brought.files, [{ file: 'AGENTS.md', from: 'lab-00/easy' }]);
  press(t.input, 'b');
  assert.match(text(t.output), /your work brought in\s+on/);
  t.quit();
});

test('nothing to bring is explained, and n leaves the bring screen', async () => {
  const t = await app({ open: 'lab-02/easy' });
  press(t.input, 'i');
  assert.match(text(t.output), /no seed record|Nothing to bring yet/);
  press(t.input, 'n');
  assert.equal(t.state.screen, 'exercise');
  t.quit();
});

test('NO_COLOR and --no-anim: plain frames that fit 80 columns', () => {
  const { labsDir } = fixtureWorkshop();
  const script = `
    import { PassThrough } from 'node:stream';
    const { startTui } = await import(process.env.TUI_URL);
    const input = new PassThrough(); input.isTTY = true; input.setRawMode = () => input;
    const output = new PassThrough(); Object.assign(output, { columns: 80, rows: 24, isTTY: true });
    const writes = []; output.write = (s) => { writes.push(String(s)); return true; };
    const app = await startTui({ labsDir: process.env.LABS, input, output, anim: false, intro: true, onExit: () => {},
      deps: { inspectEnvironment: async () => ({ ready: true, coreReady: true, items: [] }) } });
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    await wait(50);
    for (const [s, name] of [['', 'return'], ['1', '1'], ['?', '?'], ['b', 'b'], ['i', 'i'], ['b', 'b'], ['b', 'b'], ['b', 'b']]) { input.emit('keypress', s, { name }); await wait(20); }
    const frames = writes.filter((w) => w.startsWith('\\x1b[H'));
    process.stdout.write(JSON.stringify({ screens: frames.length, colour: writes.some((w) => /\\x1b\\[(38|48);5;/.test(w)), frames }));
    app.quit();
  `;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 60000, env: { ...process.env, NO_COLOR: '1', LABS: labsDir, TUI_URL: pathToFileURL(path.join(import.meta.dirname, '..', 'tui.mjs')).href } });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
  assert.ok(out.screens >= 8, `${out.screens} screens drawn`);
  assert.equal(out.colour, false, 'NO_COLOR means no colour codes');
  for (const f of out.frames) for (const line of stripAnsi(f).split('\r\n')) assert.ok(width(line) <= 80, line);
  const all = out.frames.map((f) => stripAnsi(f)).join('\n');
  for (const want of [/Workshop 0\/8/, /CHOOSE YOUR LEVEL/, /Starts from/, /HOW THE LABS WORK/, /BRING YOUR WORK FORWARD/]) assert.match(all, want);
});
