import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weightedAverage, hasPassed, gpa } from './grades.js';

test('weightedAverage combines grades by weight', () => {
  assert.equal(weightedAverage([{ grade: 8, weight: 60 }, { grade: 6, weight: 40 }]), 7.2);
});

test('weightedAverage rounds to two decimals', () => {
  assert.equal(weightedAverage([{ grade: 7, weight: 1 }, { grade: 8, weight: 1 }, { grade: 8, weight: 1 }]), 7.67);
});

test('weightedAverage rejects an empty list', () => {
  assert.throws(() => weightedAverage([]), RangeError);
});

test('hasPassed is true when the final grade is 5 or more', () => {
  assert.equal(hasPassed({ finalGrade: 7, examGrade: 6 }), true);
});

test('hasPassed is false when the exam grade is below 5, even with a good final grade', () => {
  assert.equal(hasPassed({ finalGrade: 7.5, examGrade: 4 }), false);
});

test('gpa weights final grades by credits', () => {
  assert.equal(gpa([{ credits: 6, finalGrade: 9 }, { credits: 4, finalGrade: 7 }]), 8.2);
});

test('gpa rounds to two decimals', () => {
  assert.equal(gpa([{ credits: 5, finalGrade: 8 }, { credits: 5, finalGrade: 7 }, { credits: 5, finalGrade: 7 }]), 7.33);
});

test('gpa rejects input that is not a list of valid courses', () => {
  assert.throws(() => gpa('nope'), TypeError);
  assert.throws(() => gpa([]), RangeError);
  assert.throws(() => gpa([{ credits: 5, finalGrade: 11 }]), RangeError);
  assert.throws(() => gpa([{ credits: 0, finalGrade: 8 }]), RangeError);
});
