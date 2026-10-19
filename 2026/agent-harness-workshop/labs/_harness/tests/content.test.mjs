// The real labs: every level's todo.md can be read, and its milestones and hints line up.
// (verify checks the other direction: every milestone a check names exists, and every milestone has a check.)
import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { loadCatalog } from '../catalog.mjs';
import { courseOrder, predecessorOf } from '../chain.mjs';
import { quizProblems } from '../quiz.mjs';
import { LAYERS, scanHarness, scorecard, maturity } from '../scorecard.mjs';

const labsDir = path.resolve(import.meta.dirname, '..', '..');
const catalog = loadCatalog(labsDir);
const levels = catalog.flatMap((lab) => lab.levels);

test('every todo.md has a title, a mission and a time', () => {
  assert.ok(levels.length >= 24);
  for (const ex of levels) {
    assert.ok(ex.title, `${ex.key}: title`);
    assert.ok(ex.mission, `${ex.key}: mission`);
    assert.ok(ex.minutes, `${ex.key}: 🕐 time in the meta line`);
  }
});

test('milestones are unique, and every hint milestone exists', () => {
  for (const ex of levels) {
    const ids = ex.milestones.map((m) => m.id);
    assert.equal(new Set(ids).size, ids.length, `${ex.key}: duplicate milestone`);
    for (const m of ex.milestones) assert.ok(m.title, `${ex.key}: ${m.id} needs a title`);
    for (const h of ex.hints) if (h.milestone) assert.ok(ids.includes(h.milestone), `${ex.key}: hint "${h.title}" belongs to ${h.milestone}, which is not a milestone`);
    for (const id of ids) assert.ok(ex.hints.filter((h) => h.milestone === id).length <= 3, `${ex.key}: at most three hints per milestone`);
  }
});

test('levels with milestones say what done means per milestone, not in a separate Done-when list', () => {
  for (const ex of levels.filter((e) => e.milestones.length)) {
    assert.equal(ex.done, '', `${ex.key}: move "Done when" into the milestones`);
    for (const m of ex.milestones) assert.ok(m.body, `${ex.key}: ${m.id} needs at least one "done" bullet`);
  }
});

const order = courseOrder(catalog);
const prose = (md) => md.replace(/```[\s\S]*?```/g, '').split('\n').filter((l) => l.trim()).length;

test('every lab guide has the spine: layer, maturity, threads, under the hood, in the enterprise', () => {
  for (const lab of catalog.filter((l) => !l.capstone)) {
    assert.ok(lab.layer, `${lab.id}: **Harness layer:**`);
    assert.match(lab.maturity?.level ?? '', /^L[0-5]$/, `${lab.id}: **Maturity:** L0-L5 and a name`);
    assert.ok(lab.maturity.name, `${lab.id}: the maturity level's name`);
    assert.ok(lab.threads.length, `${lab.id}: **Threads:**`);
    assert.ok(lab.underTheHood, `${lab.id}: 🔬 Under the hood`);
    assert.ok(prose(lab.underTheHood) <= 12, `${lab.id}: 🔬 Under the hood has ${prose(lab.underTheHood)} lines besides its diagram (at most 12)`);
    assert.equal(lab.enterprise.split('\n').filter((l) => /^\s*[-*] /.test(l)).length, 3, `${lab.id}: 🏛️ In the enterprise has 3 bullets`);
  }
});

test('every easy level: 8-10 min, together, builds on its predecessor, one takeaway and a valid quiz', () => {
  for (const lab of catalog.filter((l) => !l.capstone)) {
    const ex = lab.levels.find((e) => e.level === 'easy');
    const [lo, hi] = ex.minutesRange ?? [];
    assert.ok(lo >= 8 && hi <= 10, `${ex.key}: 🕐 between 8 and 10 min (${ex.time})`);
    assert.match(ex.meta, /👥 together/, ex.key);
    const pred = predecessorOf(order, ex.key);
    assert.equal(ex.buildsOn, pred ? pred.key : 'start', `${ex.key}: 🧱 builds on`);
    assert.ok(ex.takeaway, `${ex.key}: 🧠 Takeaway`);
    assert.ok(!ex.takeaway.includes('\n'), `${ex.key}: the takeaway is one sentence or two, on one line`);
    assert.ok(ex.quiz, `${ex.key}: ❓ Check yourself`);
    assert.deepEqual(quizProblems(ex.quiz), [], ex.key);
  }
});

test('any level that says what it builds on names its real predecessor, and any quiz is valid', () => {
  for (const ex of levels) {
    if (ex.buildsOn) {
      const pred = predecessorOf(order, ex.key);
      assert.equal(ex.buildsOn, pred ? pred.key : 'start', `${ex.key}: 🧱 builds on`);
    }
    assert.deepEqual(quizProblems(ex.quiz), [], ex.key);
  }
});
test('the live track does not teach "it is always answer 2": answers vary, and the right one is not always the longest', () => {
  const quizzes = catalog.filter((l) => !l.capstone).map((l) => l.levels.find((e) => e.level === 'easy').quiz);
  const at = quizzes.map((q) => q.answer);
  const most = Math.max(...[1, 2, 3, 4].map((n) => at.filter((a) => a === n).length));
  assert.ok(most <= Math.ceil(at.length / 2), `answers ${at.join(' ')}: one position is used too often`);
  const longest = quizzes.filter((q) => q.options[q.answer - 1].length === Math.max(...q.options.map((o) => o.length))).length;
  assert.ok(longest <= Math.ceil(quizzes.length / 2), `the right answer is the longest option in ${longest} of ${quizzes.length} quizzes`);
});

test('every reference solution passes the scorecard rules of the layers earlier labs taught, and climbs the maturity ladder', () => {
  const expected = { 'lab-00': 'L0', 'lab-01': 'L1', 'lab-02': 'L2', 'lab-03': 'L3', 'lab-04': 'L3', 'lab-05': 'L4', 'lab-06': 'L4', 'lab-07': 'L4' };
  for (const ex of levels) {
    const scan = scanHarness(ex.sol);
    assert.deepEqual(scan.problems, [], ex.key);
    const rules = scorecard(scan);
    const earlier = new Set(LAYERS.filter((l) => l.lab < ex.labId).map((l) => l.id));
    const bad = rules.filter((r) => earlier.has(r.layer) && r.ok === false);
    assert.deepEqual(bad.map((r) => `${r.id}: ${r.message}`), [], `${ex.key}: the inherited checks fail on the reference`);
    if (expected[ex.labId]) assert.equal(maturity(rules, scan).level, expected[ex.labId], `${ex.key} maturity`);
  }
});