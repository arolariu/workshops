// Agent checks: run the real Copilot CLI (`copilot -p ...`) on a throwaway copy of your folder, then check what the
// agent said and did. These use AI credits, so: one suite at a time, cancellation stops all further spending, and
// every suite keeps its own immutable folder in labs/.runs/<lab>-<level>/<runId>/ (outputs can contain generated or
// sensitive content; nothing is uploaded anywhere).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeKit, copilotBin as defaultCopilot, TRUST_HINT, isTrusted } from './kit.mjs';
import { runProcess, resolveCommand } from './process.mjs';
import { recoveryFor } from './doctor.mjs';
import { parseTrace, timelineText } from './trace.mjs';

export async function loadAgentChecks(exDir) {
  const file = path.join(exDir, 'tests', 'agent.mjs');
  if (!fs.existsSync(file)) return [];
  const mod = await import(`${pathToFileURL(file).href}?v=${Date.now()}`);
  return mod.default ?? [];
}

const resolveField = (v, kit) => (typeof v === 'function' ? (kit ? v(kit) : ['<from your files>']) : v);
export function copilotArgs(specIn, kit) {
  const spec = { ...specIn, allow: resolveField(specIn.allow, kit), deny: resolveField(specIn.deny, kit) };
  const args = [];
  if (spec.agent) args.push('--agent', spec.agent);
  for (const dir of spec.pluginDirs ?? []) args.push('--plugin-dir', dir);
  args.push('-p', spec.prompt, '-s', '--no-ask-user', `--max-ai-credits=${spec.credits ?? 30}`);
  // JSON events give the agent screen a timeline; trace.mjs turns them back into the text `-s` prints.
  const extra = spec.extraArgs ?? [];
  if (spec.trace !== false && !extra.some((a) => /^--output-format(=|$)/.test(String(a)))) args.push('--output-format', 'json');
  for (const a of spec.allow ?? []) args.push(`--allow-tool=${a}`);
  for (const d of spec.deny ?? []) args.push(`--deny-tool=${d}`);
  args.push(...extra);
  return args;
}

/** Did these arguments ask Copilot for JSON events (`--output-format json` or `--output-format=json`)? */
export const wantsJson = (args) => args.some((a, i) => /^--output-format=json$/i.test(a) || (a === '--output-format' && /^json$/i.test(String(args[i + 1] ?? ''))));

const show = (a) => (/^[\w\-./:=@,]+$/.test(a) ? a : `'${a.replace(/'/g, "'\\''")}'`);
export const displayCommand = (cmd, args) => [cmd, ...args].map(show).join(' ');
export const specCommand = (spec, kit) => (spec.command ? displayCommand(spec.command[0], spec.command.slice(1)) : displayCommand('copilot', copilotArgs(spec, kit)));

/** The credit cap a direct Copilot call passes on its command line, or null when there is none or it is ambiguous. */
function capOf(args) {
  const caps = [];
  args.forEach((a, i) => {
    const m = String(a).match(/^--max-ai-credits(?:=(.*))?$/);
    if (m) caps.push(m[1] ?? args[i + 1]);
  });
  return caps.length === 1 && /^\d+$/.test(String(caps[0])) ? Number(caps[0]) : null;
}

/**
 * What a suite may spend, as far as the companion can actually establish it. Scripts can make any number of calls, so
 * their bound is unknown. Usage is never known in advance and never inferred from caps.
 */
export function budgetPreview(specs, { capSupported = true } = {}) {
  const cases = specs.map((s) => (s.command
    ? { name: s.name, kind: 'script', configuredCap: null, estimatedPrompts: s.prompts ?? null }
    : { name: s.name, kind: 'copilot', configuredCap: capSupported ? capOf(copilotArgs(s)) : null, estimatedPrompts: s.prompts ?? 1 }));
  const known = cases.length > 0 && cases.every((c) => c.configuredCap !== null);
  return { configuredCap: known ? cases.reduce((n, c) => n + c.configuredCap, 0) : null, actualUsage: null, cases };
}

/** Why a spec cannot run, or null. Checked for every spec before anything is spent. */
function invalidSpec(spec, i) {
  const label = spec && typeof spec.name === 'string' && spec.name.trim() ? `"${spec.name}"` : `#${i + 1}`;
  if (!spec || typeof spec !== 'object') return `agent check #${i + 1} is not an object`;
  if (typeof spec.name !== 'string' || !spec.name.trim()) return `agent check #${i + 1} has no name`;
  if (typeof spec.expect !== 'function') return `agent check ${label} has no verdict (expect)`;
  if (spec.command !== undefined && (!Array.isArray(spec.command) || !spec.command.length || !spec.command.every((a) => typeof a === 'string'))) return `agent check ${label} has an invalid command`;
  if (spec.command === undefined && (typeof spec.prompt !== 'string' || !spec.prompt.trim())) return `agent check ${label} has neither a prompt nor a command`;
  if (spec.setup !== undefined && typeof spec.setup !== 'function') return `agent check ${label} has an invalid setup`;
  if (spec.timeout !== undefined && !(Number(spec.timeout) > 0)) return `agent check ${label} has an invalid timeout`;
  return null;
}

