import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DIFFICULTIES, normalizeLevel, loadCatalog, findExercise, parseDuration, parseDurationRange, parseTodo, parseBuildsOn } from '../catalog.mjs';
import { progressStore, captureEvidence, evidenceTracker, deriveStatus, sourceFingerprint, PROGRESS_VERSION } from '../progress.mjs';
import { tmpdir, writeTree, fixtureWorkshop, chainCourse } from './helpers.mjs';

const todo = (label, title, meta = '> 🕐 15 min · 🆓 free checks') => `# 🟢 ${label} · ${title}\n\n${meta}\n\n## 🎯 Mission\nDo ${title}.\n\n## ✅ Done when\n- it works\n`;

function fixtureLabs() {
  const labsDir = path.join(tmpdir(), 'labs');
  const files = { 'lab-01/readme.md': '# Lab 01 · 📜 Instructions — what it knows\n\n## In one minute\nIntro.\n' };
  for (const d of DIFFICULTIES) {
    files[`lab-01/${d.id}/todo.md`] = todo(d.label, `${d.label} mission`, d.id === 'hard-plus' ? '> no duration here' : undefined);
    files[`lab-01/${d.id}/src/main.js`] = `// ${d.id}\n`;
    files[`lab-01/${d.id}/tests/checks.mjs`] = 'export default [];\n';
    files[`lab-01/${d.id}/sol/main.js`] = '// solved\n';
  }
  files['lab-02/readme.md'] = '# Lab 02 · 🧩 Skills\n';
  files['lab-02/medium/todo.md'] = todo('Medium', 'Only medium');
  files['lab-02/medium/src/a.js'] = '1\n';
  files['lab-02/hard/notes.txt'] = 'a folder without todo.md is not an exercise\n';
  writeTree(labsDir, files);
  return labsDir;
}

test('difficulty IDs and aliases resolve exactly', () => {
  assert.equal(normalizeLevel('hard+'), 'hard-plus');
  assert.equal(normalizeLevel('hard++'), 'hard-plus-plus');
  assert.equal(normalizeLevel('Hard+'), 'hard-plus');
  assert.equal(normalizeLevel('hard-plus-plus'), 'hard-plus-plus');
  assert.equal(normalizeLevel('e'), 'easy');
  assert.equal(normalizeLevel('MEDIUM'), 'medium');
  assert.equal(normalizeLevel('h'), 'hard');
  assert.equal(normalizeLevel('hamster'), null);
  assert.equal(normalizeLevel('ha'), null);
  assert.equal(normalizeLevel('hard+++'), null);
  assert.equal(normalizeLevel(''), null);
  assert.deepEqual(DIFFICULTIES.map((d) => d.label), ['Easy', 'Medium', 'Hard', 'Hard+', 'Hard++']);
});

test('five fixture tiers load separately, in order, and only authored folders appear', () => {
  const catalog = loadCatalog(fixtureLabs());
  const [lab1, lab2] = catalog;
  assert.deepEqual(lab1.levels.map((e) => e.level), ['easy', 'medium', 'hard', 'hard-plus', 'hard-plus-plus']);
  assert.deepEqual(lab1.levels.map((e) => e.label), ['Easy', 'Medium', 'Hard', 'Hard+', 'Hard++']);
  assert.equal(lab1.levels[3].title, 'Hard+ mission');
  assert.equal(lab1.levels[4].key, 'lab-01/hard-plus-plus');
  assert.deepEqual(lab2.levels.map((e) => e.level), ['medium']);
  assert.equal(findExercise(catalog, 'lab-01', 'hard+').ex.level, 'hard-plus');
  assert.equal(findExercise(catalog, '1', 'hard++').ex.level, 'hard-plus-plus');
  assert.equal(findExercise(catalog, 'lab-01', 'hamster').ex, null);
  assert.match(findExercise(catalog, 'lab-01', 'hamster').error, /hamster/);
  assert.equal(findExercise(catalog, 'lab-02', 'easy').ex, null);
  assert.equal(findExercise(catalog, 'lab-9x', 'easy'), null);
});

test('durations are parsed, and unknown when missing', () => {
  assert.equal(parseDuration('> 🕐 25 min · free'), 25);
  assert.equal(parseDuration('🕐 10–15 min'), 15);
  assert.equal(parseDuration('free checks'), null);
  const catalog = loadCatalog(fixtureLabs());
  assert.equal(catalog[0].levels[0].minutes, 15);
  assert.equal(catalog[0].levels[3].minutes, null);
});

