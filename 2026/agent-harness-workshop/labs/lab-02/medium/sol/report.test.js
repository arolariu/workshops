import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summary, attendanceLines } from './report.js';

test('summary prints one line per course with the weighted average', () => {
  const courses = [{ code: 'SE201', name: 'Software Engineering', grades: [{ grade: 8, weight: 50 }, { grade: 9, weight: 50 }] }];
  assert.deepEqual(summary(courses), ['SE201 Software Engineering: 8.5']);
});

test('summary says "no grades yet" when a course has no grades', () => {
  assert.deepEqual(summary([{ code: 'WEB230', name: 'Web Development' }]), ['WEB230 Web Development: no grades yet']);
  assert.deepEqual(summary([{ code: 'WEB230', name: 'Web Development', grades: [] }]), ['WEB230 Web Development: no grades yet']);
});

test('attendanceLines prints the attendance rate per course', () => {
  const sessions = [{ attended: true }, { attended: true }, { attended: false }];
  assert.deepEqual(attendanceLines([{ code: 'SE201', name: 'Software Engineering', sessions }]), ['SE201 Software Engineering: 66.7% attendance']);
});

test('attendanceLines says "no sessions yet" when a course has no sessions', () => {
  assert.deepEqual(attendanceLines([{ code: 'WEB230', name: 'Web Development', sessions: [] }]), ['WEB230 Web Development: no sessions yet']);
  assert.deepEqual(attendanceLines([{ code: 'WEB230', name: 'Web Development' }]), ['WEB230 Web Development: no sessions yet']);
});
