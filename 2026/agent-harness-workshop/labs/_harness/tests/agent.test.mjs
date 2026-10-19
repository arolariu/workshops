import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { runAgentChecks, listRuns, budgetPreview, copilotArgs } from '../agent.mjs';
import { tmpdir, makeExercise, writeTree, waitFor } from './helpers.mjs';

// Unpaid fixtures: every "agent" is a local Node command. `copilotBin` points at Node so nothing calls Copilot.
function fixture(agentSource) {
  const root = tmpdir();
  const labsDir = path.join(root, 'labs');
  fs.mkdirSync(labsDir);
  const { exDir, target } = makeExercise(root, 'export default [];', { agent: agentSource, src: { 'main.js': 'export const x = 1;\n' } });
  return { labsDir, exDir, target, base: { exDir, target, labsDir, labId: 'lab-01', level: 'easy', copilotBin: process.execPath } };
}
const hang = `['node', '-e', 'setInterval(() => {}, 1000)']`;

test('each run gets its own directory; earlier runs survive', async () => {
  const { base } = fixture(`export default [{ name: 'says hi', command: ['node', '-e', 'console.log("hi")'], expect: (t, { output }) => /hi/.test(output) || 'no hi' }];`);
  const first = await runAgentChecks(base);
  const second = await runAgentChecks(base);
  assert.equal(first.state, 'pass');
  assert.equal(first.allPass, true);
  assert.notEqual(first.runId, second.runId);
  assert.equal(fs.existsSync(first.results[0].runDir), true);
  assert.equal(fs.existsSync(second.results[0].runDir), true);
  assert.equal(fs.readFileSync(path.join(first.dir, 'case-1', 'stdout.txt'), 'utf8').trim(), 'hi');
  const runs = listRuns(base.labsDir, { labId: 'lab-01', level: 'easy' });
  assert.deepEqual(runs.map((r) => r.runId).sort(), [first.runId, second.runId].sort());
  assert.ok(runs.every((r) => r.state === 'pass' && r.finishedAt && r.cases[0].command));
});

test('aborting the first case stops the suite before the next case launches', async () => {
  const { base } = fixture(`export default [
    { name: 'first', command: ${hang}, expect: () => true },
    { name: 'second', command: ['node', '-e', '0'], expect: () => true },
  ];`);
  const ac = new AbortController();
  const startedCases = [];
  const cancelled = await runAgentChecks({ ...base, signal: ac.signal, onEvent: (e) => { if (e.type === 'start') { startedCases.push(e.name); ac.abort(); } } });
  assert.deepEqual(startedCases, ['first']);
  assert.equal(cancelled.state, 'cancelled');
  assert.equal(cancelled.allPass, false);
  assert.equal(cancelled.results.find((r) => r.name === 'second').status, 'not-run');
  assert.equal(listRuns(base.labsDir).find((r) => r.runId === cancelled.runId).state, 'cancelled');
});

test('cancelling during an asynchronous verdict never reports a pass', async () => {
  const { base } = fixture(`export default [{ name: 'slow verdict', command: ['node', '-e', '0'], expect: async () => { await new Promise((r) => setTimeout(r, 400)); return true; } }];`);
  const ac = new AbortController();
  const result = await runAgentChecks({ ...base, signal: ac.signal, onEvent: (e) => { if (e.type === 'verdict') ac.abort(); } });
  assert.equal(result.state, 'cancelled');
  assert.equal(result.allPass, false);
  assert.equal(result.results[0].status, 'cancelled');
});

test('cancelling during setup prevents the launch', async () => {
  const dir = tmpdir();
  const marker = path.join(dir, 'launched');
  const { base } = fixture(`export default [{ name: 'with setup', setup: () => new Promise((r) => setTimeout(r, 300)), command: ['node', '-e', ${JSON.stringify(`require('node:fs').writeFileSync(${JSON.stringify(marker)}, '1')`)}], expect: () => true }];`);
  const ac = new AbortController();
  const result = await runAgentChecks({ ...base, signal: ac.signal, onEvent: (e) => { if (e.type === 'setup') ac.abort(); } });
  assert.equal(result.state, 'cancelled');
  assert.equal(fs.existsSync(marker), false);
});

test('an already-cancelled signal starts nothing', async () => {
  const { base } = fixture(`export default [{ name: 'never', command: ['node', '-e', '0'], expect: () => true }];`);
  const ac = new AbortController();
  ac.abort();
  const startedCases = [];
  const result = await runAgentChecks({ ...base, signal: ac.signal, onEvent: (e) => e.type === 'start' && startedCases.push(e.name) });
  assert.equal(result.state, 'cancelled');
  assert.deepEqual(startedCases, []);
});

test('only one paid suite runs at a time', async () => {
  const { base } = fixture(`export default [{ name: 'long', command: ${hang}, expect: () => true }];`);
  const ac = new AbortController();
  const started = [];
  const first = runAgentChecks({ ...base, signal: ac.signal, onEvent: (e) => e.type === 'start' && started.push('first') });
  const second = await runAgentChecks({ ...base, onEvent: (e) => e.type === 'start' && started.push('second') });
  assert.equal(second.state, 'blocked');
  assert.match(second.fatal, /already running/i);
  await waitFor(() => started.length === 1);
  ac.abort();
  assert.equal((await first).state, 'cancelled');
  assert.deepEqual(started, ['first']);
});