// ---------- single flight ----------
let active = null;
const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const lockFile = (labsDir) => path.join(labsDir, '.runs', '.active-suite.json');
function readLock(labsDir) {
  try { return JSON.parse(fs.readFileSync(lockFile(labsDir), 'utf8')); } catch { return null; }
}
function acquireLock(labsDir, runId) {
  const file = lockFile(labsDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      fs.writeFileSync(file, JSON.stringify({ pid: process.pid, runId, startedAt: new Date().toISOString() }), { flag: 'wx' });
      return { ok: true };
    } catch (e) {
      if (e.code !== 'EEXIST') return { ok: false, reason: `the run lock could not be created (${e.code ?? e.message})` };
      const info = readLock(labsDir);
      if (info && info.pid !== process.pid && pidAlive(info.pid)) return { ok: false, reason: `another lab app (process ${info.pid}) is running suite ${info.runId}` };
      fs.rmSync(file, { force: true });
    }
  }
  return { ok: false, reason: 'the run lock is busy' };
}
const releaseLock = (labsDir, runId) => {
  if (readLock(labsDir)?.runId === runId) fs.rmSync(lockFile(labsDir), { force: true });
};

/** True while this process is running a paid suite. */
export const suiteActive = () => Boolean(active);

// ---------- helpers ----------
const newRunId = () => `${new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)}-${crypto.randomBytes(3).toString('hex')}`;
function writeJson(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  fs.renameSync(tmp, file);
}
/** Resolve `promise`, unless `signal` aborts first. Never leaves a listener behind. */
function raceAbort(promise, signal) {
  if (!signal) return promise.then((value) => ({ value }));
  if (signal.aborted) return Promise.resolve({ aborted: true });
  return new Promise((resolve, reject) => {
    const onAbort = () => resolve({ aborted: true });
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => { signal.removeEventListener('abort', onAbort); resolve(signal.aborted ? { aborted: true } : { value }); },
      (error) => { signal.removeEventListener('abort', onAbort); if (signal.aborted) resolve({ aborted: true }); else reject(error); },
    );
  });
}

const COPY_SKIP = /(^|[\\/])(node_modules|\.git|\.agent-logs)([\\/]|$)/;

async function prepareCase({ target, work, gitBin, signal }) {
  try {
    if (!fs.existsSync(target)) throw new Error(`${target} does not exist`);
    fs.cpSync(target, work, { recursive: true, filter: (src) => { const rel = path.relative(target, src); return !rel || !COPY_SKIP.test(rel); } });
  } catch (e) {
    return { blocked: `Could not prepare a copy of your folder: ${e.message}` };
  }
  if (!resolveCommand(gitBin)) return { note: 'git is not installed, so the copy has no snapshot commit to compare against.' };
  const git = (...a) => runProcess(gitBin, ['-c', 'user.name=Harness Check', '-c', 'user.email=harness@example.com', '-c', 'commit.gpgsign=false', ...a], { cwd: work, timeout: 60000, signal });
  for (const step of [['init', '-q'], ['add', '-A'], ['commit', '-q', '--allow-empty', '-m', 'Snapshot before the agent check']]) {
    const r = await git(...step);
    if (r.cancelled) return { cancelled: true };
    if (r.code !== 0) return { blocked: `Could not snapshot the copy with git (git ${step[0]}): ${(r.stderr || r.stdout || r.error || '').trim().split('\n').slice(-2).join(' ').slice(0, 300)}` };
  }
  return {};
}

function preflight(kit, spec) {
  const needsTrust = spec.needsTrust ?? ['.mcp.json', '.github/mcp.json', '.github/hooks', '.github/extensions', '.github/agents'].some((p) => kit.exists(p));
  if (needsTrust && isTrusted(kit.dir) === false) return `Copilot would ignore this folder's MCP servers, hooks and agents. ${TRUST_HINT}`;
  return null;
}

/**
 * Run every agent check of an exercise. Resolves (never rejects):
 * { runId, dir, state, allPass, results, fatal, budget, none }
 * state: pass | fail | blocked | skipped | cancelled | interrupted. Case status: pass | fail | blocked | cancelled | not-run.
 */