test('five tiers carry theme, time and mode, and accept h+, h++ and digits', () => {
  assert.deepEqual(DIFFICULTIES.map((d) => d.badge), ['🟢', '🟡', '🔴', '🟣', '💎']);
  assert.deepEqual(DIFFICULTIES.map((d) => d.theme), ['Use it', 'Shape it', 'Prove it', 'Break it', 'Scale it']);
  assert.deepEqual(DIFFICULTIES.map((d) => d.mode), ['together', 'homework', 'homework', 'homework', 'homework']);
  assert.equal(normalizeLevel('h+'), 'hard-plus');
  assert.equal(normalizeLevel('H++'), 'hard-plus-plus');
  assert.equal(normalizeLevel('4'), 'hard-plus');
  assert.equal(normalizeLevel('1'), 'easy');
  assert.equal(normalizeLevel('6'), null);
});

test('durations in hours, and ranges', () => {
  assert.equal(parseDuration('> 🕐 1.5–2 h · 🏠 homework'), 120);
  assert.equal(parseDuration('🕐 about 1 h'), 60);
  assert.deepEqual(parseDurationRange('🕐 1.5–2 h'), [90, 120]);
  assert.deepEqual(parseDurationRange('🕐 8–10 min'), [8, 10]);
  assert.deepEqual(parseDurationRange('🕐 30 min'), [30, 30]);
  assert.deepEqual(parseDurationRange('🕐 30 min · 🤖 optional agent check (about 2–4 prompts)'), [30, 30]);
  assert.equal(parseDurationRange('free'), null);
});

test('milestones, requirements and hint milestones are parsed', () => {
  const t = parseTodo([
    '# 🟣 Hard+ · Policy as code', '', '> 🕐 1.5–2 h · 🏠 homework', '',
    '## 🎯 Mission', 'Make it real.', '',
    '## 📋 Requirements', '1. Deny wins.', '',
    '## 🧭 Milestones', '### M1 · The policy file', '- `policy.json` exists', '### M2 · The engine', '- deny wins', '',
    '## 💡 Hints', '<details><summary>General</summary>', '', 'Read the spec.', '', '</details>',
    '### M1', '<details><summary>Shape</summary>', '', 'An array.', '', '</details>',
    '### M2 · The engine', '<details><summary>Order</summary>', '', 'Deny first.', '', '</details>',
  ].join('\n'));
  assert.equal(t.title, 'Policy as code');
  assert.deepEqual(t.milestones.map((m) => [m.id, m.title]), [['M1', 'The policy file'], ['M2', 'The engine']]);
  assert.match(t.milestones[0].body, /policy\.json/);
  assert.match(t.requirements, /Deny wins/);
  assert.deepEqual(t.hints.map((h) => [h.title, h.milestone]), [['General', null], ['Shape', 'M1'], ['Order', 'M2']]);
});

test('levels know their tier theme, mode and time; the capstone lab is homework', () => {
  const { labsDir } = fixtureWorkshop();
  writeTree(labsDir, {
    'lab-08/readme.md': '# Lab 08 · 🏛️ Capstone — Ship it\n',
    'lab-08/easy/todo.md': '# 🟢 Easy · Assemble\n\n> 🆓 free checks\n\n## 🎯 Mission\nGo.\n',
    'lab-08/easy/tests/checks.mjs': 'export default () => [];\n',
  });
  const catalog = loadCatalog(labsDir);
  const easy0 = catalog[0].levels[0];
  assert.equal(easy0.mode, 'together');
  assert.equal(easy0.theme, 'Use it');
  assert.equal(easy0.time, '10 min');
  assert.deepEqual(easy0.milestones, []);
  assert.equal(catalog[0].capstone, false);
  const cap = catalog.find((l) => l.id === 'lab-08');
  assert.equal(cap.capstone, true);
  assert.equal(cap.levels[0].mode, 'homework');
  assert.equal(cap.levels[0].time, 'about 1 h');
});

test('a pass is current only while the source and the grader are unchanged', () => {
  const labsDir = fixtureLabs();
  const ex = loadCatalog(labsDir)[0].levels[0];
  const store = progressStore(labsDir);
  const tracker = evidenceTracker();
  const evidence = captureEvidence(ex);
  store.recordChecks(ex.key, { state: 'pass', allPass: true, passed: 1, total: 1, results: [] }, evidence);
  assert.equal(deriveStatus(store.get(ex.key), tracker.current(ex)), 'pass');

  fs.appendFileSync(path.join(ex.src, 'main.js'), '// a learner edit\n');
  tracker.invalidate(ex.key);
  assert.equal(deriveStatus(store.get(ex.key), tracker.current(ex)), 'stale');

  store.recordChecks(ex.key, { state: 'pass', allPass: true, passed: 1, total: 1, results: [] }, captureEvidence(ex));
  tracker.invalidate(ex.key);
  assert.equal(deriveStatus(store.get(ex.key), tracker.current(ex)), 'pass');

  fs.appendFileSync(path.join(ex.dir, 'tests', 'checks.mjs'), '// grader changed\n');
  tracker.invalidate(ex.key);
  assert.equal(deriveStatus(store.get(ex.key), tracker.current(ex)), 'stale');
});

