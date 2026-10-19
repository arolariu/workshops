import assert from 'node:assert/strict';
import { test } from 'node:test';
import { milestoneStatus, nextFixName, groupChecks, currentMilestone, revealedHints, nextHint, revealNextHint, milestoneBar } from '../milestones.mjs';

const r = (idx, name, status, milestone) => ({ idx, name, status, milestone });
const RESULTS = [r(0, 'a', 'pass', 'M1'), r(1, 'b', 'skip', 'M1'), r(2, 'c', 'fail', 'M2'), r(3, 'd', 'pass', 'M2'), r(4, 'e', 'fail', null), r(5, 'f', 'fail', 'M10')];

test('milestone status and the next fix follow milestone order', () => {
  assert.deepEqual(milestoneStatus(RESULTS), { M1: 'pass', M2: 'fail', M10: 'fail' });
  assert.equal(nextFixName(RESULTS), 'c');
  assert.equal(nextFixName([r(0, 'z', 'fail', 'M10'), r(1, 'y', 'blocked', 'M2')]), 'y');
  assert.equal(nextFixName([r(0, 'x', 'fail', null), r(1, 'w', 'fail', null)]), 'x');
  assert.equal(nextFixName([r(0, 'a', 'pass', 'M1')]), null);
  assert.deepEqual(milestoneStatus([r(0, 'a', 'pass', null)]), {});
});

test('groups follow the todo order, then unknown milestones, then the rest', () => {
  const g = groupChecks({ names: RESULTS.map((x) => x.name), milestones: RESULTS.map((x) => x.milestone), results: RESULTS, defined: [{ id: 'M1', title: 'One' }, { id: 'M2', title: 'Two' }, { id: 'M3', title: 'Three' }] });
  assert.deepEqual(g.map((x) => [x.id, x.title, x.total, x.passed, x.done]), [['M1', 'One', 2, 2, true], ['M2', 'Two', 2, 1, false], ['M3', 'Three', 0, 0, false], ['M10', '', 1, 0, false], [null, '', 1, 0, false]]);
  assert.deepEqual(g[1].items.map((i) => i.idx), [2, 3]);
});

test('without milestones there is one plain group, even while the run is still going', () => {
  const g = groupChecks({ names: ['a', 'b'], milestones: [], results: [r(0, 'a', 'pass', null)], defined: [] });
  assert.equal(g.length, 1);
  assert.equal(g[0].id, null);
  assert.deepEqual(g[0].items.map((i) => i.result?.status ?? null), ['pass', null]);
});

const EX = { key: 'lab-05/hard', milestones: [{ id: 'M1' }, { id: 'M2' }], hints: [{ title: 'g', milestone: null }, { title: 'a', milestone: 'M1' }, { title: 'b', milestone: 'M1' }, { title: 'c', milestone: 'M2' }] };

test('the current milestone is the first one that does not pass yet', () => {
  assert.equal(currentMilestone(EX, {}), 'M1');
  assert.equal(currentMilestone(EX, { milestones: { M1: 'pass' } }), 'M2');
  assert.equal(currentMilestone(EX, { milestones: { M1: 'pass', M2: 'pass' } }), null);
  assert.equal(currentMilestone({ milestones: [], hints: [] }, {}), null);
});

test('hints are revealed per milestone: its own first, then the general ones, never another milestone\'s', () => {
  let entry = {};
  const steps = [];
  for (;;) {
    const n = nextHint(EX, entry, 'M1');
    if (!n) break;
    steps.push(n.idx);
    entry = { ...entry, ...n.patch };
  }
  assert.deepEqual(steps, [1, 2, 0]);
  assert.deepEqual([...revealedHints(EX, entry)].sort(), [0, 1, 2]);
  assert.equal(entry.hints, 3);
  assert.equal(nextHint(EX, entry, 'M2').idx, 3);
  assert.equal(nextHint(EX, { ...entry, hintsBy: { ...entry.hintsBy, M2: 1 } }, null), null, 'everything revealed');
});

test('levels without milestones keep one counter', () => {
  const ex = { milestones: [], hints: [{}, {}] };
  assert.deepEqual(nextHint(ex, { hints: 1 }), { idx: 1, patch: { hints: 2 } });
  assert.equal(nextHint(ex, { hints: 2 }), null);
  assert.deepEqual([...revealedHints(ex, { hints: 1 })], [0]);
});

test('revealNextHint stores the reveal and says when a milestone has no hints left', () => {
  const data = {};
  const store = { get: (k) => data[k] ?? {}, set: (k, p) => { data[k] = { ...(data[k] ?? {}), ...p }; } };
  assert.equal(revealNextHint(store, EX).hint.title, 'a');
  assert.equal(revealNextHint(store, EX).hint.title, 'b');
  const third = revealNextHint(store, EX);
  assert.equal(third.hint.title, 'g');
  assert.equal(third.shown, 3);
  assert.deepEqual(revealNextHint(store, EX), { none: true, milestone: 'M1' });
});

test('milestone bars', () => {
  assert.equal(milestoneBar(2, 3), '▰▰▱');
  assert.equal(milestoneBar(0, 0), '');
  assert.equal([...milestoneBar(7, 20)].length, 10, 'at most ten cells');
});

test('a milestone whose checks did not all run is not passed', () => {
  assert.deepEqual(milestoneStatus([r(0, 'a', 'pass', 'M1')], ['M1', 'M1']), { M1: 'fail' });
  assert.deepEqual(milestoneStatus([r(0, 'a', 'pass', 'M1'), r(1, 'b', 'skip', 'M1')], ['M1', 'M1']), { M1: 'pass' });
});
