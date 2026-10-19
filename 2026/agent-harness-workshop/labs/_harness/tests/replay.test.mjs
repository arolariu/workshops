import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { REPLAYS, loadReplay, parseRecording, replayTurns } from '../replay.mjs';
import { replayLines } from '../screens/replay.mjs';
import { stripAnsi, width } from '../ui.mjs';

const PLAIN = Object.fromEntries(['green', 'bright', 'dim', 'white', 'yellow', 'bold', 'cyan', 'red'].map((k) => [k, (s) => s]));
const REAL = fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'trace-hook-denial.jsonl'), 'utf8');

test('both recordings parse cleanly: the same task, 6 to 10 turns, a context window on every turn', () => {
  assert.deepEqual(REPLAYS.map((r) => r.id), ['bare', 'harnessed']);
  for (const r of REPLAYS) {
    const rec = loadReplay(r.id);
    assert.deepEqual(rec.problems, [], r.id);
    assert.equal(rec.prompt, 'The build is red. Fix it.', r.id);
    assert.ok(rec.turns.length >= 6 && rec.turns.length <= 10, `${r.id}: ${rec.turns.length} turns`);
    assert.ok(rec.turns.every((t) => t.context?.length), `${r.id}: every turn shows its context window`);
    const history = rec.turns.map((t) => t.context.find((s) => s.name === 'history').tokens);
    assert.ok(history.every((n, i) => i === 0 || n > history[i - 1]), `${r.id}: the history grows each turn`);
    assert.ok(rec.turns.at(-1).answer, `${r.id}: the last turn answers`);
    assert.ok(rec.turns.slice(0, -1).every((t) => t.calls.length === 1 && t.decisions.length === 1), `${r.id}: one tool call per turn, and the harness decides on it`);
  }
});

test('without a harness the model edits the test; with one, the hook stops rm -rf and the code gets fixed', () => {
  const bare = loadReplay('bare');
  const harnessed = loadReplay('harnessed');
  const edited = (rec) => rec.turns.flatMap((t) => t.calls).filter((c) => c.tool === 'edit').map((c) => c.arguments.path);
  assert.deepEqual(edited(bare), ['grades.test.js']);
  assert.deepEqual(edited(harnessed), ['grades.js']);
  const seg = (rec, name) => rec.turns[0].context.find((s) => s.name === name);
  assert.equal(seg(bare, 'instructions'), undefined);
  assert.ok(seg(harnessed, 'instructions').tokens >= 300);
  assert.ok(seg(harnessed, 'skills').tokens > 0);
  assert.equal(bare.turns.flatMap((t) => t.decisions).filter((d) => !d.ok).length, 0, 'nothing in the bare run is ever denied');
  const denied = harnessed.turns.flatMap((t) => t.decisions).filter((d) => !d.ok);
  assert.equal(denied.length, 1);
  assert.equal(denied[0].by, 'hook');
  assert.match(harnessed.turns.find((t) => t.decisions.some((d) => !d.ok)).calls[0].arguments.command, /rm -rf/);
  assert.match(harnessed.turns.at(-1).answer, /Harness check: AGENTS\.md loaded/);
  assert.ok(harnessed.turns.some((t) => t.notes.length) && bare.turns.some((t) => t.notes.length));
});

test('a real recording replays without annotations: turns, calls, the hook denial and the answer', () => {
  const { events, problems } = parseRecording(REAL);
  assert.deepEqual(problems, []);
  const turns = replayTurns(events);
  assert.equal(turns.length, 5);
  assert.ok(turns.every((t) => t.context === null && t.notes.length === 0));
  assert.deepEqual(turns[1].calls.map((c) => c.tool), ['view', 'powershell']);
  assert.equal(turns[1].results.length, 2);
  const deny = turns[3].decisions[0];
  assert.equal(deny.ok, false);
  assert.equal(deny.by, 'hook');
  assert.match(deny.message, /^Recursive force-deletes/);
  assert.match(turns.at(-1).answer, /Harness check: AGENTS\.md loaded$/);
});

