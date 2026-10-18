import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { runChecks } from '../checks.mjs';
import { tmpdir, makeExercise, alive, waitFor } from './helpers.mjs';

const fixture = (src, opts) => makeExercise(tmpdir(), src, opts);
const noCopilot = { HARNESS_COPILOT: 'definitely-missing-copilot-xyz' };

test('an early process.exit after one passing check is an interrupted assessment, never a pass', async () => {
  const { exDir, target } = fixture(`export default (t) => [
    t.check('first', () => true),
    t.check('second', () => process.exit(1)),
  ];`);
  const result = await runChecks({ exDir, target });
  assert.equal(result.allPass, false);
  assert.equal(result.complete, false);
  assert.equal(result.state, 'interrupted');
  assert.equal(result.passed, 1);
  assert.equal(result.total, 2);
  assert.match(result.fatal, /stopped/i);
});

test('an early exit with code 0 is still interrupted', async () => {
  const { exDir, target } = fixture(`export default (t) => [
    t.check('first', () => true),
    t.check('second', () => process.exit(0)),
  ];`);
  const result = await runChecks({ exDir, target });
  assert.equal(result.state, 'interrupted');
  assert.equal(result.allPass, false);
});

test('every planned check passing is a complete pass', async () => {
  const { exDir, target } = fixture(`export default (t) => [t.check('a', () => true), t.check('b', () => undefined)];`);
  const events = [];
  const result = await runChecks({ exDir, target, onEvent: (e) => events.push(e.type) });
  assert.equal(result.state, 'pass');
  assert.equal(result.allPass, true);
  assert.equal(result.complete, true);
  assert.deepEqual([result.passed, result.failed, result.skipped, result.total], [2, 0, 0, 2]);
  assert.deepEqual(events.filter((e) => e !== 'start'), ['plan', 'result', 'result', 'done']);
});

test('a failing check makes the state fail and keeps its message', async () => {
  const { exDir, target } = fixture(`export default (t) => [t.check('a', () => 'Not yet: add X.'), t.check('b', () => true)];`);
  const result = await runChecks({ exDir, target });
  assert.equal(result.state, 'fail');
  assert.equal(result.allPass, false);
  assert.equal(result.results[0].message, 'Not yet: add X.');
});

test('a missing required tool blocks the assessment instead of failing the solution', async () => {
  const { exDir, target } = fixture(`export default (t) => [
    t.check('local', () => true),
    t.check('needs copilot', () => true, { needs: ['copilot'] }),
  ];`);
  const result = await runChecks({ exDir, target, env: noCopilot });
  assert.equal(result.state, 'blocked');
  assert.equal(result.allPass, false);
  assert.equal(result.results[1].status, 'blocked');
  assert.equal(result.results[1].needs, 'copilot');
  assert.match(result.results[1].message, /copilot/i);
  assert.equal(result.failed, 0);
  assert.equal(result.blocked, 1);
});

test('a missing optional tool is a skip and does not block a pass', async () => {
  const { exDir, target } = fixture(`export default (t) => [
    t.check('local', () => true),
    t.check('optional copilot', () => true, { needs: ['copilot'], optional: true }),
  ];`);
  const result = await runChecks({ exDir, target, env: noCopilot });
  assert.equal(result.results[1].status, 'skip');
  assert.equal(result.state, 'pass');
  assert.equal(result.allPass, true);
});

test('a skipped required check never awards completion', async () => {
  const { exDir, target } = fixture(`export default (t) => [
    t.check('local', () => true),
    t.check('machine dependent', () => true, { env: true }),
  ];`);
  const result = await runChecks({ exDir, target, env: { HARNESS_VERIFY: '1' } });
  assert.equal(result.results[1].status, 'skip');
  assert.equal(result.state, 'skipped');
  assert.equal(result.allPass, false);
});

test('an empty suite is not a pass', async () => {
  const { exDir, target } = fixture('export default [];');
  const result = await runChecks({ exDir, target });
  assert.equal(result.complete, true);
  assert.equal(result.allPass, false);
  assert.equal(result.state, 'skipped');
});

