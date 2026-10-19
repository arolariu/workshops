import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixtureWorkshop, tmpdir, chainCourse } from './helpers.mjs';
import { progressStore } from '../progress.mjs';

const START = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'start.mjs');
const cli = (labsDir, args, extraEnv = {}) => {
  const r = spawnSync(process.execPath, [START, ...args], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', WORKSHOP_LABS_DIR: labsDir, ...extraEnv }, timeout: 60000 });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
const json = (labsDir, args) => JSON.parse(cli(labsDir, args).out.slice(cli(labsDir, args).out.indexOf('[') === -1 ? 0 : 0));

test('unknown commands, options and difficulties fail explicitly', () => {
  const { labsDir } = fixtureWorkshop();
  for (const [args, re] of [
    [['frobnicate'], /Unknown command "frobnicate"/],
    [['list', '--frobnicate'], /Unknown option --frobnicate for "list"/],
    [['test', 'lab-00', 'hamster'], /"hamster" is not a difficulty.*hard\+ \(hard-plus\)/],
    [['test', 'lab-00', 'hard+'], /Lab 00 has no Hard\+ exercise/],
    [['test', 'lab-42', 'easy'], /no lab "lab-42"/],
    [['test', 'lab-00'], /needs a lab and a difficulty/],
    [['list', '--path'], /--path needs a value/],
    [['list', '--path=nowhere'], /"nowhere" is not a learning path/],
    [['open', 'lab-00', 'easy', 'extra'], /Too many arguments/],
  ]) {
    const r = cli(labsDir, args);
    assert.equal(r.code, 2, `${args.join(' ')} → ${r.out}`);
    assert.match(r.out, re);
  }
});

test('test records evidence-bound results that list reports, and an edit makes them stale', () => {
  const { labsDir } = fixtureWorkshop();
  const src = path.join(labsDir, 'lab-00', 'easy', 'src');
  const failing = cli(labsDir, ['test', 'lab-00', 'easy']);
  assert.equal(failing.code, 1);
  assert.match(failing.out, /0 of 1 checks pass/);
  fs.writeFileSync(path.join(src, 'done.txt'), 'done\n');
  const passing = cli(labsDir, ['test', 'lab-00', 'easy']);
  assert.equal(passing.code, 0, passing.out);
  assert.match(passing.out, /All checks passed/);
  const status = () => JSON.parse(cli(labsDir, ['list', '--json']).out).find((x) => x.key === 'lab-00/easy').checks;
  assert.equal(status(), 'pass');
  fs.appendFileSync(path.join(src, 'README.md'), 'more\n');
  assert.equal(status(), 'stale');
  assert.match(cli(labsDir, ['list']).out, /0\/24 exercises pass on their current files.*1 changed since checked/s);
});

test('list filters, paths and next', () => {
  const { labsDir } = fixtureWorkshop();
  const keys = (args) => JSON.parse(cli(labsDir, ['list', ...args, '--json']).out).map((x) => x.key);
  assert.deepEqual(keys(['--path=platform', '--status=unfinished']), ['lab-02/hard', 'lab-06/hard']);
  assert.deepEqual(keys(['--query=mcp', '--level=medium', '--max-minutes=15']), ['lab-04/medium']);
  assert.equal(JSON.parse(cli(labsDir, ['next', '--path=security', '--json']).out).key, 'lab-05/medium');
  assert.equal(cli(labsDir, ['path', 'internals']).code, 0);
  assert.equal(JSON.parse(cli(labsDir, ['next', '--json']).out).key, 'lab-00/hard', 'the chosen path is remembered');
  assert.equal(cli(labsDir, ['bookmark', 'lab-04', 'hard']).code, 0);
  assert.deepEqual(keys(['--bookmarked']), ['lab-04/hard']);
});

test('checkpoints, recovery and restore show what will happen before doing it', () => {
  const { labsDir } = fixtureWorkshop();
  const file = path.join(labsDir, 'lab-00', 'easy', 'src', 'README.md');
  fs.writeFileSync(file, 'good state\n');
  assert.equal(cli(labsDir, ['checkpoint', 'lab-00', 'easy', 'good']).code, 0);
  fs.writeFileSync(file, 'broken state\n');
  const dry = cli(labsDir, ['restore', 'lab-00', 'easy', '--checkpoint=good']);
  assert.equal(dry.code, 0);
  assert.match(dry.out, /Run again with --yes/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'broken state\n');
  const done = cli(labsDir, ['restore', 'lab-00', 'easy', '--checkpoint=good', '--yes']);
  assert.equal(done.code, 0, done.out);
  assert.equal(fs.readFileSync(file, 'utf8'), 'good state\n');
  const list = cli(labsDir, ['recovery', 'lab-00', 'easy']).out;
  assert.match(list, /Checkpoints: good/);
  assert.match(list, /Backups: \S+ \(before restore-checkpoint\)/);
  assert.equal(cli(labsDir, ['restore', 'lab-00', 'easy']).code, 2, 'one source must be chosen');
  assert.equal(cli(labsDir, ['restore', 'lab-00', 'easy', '--backup=../../x', '--yes']).code, 1);
  const starterless = cli(labsDir, ['restore', 'lab-01', 'easy', '--starter', '--yes']);
  assert.equal(starterless.code, 1);
  assert.match(starterless.out, /No starter is available/);
});

test('the starter kept on first use restores without git', () => {
  const { labsDir } = fixtureWorkshop();
  const file = path.join(labsDir, 'lab-02', 'easy', 'src', 'README.md');
  const original = fs.readFileSync(file, 'utf8');
  cli(labsDir, ['test', 'lab-02', 'easy']);
  fs.writeFileSync(file, 'learner attempt\n');
  const r = cli(labsDir, ['restore', 'lab-02', 'easy', '--starter', '--yes'], { PATH: path.dirname(process.execPath) });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /first time you used the lab app/);
  assert.equal(fs.readFileSync(file, 'utf8'), original);
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
  const gone = cli(labsDir, ['restore', 'lab-02', 'easy', '--starter', '--yes'], { PATH: path.dirname(process.execPath) });
  assert.equal(gone.code, 0, gone.out);
  assert.equal(fs.readFileSync(file, 'utf8'), original, 'restores even after src/ was deleted');
});

test('diff, history, hint, export and doctor', () => {
  const { labsDir } = fixtureWorkshop();
  const diff = cli(labsDir, ['diff', 'lab-00', 'easy']);
  assert.match(diff.out, /one possible solution, not a byte-for-byte target/);
  assert.match(diff.out, /done\.txt \(only in the reference\)/);
  assert.match(diff.out, /\+done/);
  assert.match(cli(labsDir, ['history', 'lab-00', 'easy']).out, /No agent runs yet/);
  assert.match(cli(labsDir, ['history', 'lab-00', 'easy']).out, /💳 No agent-check runs this month/);
  assert.match(cli(labsDir, ['hint', 'lab-00', 'easy']).out, /Hint 1 of 1 · First hint/);
  const dir = tmpdir();
  const exp = cli(labsDir, ['export', '--format=json', '--name=summary', `--dir=${dir}`]);
  assert.equal(exp.code, 0, exp.out);
  const report = JSON.parse(fs.readFileSync(path.join(dir, 'summary.json'), 'utf8'));
  assert.equal(report.exercises.length, 24);
  assert.equal(report.network, 'none');
  const again = cli(labsDir, ['export', '--format=json', '--name=summary', `--dir=${dir}`]);
  assert.equal(again.code, 1);
  assert.match(again.out, /already exists/);
  const doctor = JSON.parse(cli(labsDir, ['doctor', '--json']).out);
  assert.equal(doctor.items.find((x) => x.id === 'node').status, 'ready');
});

test('without a terminal, the app explains itself; --linear works anywhere', () => {
  const { labsDir } = fixtureWorkshop();
  const plain = cli(labsDir, []);
  assert.equal(plain.code, 0);
  assert.match(plain.out, /--linear works anywhere/);
  const r = spawnSync(process.execPath, [START, '--linear'], { input: 'list path=security\nquit\n', encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', WORKSHOP_LABS_DIR: labsDir }, timeout: 30000 });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /2 exercise\(s\) on the Security path/);
  void json;
});

const CHAIN_BASE = {
  'lab-00/easy': { src: { 'app.js': 'v1\n' }, sol: { 'app.js': 'v1\n', 'done.txt': 'x\n', 'FINDINGS.md': 'found\n' } },
  'lab-00/medium': { src: { 'app.js': 'v1 medium\n' }, sol: { 'app.js': 'v1 medium\n', 'done.txt': 'x\n' } },
  'lab-01/easy': { src: {}, sol: { 'done.txt': 'x\n' } },
};

test('sync-seeds --dry-run shows the plan and writes nothing; verify --chain reports drift until synced', () => {
  const labsDir = chainCourse(CHAIN_BASE);
  const dry = cli(labsDir, ['sync-seeds', '--bootstrap', '--dry-run']);
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.out, /lab-00\/medium\s+← lab-00\/easy/);
  assert.match(dry.out, /override.*app\.js/);
  assert.ok(!fs.existsSync(path.join(labsDir, 'lab-01/easy/src/FINDINGS.md')));
  const refused = cli(labsDir, ['sync-seeds']);
  assert.equal(refused.code, 1, 'without --bootstrap the differing app.js is a problem');
  assert.match(refused.out, /app\.js differs from the version inherited from lab-00\/easy/);
  const drift = cli(labsDir, ['verify', '--chain']);
  assert.notEqual(drift.code, 0);
  assert.match(drift.out, /❌ lab-01\/easy/);
  const sync = cli(labsDir, ['sync-seeds', '--bootstrap']);
  assert.equal(sync.code, 0, sync.out);
  assert.equal(fs.readFileSync(path.join(labsDir, 'lab-01/easy/src/FINDINGS.md'), 'utf8'), 'found\n');
  assert.match(fs.readFileSync(path.join(labsDir, '_harness/course.json'), 'utf8'), /"overrides": \["app\.js"\]/);
  const clean = cli(labsDir, ['verify', '--chain']);
  assert.match(clean.out, /✅ lab-01\/easy/);
  assert.match(clean.out, /The chain is in sync/);
  assert.equal(cli(labsDir, ['sync-seeds']).code, 0, 'a second sync has nothing to do');
});

const MILESTONE_TODO = '# 🔴 Hard · Milestones\n\n> 🕐 30 min · 🆓 free checks\n\n## 🎯 Mission\nGo.\n\n## 🧭 Milestones\n### M1 · First\n- one\n### M2 · Second\n- two\n\n## 💡 Hints\n### M1\n<details><summary>H1</summary>\n\nx\n\n</details>\n### M2\n<details><summary>H2</summary>\n\ny\n\n</details>\n';
const MILESTONE_CHECKS = "export default (t) => [t.check('a', () => true, { milestone: 'M1' }), t.check('b', () => t.exists('done.txt') || 'no', { milestone: 'M2' })];\n";

test('test groups results by milestone; hint follows the current milestone; verify checks they line up', () => {
  const { labsDir } = fixtureWorkshop();
  fs.writeFileSync(path.join(labsDir, 'lab-05/hard/todo.md'), MILESTONE_TODO);
  fs.writeFileSync(path.join(labsDir, 'lab-05/hard/tests/checks.mjs'), MILESTONE_CHECKS);
  const out = cli(labsDir, ['test', 'lab-05', 'hard']).out;
  assert.match(out, /🧭 M1 · First/);
  assert.match(out, /✅ M1 · First\s+▰ 1\/1/);
  assert.match(out, /⬜ M2 · Second\s+▱ 0\/1/);
  assert.match(cli(labsDir, ['hint', 'lab-05', 'hard']).out, /M2 · Hint 1 of 2 · H2/, 'M1 passes, so the hint is for M2');
  assert.match(cli(labsDir, ['hint', 'lab-05', 'hard']).out, /All hints for M2 are revealed/);
  assert.match(cli(labsDir, ['verify', 'lab-05']).out, /✅ lab-05 hard/);
  fs.writeFileSync(path.join(labsDir, 'lab-05/hard/tests/checks.mjs'), MILESTONE_CHECKS.replace("'M2'", "'M3'"));
  const bad = cli(labsDir, ['verify', 'lab-05']);
  assert.notEqual(bad.code, 0);
  assert.match(bad.out, /a check names M3, but todo\.md has no "### M3" milestone/);
  assert.match(bad.out, /milestone M2 has no check/);
});

test('bring shows the plan, --dry-run changes nothing, and bringing records it', () => {
  const labsDir = chainCourse(CHAIN_BASE);
  assert.equal(cli(labsDir, ['sync-seeds', '--bootstrap']).code, 0);
  assert.match(cli(labsDir, ['bring', 'lab-01', 'easy']).out, /Nothing to bring yet/);
  fs.writeFileSync(path.join(labsDir, 'lab-00/easy/src/done.txt'), 'x\n');
  fs.writeFileSync(path.join(labsDir, 'lab-00/easy/src/AGENTS.md'), 'mine\n');
  assert.equal(cli(labsDir, ['test', 'lab-00', 'easy']).code, 0);
  const dry = cli(labsDir, ['bring', 'lab-01', 'easy', '--dry-run']);
  assert.match(dry.out, /AGENTS\.md\s+← lab-00 easy\s+new/);
  assert.ok(!fs.existsSync(path.join(labsDir, 'lab-01/easy/src/AGENTS.md')));
  const real = cli(labsDir, ['bring', 'lab-01', 'easy']);
  assert.equal(real.code, 0, real.out);
  assert.match(real.out, /Brought 1 file\(s\) in/);
  assert.equal(fs.readFileSync(path.join(labsDir, 'lab-01/easy/src/AGENTS.md'), 'utf8'), 'mine\n');
  const saved = JSON.parse(fs.readFileSync(path.join(labsDir, '.progress.json'), 'utf8')).entries['lab-01/easy'];
  assert.deepEqual(saved.brought.files, [{ file: 'AGENTS.md', from: 'lab-00/easy' }]);
});

test('starters --write refuses once the seeded chain manages starters.json', () => {
  const labsDir = chainCourse(CHAIN_BASE);
  assert.equal(cli(labsDir, ['sync-seeds', '--bootstrap']).code, 0);
  const r = cli(labsDir, ['starters', '--write']);
  assert.equal(r.code, 1);
  assert.match(r.out, /managed by the seeded chain.*sync-seeds/s);
});

test('sync-seeds refuses a course.json with a typo', () => {
  const labsDir = chainCourse(CHAIN_BASE, { 'lab-00/medum': { overrides: ['app.js'] } });
  const r = cli(labsDir, ['sync-seeds', '--bootstrap']);
  assert.equal(r.code, 1);
  assert.match(r.out, /"lab-00\/medum", which is not a level/);
  assert.ok(!fs.existsSync(path.join(labsDir, 'lab-01/easy/src/FINDINGS.md')), 'nothing was written');
});

test('glossary prints the terms, or the ones matching a word', () => {
  const { labsDir } = fixtureWorkshop();
  fs.writeFileSync(path.join(labsDir, 'glossary.md'), '# Glossary\n\n- **Hook**: your code that runs before a tool call. (Lab 05)\n- **Harness**: everything around the model.\n');
  const all = cli(labsDir, ['glossary']);
  assert.equal(all.code, 0);
  assert.match(all.out, /Hook: your code that runs before a tool call\. \(Lab 05\)/);
  assert.match(all.out, /Harness: everything around the model\./);
  const one = cli(labsDir, ['glossary', 'hook']);
  assert.match(one.out, /Hook:/);
  assert.doesNotMatch(one.out, /Harness:/);
  const none = cli(labsDir, ['glossary', 'zebra']);
  assert.equal(none.code, 1);
  assert.match(none.out, /No term matches "zebra"/);
  assert.match(cli(labsDir, ['help']).out, /glossary \[word\]/);
});

test('a path saved by an older version (no longer a path) falls back to all, it never breaks next or path', () => {
  const { labsDir } = fixtureWorkshop();
  progressStore(labsDir).set('_ui', { path: 'foundations' });
  const next = cli(labsDir, ['next', '--json']);
  assert.equal(next.code, 0, next.out);
  assert.equal(JSON.parse(next.out).key, 'lab-00/easy');
  assert.match(cli(labsDir, ['path']).out, /❯ All exercises/);
});
test('xray prints the harness tree, the context budget and the maturity; --sol looks at the reference', () => {
  const { labsDir } = fixtureWorkshop();
  fs.writeFileSync(path.join(labsDir, 'lab-03/easy/sol/AGENTS.md'), '# Rules\n## Commands\n- npm test\n## Boundaries\n- Never push.\n## Definition of done\n- green\n');
  const mine = cli(labsDir, ['xray', 'lab-03', 'easy']);
  assert.equal(mine.code, 0, mine.out);
  assert.match(mine.out, /CONTEXT BUDGET/);
  assert.match(mine.out, /MATURITY · L0 Bare/);
  const ref = cli(labsDir, ['xray', 'lab-03', 'easy', '--sol']);
  assert.match(ref.out, /MATURITY · L1 Instructed/);
  assert.equal(JSON.parse(cli(labsDir, ['xray', 'lab-03', 'easy', '--sol', '--json']).out).maturity.level, 'L1');
});