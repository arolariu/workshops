import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attendanceRate } from './attendance.js';

test('attendanceRate returns the percentage of sessions attended', () => {
  assert.equal(attendanceRate([{ attended: true }, { attended: false }, { attended: true }]), 66.7);
});

test('attendanceRate rejects an empty list', () => {
  assert.throws(() => attendanceRate([]), RangeError);
});