test('evidence is captured before the run: an edit during the run makes the result stale', () => {
  const labsDir = fixtureLabs();
  const ex = loadCatalog(labsDir)[0].levels[1];
  const store = progressStore(labsDir);
  const before = captureEvidence(ex);
  fs.writeFileSync(path.join(ex.src, 'main.js'), 'changed while the checks were running\n');
  store.recordChecks(ex.key, { state: 'pass', allPass: true, passed: 1, total: 1, results: [] }, before);
  assert.equal(deriveStatus(store.get(ex.key), evidenceTracker().current(ex)), 'stale');
});

test('generated output, dependencies and logs do not change the source fingerprint', () => {
  const labsDir = fixtureLabs();
  const ex = loadCatalog(labsDir)[0].levels[0];
  const before = sourceFingerprint(ex.src);
  writeTree(ex.src, {
    'node_modules/pkg/index.js': 'x',
    '.agent-logs/run.log': 'x',
    'runs/1.json': '{}',
    'ab-results.json': '{}',
    'mcp/state.json': '{}',
    'mcp/state.json.4242.1760900000000.tmp': '{}',
    'debug.log': 'x',
  });
  assert.equal(sourceFingerprint(ex.src), before);
  writeTree(ex.src, { 'notes.md': 'real work' });
  assert.notEqual(sourceFingerprint(ex.src), before);
});

test('files inside a linked folder are part of the source fingerprint, and link cycles end', () => {
  const labsDir = fixtureLabs();
  const ex = loadCatalog(labsDir)[0].levels[0];
  const shared = path.join(tmpdir(), 'shared-agents');
  writeTree(shared, { 'reviewer.agent.md': 'v1' });
  fs.mkdirSync(path.join(ex.src, '.github'), { recursive: true });
  fs.symlinkSync(shared, path.join(ex.src, '.github', 'agents'), 'junction');
  fs.symlinkSync(ex.src, path.join(ex.src, 'loop'), 'junction');
  const before = sourceFingerprint(ex.src);
  fs.writeFileSync(path.join(shared, 'reviewer.agent.md'), 'v2 with different content');
  assert.notEqual(sourceFingerprint(ex.src), before);
});

test('incomplete runs never replace evidence with a pass; cancelled runs keep the previous result', () => {
  const labsDir = fixtureLabs();
  const ex = loadCatalog(labsDir)[0].levels[0];
  const store = progressStore(labsDir);
  const tracker = evidenceTracker();
  store.recordChecks(ex.key, { state: 'pass', allPass: true, passed: 1, total: 1, results: [] }, captureEvidence(ex));
  store.recordChecks(ex.key, { state: 'cancelled', allPass: false, passed: 0, total: 1, results: [] }, captureEvidence(ex));
  assert.equal(deriveStatus(store.get(ex.key), tracker.current(ex)), 'pass');
  assert.equal(store.get(ex.key).lastAttempt.state, 'cancelled');
  store.recordChecks(ex.key, { state: 'interrupted', allPass: false, passed: 0, total: 1, results: [] }, captureEvidence(ex));
  assert.equal(deriveStatus(store.get(ex.key), tracker.current(ex)), 'interrupted');
  store.recordChecks(ex.key, { state: 'blocked', allPass: false, passed: 0, total: 1, results: [] }, captureEvidence(ex));
  assert.equal(deriveStatus(store.get(ex.key), tracker.current(ex)), 'blocked');
});

test('a malformed progress file is preserved, reported, and never silently discarded', () => {
  const labsDir = fixtureLabs();
  const file = path.join(labsDir, '.progress.json');
  fs.writeFileSync(file, '{ "lab-01/easy": { "checks": "pass" ');
  const store = progressStore(labsDir);
  assert.match(store.status().warning, /could not be read/i);
  const copies = fs.readdirSync(labsDir).filter((f) => f.startsWith('.progress.corrupt-'));
  assert.equal(copies.length, 1);
  assert.equal(fs.readFileSync(path.join(labsDir, copies[0]), 'utf8'), '{ "lab-01/easy": { "checks": "pass" ');
  store.set('lab-01/easy', { hints: 1 });
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).version, PROGRESS_VERSION);
  assert.equal(fs.readFileSync(path.join(labsDir, copies[0]), 'utf8'), '{ "lab-01/easy": { "checks": "pass" ');
});

