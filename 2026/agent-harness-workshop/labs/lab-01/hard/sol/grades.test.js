import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weightedAverage, hasPassed } from './grades.js';

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

test('weightedAverage of a single item is that grade', () => {
  assert.equal(weightedAverage([{ grade: 9.5, weight: 30 }]), 9.5);
});

test('weightedAverage rejects a total weight of zero', () => {
  assert.throws(() => weightedAverage([{ grade: 8, weight: 0 }]), RangeError);
});

test('weightedAverage rejects input that is not an array', () => {
  assert.throws(() => weightedAverage('8,9'), RangeError);
});

test('weightedAverage treats weights as relative values', () => {
  assert.equal(weightedAverage([{ grade: 10, weight: 1 }, { grade: 5, weight: 4 }]), 6);
});
