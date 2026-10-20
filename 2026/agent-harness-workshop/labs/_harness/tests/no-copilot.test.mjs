import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { isPaidCopilot, paidInShell } from '../no-copilot.mjs';
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
