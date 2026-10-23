import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { runProcess, resolveCommand, killTree } from '../process.mjs';
import { tmpdir, writeTree, alive, waitFor } from './helpers.mjs';

const node = process.execPath;

test('captures stdout, stderr and the exit code', async () => {
  const r = await runProcess(node, ['-e', 'process.stdout.write("out"); process.stderr.write("err"); process.exit(3)']);
  assert.equal(r.code, 3);
  assert.equal(r.stdout, 'out');
  assert.equal(r.stderr, 'err');
  assert.equal(r.timedOut, false);
  assert.equal(r.cancelled, false);
});

test('a missing command is reported, not thrown', async () => {
  const r = await runProcess('definitely-not-a-real-command-xyz', ['--version']);
  assert.equal(r.missing, true);
  assert.equal(r.code, null);
});

test('a timeout stops the process and says so', async () => {
  const started = Date.now();
  const r = await runProcess(node, ['-e', 'setInterval(() => {}, 1000)'], { timeout: 300 });
  assert.equal(r.timedOut, true);
  assert.ok(Date.now() - started < 8000);
});

test('an AbortSignal cancels the whole process tree, including grandchildren', async () => {
  const dir = tmpdir();
  const pidFile = path.join(dir, 'grandchild.pid');
  const script = `
    const { spawn } = require('node:child_process');
    const g = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(g.pid));
    setInterval(() => {}, 1000);
  `;
  const ac = new AbortController();
  const pending = runProcess(node, ['-e', script], { signal: ac.signal });
  const gpid = Number(await waitFor(() => fs.existsSync(pidFile) && fs.readFileSync(pidFile, 'utf8')));
  assert.equal(alive(gpid), true);
  ac.abort();
  const r = await pending;
  assert.equal(r.cancelled, true);
  await waitFor(() => !alive(gpid), { timeout: 8000 });
  assert.equal(getEventListeners(ac.signal, 'abort').length, 0, 'the abort listener is removed');
});

test('an already-aborted signal never starts the process', async () => {
  const dir = tmpdir();
  const marker = path.join(dir, 'ran');
  const ac = new AbortController();
  ac.abort();
  const r = await runProcess(node, ['-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, '1')`], { signal: ac.signal });
  assert.equal(r.cancelled, true);
  assert.equal(fs.existsSync(marker), false);
});

test('listeners are removed after a normal exit', async () => {
  const ac = new AbortController();
  await runProcess(node, ['-e', '0'], { signal: ac.signal, timeout: 5000 });
  assert.equal(getEventListeners(ac.signal, 'abort').length, 0);
});

test('output is bounded and marked as truncated', async () => {
  const r = await runProcess(node, ['-e', 'process.stdout.write("x".repeat(50000))'], { maxOutput: 1000 });
  assert.equal(r.truncated, true);
  assert.ok(r.stdout.length <= 1100);
});

test('killTree on a finished process is harmless', async () => {
  const r = await runProcess(node, ['-e', '0']);
  assert.doesNotThrow(() => killTree(r.pid));
});

test('resolveCommand finds programs on PATH, and only executables', () => {
  const dir = tmpdir();
  const exe = process.platform === 'win32' ? 'tool.cmd' : 'tool';
  writeTree(dir, { [exe]: process.platform === 'win32' ? '@echo off\r\n' : '#!/bin/sh\n', 'readme.txt': 'x' });
  if (process.platform !== 'win32') fs.chmodSync(path.join(dir, exe), 0o755);
  const env = { PATH: dir, PATHEXT: '.COM;.EXE;.BAT;.CMD' };
  const same = (p) => (process.platform === 'win32' ? p?.toLowerCase() : p);
  assert.equal(same(resolveCommand('tool', { env })), same(path.join(dir, exe)));
  assert.equal(resolveCommand('readme', { env }), null);
  assert.equal(resolveCommand('nope', { env }), null);
});

test('Windows .cmd shims in folders with spaces receive arguments intact', { skip: process.platform !== 'win32' }, async () => {
  const dir = path.join(tmpdir(), 'with space & more');
  writeTree(dir, {
    'echo.mjs': 'process.stdout.write(JSON.stringify(process.argv.slice(2)))',
    'shim.cmd': '@"%~dp0..\\..\\node.exe" "%~dp0echo.mjs" %*\r\n'.replace('"%~dp0..\\..\\node.exe"', `"${node}"`),
  });
  const args = ['a b', 'x&y', 'quote"inside', '50%', '', 'trailing\\'];
  const r = await runProcess('shim', args, { env: { ...process.env, PATH: `${dir};${process.env.PATH}` } });
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), args);
});
