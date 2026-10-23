import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { loadCatalog, exerciseByKey } from '../catalog.mjs';
import { progressStore, captureEvidence } from '../progress.mjs';
import { PATHS, progressView, selectExercises, describeSelection, nextExercise, learningReport, reportMarkdown, writeReport, SelectionError, choosePath, pathMinutes, pathTime } from '../learning.mjs';
import { fixtureWorkshop, tmpdir } from './helpers.mjs';

function setup(opts) {
  const { labsDir } = fixtureWorkshop(opts);
  const catalog = loadCatalog(labsDir);
  const store = progressStore(labsDir);
  const view = progressView(store, catalog);
  const pass = (key) => {
    const { ex } = exerciseByKey(catalog, key);
    fs.writeFileSync(path.join(ex.src, 'done.txt'), 'done\n');
    store.recordChecks(key, { state: 'pass', allPass: true, passed: 1, total: 1, results: [] }, captureEvidence(ex));
  };
  return { labsDir, catalog, store, view, pass };
}

test('search, difficulty, status and time budget combine', () => {
  const { catalog, view } = setup();
  const matches = selectExercises(catalog, view, { query: 'mcp', level: 'medium', status: 'unfinished', maxMinutes: 15 });
  assert.deepEqual(matches.map((x) => x.key), ['lab-04/medium']);
  assert.equal(matches[0].progress.checks, 'not-run');
  assert.deepEqual(selectExercises(catalog, view, { query: 'MCP servers', level: 'hard', maxMinutes: 15 }).map((x) => x.key), []);
  assert.deepEqual(selectExercises(catalog, view, { query: 'least privilege' }).map((x) => x.key), ['lab-03/easy', 'lab-03/medium', 'lab-03/hard']);
});

test('learning paths keep their explicit order', () => {
  const { catalog, view } = setup();
  assert.deepEqual(PATHS.map((p) => p.id), ['all', 'deeper', 'security', 'platform', 'internals', 'capstone']);
  assert.deepEqual(selectExercises(catalog, view, { path: 'deeper' }).map((x) => x.key), ['lab-00/medium', 'lab-01/medium', 'lab-02/medium', 'lab-03/medium', 'lab-04/medium', 'lab-05/medium', 'lab-06/medium', 'lab-07/medium']);
  assert.deepEqual(selectExercises(catalog, view, { path: 'security' }).map((x) => x.key), ['lab-05/medium', 'lab-05/hard']);
  assert.deepEqual(selectExercises(catalog, view, { path: 'platform' }).map((x) => x.key), ['lab-02/hard', 'lab-06/hard']);
  assert.deepEqual(selectExercises(catalog, view, { path: 'internals' }).map((x) => x.key), ['lab-00/hard']);
  assert.deepEqual(pathMinutes(catalog, 'deeper'), [120, 120], 'eight 15-minute fixture levels');
  assert.equal(pathMinutes(catalog, 'all'), null, 'all is not a path you finish in an evening');
  assert.equal(pathTime(catalog, 'deeper'), 'about 2 h');
  assert.equal(pathTime(catalog, 'internals'), 'about 25 min');
  const all = selectExercises(catalog, view, { path: 'all' }).map((x) => x.key);
  assert.equal(all.length, 24);
  assert.deepEqual(all.slice(0, 3), ['lab-00/easy', 'lab-01/easy', 'lab-02/easy']);
});

test('unknown durations are explained, never assumed to fit a budget', () => {
  const { catalog, view } = setup({ noDuration: ['lab-06/medium'] });
  const { matches, notes } = describeSelection(catalog, view, { level: 'medium', maxMinutes: 20 });
  assert.ok(!matches.some((m) => m.key === 'lab-06/medium'));
  assert.match(notes.join(' '), /1 exercise.*unknown duration/i);
  assert.ok(selectExercises(catalog, view, { level: 'medium' }).some((m) => m.key === 'lab-06/medium'), 'without a budget it is listed');
});

test('invalid selections fail with a clear message', () => {
  const { catalog, view } = setup();
  for (const bad of [{ path: 'nope' }, { level: 'hamster' }, { status: 'weird' }, { maxMinutes: -5 }, { maxMinutes: 'abc' }]) {
    assert.throws(() => selectExercises(catalog, view, bad), SelectionError, JSON.stringify(bad));
  }
});

test('Next is the first unfinished exercise of the selection, using fresh evidence', () => {
  const { catalog, view, pass } = setup();
  for (const key of ['lab-00/medium', 'lab-01/medium', 'lab-02/medium', 'lab-03/medium', 'lab-04/medium']) pass(key);
  const next = nextExercise(catalog, view, { path: 'deeper' });
  assert.equal(next.key, 'lab-05/medium');
  fs.appendFileSync(path.join(exerciseByKey(catalog, 'lab-02/medium').ex.src, 'README.md'), 'edited in another window\n');
  view.refresh();
  assert.equal(nextExercise(catalog, view, { path: 'deeper' }).key, 'lab-02/medium');
});

test('a finished selection says so instead of claiming the whole workshop is done', () => {
  const { catalog, view, pass } = setup();
  for (const key of ['lab-05/medium', 'lab-05/hard']) pass(key);
  assert.equal(nextExercise(catalog, view, { path: 'security' }), null);
  assert.notEqual(nextExercise(catalog, view, { path: 'all' }), null);
});

test('bookmarks filter the list and the chosen path is remembered', () => {
  const { catalog, store, view } = setup();
  store.set('lab-04/hard', { bookmarked: true });
  assert.deepEqual(selectExercises(catalog, view, { bookmarked: true }).map((x) => x.key), ['lab-04/hard']);
  choosePath(store, 'platform');
  assert.equal(store.get('_ui').path, 'platform');
  assert.throws(() => choosePath(store, 'nope'), SelectionError);
});

