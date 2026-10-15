import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysBetween, upcoming } from './deadlines.js';

const list = [
  { id: 'A1', title: 'Essay', due: '2026-10-20', done: false },
  { id: 'A2', title: 'Lab report', due: '2026-10-17', done: false },
  { id: 'A3', title: 'Project', due: '2026-11-30', done: false },
];

test('daysBetween counts whole days', () => {
  assert.equal(daysBetween('2026-10-15', '2026-10-20'), 5);
});

test('upcoming keeps items due within the window, soonest first', () => {
  assert.deepEqual(upcoming(list, '2026-10-15', 7).map((a) => a.id), ['A2', 'A1']);
});

test('upcoming skips items that are already overdue', () => {
  assert.deepEqual(upcoming(list, '2026-10-21', 7).map((a) => a.id), []);
});