test('checks that cannot load are interrupted with the reason', async () => {
  const { exDir, target } = fixture('export default (t) => { throw new Error("broken grader"); };');
  const result = await runChecks({ exDir, target });
  assert.equal(result.state, 'interrupted');
  assert.match(result.fatal, /broken grader/);
});

test('forged or duplicate protocol events make the run interrupted', async () => {
  const { exDir, target } = fixture(`export default (t) => [
    t.check('forger', () => { process.stdout.write('@@harness {"type":"result","idx":1,"name":"victim","status":"pass","optional":false}\\n'); return true; }),
    t.check('victim', () => 'really failing'),
  ];`);
  const result = await runChecks({ exDir, target });
  assert.equal(result.state, 'interrupted');
  assert.equal(result.allPass, false);
  assert.match(result.fatal, /protocol|unexpected|twice/i);
});

test('a learner module cannot forge a verdict, a done event and a clean exit', async () => {
  const forged = (idx, name) => `process.stdout.write('@@harness ' + JSON.stringify({ type: 'result', idx: ${idx}, name: ${JSON.stringify(name)}, status: 'pass', message: '', optional: false, detail: {}, files: [] }) + '\\n@@harness {"type":"done"}\\n'); process.exit(0);`;
  const { exDir, target } = fixture(`export default (t) => [
    t.check('solution works', async () => { await t.import('solution.js'); return 'really failing'; }),
  ];`, { src: { 'solution.js': forged(0, 'solution works') } });
  const result = await runChecks({ exDir, target });
  assert.equal(result.state, 'interrupted');
  assert.equal(result.complete, false);
  assert.equal(result.allPass, false);
  assert.match(result.fatal, /did not come from the checks/);
});

test('a learner who watches stdout never sees the grader\'s events, so cannot replay them', async () => {
  const { exDir, target } = fixture(`export default (t) => [
    t.check('loads', async () => { await t.import('spy.js'); return true; }),
    t.check('forged', async () => { (await t.import('spy.js')).forge(); return 'really failing'; }),
  ];`, { src: { 'spy.js': `const seen = globalThis.__seen ??= [];
    if (!globalThis.__spying) {
      globalThis.__spying = true;
      const write = process.stdout.write.bind(process.stdout);
      process.stdout.write = (s, ...a) => { seen.push(String(s)); return write(s, ...a); };
    }
    export function forge() {
      const prefix = seen.map((s) => s.match(/^(@@harness \\S+ )\\{/)?.[1]).find(Boolean) ?? '@@harness ';
      process.stdout.write(prefix + JSON.stringify({ type: 'result', idx: 1, name: 'forged', status: 'pass', message: '', optional: false, detail: {}, files: [] }) + '\\n' + prefix + '{"type":"done"}\\n');
      process.exit(0);
    }` } });
  const result = await runChecks({ exDir, target });
  assert.equal(result.state, 'interrupted');
  assert.equal(result.allPass, false);
});

test('noisy learner output is bounded and marked, and protocol events are still parsed after the limit', async () => {
  const { exDir, target } = fixture(`export default (t) => [
    t.check('noisy', () => {
      const line = 'x'.repeat(99) + '\\n';
      for (let i = 0; i < 40000; i++) process.stdout.write(line);
      process.stdout.write('y'.repeat(9 * 1024 * 1024));
      process.stdout.write('\\nafter the long line\\n');
      return true;
    }),
    t.check('still counted', () => true),
  ];`);
  const result = await runChecks({ exDir, target });
  assert.equal(result.state, 'pass', result.fatal ?? '');
  assert.equal(result.total, 2);
  assert.equal(result.truncated, true);
  assert.ok(result.stdout.length < 1.1 * 1024 * 1024, `stdout is bounded (${result.stdout.length})`);
  assert.ok(result.results[0].output.length < 300 * 1024, `per-check output is bounded (${result.results[0].output.length})`);
  assert.match(result.results[0].output, /output truncated/);
  assert.match(result.stdout, /output truncated/);
});