test('reports show current evidence, stale work, history, hints and bookmarks, and never overwrite', () => {
  const { catalog, store, view, pass } = setup();
  pass('lab-00/easy');
  pass('lab-01/easy');
  const staleKey = 'lab-01/easy';
  fs.appendFileSync(path.join(exerciseByKey(catalog, staleKey).ex.src, 'README.md'), 'more\n');
  store.set('lab-02/easy', { hints: 2, peeked: true, bookmarked: true });
  view.refresh();
  const report = learningReport(catalog, view, { path: 'all' });
  assert.equal(report.exercises.find((x) => x.key === staleKey).checks, 'stale');
  assert.equal(report.exercises.find((x) => x.key === 'lab-00/easy').checks, 'pass');
  assert.ok(report.exercises.find((x) => x.key === staleKey).lastChecked, 'historical timestamp kept');
  assert.deepEqual(report.bookmarks, ['lab-02/easy']);
  assert.equal(report.exercises.find((x) => x.key === 'lab-02/easy').hints, 2);
  assert.equal(report.totals.passed, 1);
  assert.equal(report.totals.stale, 1);
  assert.equal(report.network, 'none');
  const md = reportMarkdown(report);
  assert.match(md, /^# /);
  assert.match(md, /lab-01\/easy.*stale/);
  const dir = tmpdir();
  const first = writeReport(report, { dir, format: 'json', name: 'summary' });
  assert.equal(JSON.parse(fs.readFileSync(first.file, 'utf8')).totals.passed, 1);
  assert.throws(() => writeReport(report, { dir, format: 'json', name: 'summary' }), /already exists/);
  const second = writeReport(report, { dir, format: 'md' });
  assert.match(fs.readFileSync(second.file, 'utf8'), /Learning summary/);
  assert.ok(!JSON.stringify(report).includes('stdout'), 'no raw logs are attached');
});

test('next up on the "all" path: the live track first, then the homework ladder', () => {
  const { catalog, view, pass } = setup();
  const next = (o) => nextExercise(catalog, view, { path: 'all', ...o })?.key ?? null;
  assert.equal(next({ current: 'lab-02/easy' }), 'lab-03/easy', 'n on an easy level moves down the live track, finished or not');
  assert.equal(next({ last: 'lab-04/medium' }), 'lab-04/medium', 'from the home screen: back to where you were');
  assert.equal(next({ current: 'lab-04/medium' }), 'lab-00/easy', 'then the first unfinished easy level');
  for (const lab of catalog) pass(lab.levels[0].key);
  view.refresh();
  assert.equal(next({ current: 'lab-04/medium' }), 'lab-04/hard', 'then the next tier in the same lab');
  pass('lab-04/hard');
  view.refresh();
  assert.equal(next({ current: 'lab-04/medium' }), 'lab-05/medium', 'then the lowest unfinished tier of the next lab');
  assert.equal(next({ current: 'lab-07/easy' }), 'lab-07/medium', 'the last easy level continues along its row');
  assert.equal(next({}), 'lab-00/medium', 'with no history: the first unfinished level');
  pass('lab-04/medium');
  view.refresh();
  assert.equal(next({ last: 'lab-04/medium' }), 'lab-05/medium', 'a finished last level is not suggested again');
});

test('other paths keep their own order, whatever the current level', () => {
  const { catalog, view } = setup();
  assert.equal(nextExercise(catalog, view, { path: 'security', current: 'lab-02/easy' }).key, 'lab-05/medium');
});

test('the learning summary includes each check-yourself answer', () => {
  const { catalog, store, view } = setup();
  store.set('lab-03/easy', { quiz: 'right' });
  store.set('lab-04/easy', { quiz: 'wrong' });
  view.refresh();
  const report = learningReport(catalog, view, { path: 'all' });
  assert.equal(report.exercises.find((x) => x.key === 'lab-03/easy').quiz, 'right');
  assert.equal(report.exercises.find((x) => x.key === 'lab-04/easy').quiz, 'wrong');
  assert.equal(report.exercises.find((x) => x.key === 'lab-05/easy').quiz, null);
  const md = reportMarkdown(report);
  assert.match(md, /\| Check yourself \|/);
  assert.match(md, /\| lab-03\/easy \|[^\n]*\| ✅ \|/);
  assert.match(md, /\| lab-04\/easy \|[^\n]*\| 💡 \|/);
});

test('the homework paths only name levels that exist (Phases 4 and 5 add the deeper ones)', () => {
  const real = loadCatalog(path.join(import.meta.dirname, '..', '..'));
  const keys = new Set(real.flatMap((l) => l.levels.map((e) => e.key)));
  for (const p of PATHS.filter((x) => x.keys)) {
    assert.ok(p.keys.length, `${p.id} has levels`);
    for (const k of p.keys) assert.ok(keys.has(k), `${p.id}: ${k} does not exist`);
  }
  const order = (id) => PATHS.find((p) => p.id === id).keys.map((k) => k.split('/')[0]);
  assert.deepEqual([...new Set(order('security'))], ['lab-05', 'lab-04', 'lab-07', 'lab-08'], 'Security: guardrails first, then the attacks, then red-teaming your own harness (spec §5.1)');
  assert.deepEqual([...new Set(order('capstone'))], ['lab-08'], 'Capstone: Lab 08 only');
  const cap = real.find((l) => l.capstone);
  assert.deepEqual(PATHS.find((p) => p.id === 'capstone').keys, cap.levels.map((e) => e.key), 'Capstone: every tier of Lab 08, in order (spec §5.1)');
});