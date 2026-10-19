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
  const flags = [];
  let asked = null;
  for (let i = 0; i < args.length; i++) {
    const a = String(args[i]);
    if (a === '-p' || a === '--prompt') { i++; continue; }
    if (a.startsWith('--prompt=')) continue;
    if (a === '--model') asked = String(args[i + 1] ?? '') || null;
    if (a.startsWith('--model=')) asked = a.slice('--model='.length) || null;
    flags.push(a);
  }
  return {
    prompt,
    model: summary?.model ?? asked,
    flags,
    git: { commit: git?.commit ?? null, dirty: Boolean(git?.dirty) },
    cli,
    startedAt,
    exitCode,
  };
}

/**
 * Record `prompt` n times: runs/<stamp>-<slug>/run-<k>/{events.jsonl, meta.json}. Every run uses recordArgs()
 * (read-only, capped). A run that fails is recorded too, and the series goes on.
 * `run`, `git`, `cli` and `now` can be replaced (the checks use a fake Copilot).
 */
export function record({ prompt, n = 3, model, dir = 'runs', run = runCopilot, git = gitInfo, cli = cliVersion, now = () => new Date() }) {
  const series = path.join(dir, `${stamp(now())}-${slug(prompt)}`);
  const version = cli();
  const runs = [];
  for (let k = 1; k <= n; k++) {
    const args = recordArgs(prompt, { model });
    const startedAt = now().toISOString();
    const r = run(args) ?? {};
    const stdout = String(r.stdout ?? '');
    const out = path.join(series, `run-${k}`);
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'events.jsonl'), stdout);
    if (String(r.stderr ?? '').trim()) fs.writeFileSync(path.join(out, 'stderr.txt'), String(r.stderr));
    const summary = summarize(stdout.split(/\r?\n/));
    const meta = metaFor({ prompt, args, git: git(), cli: version, startedAt, exitCode: r.code ?? null, summary });
    fs.writeFileSync(path.join(out, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
    runs.push(out);
  }
  return { series, runs };
}

