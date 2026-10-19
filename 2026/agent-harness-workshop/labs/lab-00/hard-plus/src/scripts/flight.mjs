#!/usr/bin/env node
// ✈️ flight: a flight recorder for Copilot runs. Record one prompt N times with the metadata that explains a run
// (model, flags, commit, CLI version), compare two runs, and measure how much N runs of one prompt differ.
//   node scripts/flight.mjs record [--n 3] [--model <model>] "<prompt>"   → runs/<series>/run-<k>/
//   node scripts/flight.mjs compare <run-a> <run-b>
//   node scripts/flight.mjs variance <folder of runs>
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarize, recordArgs } from './run-stats.mjs';

/** What must match for two runs to count as the same setup. */
export const SETUP = ['prompt', 'model', 'flags', 'commit', 'cli'];

/**
 * meta.json for one run: what was asked, how, and where. `flags` are the arguments without the prompt; `model` is the
 * model the stream names (what really ran: "auto" picks one), else the --model flag, else null.
 */
export function metaFor({ prompt, args = [], git = {}, cli = null, startedAt, exitCode = null, summary = null }) {
  // TODO(M1): return { prompt, model, flags, git: { commit, dirty }, cli, startedAt, exitCode }.
  return {};
}

/**
 * Record `prompt` n times: runs/<stamp>-<slug>/run-<k>/{events.jsonl, meta.json}. Every run uses recordArgs()
 * (read-only, capped). A run that fails is recorded too, and the series goes on.
 * `run`, `git`, `cli` and `now` can be replaced (the checks use a fake Copilot).
 */
export function record({ prompt, n = 3, model, dir = 'runs', run = runCopilot, git = gitInfo, cli = cliVersion, now = () => new Date() }) {
  const series = path.join(dir, `${stamp(now())}-${slug(prompt)}`);
  // TODO(M1): for k = 1…n: args = recordArgs(prompt, { model }); r = run(args) → { code, stdout, stderr }; write
  //           <series>/run-<k>/events.jsonl (stdout, as it came) and meta.json (metaFor, with summarize(stdout)).
  return { series, runs: [] };
}

/** One recorded run: { id, dir, meta, summary, problems }. Never throws: what's missing or broken is a problem. */
export function loadRun(dir) {
  const run = { id: path.basename(dir), dir, meta: null, summary: null, problems: [] };
  // TODO(M2): meta = JSON.parse(meta.json); summary = summarize(the lines of events.jsonl).
  // TODO(M4): a missing or broken meta.json, a missing events.jsonl, broken lines and a run without a result event
  //           are problems (one sentence each in run.problems), not crashes.
  return run;
}

/** { same, differs }: which parts of the setup (SETUP) differ between runs; a run without meta makes it unknown. */
export function setupDiff(runs) {
  // TODO(M2): compare prompt, model, flags, the git commit and cli across the runs' meta.
  // TODO(M4): when a run has no meta, the setup is unknown: put 'meta' first in differs.
  return { same: true, differs: [] };
}

/** What a run did, in numbers: { sequence, turns, toolCalls, tokens: { input, output }, outcome }. */
function profile(run) {
  // TODO(M2): sequence = the tool names in order (from run.summary.turns); outcome: 'denied' for a run that finished
  //           ok but had a denial, else summary.outcome ('ok', 'failed', 'incomplete').
  return { sequence: [], turns: 0, toolCalls: 0, tokens: { input: 0, output: 0 }, outcome: 'ok' };
}

/** Two runs side by side: { setup, tools: { a, b, same }, turns, toolCalls, tokens, outcome } (each { a, b }). */
export function compare(a, b) {
  // TODO(M2): use profile() and setupDiff().
  return null;
}

/** { min, median, max } of a list of numbers (the median of an even count is the mean of the middle two). */
const stat = (xs) => {
  const s = [...xs].sort((x, y) => x - y);
  const m = s.length;
  return { min: s[0], median: m % 2 ? s[(m - 1) / 2] : (s[m / 2 - 1] + s[m / 2]) / 2, max: s[m - 1] };
};

/**
 * How much N runs differ: { n, measured, prompt, setup, turns, toolCalls, tokens: { input, output } (each { min,
 * median, max }), tools: { name: runs that used it }, sequences, outcomes: { outcome: runs }, problems: [{ run,
 * problem }] }.
 */
export function variance(runs) {
  // TODO(M3): the numbers above, from profile() of every run (measured = how many runs the spread comes from).
  // TODO(M4): leave out runs without events (their problems are listed), and throw an Error that says "at least 2"
  //           when fewer than 2 runs are left. A run that never finished (outcome 'incomplete') stopped halfway:
  //           count its outcome, but keep it out of turns, toolCalls and tokens.
  return null;
}

// ---------- plumbing: you don't need to change anything below this line ----------

/** The variance as Markdown: paste it into VARIANCE.md. */
export function report(v) {
  const row = (label, s) => (s ? `| ${label} | ${s.min} | ${s.median} | ${s.max} |` : `| ${label} | – | – | – |`);
  const measured = v.measured ?? v.n;
  const tools = Object.entries(v.tools).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, k]) => `| ${name} | ${k}/${v.n} |`);
  const outcomes = Object.entries(v.outcomes).sort((a, b) => b[1] - a[1]).map(([o, k]) => `${o} ${k}/${v.n}`).join(' · ');
  return [
    `### Variance across ${v.n} runs`,
    '',
    v.prompt ? `Prompt: "${v.prompt}"` : 'Prompt: ⚠ the runs have different prompts',
    '',
    ...(v.setup.same ? [] : [`⚠ Not one setup: ${v.setup.differs.join(', ')} differ(s) between runs. Some of the variance may come from the setup, not from the model.`, '']),
    ...(measured < v.n ? [`Turns, calls and tokens come from the ${measured} finished run(s); ${v.n - measured} never finished.`, ''] : []),
    '| Measure | Min | Median | Max |',
    '|---|---:|---:|---:|',
    row('Turns', v.turns),
    row('Tool calls', v.toolCalls),
    row('Input tokens', v.tokens?.input),
    row('Output tokens', v.tokens?.output),
    '',
    '| Tool | Runs that used it |',
    '|---|---:|',
    ...tools,
    '',
    `Tool sequences: ${v.sequences} different in ${v.n} runs.`,
    `Outcomes: ${outcomes}.`,
    ...(v.problems.length ? ['', `Problems: ${v.problems.map((p) => `${p.run}: ${p.problem}`).join('; ')}.`] : []),
    '',
  ].join('\n');
}