test('a current-format progress file whose entries are a list is preserved and reported, not silently emptied', () => {
  const labsDir = fixtureLabs();
  const file = path.join(labsDir, '.progress.json');
  const bad = JSON.stringify({ version: PROGRESS_VERSION, entries: [] });
  fs.writeFileSync(file, bad);
  const store = progressStore(labsDir);
  assert.match(store.status().warning, /could not be read/i);
  const copies = fs.readdirSync(labsDir).filter((f) => f.startsWith('.progress.corrupt-'));
  assert.deepEqual(copies.map((f) => fs.readFileSync(path.join(labsDir, f), 'utf8')), [bad]);
  store.set('lab-01/easy', { hints: 1 });
  const restarted = progressStore(labsDir);
  assert.equal(restarted.get('lab-01/easy').hints, 1, 'new progress survives a restart');
});

test('a write failure is reported and the progress stays in memory', () => {
  const labsDir = fixtureLabs();
  fs.mkdirSync(path.join(labsDir, '.progress.json'));
  const store = progressStore(labsDir);
  assert.doesNotThrow(() => store.set('lab-01/easy', { hints: 2 }));
  assert.equal(store.get('lab-01/easy').hints, 2);
  assert.ok(store.status().error, 'the error is visible');
  assert.equal(store.status().writable, false);
});

test('old-format progress migrates, and old green results become historical, not current', () => {
  const labsDir = fixtureLabs();
  const ex = loadCatalog(labsDir)[0].levels[0];
  fs.writeFileSync(path.join(labsDir, '.progress.json'), JSON.stringify({ 'lab-01/easy': { checks: 'pass', passed: 1, total: 1, hints: 2 }, _ui: { lab: 'lab-01', level: 'easy' } }));
  const store = progressStore(labsDir);
  assert.equal(store.get('lab-01/easy').hints, 2);
  assert.equal(store.get('_ui').lab, 'lab-01');
  assert.equal(deriveStatus(store.get(ex.key), evidenceTracker().current(ex)), 'stale');
  store.set('_ui', { level: 'medium' });
  const saved = JSON.parse(fs.readFileSync(path.join(labsDir, '.progress.json'), 'utf8'));
  assert.equal(saved.version, PROGRESS_VERSION);
  assert.equal(saved.entries['lab-01/easy'].legacy, true);
});

test('updates written by another process are not lost', () => {
  const labsDir = fixtureLabs();
  const a = progressStore(labsDir);
  const b = progressStore(labsDir);
  a.set('lab-01/easy', { hints: 1 });
  b.set('lab-01/medium', { hints: 3 });
  assert.equal(a.reload(), true, 'the external write is noticed');
  assert.equal(a.get('lab-01/medium').hints, 3);
  b.set('lab-01/easy', { bookmarked: true });
  a.set('lab-01/hard', { hints: 2 });
  const saved = JSON.parse(fs.readFileSync(path.join(labsDir, '.progress.json'), 'utf8')).entries;
  assert.deepEqual([saved['lab-01/easy'].hints, saved['lab-01/easy'].bookmarked, saved['lab-01/medium'].hints, saved['lab-01/hard'].hints], [1, true, 3, 2]);
  assert.equal(a.reload(), false, 'nothing new since our own write');
});

test('a fresh lock is not broken just because its owner has exited', async () => {
  // On Windows a just-released lock can linger for a moment ("delete pending") with an owner that already exited.
  // Breaking it on sight deleted the next writer's brand-new lock, so two processes wrote at once and lost updates.
  const labsDir = fixtureLabs();
  const dead = await new Promise((resolve) => { const c = spawn(process.execPath, ['-e', '']); c.on('exit', () => resolve(c.pid)); });
  const lock = path.join(labsDir, '.progress.json.lock');
  fs.writeFileSync(lock, `${dead}\n`);
  const store = progressStore(labsDir);
  const started = Date.now();
  store.set('lab-01/easy', { hints: 1 });
  const waited = Date.now() - started;
  assert.ok(waited >= 800, `waited only ${waited} ms before breaking a fresh lock`);
  assert.equal(store.get('lab-01/easy').hints, 1);
  assert.ok(!fs.existsSync(lock), 'the lock is released');
});

