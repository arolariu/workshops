import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysBetween, today, upcoming } from './deadlines.js';

// The time-zone finding only shows where the local date differs from UTC: pin a zone so it is red on every machine.
process.env.TZ = 'Europe/Bucharest';

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

test('upcoming leaves out assignments that are already done', () => {
  const withDone = [...list, { id: 'A4', title: 'Quiz', due: '2026-10-16', done: true }];
  assert.deepEqual(upcoming(withDone, '2026-10-15', 7).map((a) => a.id), ['A2', 'A1']);
});

test('today gives the local date, not the UTC date, just after midnight', () => {
  // 00:30 on 20 October in Bucharest is still 19 October in UTC.
  assert.equal(today(new Date('2026-10-19T21:30:00Z')), '2026-10-20');
});

test('daysBetween throws a RangeError for a date that is not a real YYYY-MM-DD', () => {
  assert.throws(() => daysBetween('2026-10-15', 'next friday'), RangeError);
  assert.throws(() => daysBetween('2026-02-30', '2026-10-20'), RangeError);
});
