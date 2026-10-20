#!/usr/bin/env node
// 👥 The agent team: planner → a person approves → implementer → tester → reviewer. Each stage hands the next one an
// artifact in the run folder (.agent-logs/team/<run>/): plan.json, changes.patch, test-report.json, verdict.json.
//   node scripts/team.mjs start "<goal>"            plan, then wait for a person (uses AI credits)
//   node scripts/team.mjs approve <run> --by <you>  approve the plan as it is now
//   node scripts/team.mjs resume <run>              carry on from where the run stopped (uses AI credits)
//   node scripts/team.mjs status <run>              every stage, its status and the credits spent
//   node scripts/team.mjs --dry-run                 the command of every stage (free)
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---------- M1 · Stage contracts ----------
// The schemas in team/contracts/ say what each artifact looks like; contractProblems() adds what a schema can't say.

export const KINDS = ['plan', 'test-report', 'verdict'];
export const loadSchema = (kind) => JSON.parse(fs.readFileSync(path.join(HERE, 'team', 'contracts', `${kind}.schema.json`), 'utf8'));

/** Everything wrong with an artifact of this kind, as sentences: [] when it keeps its contract. */
export function contractProblems(kind, value) {
  if (!KINDS.includes(kind)) return [`There is no contract called ${kind}.`];
  const problems = checkSchema(value, loadSchema(kind));
  if (problems.length) return problems;
  // TODO(M1): the rules a schema can't say: every step's file is in "files", step ids are unique, "failed" is the
  // number of "failing" tests, and an "approve" verdict has no "high" finding. One sentence per problem.
  return problems;
}

// ---------- M2 · A team with separate duties ----------

/** The Copilot arguments of one stage: its agent, its prompt (with {goal} and {run} filled in), its cap and permissions. */
export function stageArgs(stage, runDir, goal) {
  // TODO(M2): --agent, -p with the stage's prompt ({goal} and {run} filled in, run with forward slashes), -s,
  // --no-ask-user, --max-ai-credits=<the stage's credits>, then an --allow-tool for each "allow" and a --deny-tool for
  // each "deny".
  return [];
}

// ---------- M3 · Run the stages ----------

/** Start a run: its folder and state.json, with the pipeline's budget. */
export function startRun({ runDir, goal, pipeline }) {
  fs.mkdirSync(runDir, { recursive: true });
  const state = { goal, budget: pipeline.budget, spent: 0, stages: {} };
  writeState(runDir, state);
  return state;
}

/**
 * Run every stage that isn't done yet, in order, until the run is done, waits for a person, or stops.
 * run(args, { stage, cwd }) is one Copilot call (the checks pass a fake); cwd is the project the agents work in.
 * @returns {Promise<{ status: 'done' | 'awaiting-approval' | 'stopped', stage: string | null, reason?: string }>}
 */
export async function advance(runDir, { pipeline, run = copilotRun, cwd = process.cwd() } = {}) {
  const state = readState(runDir);
  const save = () => writeState(runDir, state);
  // TODO(M3): for each stage of pipeline.stages, in order (const st = state.stages[stage.id] ??= { status: 'pending' }):
  //   - the gate (stage.human): approvalProblem(runDir) is null → done, go on; otherwise "waiting", save, and return
  //     { status: 'awaiting-approval', stage: stage.id, reason }
  //   - TODO(M5): skip a stage that is done, whose output exists, and whose inputs still have the hashes it saw
  //   - a stage whose credits would push state.spent past state.budget: "stopped", return a "budget: …" reason
  //   - "running", credits, spent, save; takeBaseline() before implement and test; snapshot(runDir) before the call
  //   - answer = await run(stageArgs(stage, runDir, state.goal), { stage: stage.id, cwd }); a throw stops ("error: …")
  //   - the run folder must be the same after the call (changedFiles()); then the result: implementResult(),
  //     testResult() or artifactOf(); any problem stops the run ("contract: …")
  //   - write result.text to stage.writes and each of result.extra, then { status: 'done', output, sha256, inputs,
  //     ...result.record } and save
  return { status: 'stopped', stage: null, reason: 'TODO(M3): advance() is not written yet.' };
}