export async function runAgentChecks(opts) {
  const { labsDir } = opts;
  const refuse = (reason) => ({ runId: null, dir: null, state: 'blocked', allPass: false, results: [], fatal: `Another agent check suite is already running (${reason}). Wait for it to finish or cancel it first.`, none: false });
  if (active) return refuse(`suite ${active.runId}`);
  const runId = newRunId();
  active = { runId };
  let locked = false;
  try {
    const lock = acquireLock(labsDir, runId);
    if (!lock.ok) return refuse(lock.reason);
    locked = true;
    return await runSuite({ ...opts, runId });
  } finally {
    if (locked) releaseLock(labsDir, runId);
    active = null;
  }
}

async function runSuite({ exDir, target, labsDir, labId, level, signal, onEvent = () => {}, specs: given, copilotBin, gitBin = 'git', env = {}, runId, capSupported }) {
  const empty = (state, fatal, extra = {}) => ({ runId: null, dir: null, state, allPass: false, results: [], fatal, none: false, ...extra });
  if (signal?.aborted) return empty('cancelled', 'Cancelled before anything ran.');
  let specs = given;
  if (!specs) {
    try { specs = await loadAgentChecks(exDir); } catch (e) { return empty('interrupted', `Could not load the agent checks: ${e.message}`); }
  }
  if (!Array.isArray(specs) || !specs.length) return empty('skipped', null, { none: true });
  const bad = specs.map(invalidSpec).find(Boolean);
  if (bad) return empty('interrupted', `The agent checks cannot run: ${bad}.`);
  const copilot = copilotBin ?? defaultCopilot();
  if (!resolveCommand(copilot)) return empty('blocked', `GitHub Copilot CLI is not installed or not on PATH. ${recoveryFor('copilot')}`);
  if (signal?.aborted) return empty('cancelled', 'Cancelled before anything ran.');

  const budget = budgetPreview(specs, { capSupported });
  const parent = path.join(labsDir, '.runs', `${labId}-${level}`);
  fs.mkdirSync(parent, { recursive: true });
  const dir = path.join(parent, runId);
  fs.mkdirSync(dir);
  const cases = specs.map((s, idx) => ({ idx, name: s.name, status: 'not-run', message: '', command: specCommand(s), runDir: null, note: null, startedAt: null, finishedAt: null, exitCode: null }));
  const suite = { runId, labId, level, target, startedAt: new Date().toISOString(), finishedAt: null, state: 'running', allPass: false, budget, cases };
  const persist = () => { try { writeJson(path.join(dir, 'suite.json'), suite); } catch { /* history is best effort; the result is still returned */ } };
  persist();
  onEvent({ type: 'suite', runId, dir, budget });

  let cancelled = false;
  for (const [idx, spec] of specs.entries()) {
    if (signal?.aborted) { cancelled = true; break; }
    const c = cases[idx];
    const caseDir = path.join(dir, `case-${idx + 1}`);
    const work = path.join(caseDir, 'work');
    fs.mkdirSync(caseDir);
    c.runDir = work;
    c.startedAt = new Date().toISOString();
    const done = (status, message = '', extra = {}) => {
      Object.assign(c, { status, message, finishedAt: new Date().toISOString() }, extra);
      persist();
      onEvent({ type: 'result', ...c });
    };
    const prep = await prepareCase({ target, work, gitBin, signal });
    if (prep.cancelled || signal?.aborted) { cancelled = true; done('cancelled', 'Cancelled while preparing the copy.'); break; }
    if (prep.blocked) { done('blocked', prep.blocked); continue; }
    if (prep.note) c.note = prep.note;
    const kit = makeKit({ dir: work, exDir });
    try {
      if (spec.setup) {
        onEvent({ type: 'setup', idx, name: spec.name });
        const r = await raceAbort(Promise.resolve().then(() => spec.setup(kit)), signal);
        if (r.aborted) { cancelled = true; done('cancelled', 'Cancelled during setup, before the agent started.'); break; }
      }
    } catch (e) {
      done('fail', `The check's setup failed: ${e?.message ?? e}`);
      continue;
    }
    const trouble = preflight(kit, spec);
    if (trouble) { done('blocked', trouble); continue; }
    if (signal?.aborted) { cancelled = true; done('cancelled', 'Cancelled before the agent started.'); break; }

    const [cmd, args, shown] = spec.command
      ? [spec.command[0] === 'node' ? process.execPath : spec.command[0], spec.command.slice(1), spec.command[0]]
      : [copilot, copilotArgs(spec, kit), 'copilot'];
    c.command = displayCommand(shown, args);
    c.launched = true;
    persist();
    onEvent({ type: 'start', idx, name: spec.name, command: c.command, runDir: work });
    const started = Date.now();
    const tick = setInterval(() => onEvent({ type: 'tick', idx, seconds: Math.round((Date.now() - started) / 1000) }), 1000);
    let res;
    try {
      res = await runProcess(cmd, args, { cwd: work, timeout: Number(spec.timeout ?? 300000), signal, env: { ...process.env, ...env } });
    } finally {
      clearInterval(tick);
    }
    try {
      fs.writeFileSync(path.join(caseDir, 'stdout.txt'), res.stdout);
      fs.writeFileSync(path.join(caseDir, 'stderr.txt'), res.stderr);
    } catch { /* keep going: the output is also in the result */ }
    c.exitCode = res.code;
    // A Copilot run's stdout is JSON events (see copilotArgs): keep the timeline, and give `expect` the text `-s` would
    // print. expect(kit, { output: every message, answer: the last one, stderr, code }).
    let output = res.stdout.trim();
    let answer = output;
    if (!spec.command && wantsJson(args)) {
      const trace = parseTrace(res.stdout, { cwd: work });
      c.traced = trace.ok;
      if (trace.ok) {
        output = trace.output;
        answer = trace.answer;
        c.timeline = timelineText(trace);
        c.usage = trace.usage;
        try { writeJson(path.join(caseDir, 'trace.json'), { timeline: trace.timeline, usage: trace.usage }); } catch { /* the result still has it */ }
      }
    }
    if (res.cancelled || signal?.aborted) { cancelled = true; done('cancelled', 'Cancelled while the agent was running.', { output }); break; }
    if (res.missing) { done('blocked', `Could not start \`${shown}\`. ${shown === 'copilot' ? recoveryFor('copilot') : ''}`.trim(), { output }); continue; }
    if (res.error) { done('fail', `Could not run the agent: ${res.error}`, { output }); continue; }
    if (res.timedOut) { done('fail', 'The agent run took too long and was stopped.', { output }); continue; }
    // More output than runProcess keeps: the end of the run (with the answer) may be missing, so say so.
    const cut = res.truncated ? ' (Copilot printed more than the app keeps, so the end of its output is missing.)' : '';
    if (res.code !== 0 && !spec.allowNonZero) {
      const why = `${res.stderr}\n${output || res.stdout.trim()}`.trim().split('\n').slice(-4).join(' ').slice(0, 400);
      done('fail', `The run ended with exit code ${res.code}. ${why}${/auth|login|token/i.test(why) ? ' (Are you logged in? Run `copilot` and use /login.)' : ''}${cut}`, { output });
      continue;
    }
    onEvent({ type: 'verdict', idx, name: spec.name });
    let verdict;
    try {
      verdict = await raceAbort(Promise.resolve().then(() => spec.expect(kit, { output, answer, stderr: res.stderr, code: res.code })), signal);
    } catch (e) {
      done('fail', `The verdict crashed: ${e?.message ?? e}`, { output });
      continue;
    }
    if (verdict.aborted) { cancelled = true; done('cancelled', 'Cancelled while the result was being checked.', { output }); break; }
    if (typeof verdict.value === 'string') done('fail', `${verdict.value}${cut}`, { output });
    else if (verdict.value === false) done('fail', `The agent did not do what we expected.${cut}`, { output });
    else done('pass', '', { output });
  }

  cancelled = cancelled || Boolean(signal?.aborted);
  let state;
  if (cancelled) state = 'cancelled';
  else if (cases.some((c) => c.status === 'fail')) state = 'fail';
  else if (cases.some((c) => c.status === 'blocked')) state = 'blocked';
  else if (cases.every((c) => c.status === 'pass')) state = 'pass';
  else state = 'interrupted';
  suite.state = state;
  suite.allPass = state === 'pass';
  suite.finishedAt = new Date().toISOString();
  persist();
  onEvent({ type: 'done', runId, state });
  return { runId, dir, state, allPass: state === 'pass', results: cases, fatal: null, budget, none: false };
}

