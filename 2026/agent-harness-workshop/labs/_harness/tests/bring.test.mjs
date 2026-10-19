import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { loadCatalog, exerciseByKey } from '../catalog.mjs';
import { loadCourse } from '../course.mjs';
import { computeChain, writeChain, loadManifest, courseOrder } from '../chain.mjs';
import { progressStore, captureEvidence } from '../progress.mjs';
import { progressView } from '../learning.mjs';
import { runChecks } from '../checks.mjs';
import { bringPlan, applyBring, perfectLearnerPlan, simulateBring } from '../bring.mjs';
import { chainCourse } from './helpers.mjs';

/** A chain course, synced like the published workshop (bootstrap accepts differing files as overrides). */
function synced(levels, rules) {
  const labsDir = chainCourse(levels, rules);
  const result = computeChain({ catalog: loadCatalog(labsDir), course: loadCourse(labsDir), manifest: null, bootstrap: true });
  assert.deepEqual(result.problems, []);
  writeChain({ labsDir, result });
  return labsDir;
}
function ctx(labsDir) {
  const catalog = loadCatalog(labsDir);
  const store = progressStore(labsDir);
  return { catalog, course: loadCourse(labsDir), manifest: loadManifest(labsDir), store, view: progressView(store, catalog), node: (k) => courseOrder(catalog).find((n) => n.key === k), ex: (k) => exerciseByKey(catalog, k).ex };
}
const write = (labsDir, rel, text) => { const f = path.join(labsDir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
const read = (labsDir, rel) => fs.readFileSync(path.join(labsDir, rel), 'utf8');
/** Run the real checks and record them with real evidence, like the app does. */
async function pass(store, ex) {
  const evidence = captureEvidence(ex);
  const res = await runChecks({ exDir: ex.dir, target: ex.src });
  assert.equal(res.state, 'pass', `${ex.key} should pass`);
  store.recordChecks(ex.key, res, evidence);
}

test('only fresh passes travel, only harness files, and later sources win', async () => {
  const labsDir = synced({
    'lab-00/easy': { src: { 'app.js': 'v1\n' }, sol: { 'app.js': 'v1\n', 'done.txt': 'x\n' } },
    'lab-00/medium': { src: {}, sol: { 'done.txt': 'x\n', 'AGENTS.md': 'ref\n' } },
    'lab-01/easy': { src: {}, sol: { 'done.txt': 'x\n' } },
  });
  const c = ctx(labsDir);
  write(labsDir, 'lab-00/easy/src/done.txt', 'x\n');
  write(labsDir, 'lab-00/easy/src/AGENTS.md', 'mine v1\n');
  write(labsDir, 'lab-00/easy/src/app.js', 'my app\n');
  await pass(c.store, c.ex('lab-00/easy'));
  write(labsDir, 'lab-00/medium/src/AGENTS.md', 'mine v2\n');
  await pass(c.store, c.ex('lab-00/medium'));
  c.view.refresh();
  const plan = bringPlan({ ...c, target: c.node('lab-01/easy') });
  assert.deepEqual(plan.sources, ['lab-00/easy', 'lab-00/medium']);
  assert.deepEqual(plan.items.map((i) => [i.file, i.from, i.action, i.alsoIn]), [['AGENTS.md', 'lab-00/medium', 'new', ['lab-00/easy']]], 'app.js is app code: it never travels');
  assert.deepEqual(plan.skipped, []);

  write(labsDir, 'lab-00/medium/src/AGENTS.md', 'mine v3\n');
  c.view.refresh();
  const stale = bringPlan({ ...c, target: c.node('lab-01/easy') });
  assert.deepEqual(stale.skipped.map((s) => s.key), ['lab-00/medium']);
  assert.match(stale.skipped[0].reason, /changed since its checks last passed/);
  assert.equal(stale.items[0].from, 'lab-00/easy');
  assert.equal(stale.items[0].buf.toString(), 'mine v1\n');
  assert.deepEqual(bringPlan({ ...c, target: c.node('lab-00/easy') }).items, [], 'nothing comes before the first level');
});

test('keep and new starter files are never overwritten; overrides are; applying backs up first', async () => {
  const labsDir = synced({
    'lab-00/easy': { src: {}, sol: { 'done.txt': 'x\n', 'AGENTS.md': 'ref\n' } },
    'lab-01/easy': { src: { 'AGENTS.md': 'stub\n', '.github/x.md': 'starter\n' }, sol: { 'AGENTS.md': 'stub\n', '.github/x.md': 'starter\n', 'done.txt': 'x\n' } },
  }, { 'lab-01/easy': { keep: ['.github/hooks/**'] } });
  const c = ctx(labsDir);
  assert.deepEqual(c.course.levels['lab-01/easy'].overrides, undefined, 'the fixture course.json was not rewritten by the test');
  write(labsDir, 'lab-00/easy/src/done.txt', 'x\n');
  write(labsDir, 'lab-00/easy/src/AGENTS.md', 'mine\n');
  write(labsDir, 'lab-00/easy/src/.github/hooks/guard.mjs', 'guard\n');
  write(labsDir, 'lab-00/easy/src/.github/x.md', 'my x\n');
  write(labsDir, 'lab-00/easy/src/.mcp.json', '{}\n');
  await pass(c.store, c.ex('lab-00/easy'));
  c.view.refresh();
  const course = { ...c.course, levels: { 'lab-01/easy': { keep: ['.github/hooks/**'], overrides: ['AGENTS.md'] } } };
  const plan = bringPlan({ ...c, course, target: c.node('lab-01/easy') });
  assert.deepEqual(plan.kept.map((k) => [k.file, k.reason]), [['.github/hooks/guard.mjs', 'keep'], ['.github/x.md', 'starter']]);
  assert.deepEqual(plan.items.map((i) => [i.file, i.action]), [['.mcp.json', 'new'], ['AGENTS.md', 'replace']]);
  const r = applyBring({ labsDir, target: c.node('lab-01/easy'), plan });
  assert.equal(r.ok, true, r.reason);
  assert.ok(fs.existsSync(r.backup.dir), 'a recovery backup exists');
  assert.equal(read(labsDir, 'lab-01/easy/src/AGENTS.md'), 'mine\n');
  assert.equal(read(labsDir, 'lab-01/easy/src/.mcp.json'), '{}\n');
  assert.equal(read(labsDir, 'lab-01/easy/src/.github/x.md'), 'starter\n');
  assert.ok(!fs.existsSync(path.join(labsDir, 'lab-01/easy/src/.github/hooks/guard.mjs')));
  assert.deepEqual(r.files, [{ file: '.mcp.json', from: 'lab-00/easy' }, { file: 'AGENTS.md', from: 'lab-00/easy' }]);
  const replaced = bringPlan({ ...c, course, target: c.node('lab-01/easy') });
  assert.deepEqual(replaced.items, [], 'bringing again changes nothing');
});

test('a level without a seed record cannot receive work, and says why', () => {
  const labsDir = chainCourse({ 'lab-00/easy': { src: {}, sol: { 'done.txt': 'x\n' } }, 'lab-01/easy': { src: {}, sol: { 'done.txt': 'x\n' } } });
  const c = ctx(labsDir);
  const plan = bringPlan({ ...c, target: c.node('lab-01/easy') });
  assert.match(plan.error, /sync-seeds/);
});

test('the perfect learner brings every earlier solution delta under the harness paths', () => {
  const labsDir = synced({
    'lab-00/easy': { src: { 'app.js': 'v1\n' }, sol: { 'app.js': 'v1\n', 'done.txt': 'x\n' } },
    'lab-00/medium': { src: {}, sol: { 'done.txt': 'x\n', 'AGENTS.md': 'ref\n', 'notes.md': 'not harness\n' } },
    'lab-01/easy': { src: {}, sol: { 'done.txt': 'x\n', 'AGENTS.md': 'easy ref\n' } },
  });
  const c = ctx(labsDir);
  const plan = perfectLearnerPlan({ ...c, target: c.node('lab-01/easy') });
  assert.deepEqual(plan.items.map((i) => [i.file, i.from]), [['AGENTS.md', 'lab-00/medium']]);
  const sim = simulateBring({ labsDir, ...c, target: c.node('lab-01/easy') });
  assert.ok(sim.base.startsWith(path.join(labsDir, '.runs')), 'the copies stay inside labs/');
  assert.equal(fs.readFileSync(path.join(sim.src, 'AGENTS.md'), 'utf8'), 'ref\n');
  assert.equal(fs.readFileSync(path.join(sim.sol, 'AGENTS.md'), 'utf8'), 'easy ref\n', "this level's own solution file is kept");
  assert.ok(!fs.existsSync(path.join(sim.src, 'notes.md')));
});

test('bring never pre-fills a file the target level drops, nor a source level\'s local files', async () => {
  const labsDir = synced({
    'lab-00/easy': { src: {}, sol: { 'done.txt': 'x\n' } },
    'lab-01/easy': { src: {}, sol: { 'done.txt': 'x\n', '.github/hooks/guard.mjs': 'the deliverable\n' } },
  }, { 'lab-00/easy': { local: ['.github/notes.md'] }, 'lab-01/easy': { drop: ['.github/hooks/guard.mjs'] } });
  const c = ctx(labsDir);
  write(labsDir, 'lab-00/easy/src/done.txt', 'x\n');
  write(labsDir, 'lab-00/easy/src/.github/hooks/guard.mjs', 'my guard\n');
  write(labsDir, 'lab-00/easy/src/.github/notes.md', 'notes\n');
  write(labsDir, 'lab-00/easy/src/AGENTS.md', 'mine\n');
  await pass(c.store, c.ex('lab-00/easy'));
  c.view.refresh();
  const plan = bringPlan({ ...c, target: c.node('lab-01/easy') });
  assert.deepEqual(plan.items.map((i) => i.file), ['AGENTS.md']);
  assert.deepEqual(plan.kept.map((k) => [k.file, k.reason]), [['.github/hooks/guard.mjs', 'drop']]);
  const sim = perfectLearnerPlan({ ...c, target: c.node('lab-01/easy') });
  assert.ok(!sim.items.some((i) => i.file === '.github/hooks/guard.mjs'));
});

test('levels with your work that do not pass are listed with the reason', async () => {
  const labsDir = synced({
    'lab-00/easy': { src: {}, sol: { 'done.txt': 'x\n' } },
    'lab-00/medium': { src: {}, sol: { 'done.txt': 'x\n' } },
    'lab-00/hard': { src: {}, sol: { 'done.txt': 'x\n' } },
    'lab-01/easy': { src: {}, sol: { 'done.txt': 'x\n' } },
  });
  const c = ctx(labsDir);
  for (const k of ['lab-00/medium', 'lab-00/hard']) fs.rmSync(path.join(labsDir, k, 'src', 'done.txt'), { force: true });
  write(labsDir, 'lab-00/medium/src/AGENTS.md', 'medium work\n');
  write(labsDir, 'lab-00/hard/src/AGENTS.md', 'hard work\n');
  const ex = c.ex('lab-00/medium');
  const evidence = captureEvidence(ex);
  c.store.recordChecks(ex.key, await runChecks({ exDir: ex.dir, target: ex.src }), evidence);
  c.view.refresh();
  const plan = bringPlan({ ...c, target: c.node('lab-01/easy') });
  assert.deepEqual(plan.skipped.map((s) => [s.key, s.reason]), [['lab-00/medium', 'its checks fail now'], ['lab-00/hard', 'its checks have not been run yet']]);
  assert.deepEqual(plan.items, []);
});