/** One recorded run: { id, dir, meta, summary, problems }. Never throws: what's missing or broken is a problem. */
export function loadRun(dir) {
  const run = { id: path.basename(dir), dir, meta: null, summary: null, problems: [] };
  const metaFile = path.join(dir, 'meta.json');
  if (!fs.existsSync(metaFile)) run.problems.push('no meta.json: the setup is unknown');
  else {
    try { run.meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')); } catch { run.problems.push('meta.json is not valid JSON: the setup is unknown'); }
  }
  const eventsFile = path.join(dir, 'events.jsonl');
  if (!fs.existsSync(eventsFile)) {
    run.problems.push('no events.jsonl: nothing to measure');
    return run;
  }
  run.summary = summarize(fs.readFileSync(eventsFile, 'utf8').split(/\r?\n/));
  if (run.summary.skipped) run.problems.push(`${run.summary.skipped} broken line(s) in events.jsonl`);
  if (run.summary.outcome === 'incomplete') run.problems.push('no result event: the run never finished');
  return run;
}

const setupOf = (meta) => ({ prompt: meta.prompt, model: meta.model, flags: JSON.stringify(meta.flags ?? []), commit: meta.git?.commit ?? null, cli: meta.cli ?? null });
/** { same, differs }: which parts of the setup differ between runs; a run without meta makes the setup unknown. */
export function setupDiff(runs) {
  const known = runs.filter((r) => r.meta);
  const differs = SETUP.filter((k) => new Set(known.map((r) => setupOf(r.meta)[k])).size > 1);
  if (known.length < runs.length) differs.unshift('meta');
  return { same: differs.length === 0, differs };
}

/** What a run did, in numbers: its tool sequence, turns, tool calls, tokens and outcome. */
function profile(run) {
  const s = run.summary;
  if (!s) throw new Error(`${run.id} has no events.jsonl`);
  const sequence = s.turns.flatMap((t) => t.tools.map((x) => x.name));
  const denied = Object.values(s.tools).some((t) => t.denied > 0);
  return {
    sequence,
    turns: s.turns.length,
    toolCalls: sequence.length,
    tokens: { input: s.tokens.input, output: s.tokens.output },
    outcome: s.outcome === 'ok' && denied ? 'denied' : s.outcome,
  };
}

/** Two runs side by side. */
export function compare(a, b) {
  const pa = profile(a);
  const pb = profile(b);
  return {
    setup: setupDiff([a, b]),
    tools: { a: pa.sequence, b: pb.sequence, same: pa.sequence.join('>') === pb.sequence.join('>') },
    turns: { a: pa.turns, b: pb.turns },
    toolCalls: { a: pa.toolCalls, b: pb.toolCalls },
    tokens: { a: pa.tokens, b: pb.tokens },
    outcome: { a: pa.outcome, b: pb.outcome },
  };
}

const stat = (xs) => {
  const s = [...xs].sort((x, y) => x - y);
  const m = s.length;
  return { min: s[0], median: m % 2 ? s[(m - 1) / 2] : (s[m / 2 - 1] + s[m / 2]) / 2, max: s[m - 1] };
};
/** How much N runs differ. Runs without events are left out (and named in `problems`); it needs 2 to compare. */
export function variance(runs) {
  const problems = runs.flatMap((r) => r.problems.map((problem) => ({ run: r.id, problem })));
  const usable = runs.filter((r) => r.summary);
  if (usable.length < 2) throw new Error(`variance needs at least 2 runs with events; got ${usable.length}`);
  const ps = usable.map(profile);
  const tools = {};
  for (const p of ps) for (const name of new Set(p.sequence)) tools[name] = (tools[name] ?? 0) + 1;
  const outcomes = {};
  for (const p of ps) outcomes[p.outcome] = (outcomes[p.outcome] ?? 0) + 1;
  const prompts = [...new Set(usable.map((r) => r.meta?.prompt).filter(Boolean))];
  return {
    n: usable.length,
    prompt: prompts.length === 1 ? prompts[0] : null,
    setup: setupDiff(runs),
    turns: stat(ps.map((p) => p.turns)),
    toolCalls: stat(ps.map((p) => p.toolCalls)),
    tokens: { input: stat(ps.map((p) => p.tokens.input)), output: stat(ps.map((p) => p.tokens.output)) },
    tools,
    sequences: new Set(ps.map((p) => p.sequence.join('>'))).size,
    outcomes,
    problems,
  };
}

// ---------- plumbing: you don't need to change anything below this line ----------

/** The variance as Markdown: paste it into VARIANCE.md. */
export function report(v) {
  const row = (label, s) => `| ${label} | ${s.min} | ${s.median} | ${s.max} |`;
  const tools = Object.entries(v.tools).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, k]) => `| ${name} | ${k}/${v.n} |`);
  const outcomes = Object.entries(v.outcomes).sort((a, b) => b[1] - a[1]).map(([o, k]) => `${o} ${k}/${v.n}`).join(' · ');
  return [
    `### Variance across ${v.n} runs`,
    '',
    v.prompt ? `Prompt: "${v.prompt}"` : 'Prompt: ⚠ the runs have different prompts',
    '',
    ...(v.setup.same ? [] : [`⚠ Not one setup: ${v.setup.differs.join(', ')} differ(s) between runs. Some of the variance may come from the setup, not from the model.`, '']),
    '| Measure | Min | Median | Max |',
    '|---|---:|---:|---:|',
    row('Turns', v.turns),
    row('Tool calls', v.toolCalls),
    row('Input tokens', v.tokens.input),
    row('Output tokens', v.tokens.output),
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

/** The run folders in `folder` (folders with meta.json or events.jsonl), or the folder itself when it is a run. */
export function runFolders(folder) {
  const isRun = (d) => fs.existsSync(path.join(d, 'meta.json')) || fs.existsSync(path.join(d, 'events.jsonl'));
  if (isRun(folder)) return [folder];
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(folder, e.name)).filter(isRun).sort();
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

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
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
