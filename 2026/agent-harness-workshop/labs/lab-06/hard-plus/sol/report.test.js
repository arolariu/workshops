import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summary } from './report.js';

test('summary prints one line per course with the weighted average', () => {
  const courses = [{ code: 'SE201', name: 'Software Engineering', grades: [{ grade: 8, weight: 50 }, { grade: 9, weight: 50 }] }];
  assert.deepEqual(summary(courses), ['SE201 Software Engineering: 8.5']);
});
