import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { runLinear } from '../linear.mjs';
import { fixtureWorkshop } from './helpers.mjs';

function session(lines, opts = {}) {
  const { labsDir } = opts.labsDir ? opts : fixtureWorkshop();
  const input = new PassThrough();
  const output = new PassThrough();
  let text = '';
  output.write = (s) => { text += String(s); return true; };
  const done = runLinear({ labsDir, input, output, deps: opts.deps });
  input.end(lines.map((l) => `${l}\n`).join(''));
  return done.then((code) => ({ code, text, labsDir }));
}

test('end of input closes the session cleanly', async () => {
  const { code, text } = await session([]);
  assert.equal(code, 0);
  assert.match(text, /Goodbye/);
});

test('a whole exercise can be worked line by line, with no escape codes', async () => {
  const { labsDir } = fixtureWorkshop();
  const file = path.join(labsDir, 'lab-04', 'medium', 'src', 'README.md');
  const { code, text } = await session([
    'list path=builder',
    'open 1',
    'checks',
    'details 1',
    'hint',
    'checkpoint first',
    'bookmark',
    'restore checkpoint:first',
    'yes',
    'compare',
    'next',
    'quit',
  ], { labsDir });
  assert.equal(code, 0);
  assert.doesNotMatch(text, /\x1b/);
  assert.match(text, /1\. Lab 04 MCP servers, Medium/);
  assert.match(text, /Open: Lab 04 MCP servers, Medium/);
  assert.match(text, /0 of 1 checks passed/);
  assert.match(text, /Check 1: done\.txt exists\. Status: fail/);
  assert.match(text, /Hint 1 of 1: First hint/);
  assert.match(text, /Checkpoint first saved/);
  assert.match(text, /Bookmarked/);
  assert.match(text, /Done\. Backup:/);
  assert.match(text, /not a byte-for-byte target/);
  assert.ok(fs.existsSync(file));
});

test('agent checks need an explicit yes', async () => {
  const started = [];
  const deps = {
    loadAgentChecks: async () => [{ name: 'asks', prompt: 'hi', expect: () => true }],
    runAgentChecks: async () => { started.push(1); return { state: 'pass', allPass: true, results: [], runId: 'r1', dir: null }; },
  };
  const declined = await session(['open lab-00 easy', 'agent', 'no', 'quit'], { deps });
  assert.match(declined.text, /Configured cap: 30 AI credits/);
  assert.match(declined.text, /Nothing was run/);
  assert.deepEqual(started, []);
  const accepted = await session(['open lab-00 easy', 'agent', 'yes', 'quit'], { deps });
  assert.match(accepted.text, /Agent checks: passed/);
  assert.deepEqual(started, [1]);
  const eof = await session(['open lab-00 easy', 'agent'], { deps });
  assert.match(eof.text, /Nothing was run/, 'end of input never counts as yes');
  assert.deepEqual(started, [1]);
});

test('unknown commands and invalid input are explained', async () => {
  const { text } = await session(['frobnicate', 'open lab-00 hamster', 'list level=hamster', 'path nowhere', 'details 1', 'checks']);
  assert.match(text, /Unknown command "frobnicate"/);
  assert.match(text, /"hamster" is not a difficulty/);
  assert.match(text, /"nowhere" is not a learning path/);
  assert.match(text, /Run "checks" first/);
  assert.match(text, /No exercise is open/);
});
