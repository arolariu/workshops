// Unit tests for scripts/run-stats.mjs, on three recorded runs: fixtures/ok.jsonl (it answered), fixtures/denied.jsonl
// (a call was denied) and fixtures/failed.jsonl (a call failed, then the run failed). Run: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { summarize } from '../scripts/run-stats.mjs';

const run = (name) => summarize(fs.readFileSync(new URL(`../fixtures/${name}.jsonl`, import.meta.url), 'utf8').split(/\r?\n/));

test('ok.jsonl: the run answered', () => {
  const s = run('ok');
  assert.equal(s.outcome, 'ok');
  // TODO(M4): the tools and their outcomes, the tokens, and which tools ran in which turn.
});

// TODO(M4): one test for denied.jsonl (the denied call, and a run that still finished) and one for failed.jsonl (a
// failed call is not a denial; the run failed). Assert the fields todo.md lists, the same way for all three.
