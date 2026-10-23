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

const LABS = [
  ['00', '💻', 'Copilot CLI', 'Your agent runtime'],
  ['01', '📜', 'Instructions', 'What the agent knows'],
  ['02', '🧩', 'Skills', 'Know-how on demand'],
  ['03', '🎭', 'Custom agents', 'Roles with least privilege'],
  ['04', '🔌', 'MCP servers', 'Connect your systems'],
  ['05', '🔒', 'Guardrails & hooks', 'What the agent may do'],
  ['06', '📦', 'Plugins, extensions & APM', 'Extend and share'],
  ['07', '🚀', 'Agentic workflows', 'Agents in CI'],
];
const MINUTES = { easy: 10, medium: 15, hard: 25 };

/**
 * A small fake workshop: labs 00-07 with easy/medium/hard. Each level passes when src/done.txt exists.
 * Options: { noDuration: ['lab-06/medium'] } leaves a level without a duration.
 */
export function fixtureWorkshop({ noDuration = [] } = {}) {
  const root = tmpdir('harness workshop ');
  const labsDir = path.join(root, 'labs');
  const files = {};
  for (const [num, emoji, title, tagline] of LABS) {
    files[`lab-${num}/readme.md`] = `# Lab ${num} · ${emoji} ${title} — ${tagline}\n\n## 💡 In one minute\n${title} in one minute.\n`;
    for (const level of ['easy', 'medium', 'hard']) {
      const key = `lab-${num}/${level}`;
      const meta = noDuration.includes(key) ? '> 🆓 free checks' : `> 🕐 ${MINUTES[level]} min · 🆓 free checks`;
      const label = level[0].toUpperCase() + level.slice(1);
      files[`${key}/todo.md`] = `# 🟢 ${label} · ${title} ${level} mission\n\n${meta}\n\n## 🎯 Mission\nPractise ${title.toLowerCase()} at ${level} level.\n\n## ✅ Done when\n- \`done.txt\` exists\n\n## 💡 Hints\n<details><summary>First hint</summary>\n\nCreate the file.\n\n</details>\n`;
      files[`${key}/src/README.md`] = `${title} ${level}\n`;
      files[`${key}/sol/README.md`] = `${title} ${level}\n`;
      files[`${key}/sol/done.txt`] = 'done\n';
      files[`${key}/tests/checks.mjs`] = "export default (t) => [t.check('done.txt exists', () => t.exists('done.txt') || 'Create `done.txt` in src/.')];\n";
    }
  }
  writeTree(labsDir, files);
  return { root, labsDir };
}

/**
 * A tiny course for chain and bring tests: { 'lab-00/easy': { src: {...}, sol: {...} }, ... }, optional course.json
 * level rules, and checks that pass when src/done.txt exists. Returns the labs folder.
 */
export function chainCourse(levels, rules = null) {
  const labsDir = path.join(tmpdir('harness chain '), 'labs');
  const files = {};
  for (const [key, { src = {}, sol = {} }] of Object.entries(levels)) {
    const [lab, level] = key.split('/');
    files[`${lab}/readme.md`] = `# Lab ${lab.slice(4)} · 🧪 Fixture ${lab.slice(4)} — a fixture\n`;
    files[`${key}/todo.md`] = `# 🟢 ${level} · Fixture ${key}\n\n> 🕐 10 min · 🆓 free checks\n\n## 🎯 Mission\nGo.\n`;
    files[`${key}/tests/checks.mjs`] = "export default (t) => [t.check('done.txt exists', () => t.exists('done.txt') || 'Create `done.txt`.')];\n";
    fs.mkdirSync(path.join(labsDir, key, 'src'), { recursive: true });
    fs.mkdirSync(path.join(labsDir, key, 'sol'), { recursive: true });
    for (const [f, c] of Object.entries(src)) files[`${key}/src/${f}`] = c;
    for (const [f, c] of Object.entries(sol)) files[`${key}/sol/${f}`] = c;
  }
  if (rules) files['_harness/course.json'] = JSON.stringify({ levels: rules });
  writeTree(labsDir, files);
  return labsDir;
}