test('concurrent writers in separate processes never drop each other\'s updates', async () => {
  const labsDir = fixtureLabs();
  const progress = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'progress.mjs')).href;
  const writers = 4;
  const each = 25;
  const script = (w) => `import { progressStore } from ${JSON.stringify(progress)};
    const store = progressStore(${JSON.stringify(labsDir)});
    for (let i = 0; i < ${each}; i++) store.set('w${w}/' + i, { hints: i });`;
  const codes = await Promise.all(Array.from({ length: writers }, (_, w) => new Promise((resolve) => {
    spawn(process.execPath, ['--input-type=module', '-e', script(w)], { stdio: 'inherit' }).on('exit', resolve);
  })));
  assert.deepEqual(codes, Array(writers).fill(0));
  const saved = JSON.parse(fs.readFileSync(path.join(labsDir, '.progress.json'), 'utf8')).entries;
  assert.equal(Object.keys(saved).length, writers * each, 'every update from every process is kept');
  assert.ok(!fs.existsSync(path.join(labsDir, '.progress.json.lock')), 'the lock is released');
});

test('a progress file from a newer version is left untouched', () => {
  const labsDir = fixtureLabs();
  const file = path.join(labsDir, '.progress.json');
  const future = JSON.stringify({ version: PROGRESS_VERSION + 1, entries: {} });
  fs.writeFileSync(file, future);
  const store = progressStore(labsDir);
  store.set('lab-01/easy', { hints: 1 });
  assert.equal(fs.readFileSync(file, 'utf8'), future);
  assert.match(store.status().error, /newer/i);
});

test('the spine: lab layer, maturity, threads and sections; level takeaway, quiz and builds-on', () => {
  const labsDir = chainCourse({ 'lab-00/easy': {}, 'lab-01/easy': {} });
  fs.writeFileSync(path.join(labsDir, 'lab-01/readme.md'), [
    '# Lab 01 · 📜 Instructions — What the agent knows', '',
    '> **Harness layer:** Context · **Maturity:** L1 Instructed · 🟢 together · 🟡 🔴 homework', '>',
    '> **Threads:** 🔴 The red build · 📏 Measurement', '',
    '## 🔬 Under the hood', 'Always in context.', '', '## 🏛️ In the enterprise', '- one', '- two', '- three', '',
  ].join('\r\n'));
  fs.writeFileSync(path.join(labsDir, 'lab-01/easy/todo.md'), [
    '# 🟢 Easy · Rules', '', '> 🕐 10 min · 👥 together · 🆓 free checks · 🧱 builds on: Lab 00 · easy', '',
    '## 🎯 Mission', 'Go.', '', '## 🧠 Takeaway', 'Short rules, proven loaded.', '',
    '## ❓ Check yourself', 'Q?', '1. a', '2. b', '', '<details><summary>Answer</summary>', '', '**1.** Because.', '', '</details>', '',
  ].join('\n'));
  const lab = loadCatalog(labsDir).find((l) => l.id === 'lab-01');
  assert.equal(lab.layer, 'Context');
  assert.deepEqual(lab.maturity, { level: 'L1', name: 'Instructed' });
  assert.deepEqual(lab.threads, ['🔴 The red build', '📏 Measurement']);
  assert.equal(lab.underTheHood, 'Always in context.');
  assert.equal(lab.enterprise, '- one\n- two\n- three');
  const ex = lab.levels[0];
  assert.equal(ex.takeaway, 'Short rules, proven loaded.');
  assert.equal(ex.quiz.answer, 1);
  assert.equal(ex.quiz.why, 'Because.');
  assert.equal(ex.buildsOn, 'lab-00/easy');
  assert.equal(ex.time, '10 min', 'the builds-on part never leaks into the time');
  const bare = loadCatalog(labsDir).find((l) => l.id === 'lab-00');
  assert.equal(bare.layer, null);
  assert.equal(bare.maturity, null);
  assert.deepEqual(bare.threads, []);
  assert.equal(bare.levels[0].quiz, null, 'no section, no quiz');
  assert.equal(bare.levels[0].takeaway, '');
});

test('builds-on: a lab and a tier, the start of the chain, or nothing', () => {
  assert.equal(parseBuildsOn('🕐 10 min · 🧱 builds on: Lab 02 · easy'), 'lab-02/easy');
  assert.equal(parseBuildsOn('🧱 builds on: Lab 5 · hard+'), 'lab-05/hard-plus');
  assert.equal(parseBuildsOn('🕐 8 min · 🧱 starts the chain'), 'start');
  assert.equal(parseBuildsOn('🕐 8 min'), null);
  assert.equal(parseBuildsOn('🧱 builds on: Lab 02 · impossible'), null);
});