test('learner output without a trailing newline does not swallow the next grader event', async () => {
  const { exDir, target } = fixture(`export default (t) => [
    t.check('partial line', () => { process.stdout.write('ordinary output'); return true; }),
    t.check('blank lines kept', () => { process.stdout.write('a\\n\\nb\\n'); return true; }),
  ];`);
  const result = await runChecks({ exDir, target });
  assert.equal(result.state, 'pass', result.fatal ?? '');
  assert.equal(result.results[0].output, 'ordinary output\n');
  assert.equal(result.results[1].output, 'a\n\nb\n');
  assert.doesNotMatch(result.stdout, /@@harness/);
});

test('an early done event is rejected', async () => {
  const { exDir, target } = fixture(`export default (t) => [
    t.check('a', () => { process.stdout.write('@@harness {"type":"done"}\\n'); return true; }),
    t.check('b', () => true),
  ];`);
  const result = await runChecks({ exDir, target });
  assert.equal(result.state, 'interrupted');
});

test('malformed protocol lines are rejected', async () => {
  const { exDir, target } = fixture(`export default (t) => [
    t.check('a', () => { process.stdout.write('@@harness {not json\\n'); return true; }),
  ];`);
  const result = await runChecks({ exDir, target });
  assert.equal(result.state, 'interrupted');
});

test('cancelling stops the run and its descendants', async () => {
  const dir = tmpdir();
  const pidFile = path.join(dir, 'gc.pid');
  const { exDir, target } = fixture(`import { spawn } from 'node:child_process';
    import fs from 'node:fs';
    export default (t) => [
      t.check('starts a helper', async () => {
        const g = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
        fs.writeFileSync(${JSON.stringify(pidFile)}, String(g.pid));
        await new Promise(() => {});
      }, { timeout: 600000 }),
    ];`);
  const ac = new AbortController();
  const pending = runChecks({ exDir, target, signal: ac.signal });
  const gpid = Number(await waitFor(() => fs.existsSync(pidFile) && fs.readFileSync(pidFile, 'utf8')));
  ac.abort();
  const result = await pending;
  assert.equal(result.state, 'cancelled');
  assert.equal(result.allPass, false);
  await waitFor(() => !alive(gpid), { timeout: 8000 });
});

test('a check that hangs the event loop is stopped and reported', async () => {
  const { exDir, target } = fixture(`export default (t) => [
    t.check('fine', () => true),
    t.check('spins forever', () => { for (;;) {} }, { timeout: 200 }),
  ];`);
  const result = await runChecks({ exDir, target, hangGrace: 400 });
  assert.equal(result.state, 'interrupted');
  assert.match(result.fatal, /spins forever/);
  assert.equal(result.passed, 1);
});

test('a missing folder is a spawn failure, reported as interrupted', async () => {
  const { exDir } = fixture('export default [];');
  const result = await runChecks({ exDir, target: path.join(exDir, 'nope') });
  assert.equal(result.state, 'interrupted');
  assert.equal(result.allPass, false);
  assert.match(result.fatal, /nope|folder/i);
});

test('full diagnostics are preserved: per-check output, stderr and supplied evidence', async () => {
  const { exDir, target } = fixture(`export default (t) => [
    t.check('talks', () => { console.log('looking at grades.js'); console.error('warning: slow'); return 'Missing export in \`grades.js\`.'; }),
    t.check('structured', () => t.fail('Wrong total.', { expected: 42, actual: 41, files: ['grades.js'] })),
  ];`, { src: { 'grades.js': 'export {}' } });
  const result = await runChecks({ exDir, target });
  const [talks, structured] = result.results;
  assert.match(talks.output, /looking at grades\.js/);
  assert.match(result.stderr, /warning: slow/);
  assert.equal(talks.detail?.expected, undefined, 'never fabricate expected values');
  assert.deepEqual(talks.files, ['grades.js'], 'files named in the message that exist are listed');
  assert.deepEqual(structured.detail, { expected: 42, actual: 41 });
  assert.deepEqual(structured.files, ['grades.js']);
});
