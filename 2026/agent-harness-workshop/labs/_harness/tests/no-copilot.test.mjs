import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { isPaidCopilot, paidInShell, paidCall, guardEnvironment } from '../no-copilot.mjs';
import { runChecks } from '../checks.mjs';
import { tmpdir, makeExercise } from './helpers.mjs';

test('which copilot calls cost credits', () => {
  for (const a of [['-p', 'hi'], ['--prompt=hi'], [], ['--agent', 'x', '-p', 'y'], ['-i', 'hi'], ['--resume'], ['update'], ['login'], ['--model', 'x']]) {
    assert.equal(isPaidCopilot(a), true, a.join(' '));
  }
  for (const a of [['--version'], ['-h'], ['help', 'limits'], ['instruction', 'list', '--json'], ['skill', 'list'], ['plugin', 'marketplace', 'browse', 'x'], ['mcp', 'get', 'portal'], ['--plugin-dir', './p', 'skill', 'list']]) {
    assert.equal(isPaidCopilot(a), false, a.join(' '));
  }
});

test('copilot inside a shell command: only a command counts, wrappers are opened', () => {
  for (const c of ['npm test && copilot -p "fix it"', 'copilot', '& copilot --prompt x', 'cmd /c "copilot -p x"', 'bash -c "copilot -i hi"', 'FOO=1 copilot -p x', 'npx copilot -p x']) {
    assert.equal(paidInShell(c), true, c);
  }
  for (const c of ['C:\\tools\\copilot.exe --version', 'echo copilot is great', 'cd /tmp/copilot && npm test', 'npm test', 'copilot instruction list --json', '"copilot" skill list']) {
    assert.equal(paidInShell(c), false, c);
  }
});

/** A stand-in for the real CLI: prints its arguments. */
function fakeReal(root) {
  const js = path.join(root, 'real-copilot.mjs');
  fs.writeFileSync(js, 'console.log("REAL " + process.argv.slice(2).join(" "));\n');
  if (process.platform === 'win32') {
    const cmd = path.join(root, 'real-copilot.cmd');
    fs.writeFileSync(cmd, `@"${process.execPath}" "${js}" %*\r\n`);
    return cmd;
  }
  const sh = path.join(root, 'real-copilot');
  fs.writeFileSync(sh, `#!/bin/sh\nexec "${process.execPath}" "${js}" "$@"\n`);
  fs.chmodSync(sh, 0o755);
  return sh;
}

test('a free check that starts Copilot with a prompt fails with a clear message; free subcommands pass through', async () => {
  const root = tmpdir();
  const real = fakeReal(root);
  const { exDir, target } = makeExercise(root, `import { spawnSync, execFileSync } from 'node:child_process';
export default (t) => [
  t.check('asks the real CLI for its version', () => { const r = spawnSync('copilot --version', { shell: true, encoding: 'utf8' }); return /REAL --version/.test(r.stdout) || \`no pass-through: \${r.stdout} \${r.stderr}\`; }),
  t.check('starts a prompt in a shell', () => { spawnSync('copilot -p "fix it"', { shell: true }); return true; }),
  t.check('starts a prompt from a Node child', () => { try { execFileSync(process.execPath, ['-e', "require('child_process').spawnSync('copilot', ['-p', 'x'])"]); } catch {} return true; }),
  t.check('does nothing with Copilot', () => true),
  t.check('the kit still knows Copilot is there', () => true, { needs: ['copilot'] }),
];`);
  const saved = process.env.HARNESS_COPILOT;
  process.env.HARNESS_COPILOT = real;
  try {
    const r = await runChecks({ exDir, target });
    assert.deepEqual(r.results.map((x) => x.status), ['pass', 'fail', 'fail', 'pass', 'pass'], JSON.stringify(r.results.map((x) => x.message)));
    assert.match(r.results[1].message, /never start Copilot with a prompt/);
    assert.match(r.results[2].message, /never start Copilot with a prompt/);
  } finally {
    if (saved === undefined) delete process.env.HARNESS_COPILOT; else process.env.HARNESS_COPILOT = saved;
  }
});