/** An agent's answer as an artifact: the JSON in it, kept only when it keeps its contract. */
function artifactOf(stage, answer) {
  const json = extractJson(answer);
  if (!json.ok) return { problems: [json.error] };
  const problems = stage.contract ? contractProblems(stage.contract, json.value) : [];
  return { problems, text: `${JSON.stringify(json.value, null, 2)}\n` };
}

/** Before the first implement: every work file as it was (baseline.json). Every later comparison starts from here. */
function takeBaseline(runDir, cwd) {
  const file = path.join(runDir, 'baseline.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const hashes = snapshot(cwd);
  const content = Object.fromEntries(Object.keys(hashes).map((f) => [f, fs.readFileSync(path.join(cwd, f), 'utf8')]));
  const baseline = { hashes, content };
  fs.writeFileSync(file, `${JSON.stringify(baseline, null, 2)}\n`);
  return baseline;
}

const TEST_FILE = /\.test\.[cm]?js$/;
const readFile = (cwd, f) => (fs.existsSync(path.join(cwd, f)) ? fs.readFileSync(path.join(cwd, f), 'utf8') : '');
const diffOf = (cwd, baseline, files) => files.map((f) => unifiedDiff(f, baseline.content[f] ?? '', readFile(cwd, f))).join('');

/**
 * The implementer's work, against the baseline and the plan as it is now: every file that differs from the baseline
 * must be in the plan, or be a test the tester left as it is. The patch covers the plan's files.
 */
function implementResult(runDir, cwd, state, baseline) {
  // TODO(M3): read plan.json as it is now and snapshot(cwd). A file that differs from baseline.hashes is a problem
  // (name it) unless the plan lists it, or it is a test the tester left as it is (state.stages.test.tests). The
  // patch: diffOf(cwd, baseline, plan.files); an empty one is a problem too. Return { problems, text, record: { tree } }.
  return { problems: ['TODO(M3): implementResult() is not written yet.'] };
}

/** The tester's answer, and its changes: test files only (compared with what implement left). They go to tests.patch. */
function testResult(stage, answer, cwd, state, baseline) {
  // TODO(M3): artifactOf() the answer; then every file that differs from what implement left
  // (state.stages.implement.tree) must be a test file (TEST_FILE). Return the artifact with
  // extra: { 'tests.patch': diffOf() of the test files that differ from the baseline } and record: { tests: { file: hash } }.
  return { problems: ['TODO(M3): testResult() is not written yet.'] };
}

// ---------- M4 · The approval gate ----------

/** Why the run can't pass the gate, or null: approval.json must hold the sha256 of plan.json as it is now. */
export function approvalProblem(runDir) {
  // TODO(M4): null when approval.json exists and its "plan" is the sha256 of plan.json as it is now; otherwise a
  // sentence that says what to do.
  return 'TODO(M4): the gate is not written yet.';
}

/** A person approves plan.json as it is now. Throws when there is no valid plan, no name, or the name is an agent's. */
export function approve(runDir, { by, pipeline, now = () => new Date().toISOString() } = {}) {
  // TODO(M4): plan.json must exist and keep its contract; `by` must be a name, and not the name of an agent of the
  // pipeline (in any case). Write { by, at: now(), plan: sha256File(plan.json) } to approval.json and return it.
  throw new Error('TODO(M4): approve() is not written yet.');
}

// ---------- plumbing: you don't need to change anything below this line ----------

export const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
/** The sha256 of a file's bytes, or null when it doesn't exist. */
export const sha256File = (file) => (fs.existsSync(file) ? sha256(fs.readFileSync(file)) : null);

/** The JSON in an agent's answer: the last ```json block, else the text from the first "{" to the last "}". */
export function extractJson(text) {
  const s = String(text ?? '');
  const blocks = [...s.matchAll(/`{3}json[^\n]*\n([\s\S]*?)`{3}/gi)].map((m) => m[1]);
  const json = blocks.length ? blocks[blocks.length - 1] : (s.includes('{') ? s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1) : '');
  if (!json.trim()) return { ok: false, error: 'The answer has no JSON.' };
  try { return { ok: true, value: JSON.parse(json) }; } catch (e) { return { ok: false, error: `The JSON doesn't parse: ${e.message}` }; }
}

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
/**
 * What is wrong with `value` according to `schema`, as readable sentences ([] when it fits). A JSON Schema subset:
 * type, enum, required, properties, additionalProperties: false, items, minItems, minimum, minLength, pattern.
 */