test('a malformed specification is rejected before anything runs', async () => {
  const { base } = fixture(`export default [{ name: 'ok', command: ['node', '-e', '0'], expect: () => true }, { name: 'no verdict', command: ['node', '-e', '0'] }];`);
  const started = [];
  const result = await runAgentChecks({ ...base, onEvent: (e) => e.type === 'start' && started.push(e.name) });
  assert.equal(result.state, 'interrupted');
  assert.match(result.fatal, /no verdict/);
  assert.deepEqual(started, []);
});

test('a run that times out fails with the reason and keeps its output', async () => {
  const { base } = fixture(`export default [{ name: 'too slow', timeout: 300, command: ['node', '-e', 'console.log("working"); setInterval(() => {}, 1000)'], expect: () => true }];`);
  const result = await runAgentChecks(base);
  assert.equal(result.state, 'fail');
  assert.match(result.results[0].message, /too long/i);
  assert.match(fs.readFileSync(path.join(result.dir, 'case-1', 'stdout.txt'), 'utf8'), /working/);
});

test('a failing copy is a blocked case with a diagnostic, and history keeps it', async () => {
  const { base } = fixture(`export default [{ name: 'copy', command: ['node', '-e', '0'], expect: () => true }];`);
  const result = await runAgentChecks({ ...base, target: path.join(base.target, 'missing') });
  assert.equal(result.state, 'blocked');
  assert.match(result.results[0].message, /prepare/i);
  const saved = listRuns(base.labsDir).find((r) => r.runId === result.runId);
  assert.equal(saved.state, 'blocked');
  assert.match(saved.cases[0].message, /prepare/i);
});

test('a failing git snapshot is a blocked case; a missing git is noted but not fatal', async () => {
  const { base } = fixture(`export default [{ name: 'snap', command: ['node', '-e', '0'], expect: () => true }];`);
  const broken = await runAgentChecks({ ...base, gitBin: process.execPath });
  assert.equal(broken.state, 'blocked');
  assert.match(broken.results[0].message, /git/i);
  const missing = await runAgentChecks({ ...base, gitBin: 'definitely-missing-git-xyz' });
  assert.equal(missing.state, 'pass');
  assert.match(missing.results[0].note, /git/i);
});

test('a missing Copilot blocks the suite instead of failing it', async () => {
  const { base } = fixture(`export default [{ name: 'needs copilot', prompt: 'hi', expect: () => true }];`);
  const result = await runAgentChecks({ ...base, copilotBin: 'definitely-missing-copilot-xyz' });
  assert.equal(result.state, 'blocked');
  assert.equal(result.allPass, false);
  assert.match(result.fatal, /copilot/i);
});

test('a crashing verdict is a failure with its error preserved in history', async () => {
  const { base } = fixture(`export default [{ name: 'boom', command: ['node', '-e', '0'], expect: () => { throw new Error('verdict exploded'); } }];`);
  const result = await runAgentChecks(base);
  assert.equal(result.state, 'fail');
  assert.match(listRuns(base.labsDir).find((r) => r.runId === result.runId).cases[0].message, /verdict exploded/);
});

test('a suite left running by a crashed process is listed as interrupted', () => {
  const { base } = fixture('export default [];');
  const dir = path.join(base.labsDir, '.runs', 'lab-01-easy', '20260101-000000-dead');
  writeTree(dir, { 'suite.json': JSON.stringify({ runId: '20260101-000000-dead', labId: 'lab-01', level: 'easy', state: 'running', startedAt: '2026-01-01T00:00:00Z', cases: [] }) });
  assert.equal(listRuns(base.labsDir).find((r) => r.runId === '20260101-000000-dead').state, 'interrupted');
});

test('budget preview is honest: verified caps for direct Copilot calls, unknown for scripts, never actual usage', () => {
  const direct = { name: 'd', prompt: 'p', credits: 30, expect: () => true };
  const script = { name: 's', command: ['node', 'x.mjs'], prompts: 4, expect: () => true };
  assert.match(copilotArgs(direct).join(' '), /--max-ai-credits=30/);
  assert.deepEqual(budgetPreview([direct]), { configuredCap: 30, actualUsage: null, cases: [{ name: 'd', kind: 'copilot', configuredCap: 30, estimatedPrompts: 1 }] });
  const mixed = budgetPreview([direct, script]);
  assert.equal(mixed.configuredCap, null);
  assert.equal(mixed.actualUsage, null);
  assert.deepEqual(mixed.cases[1], { name: 's', kind: 'script', configuredCap: null, estimatedPrompts: 4 });
  assert.equal(budgetPreview([{ ...direct, extraArgs: ['--max-ai-credits=99'] }]).configuredCap, null, 'conflicting caps are not a verified limit');
});

test('history marks the cases that started the agent, for the credit meter', async () => {
  const { base } = fixture(`export default [{ name: 'runs', command: ['node', '-e', '0'], expect: () => true }];`);
  const ran = await runAgentChecks(base);
  assert.equal(listRuns(base.labsDir).find((r) => r.runId === ran.runId).cases[0].launched, true);
  const blocked = await runAgentChecks({ ...base, target: path.join(base.target, 'missing') });
  assert.equal(listRuns(base.labsDir).find((r) => r.runId === blocked.runId).cases[0].launched, undefined, 'never started: not counted');
});