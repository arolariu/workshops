// The real labs: every level's todo.md can be read, and its milestones and hints line up.
// (verify checks the other direction: every milestone a check names exists, and every milestone has a check.)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { loadCatalog } from '../catalog.mjs';
import { courseOrder, predecessorOf, loadManifest, chainEntry } from '../chain.mjs';
import { quizProblems } from '../quiz.mjs';
import { LAYERS, scanHarness, scorecard, maturity } from '../scorecard.mjs';
import { DIFFICULTIES } from '../catalog.mjs';
import { loadAgentChecks } from '../agent.mjs';

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
  // The capstone climbs inside the lab: governance (a CI gate and evals) reaches L5 at hard+.
  const capstone = { easy: 'L4', medium: 'L4', hard: 'L4', 'hard-plus': 'L5', 'hard-plus-plus': 'L5' };
  // Lab 01 hard+ moves a procedure into a skill in .agents/skills/ (Copilot loads it; bring doesn't carry it on), and
  // hard++ inherits it.
  const level = { 'lab-01/hard-plus': 'L2', 'lab-01/hard-plus-plus': 'L2' };
  for (const ex of levels) {
    const scan = scanHarness(ex.sol);
    assert.deepEqual(scan.problems, [], ex.key);
    const rules = scorecard(scan);
    const earlier = new Set(LAYERS.filter((l) => l.lab < ex.labId).map((l) => l.id));
    const bad = rules.filter((r) => earlier.has(r.layer) && r.ok === false);
    assert.deepEqual(bad.map((r) => `${r.id}: ${r.message}`), [], `${ex.key}: the inherited checks fail on the reference`);
    const want = level[ex.key] ?? (catalog.find((l) => l.id === ex.labId)?.capstone ? capstone[ex.level] : expected[ex.labId]);
    if (want) assert.equal(maturity(rules, scan).level, want, `${ex.key} maturity`);
  }
});

// Labs whose homework ladder is complete (Phase 4; the capstone in Phase 5). Their levels above easy follow the ticket format of spec §5.3.
// CONTENT_TEST_LABS=lab-01,lab-02 checks other labs while their ladders are being written.
const GROWN = new Set(process.env.CONTENT_TEST_LABS ? process.env.CONTENT_TEST_LABS.split(',').map((s) => s.trim()) : ['lab-00', 'lab-01', 'lab-02', 'lab-03', 'lab-04', 'lab-05', 'lab-06', 'lab-07', 'lab-08']);
// The capstone's tiers have their own times. "about 1 h" leaves a quarter either way.
const tierRange = (d, capstone = false) => {
  const time = capstone ? d.capstoneTime : d.time;
  const [lo, hi = lo] = time.match(/[\d.]+/g).map(Number);
  const unit = /\bh\b/.test(time) ? 60 : 1;
  const slack = /^about\b/.test(time) ? 0.25 : 0;
  return [lo * unit * (1 - slack), hi * unit * (1 + slack)];
};
test('the grown labs are labs that exist (a typo in CONTENT_TEST_LABS would test nothing)', () => {
  const ids = new Set(catalog.map((l) => l.id));
  for (const id of GROWN) assert.ok(ids.has(id), `${id} is not a lab`);
});
test('every homework level of a grown lab follows the ticket format, fits its tier, and keeps agent checks cheap', async () => {
  for (const lab of catalog.filter((l) => GROWN.has(l.id))) {
    assert.deepEqual(lab.levels.map((e) => e.level), DIFFICULTIES.map((d) => d.id), `${lab.id}: all five tiers`);
    // The capstone's easy is homework too, so it follows the ticket format.
    for (const ex of lab.levels.filter((e) => e.level !== 'easy' || lab.capstone)) {
      const d = DIFFICULTIES.find((x) => x.id === ex.level);
      const [lo, hi] = tierRange(d, lab.capstone);
      const [a, b] = ex.minutesRange ?? [];
      assert.ok(a >= lo && b <= hi, `${ex.key}: 🕐 ${ex.time} is outside ${lab.capstone ? d.capstoneTime : d.time}`);
      assert.match(ex.meta, /🏠 homework/, ex.key);
      assert.equal(ex.buildsOn, predecessorOf(order, ex.key).key, `${ex.key}: 🧱 builds on`);
      assert.ok(ex.mission.split('\n').length >= 3, `${ex.key}: 🎯 a story of 3-6 lines`);
      assert.ok((ex.requirements.match(/^\d+\.\s/gm) ?? []).length >= 2, `${ex.key}: 📋 numbered requirements`);
      assert.ok(ex.milestones.length >= 2 && ex.milestones.length <= 6, `${ex.key}: 2-6 milestones`);
      for (const m of ex.milestones) {
        const n = ex.hints.filter((h) => h.milestone === m.id).length;
        assert.ok(n >= 1 && n <= 3, `${ex.key}: ${m.id} has ${n} hints (1-3)`);
      }
      assert.ok(ex.takeaway && !ex.takeaway.includes('\n'), `${ex.key}: 🧠 a one-line takeaway`);
      assert.ok(ex.quiz, `${ex.key}: ❓ Check yourself`);
      assert.ok(ex.further, `${ex.key}: 🚀 Going further`);
      if (ex.hasAgent) {
        const specs = await loadAgentChecks(ex.dir);
        const prompts = specs.reduce((n, s) => n + (s.command ? (s.prompts ?? 1) : 1), 0);
        assert.ok(prompts <= 2, `${ex.key}: agent checks use at most 2 prompts (${prompts})`);
      }
    }
  }
});

// Hard+ and hard++ starters are skeletons: a TODO(Mn) marker shows where each milestone's work goes.
const manifest = loadManifest(labsDir);
const textOf = (dir) => {
  if (!fs.existsSync(dir)) return '';
  return fs.readdirSync(dir, { withFileTypes: true }).map((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return /^(node_modules|\.git)$/.test(e.name) ? '' : textOf(p);
    return fs.statSync(p).size < 512 * 1024 ? fs.readFileSync(p, 'utf8') : '';
  }).join('\n');
};
test('every milestone of a grown lab\'s hard+ and hard++ level has a TODO(Mn) marker in its starter', () => {
  for (const lab of catalog.filter((l) => GROWN.has(l.id))) {
    for (const ex of lab.levels.filter((e) => e.level === 'hard-plus' || e.level === 'hard-plus-plus')) {
      // Only this level's own starter files: a marker inherited from the level before doesn't say where *this* work goes.
      const own = Object.keys(chainEntry(manifest, ex.key)?.starter ?? {});
      const text = own.length ? own.map((f) => { try { return fs.readFileSync(path.join(ex.src, f), 'utf8'); } catch { return ''; } }).join('\n') : textOf(ex.src);
      const missing = ex.milestones.filter((m) => !text.includes(`TODO(${m.id})`)).map((m) => m.id);
      assert.deepEqual(missing, [], `${ex.key}: src/ has no TODO(Mn) marker for ${missing.join(', ')}`);
    }
  }
});