/** Every retained suite, newest first. Suites left "running" by a process that is gone are reported as interrupted. */
export function listRuns(labsDir, { labId, level } = {}) {
  const root = path.join(labsDir, '.runs');
  const lock = readLock(labsDir);
  const out = [];
  let groups = [];
  try { groups = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()); } catch { return out; }
  for (const g of groups) {
    if (labId && level && g.name !== `${labId}-${level}`) continue;
    let runs = [];
    try { runs = fs.readdirSync(path.join(root, g.name), { withFileTypes: true }).filter((d) => d.isDirectory()); } catch { continue; }
    for (const r of runs) {
      const file = path.join(root, g.name, r.name, 'suite.json');
      if (!fs.existsSync(file)) continue;
      let suite;
      try { suite = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
        out.push({ runId: r.name, dir: path.dirname(file), state: 'unreadable', error: e.message, cases: [], startedAt: null });
        continue;
      }
      const running = active?.runId === suite.runId || (lock?.runId === suite.runId && pidAlive(lock.pid));
      if (suite.state === 'running' && !running) suite.state = 'interrupted';
      out.push({ ...suite, dir: path.dirname(file) });
    }
  }
  return out.sort((a, b) => String(b.startedAt ?? '').localeCompare(String(a.startedAt ?? '')));
}
