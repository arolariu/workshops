// The checks run your code: scripts, hooks, the extension. None of it may start Copilot, because a prompt spends AI
// credits. guard(t, checks) runs every check that doesn't call Copilot on purpose with a PATH where Copilot can't be
// found (only git, for the checks that need it), and says so clearly when your code tried to start it anyway.
import fs from 'node:fs';
import path from 'node:path';

const COPILOT = /^copilot(\.(exe|cmd|bat|com|ps1))?$/i;
const exeNames = (name) => (process.platform === 'win32' ? [`${name}.exe`, `${name}.com`] : [name]);
function onPath(name) {
  for (const dir of String(process.env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
    if (exeNames(name).some((n) => fs.existsSync(path.join(dir, n)))) return dir;
  }
  return null;
}
/** A stand-in `copilot` that only records that something tried to run it. */
function trap(dir) {
  const marker = path.join(dir, 'copilot-was-called');
  if (process.platform === 'win32') {
    fs.writeFileSync(path.join(dir, 'copilot.cmd'), `@echo called> "${marker}"\r\n@exit /b 1\r\n`);
  } else {
    const file = path.join(dir, 'copilot');
    fs.writeFileSync(file, `#!/bin/sh\necho called > "${marker}"\nexit 1\n`);
    fs.chmodSync(file, 0o755);
  }
  return marker;
}
/** PATH for a guarded check: the trap, and git's folder when the check needs git (unless Copilot lives there too). */
function guardedPath(t, git) {
  const bin = t.tmp();
  const marker = trap(bin);
  const dirs = [bin];
  const g = git ? onPath('git') : null;
  if (g && !fs.readdirSync(g).some((n) => COPILOT.test(n))) dirs.push(g);
  else if (g && process.platform !== 'win32') fs.symlinkSync(path.join(g, 'git'), path.join(bin, 'git'));
  return { PATH: dirs.join(path.delimiter), marker, bin };
}

/** Run fn with Copilot out of reach; a clear failure when the code under test tried to start it. */
export async function withoutCopilot(t, fn, { git = false } = {}) {
  const saved = { PATH: process.env.PATH, HARNESS_COPILOT: process.env.HARNESS_COPILOT };
  const { PATH, marker, bin } = guardedPath(t, git);
  process.env.PATH = PATH;
  process.env.HARNESS_COPILOT = path.join(bin, 'no-copilot-here');
  let result;
  try {
    result = await fn();
  } finally {
    process.env.PATH = saved.PATH;
    if (saved.HARNESS_COPILOT === undefined) delete process.env.HARNESS_COPILOT;
    else process.env.HARNESS_COPILOT = saved.HARNESS_COPILOT;
  }
  if (fs.existsSync(marker)) return 'Your code tried to start Copilot (copilot …). The checks never run the model, because a prompt spends AI credits: do this work in code.';
  return result;
}

/** Wrap every check that doesn't call Copilot on purpose (needs: ['copilot']). */
export const guard = (t, checks) => checks.map((c) => ((c.needs ?? []).includes('copilot') ? c
  : { ...c, run: () => withoutCopilot(t, c.run, { git: (c.needs ?? []).includes('git') }) }));