test('tolerant: broken lines are reported, a missing turn end and tool calls outside a turn still replay', () => {
  const lines = [
    '{"type":"user.message","data":{"content":"Run the tests"}}',
    '{"type":"tool.execution_start","data":{"toolCallId":"t0","toolName":"view","arguments":{"path":"a.js"}}}',
    '{"type":"tool.execution_complete","data":{"toolCallId":"t0","success":true}}',
    '{"type":"assistant.turn_start","data":{}}',
    '{"type":"tool.execution_start","data":{"toolCallId":"t1","toolName":"bash","arguments":{"command":"npm test"}}}',
    '',
    'this line is broken on purpose',
    '{"type":"tool.execution_complete","data":{"toolCallId":"t1","success":false,"error":{"code":"denied","message":"Permission denied because no interactive user response was available."}}}',
    '{"type":"assistant.message","data":{"content":"One test fails."}}',
  ];
  const { events, problems } = parseRecording(lines.join('\n'));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /line 7/);
  const turns = replayTurns(events);
  assert.equal(turns.length, 2);
  assert.equal(turns[0].prompt, 'Run the tests');
  assert.deepEqual(turns[1].decisions.map((d) => [d.ok, d.by]), [[false, 'permissions']]);
  assert.equal(turns[1].answer, 'One test fails.');
  assert.deepEqual(replayTurns(parseRecording('').events), []);
});

test('loadReplay takes a recording id or a file, and explains what it cannot read', () => {
  assert.equal(loadReplay('bare').title, REPLAYS[0].title);
  const file = path.join(import.meta.dirname, 'fixtures', 'trace-hook-denial.jsonl');
  const own = loadReplay(file);
  assert.equal(own.scripted, false);
  assert.equal(own.turns.length, 5);
  assert.match(loadReplay('nope').error, /bare, harnessed, or a \.jsonl file/);
  const empty = path.join(import.meta.dirname, 'fixtures');
  assert.match(loadReplay(empty).error, /Could not read/);
});

test('a turn on screen: the four parts, inside 78 columns, and the denial spelled out', () => {
  const harnessed = loadReplay('harnessed');
  const at = (rec, i) => replayLines(rec, i, { W: 76, fmt: PLAIN }).map(stripAnsi);
  for (const rec of [harnessed, loadReplay('bare')]) {
    rec.turns.forEach((t, i) => {
      const lines = at(rec, i);
      const wide = lines.filter((l) => width(l) > 78);
      assert.deepEqual(wide, [], `${rec.id} turn ${i + 1}`);
    });
  }
  const deniedAt = harnessed.turns.findIndex((t) => t.decisions.some((d) => !d.ok));
  const text = at(harnessed, deniedAt).join('\n');
  for (const h of ['CONTEXT WINDOW', 'THE MODEL WROTE', 'THE HARNESS DECIDED', 'ADDED TO THE HISTORY']) assert.match(text, new RegExp(h));
  assert.match(text, /⛔ denied by a hook/);
  assert.match(text, /"command": "rm -rf node_modules && npm ci"/);
  assert.match(text, /I instructions ≈410/);
  assert.match(text, /Your harness is I and K: ≈470 tokens/, 'named by letter, so it reads without colour');
  const last = at(harnessed, harnessed.turns.length - 1).join('\n');
  assert.match(last, /THE ANSWER/);
  assert.match(last, /Harness check: AGENTS\.md loaded/);
  const real = loadReplay(path.join(import.meta.dirname, 'fixtures', 'trace-hook-denial.jsonl'));
  assert.match(replayLines(real, 0, { W: 76, fmt: PLAIN }).join('\n'), /This recording has no annotations/);
  assert.match(replayLines(harnessed, 99, { W: 76, fmt: PLAIN }).join('\n'), /TURN 6 OF 6/i, 'an index past the end shows the last turn');
});