export function checkSchema(value, schema, at = '$') {
  const out = [];
  if (!schema || typeof schema !== 'object') return out;
  const t = typeOf(value);
  if (schema.type && !(schema.type === t || (schema.type === 'number' && t === 'integer'))) return [`${at} should be ${schema.type === 'integer' ? 'a whole number' : `a(n) ${schema.type}`}, not ${t}`];
  if (schema.enum && !schema.enum.includes(value)) out.push(`${at} should be one of ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}, not ${JSON.stringify(value)}`);
  if (t === 'string') {
    if (schema.minLength != null && value.length < schema.minLength) out.push(`${at} is too short (at least ${schema.minLength} characters)`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) out.push(`${at} should match ${schema.pattern}`);
  }
  if ((t === 'integer' || t === 'number') && schema.minimum != null && value < schema.minimum) out.push(`${at} should be at least ${schema.minimum}`);
  if (t === 'array') {
    if (schema.minItems != null && value.length < schema.minItems) out.push(`${at} needs at least ${schema.minItems} item(s)`);
    if (schema.items) value.forEach((v, i) => out.push(...checkSchema(v, schema.items, `${at}[${i}]`)));
  }
  if (t === 'object') {
    for (const k of schema.required ?? []) if (!(k in value)) out.push(`${at}.${k} is missing`);
    for (const [k, v] of Object.entries(value)) {
      if (schema.properties?.[k]) out.push(...checkSchema(v, schema.properties[k], `${at}.${k}`));
      else if (schema.additionalProperties === false) out.push(`${at}.${k} is not part of the contract`);
    }
  }
  return out;
}

const SKIP = new Set(['.git', 'node_modules', '.agent-logs']);
/** The work files of a folder: { "deadlines.js": sha256, … } (no .git, node_modules or .agent-logs). */
export function snapshot(dir) {
  const out = {};
  const walk = (abs, rel) => {
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      if (SKIP.has(e.name)) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(abs, e.name), r);
      else out[r] = sha256(fs.readFileSync(path.join(abs, e.name)));
    }
  };
  walk(dir, '');
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

/** The files whose hash differs between two snapshots (added, changed or removed), sorted. */
export function changedFiles(a, b) {
  return [...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])].filter((f) => (a ?? {})[f] !== (b ?? {})[f]).sort();
}

/** A unified diff of one file (3 lines of context), from `before` to `after`. '' when they are the same. */
export function unifiedDiff(file, before, after) {
  const a = String(before ?? '').replace(/\r\n/g, '\n').split('\n');
  const b = String(after ?? '').replace(/\r\n/g, '\n').split('\n');
  const n = a.length;
  const m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { ops.push([' ', a[i], i, j]); i++; j++; }
    else if (i < n && (j === m || lcs[i + 1][j] >= lcs[i][j + 1])) { ops.push(['-', a[i], i, j]); i++; }
    else { ops.push(['+', b[j], i, j]); j++; }
  }
  const changed = ops.map((o, k) => (o[0] !== ' ' ? k : -1)).filter((k) => k >= 0);
  if (!changed.length) return '';
  const hunks = [];
  for (const k of changed) {
    const last = hunks[hunks.length - 1];
    if (last && k - last.end <= 6) last.end = k;
    else hunks.push({ start: k, end: k });
  }
  const lines = [`--- a/${file}`, `+++ b/${file}`];
  for (const h of hunks) {
    const from = Math.max(0, h.start - 3);
    const to = Math.min(ops.length - 1, h.end + 3);
    const part = ops.slice(from, to + 1);
    const oldCount = part.filter((o) => o[0] !== '+').length;
    const newCount = part.filter((o) => o[0] !== '-').length;
    lines.push(`@@ -${part[0][2] + (oldCount ? 1 : 0)},${oldCount} +${part[0][3] + (newCount ? 1 : 0)},${newCount} @@`);
    for (const [op, text] of part) lines.push(`${op}${text}`);
  }
  return `${lines.join('\n')}\n`;
}

