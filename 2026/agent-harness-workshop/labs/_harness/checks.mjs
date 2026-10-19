// Parent side: run the free checks of one exercise in a child process and turn its event stream into one
// trustworthy result. Anything short of a complete, well-formed run is reported as interrupted, never as a pass.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProcess } from './process.mjs';
import { milestoneStatus } from './milestones.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STATUSES = new Set(['pass', 'fail', 'blocked', 'skip']);
const MAX_OUTPUT = 1024 * 1024; // learner output kept for the whole run
const MAX_CHECK_OUTPUT = 256 * 1024; // learner output kept per check
const MAX_LINE = 8 * 1024 * 1024; // longest protocol line accepted
const TRUNCATED = '\n… (output truncated)\n';

/** Result states. Only `pass` means the work is done. */
export const STATES = ['pass', 'fail', 'blocked', 'skipped', 'cancelled', 'interrupted'];

/**
 * Run tests/checks.mjs of `exDir` against `target`. Resolves (never rejects):
 * { state, allPass, complete, results, passed, failed, skipped, blocked, total, fatal, stdout, stderr, exitCode, truncated }
 * state: pass | fail | blocked | skipped | cancelled | interrupted
 */
export async function runChecks({ exDir, target, onEvent = () => {}, env = {}, signal, timeout = 10 * 60 * 1000, hangGrace = 15000, startTimeout = 60000 }) {
  const results = [];
  let plan = null;
  let done = false;
  let fatal = null;
  let protocolError = null;
  let current = null;
  let currentOutput = '';
  let hung = null;
  let buf = '';
  let skipping = false;
  let stdout = '';
  let truncated = false;
  // Only the grader knows this per-run token; lines without it did not come from the checks.
  const token = crypto.randomBytes(24).toString('hex');
  const tag = `${token} `;
  const violate = (msg) => { protocolError = protocolError ?? msg; };
  const inner = new AbortController();
  const cancel = () => inner.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  let watchdog = null;
  // Until the plan arrives, no check is running, so the per-check watchdog can't help: a run that never starts
  // (seen once under heavy parallel load on Windows) must not keep the learner waiting for the overall timeout.
  let stalled = false;
  let startTimer = null;
  const armWatchdog = (ev) => {
    clearTimeout(watchdog);
    const limit = Number.isFinite(ev.timeout) && ev.timeout > 0 ? ev.timeout : 60000;
    watchdog = setTimeout(() => { hung = ev.name; inner.abort(); }, limit + hangGrace);
  };

  const handle = (ev) => {
    if (!ev || typeof ev !== 'object' || typeof ev.type !== 'string') return violate('an event without a type');
    if (done) return violate(`a "${ev.type}" event after the run said it was done`);
    const validIdx = (i) => Number.isInteger(i) && plan && i >= 0 && i < plan.total;
    switch (ev.type) {
      case 'plan':
        if (plan) return violate('the plan was sent twice');
        if (!Number.isInteger(ev.total) || ev.total < 0 || !Array.isArray(ev.names) || ev.names.length !== ev.total || !ev.names.every((n) => typeof n === 'string')) return violate('an invalid plan');
        if (ev.milestones !== undefined && (!Array.isArray(ev.milestones) || ev.milestones.length !== ev.total || !ev.milestones.every((m) => m === null || typeof m === 'string'))) return violate('an invalid list of milestones');
        plan = { total: ev.total, names: ev.names, milestones: ev.milestones ?? ev.names.map(() => null) };
        clearTimeout(startTimer);
        break;
      case 'start':
        if (!validIdx(ev.idx) || results[ev.idx] || current !== null) return violate('an unexpected start event');
        current = ev.idx;
        currentOutput = '';
        armWatchdog(ev);
        break;
      case 'result':
        if (!plan) return violate('a result before the plan');
        if (!validIdx(ev.idx)) return violate('a result for a check that is not in the plan');
        if (results[ev.idx]) return violate(`the result of "${plan.names[ev.idx]}" was sent twice`);
        if (ev.idx !== current) return violate(`a result for "${plan.names[ev.idx]}" while another check was running`);
        if (ev.name !== plan.names[ev.idx]) return violate('a result whose name does not match the plan');
        if (!STATUSES.has(ev.status)) return violate(`an unknown status "${ev.status}"`);
        clearTimeout(watchdog);
        results[ev.idx] = {
          idx: ev.idx,
          name: ev.name,
          status: ev.status,
          message: String(ev.message ?? ''),
          optional: Boolean(ev.optional),
          milestone: plan.milestones[ev.idx] ?? null,
          ...(ev.needs ? { needs: ev.needs } : {}),
          detail: ev.detail && typeof ev.detail === 'object' ? ev.detail : {},
          files: Array.isArray(ev.files) ? ev.files.map(String) : [],
          output: currentOutput,
        };
        current = null;
        break;
      case 'fatal':
        fatal = String(ev.message ?? 'The checks could not run.');
        break;
      case 'done':
        if (!plan) return violate('done before the plan');
        if (results.filter(Boolean).length !== plan.total) return violate('done before every check had a result');
        done = true;
        break;
      default:
        return violate(`an unknown event "${ev.type}"`);
    }
    onEvent(ev);
    return undefined;
  };

  const capped = (have, text, max) => {
    if (have.length >= max) { if (text) truncated = true; return have; }
    const next = have + text;
    if (next.length <= max) return next;
    truncated = true;
    return next.slice(0, max) + TRUNCATED;
  };
  const output = (text) => {
    if (current !== null) currentOutput = capped(currentOutput, text, MAX_CHECK_OUTPUT);
    stdout = capped(stdout, text, MAX_OUTPUT);
  };
  // Every event is preceded by a newline, so a blank line right before an event is the grader's separator, not output.
  let separator = false;
  const onLine = (raw) => {
    const line = raw.replace(/\r$/, '');
    const pending = separator;
    separator = false;
    if (!line.startsWith('@@harness ')) {
      if (pending) output('\n');
      if (line) output(`${line}\n`); else separator = true;
      return;
    }
    const body = line.slice('@@harness '.length);
    if (!body.startsWith(tag)) { violate('a protocol line that did not come from the checks'); return; }
    let ev;
    try { ev = JSON.parse(body.slice(tag.length)); } catch { violate('a malformed protocol line'); return; }
    handle(ev);
  };
  // Output is captured up to its limits, but every line is still scanned so protocol events keep flowing.
  const onStdout = (chunk) => {
    let start = 0;
    let n;
    while ((n = chunk.indexOf('\n', start)) >= 0) {
      const piece = chunk.slice(start, n);
      start = n + 1;
      if (skipping) { skipping = false; continue; }
      onLine(buf + piece);
      buf = '';
    }
    if (skipping) return;
    buf += chunk.slice(start);
    if (buf.length > MAX_LINE) {
      if (buf.startsWith('@@harness ')) violate('a protocol line that was too long');
      else { if (separator) output('\n'); output(buf); }
      separator = false;
      truncated = true;
      buf = '';
      skipping = true;
    }
  };

  const finish = (proc) => {
    clearTimeout(watchdog);
    clearTimeout(startTimer);
    signal?.removeEventListener('abort', cancel);
    if (separator) stdout = capped(stdout, '\n', MAX_OUTPUT);
    if (buf && !skipping) stdout = capped(stdout, buf, MAX_OUTPUT);
    const list = results.filter(Boolean);
    const total = plan ? plan.total : list.length;
    const count = (s) => list.filter((r) => r.status === s).length;
    const cancelled = Boolean(signal?.aborted) && !hung;
    let reason = null;
    if (cancelled) reason = 'The checks were cancelled.';
    else if (fatal) reason = fatal;
    else if (proc?.error) reason = `Could not start the checks: ${proc.error}`;
    else if (stalled) reason = `The checks did not start within ${Math.round(startTimeout / 1000)} s and were stopped. Run them again; if it keeps happening, restart the lab app.`;
    else if (hung) reason = `The check "${hung}" did not finish in time and was stopped.`;
    else if (proc?.timedOut) reason = `The checks took longer than ${Math.round(timeout / 1000)}s and were stopped.`;
    else if (protocolError) reason = `The checks reported something unexpected (${protocolError}), so this run cannot be trusted.`;
    else if (!plan || !done || list.length !== total) reason = `The checks stopped early${proc?.code ? ` (exit code ${proc.code})` : ''} after ${list.length} of ${plan ? total : '?'} checks.`;
    else if (proc && proc.code !== 0) reason = `The checks stopped with exit code ${proc.code}.`;
    const complete = !reason;
    const required = list.filter((r) => !r.optional);
    const allPass = complete && !fatal && required.length > 0 && required.every((r) => r.status === 'pass') && !list.some((r) => r.status === 'fail');
    let state;
    if (cancelled) state = 'cancelled';
    else if (!complete) state = 'interrupted';
    else if (list.some((r) => r.status === 'fail')) state = 'fail';
    else if (required.some((r) => r.status === 'blocked')) state = 'blocked';
    else if (!allPass) state = 'skipped';
    else state = 'pass';
    return {
      state,
      allPass,
      complete,
      results: list,
      passed: count('pass'),
      failed: count('fail'),
      skipped: count('skip'),
      blocked: count('blocked'),
      total,
      planMilestones: plan ? plan.milestones : [],
      milestones: milestoneStatus(list, plan?.milestones),
      fatal: reason,
      stdout,
      stderr: proc?.stderr ?? '',
      exitCode: proc?.code ?? null,
      truncated: truncated || (proc?.stderr?.length ?? 0) >= MAX_OUTPUT,
    };
  };

  if (signal?.aborted) return finish(null);
  for (const [dir, what] of [[target, 'folder to check'], [exDir, 'exercise folder']]) {
    if (!fs.existsSync(dir)) return finish({ error: `the ${what} ${dir} does not exist.`, stderr: '' });
  }
  startTimer = setTimeout(() => { if (!plan) { stalled = true; inner.abort(); } }, startTimeout);
  const proc = await runProcess(process.execPath, [path.join(HERE, 'run-checks.mjs'), exDir, target], {
    cwd: target,
    env: { ...process.env, ...env },
    timeout,
    signal: inner.signal,
    input: `${token}\n`,
    maxOutput: MAX_OUTPUT,
    onStdout,
  });
  return finish(proc);
}