test('without a real copilot, checks that need it are blocked, and the stub says it is missing', async () => {
  const root = tmpdir();
  const { exDir, target } = makeExercise(root, `import { spawnSync } from 'node:child_process';
export default (t) => [
  t.check('needs copilot', () => true, { needs: ['copilot'] }),
  t.check('the stub answers', () => { const r = spawnSync('copilot --version', { shell: true, encoding: 'utf8' }); return r.status === 127 || \`status \${r.status}\`; }),
];`);
  const saved = process.env.HARNESS_COPILOT;
  process.env.HARNESS_COPILOT = path.join(root, 'no-such-copilot');
  try {
    const r = await runChecks({ exDir, target });
    assert.deepEqual(r.results.map((x) => x.status), ['blocked', 'pass'], JSON.stringify(r.results.map((x) => x.message)));
  } finally {
    if (saved === undefined) delete process.env.HARNESS_COPILOT; else process.env.HARNESS_COPILOT = saved;
  }
});

test('a .cmd run through cmd /d /s /c counts, quoted or not (how process.mjs and the kit run .cmd files)', () => {
  for (const args of [['/d', '/s', '/c', '"C:\\npm\\copilot.cmd -p "fix it""'], ['/d', '/s', '/c', '"^"C:\\npm\\copilot.cmd^" -p x"'], ['/c', 'C:\\npm\\copilot.cmd --prompt=x']]) {
    assert.equal(paidCall('cmd', args, {}), true, args.join(' '));
  }
  assert.equal(paidCall('cmd', ['/d', '/s', '/c', '"C:\\npm\\copilot.cmd skill list"'], {}), false);
});

// Windows finds a program by name without a shell (CreateProcess, libuv, Python, Go …) only as .com/.exe, so the stub
// copilot.cmd can't shadow a real copilot.exe: the guarded PATH leaves out folders that hold one, and keeps their
// other programs reachable. A worker thread or a non-Node helper, which the in-process guard doesn't reach, then
// finds no Copilot at all.
test('on Windows, no program finds copilot.exe through the guarded PATH; the folder\'s other programs stay', { skip: process.platform !== 'win32' && 'Windows only' }, () => {
  const root = tmpdir();
  const tools = path.join(root, 'tools');
  fs.mkdirSync(tools);
  // Stand-ins: node.exe under two names. "copilot" prints REAL when it runs.
  for (const name of ['copilot.exe', 'helper.exe']) {
    try { fs.linkSync(process.execPath, path.join(tools, name)); } catch { fs.copyFileSync(process.execPath, path.join(tools, name)); }
  }
  const key = Object.keys(process.env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
  const env = { ...process.env, [key]: `${tools};${process.env[key]}` };
  delete env.NODE_OPTIONS;
  const real = spawnSync('copilot', ['-e', 'console.log("REAL")'], { env, encoding: 'utf8' });
  assert.equal(real.stdout.trim(), 'REAL', 'without the guard, the stand-in is found by name');
  const guarded = { ...env, ...guardEnvironment({ dir: path.join(root, 'guard'), env }) };
  assert.ok(!guarded[key].split(';').some((d) => path.resolve(d) === path.resolve(tools)), 'the folder with copilot.exe is not on the guarded PATH');
  const direct = spawnSync('copilot', ['-e', 'console.log("REAL")'], { env: guarded, encoding: 'utf8' });
  assert.notEqual(direct.stdout?.trim(), 'REAL', 'a direct spawn finds no copilot.exe');
  const helper = spawnSync('helper', ['-e', 'console.log("HELPER")'], { env: guarded, encoding: 'utf8' });
  assert.equal(helper.stdout?.trim(), 'HELPER', `the folder's other programs are still found: ${helper.error?.code ?? helper.stderr}`);
  const worker = spawnSync(process.execPath, ['-e', `
    const { Worker } = require('node:worker_threads');
    new Worker("const r = require('node:child_process').spawnSync('copilot', ['-e', 'console.log(\\"REAL\\")'], { encoding: 'utf8' }); console.log('WORKER', r.error ? r.error.code : r.stdout.trim());", { eval: true });
  `], { env: guarded, encoding: 'utf8' });
  assert.match(worker.stdout, /WORKER/, worker.stderr);
  assert.doesNotMatch(worker.stdout, /WORKER REAL/, 'a worker thread finds no copilot.exe either');
});
