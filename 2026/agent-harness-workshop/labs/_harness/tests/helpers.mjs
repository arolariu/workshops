// Shared test fixtures: temporary folders outside the checkout, removed after each test file.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after } from 'node:test';

const created = [];
after(() => {
  for (const dir of created.splice(0)) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

/** A fresh temporary folder (its name contains a space on purpose). Removed when the test file ends. */
export function tmpdir(prefix = 'harness test ') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  created.push(dir);
  return dir;
}

/** Write a tree of files: { 'a/b.txt': 'text' }. */
export function writeTree(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return root;
}

export const alive = (pid) => {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
};

export async function waitFor(fn, { timeout = 10000, interval = 25 } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, interval));
  }
}

/** A minimal exercise folder: tests/checks.mjs with the given source, plus src/ and sol/. */
export function makeExercise(root, checksSource, { src = {}, sol = {}, agent = null } = {}) {
  const exDir = path.join(root, 'exercise');
  writeTree(exDir, {
    'todo.md': '# 🟢 Easy · Fixture\n\n> 🕐 10 min · 🆓 free checks\n\n## 🎯 Mission\nDo it.\n',
    'tests/checks.mjs': checksSource,
    ...(agent ? { 'tests/agent.mjs': agent } : {}),
  });
  fs.mkdirSync(path.join(exDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(exDir, 'sol'), { recursive: true });
  writeTree(path.join(exDir, 'src'), src);
  writeTree(path.join(exDir, 'sol'), sol);
  return { exDir, target: path.join(exDir, 'src') };
}