export const loadPipeline = (file = path.join(HERE, 'team', 'pipeline.json')) => JSON.parse(fs.readFileSync(file, 'utf8'));
export const readState = (runDir) => JSON.parse(fs.readFileSync(path.join(runDir, 'state.json'), 'utf8'));
export const writeState = (runDir, state) => fs.writeFileSync(path.join(runDir, 'state.json'), `${JSON.stringify(state, null, 2)}\n`);

/** One real Copilot call: returns what it printed, throws when it fails. */
export function copilotRun(args, { cwd = process.cwd() } = {}) {
  if (process.env.HARNESS_NO_COPILOT) {
    globalThis.__harnessCopilotCalls = (globalThis.__harnessCopilotCalls ?? 0) + 1;
    throw new Error('copilotRun() refused: the free checks never call Copilot. Use the run() you are given.');
  }
  let r = spawnSync('copilot', args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (r.error?.code === 'ENOENT' && process.platform === 'win32') {
    const q = (a) => (/^[\w\-./:=@,]+$/.test(a) ? a : `"${a.replace(/"/g, '""')}"`);
    r = spawnSync('copilot', args.map(q), { cwd, encoding: 'utf8', shell: true, maxBuffer: 16 * 1024 * 1024 });
  }
  if (r.error) throw new Error(`could not start copilot: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`copilot exited with ${r.status}: ${(r.stderr || r.stdout || '').trim().slice(0, 300)}`);
  return r.stdout;
}

// Real paths: a symlinked temp folder, a junction or a short 8.3 path still counts as "run directly".
const isMain = (() => {
  try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isMain) {
  const [cmd, arg] = process.argv.slice(2);
  const argv = process.argv.slice(2);
  const pipeline = loadPipeline();
  const dirOf = (id) => path.join('.agent-logs', 'team', String(id ?? ''));
  const say = (r) => {
    console.log(r.status === 'done' ? '✅ The run is done.' : r.status === 'awaiting-approval' ? `⏸  ${r.reason}` : `⛔ Stopped at ${r.stage}: ${r.reason}`);
    process.exitCode = r.status === 'stopped' ? 1 : 0;
  };
  const show = (args) => `copilot ${args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}`;
  const loud = (args, ctx) => {
    console.log(`▶ ${ctx.stage}: ${args[1]}…`);
    return copilotRun(args, ctx);
  };
  if (argv.includes('--dry-run')) {
    for (const s of pipeline.stages) console.log(s.human ? `✋ ${s.id}: a person runs node scripts/team.mjs approve <run> --by <name>` : `▶ ${s.id}: ${show(stageArgs(s, dirOf('<run>'), '<goal>'))}`);
  } else if (cmd === 'start' && arg) {
    const id = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    startRun({ runDir: dirOf(id), goal: arg, pipeline });
    console.log(`👥 Run ${id} in ${dirOf(id)}`);
    say(await advance(dirOf(id), { pipeline, run: loud }));
  } else if (cmd === 'approve' && arg) {
    const by = argv.includes('--by') ? argv[argv.indexOf('--by') + 1] : '';
    try {
      const a = approve(dirOf(arg), { by, pipeline });
      console.log(`✅ ${a.by} approved plan ${a.plan.slice(0, 12)}… Run node scripts/team.mjs resume ${arg}.`);
    } catch (e) {
      console.error(`❌ ${e.message}`);
      process.exitCode = 1;
    }
  } else if (cmd === 'resume' && arg) {
    say(await advance(dirOf(arg), { pipeline, run: loud }));
  } else if (cmd === 'status' && arg) {
    const state = readState(dirOf(arg));
    console.log(`👥 ${state.goal}\n   credits: ${state.spent} of ${state.budget}`);
    for (const s of pipeline.stages) console.log(`   ${s.id.padEnd(10)} ${state.stages[s.id]?.status ?? 'pending'}`);
  } else {
    console.log('Usage: node scripts/team.mjs start "<goal>" | approve <run> --by <you> | resume <run> | status <run> | --dry-run');
  }
}
