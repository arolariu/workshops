import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from './index.js';

const assignments = [
  { id: 'A1', title: 'Essay', due: '2026-10-20', done: false },
  { id: 'A2', title: 'Lab report', due: '2026-10-17', done: false },
];

test('due lists what is due within a week, soonest first', () => {
  assert.deepEqual(run(['due', '2026-10-15'], { assignments }), { code: 0, out: '2026-10-17  Lab report\n2026-10-20  Essay' });
});

test('average prints the weighted average', () => {
  assert.deepEqual(run(['average', '8:60', '6:40']), { code: 0, out: '7.2' });
});

test('an unknown command is a user error: exit code 1', () => {
  assert.equal(run(['dance']).code, 1);
});
