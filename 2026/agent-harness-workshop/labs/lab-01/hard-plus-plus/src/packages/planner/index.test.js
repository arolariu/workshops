import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shift, studyPlan } from './index.js';

const list = [
  { id: 'A1', title: 'Essay', due: '2026-10-20', done: false },
  { id: 'A2', title: 'Lab report', due: '2026-10-16', done: false },
  { id: 'A3', title: 'Quiz', due: '2026-10-18', done: true },
];

test('shift moves a date by whole days', () => {
  assert.equal(shift('2026-10-31', 1), '2026-11-01');
});

test('a plan starts 2 days before the due date, or today when that is sooner', () => {
  assert.deepEqual(studyPlan(list, '2026-10-15'), [
    { id: 'A2', start: '2026-10-15', due: '2026-10-16' },
    { id: 'A1', start: '2026-10-18', due: '2026-10-20' },
  ]);
});

test('a plan skips assignments that are done', () => {
  assert.ok(!studyPlan(list, '2026-10-15').some((p) => p.id === 'A3'));
});
