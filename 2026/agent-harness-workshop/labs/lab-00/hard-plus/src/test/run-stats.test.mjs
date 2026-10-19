// Unit tests for scripts/run-stats.mjs, on three recorded runs: one that answered, one with a denied call, and one
// with a failed call that ended in a failed run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { summarize } from '../scripts/run-stats.mjs';

const run = (name) => summarize(fs.readFileSync(new URL(`../fixtures/${name}.jsonl`, import.meta.url), 'utf8').split(/\r?\n/));
const timeline = (s) => s.turns.map((t) => t.tools.map((x) => `${x.name}:${x.outcome}`).join(' '));

test('ok.jsonl: every call succeeded, the run answered', () => {
  const s = run('ok');
  assert.equal(s.events, 22);
  assert.equal(s.skipped, 0);
  assert.equal(s.model, 'gpt-6.1-sol');
  assert.deepEqual(s.tools, { skill: { calls: 1, ok: 1, failed: 0, denied: 0 }, view: { calls: 2, ok: 2, failed: 0, denied: 0 } });
  assert.deepEqual(s.tokens, { input: 55924, output: 253, cacheRead: 36509 });
  assert.equal(s.outcome, 'ok');
  assert.deepEqual(timeline(s), ['skill:ok', 'view:ok view:ok', '']);
  assert.equal(s.turns[2].said, true);
});

test('denied.jsonl: the permission system denied a call, and the run still finished', () => {
  const s = run('denied');
  assert.deepEqual(s.tools.powershell, { calls: 1, ok: 0, failed: 0, denied: 1 });
  assert.deepEqual(timeline(s), ['skill:ok', 'powershell:denied', '']);
  assert.equal(s.exitCode, 0);
  assert.equal(s.outcome, 'ok');
});

test('failed.jsonl: a failed call is not a denial, and a session error fails the run', () => {
  const s = run('failed');
  assert.deepEqual(s.tools.view, { calls: 2, ok: 1, failed: 1, denied: 0 });
  assert.deepEqual(timeline(s), ['skill:ok', 'view:failed view:ok', '']);
  assert.equal(s.exitCode, 1);
  assert.equal(s.errors.length, 1);
  assert.equal(s.outcome, 'failed');
  assert.deepEqual(s.tokens, { input: 37104, output: 128, cacheRead: 18490 });
});

test('blank lines are ignored, broken lines are skipped, a run without a result is incomplete', () => {
  const s = summarize(['', '{"type":"user.message","data":{"content":"hi"}}', 'not json', '   ']);
  assert.equal(s.events, 1);
  assert.equal(s.skipped, 1);
  assert.equal(s.outcome, 'incomplete');
});
