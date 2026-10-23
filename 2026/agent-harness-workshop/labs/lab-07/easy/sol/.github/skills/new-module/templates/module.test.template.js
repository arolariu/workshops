import { test } from 'node:test';
import assert from 'node:assert/strict';
import { {{functionName}} } from './{{module}}.js';

test('{{functionName}} {{does the normal thing}}', () => {
  assert.equal({{functionName}}({{input}}), {{expected}});
});

test('{{functionName}} rejects {{bad input}}', () => {
  assert.throws(() => {{functionName}}({{badInput}}), RangeError);
});