const short = (meta) => (meta ? `${meta.model ?? '?'} · commit ${String(meta.git?.commit ?? '?').slice(0, 7)} · ${(meta.flags ?? []).length} flags` : 'no meta.json');
function printCompare(a, b, c) {
  const pct = (x, y) => (x ? ` (${y >= x ? '+' : '−'}${Math.round((Math.abs(y - x) / x) * 100)}%)` : '');
  console.log(`\n⚖️  ${a.id} vs ${b.id}`);
  console.log(`   setup     ${c.setup.same ? `same: ${short(a.meta)}` : `⚠ differs: ${c.setup.differs.join(', ')} (${short(a.meta)} vs ${short(b.meta)})`}`);
  console.log(`   tools     ${c.tools.a.join(' › ') || '-'}`);
  console.log(`             ${c.tools.b.join(' › ') || '-'}${c.tools.same ? '  (same sequence)' : ''}`);
  console.log(`   turns     ${c.turns.a} vs ${c.turns.b}`);
  console.log(`   calls     ${c.toolCalls.a} vs ${c.toolCalls.b}`);
  console.log(`   tokens    ${c.tokens.a.input} vs ${c.tokens.b.input} in${pct(c.tokens.a.input, c.tokens.b.input)} · ${c.tokens.a.output} vs ${c.tokens.b.output} out`);
  console.log(`   outcome   ${c.outcome.a} vs ${c.outcome.b}\n`);
}

/** The run folders in `folder` (folders with meta.json or events.jsonl), run-2 before run-10, or the folder itself when it is a run. */
export function runFolders(folder) {
  const isRun = (d) => fs.existsSync(path.join(d, 'meta.json')) || fs.existsSync(path.join(d, 'events.jsonl'));
  if (isRun(folder)) return [folder];
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(folder, e.name)).filter(isRun).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

export function gitInfo(cwd = process.cwd()) {
  const git = (args) => spawnSync('git', args, { cwd, encoding: 'utf8' });
  const head = git(['rev-parse', 'HEAD']);
  if (head.status !== 0) return { commit: null, dirty: false };
  return { commit: head.stdout.trim(), dirty: Boolean(git(['status', '--porcelain']).stdout.trim()) };
}

function copilot(args) {
  let r = spawnSync('copilot', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error?.code === 'ENOENT' && process.platform === 'win32') {
    const q = (a) => (/^[\w\-./:=@,]+$/.test(a) ? a : `"${a.replace(/"/g, '""')}"`);
    r = spawnSync('copilot', args.map(q), { encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024 });
  }
  return r;
}
export function cliVersion() {
  const r = copilot(['--version']);
  return String(r.stdout ?? '').match(/\d+\.\d+\.\d+(?:-\d+)?/)?.[0] ?? null;
}
export function runCopilot(args) {
  console.log(`🎬 copilot ${args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}`);
  const r = copilot(args);
  if (r.error) return { code: null, stdout: '', stderr: String(r.error.message) };
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'run';

// Run as a script, not imported? Compare real paths: a symlink, a junction or a short 8.3 name must still count.
const isMain = (() => {
  try { return Boolean(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isMain) {
  const [cmd, ...rest] = process.argv.slice(2);
  const option = (name) => {
    const i = rest.indexOf(name);
    if (i < 0) return undefined;
    const [, value] = rest.splice(i, 2);
    return value;
  };
  try {
    if (cmd === 'record') {
      const n = Number(option('--n') ?? 3);
      const model = option('--model');
      const prompt = rest.join(' ').trim();
      if (!prompt || !(n >= 1)) throw new Error('Usage: node scripts/flight.mjs record [--n 3] [--model <model>] "<prompt>"');
      const { series, runs } = record({ prompt, n, model });
      if (!runs?.length) throw new Error('record() recorded nothing yet: finish M1 first.');
      console.log(`\n✈️  ${runs.length} run(s) in ${series}. Next: node scripts/flight.mjs variance ${series}`);
    } else if (cmd === 'compare') {
      if (rest.length !== 2) throw new Error('Usage: node scripts/flight.mjs compare <run-a> <run-b>');
      const [a, b] = rest.map(loadRun);
      const c = compare(a, b);
      if (!c) throw new Error('compare() returns nothing yet: finish M2 first.');
      printCompare(a, b, c);
    } else if (cmd === 'variance') {
      if (rest.length !== 1) throw new Error('Usage: node scripts/flight.mjs variance <folder of runs>');
      const v = variance(runFolders(rest[0]).map(loadRun));
      if (!v) throw new Error('variance() returns nothing yet: finish M3 first.');
      process.stdout.write(report(v));
    } else {
      console.log('Usage: node scripts/flight.mjs record [--n 3] [--model <m>] "<prompt>" | compare <run-a> <run-b> | variance <folder>');
      process.exit(cmd ? 1 : 0);
    }
  } catch (e) {
    console.error(`✈️  ${e.message}`);
    process.exit(1);
  }
}
