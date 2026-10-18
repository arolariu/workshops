import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { startTui } from '../tui.mjs';
import { loadCatalog, exerciseByKey } from '../catalog.mjs';
import { progressStore, captureEvidence } from '../progress.mjs';
import { inline, stripAnsi, renderMarkdown, setAscii } from '../ui.mjs';
import { fixtureWorkshop, waitFor } from './helpers.mjs';

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
  press(t.input, 'b');
  press(t.input, 'b');
  assert.match(text(t.output), /1\/24/);
  fs.appendFileSync(path.join(ex.src, 'README.md'), 'edited elsewhere\n');
  press(t.input, 'n');
  assert.equal(t.catalog[t.state.lab].levels[t.state.level].key, 'lab-00/easy', 'the edit made it stale');
  press(t.input, 'b');
  press(t.input, 'b');
  assert.match(text(t.output), /0\/24/);
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
