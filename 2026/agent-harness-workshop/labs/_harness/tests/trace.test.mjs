import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { parseTrace, timelineText } from '../trace.mjs';

const REAL = fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'trace-hook-denial.jsonl'), 'utf8');
const ev = (type, data) => JSON.stringify({ type, data });

test('a real run (Copilot CLI 1.0.99-2): the answer, every tool call, the hook denial and the token use', () => {
  const t = parseTrace(REAL);
  assert.equal(t.ok, true);
  assert.ok(t.events > 20);
  assert.match(t.output, /^Read `README\.md`\. Deleting `tmp-demo` was blocked/);
  assert.match(t.output, /Harness check: AGENTS\.md loaded$/);
  const tools = t.timeline.filter((x) => x.kind !== 'answer');
  assert.deepEqual(tools.map((x) => `${x.tool}:${x.kind}`), ['skill:tool', 'view:tool', 'powershell:tool', 'skill:tool', 'powershell:denied']);
  const denied = tools.at(-1);
  assert.equal(denied.by, 'hook');
  assert.match(denied.message, /^Recursive force-deletes/);
  assert.equal(tools[1].summary, 'README.md');
  assert.equal(t.timeline.at(-1).kind, 'answer');
  assert.deepEqual(t.usage, { inputTokens: 98566, outputTokens: 526, cacheReadTokens: 77704, premiumRequests: 1 });
  const line = timelineText(t);
  assert.match(line, /🔧 view README\.md ✓/);
  assert.match(line, /⛔ powershell Remove-Item [^·]*\(denied by a hook\)/);
  assert.match(line, /💬 answer · Σ ≈98\.6k in \/ 526 out tokens$/);
});

test('paths read as the agent saw its folder: relative to the run folder, or the tail when they are elsewhere', () => {
  const run = (p) => ev('tool.execution_start', { toolCallId: p, toolName: 'view', arguments: { path: p } });
  const t = parseTrace([run('C:\\runs\\case-1\\work\\src\\grades.js'), run('C:\\runs\\case-1\\work'), run('D:\\elsewhere\\a\\very\\long\\folder\\name\\that\\goes\\on\\and\\on\\notes.md')].join('\n'), { cwd: 'c:\\runs\\case-1\\work\\' });
  assert.deepEqual(t.timeline.map((x) => x.summary), ['src/grades.js', '.', '…older/name/that/goes/on/and/on/notes.md']);
  assert.equal(parseTrace(run('/home/me/work/a.js'), { cwd: '/home/me/work' }).timeline[0].summary, 'a.js');
  assert.equal(parseTrace(run('/home/me/workshop/a.js'), { cwd: '/home/me/work' }).timeline[0].summary, '/home/me/workshop/a.js', 'a sibling folder is not inside');
});

test('every assistant message joins the output, as text mode prints them; a permission denial is "denied"', () => {
  const t = parseTrace([
    ev('assistant.message', { content: 'I will look first.', toolRequests: [{ toolCallId: 'a', name: 'powershell', arguments: { command: 'rm -rf x' } }] }),
    ev('tool.execution_start', { toolCallId: 'a', toolName: 'powershell', arguments: { command: 'rm -rf x' } }),
    ev('tool.execution_complete', { toolCallId: 'a', success: false, error: { code: 'denied', message: 'Permission denied because no interactive user response was available.' } }),
    ev('tool.execution_start', { toolCallId: 'b', toolName: 'view', arguments: { path: 'gone.js' } }),
    ev('tool.execution_complete', { toolCallId: 'b', success: false, error: { code: 'failure', message: 'File not found' } }),
    ev('assistant.message', { content: 'Done.' }),
  ].join('\n'));
  assert.equal(t.output, 'I will look first.\n\nDone.');
  assert.deepEqual(t.timeline.map((x) => [x.kind, x.by]), [['denied', 'permissions'], ['failed', null], ['answer', null]]);
  assert.match(timelineText(t), /⛔ powershell rm -rf x \(denied\) · ❌ view gone\.js \(failed\) · 💬 answer$/);
  assert.equal(t.usage, null);
});

test('tolerant: text lines and broken JSON are skipped; nothing parsable means no trace', () => {
  const mixed = parseTrace(`warning: something\n${ev('assistant.message', { content: 'Hi' })}\n{ broken\n`);
  assert.equal(mixed.ok, true);
  assert.equal(mixed.output, 'Hi');
  const none = parseTrace('Just a plain answer.\nOn two lines.');
  assert.equal(none.ok, false);
  assert.equal(none.output, '');
  assert.deepEqual(parseTrace(''), { ok: false, events: 0, output: '', answer: '', timeline: [], usage: null });
});

test('a long run is cut to the first steps, and a tool still running is marked', () => {
  const lines = [];
  for (let i = 0; i < 12; i++) lines.push(ev('tool.execution_start', { toolCallId: `c${i}`, toolName: 'view', arguments: { path: `f${i}.js` } }), ev('tool.execution_complete', { toolCallId: `c${i}`, success: true }));
  lines.push(ev('tool.execution_start', { toolCallId: 'z', toolName: 'powershell', arguments: { command: 'npm test -- --watch and a very long tail of arguments' } }));
  const t = parseTrace(lines.join('\n'));
  assert.equal(t.timeline.at(-1).kind, 'running');
  assert.ok(t.timeline.at(-1).summary.length <= 41);
  assert.match(timelineText(t, { max: 4 }), /f3\.js ✓ · … 9 more$/);
});

test('a cut timeline still says how many hidden steps were denied or failed, and keeps the answer and the tokens', () => {
  const lines = [];
  for (let i = 0; i < 6; i++) lines.push(ev('tool.execution_start', { toolCallId: `c${i}`, toolName: 'view', arguments: { path: `f${i}.js` } }), ev('tool.execution_complete', { toolCallId: `c${i}`, success: true }));
  lines.push(ev('tool.execution_start', { toolCallId: 'd', toolName: 'bash', arguments: { command: 'rm -rf /' } }), ev('tool.execution_complete', { toolCallId: 'd', success: false, error: { code: 'denied', message: 'Denied by preToolUse hook: no' } }));
  lines.push(ev('tool.execution_start', { toolCallId: 'f', toolName: 'bash', arguments: { command: 'npm test' } }), ev('tool.execution_complete', { toolCallId: 'f', success: false, error: { code: 'failure', message: 'exit 1' } }));
  lines.push(ev('assistant.message', { content: 'Done.' }), ev('session.usage_checkpoint', { accountingSnapshot: { modelMetrics: { m: { usage: { inputTokens: 2000, outputTokens: 100 } } } } }));
  assert.match(timelineText(parseTrace(lines.join('\n')), { max: 3 }), /f2\.js ✓ · … 5 more \(1 denied, 1 failed\) · 💬 answer · Σ ≈2\.0k in \/ 100 out tokens$/);
});
