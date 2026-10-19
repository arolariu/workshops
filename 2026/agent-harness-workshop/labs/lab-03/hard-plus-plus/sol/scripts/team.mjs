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
  if (kind === 'plan') {
    const ids = value.steps.map((s) => s.id);
    for (const id of ids.filter((x, i) => ids.indexOf(x) !== i)) problems.push(`Two steps are called ${id}.`);
    for (const s of value.steps) if (!value.files.includes(s.file)) problems.push(`Step ${s.id} changes ${s.file}, which isn't in "files".`);
  }
  if (kind === 'test-report' && value.failed !== value.failing.length) problems.push(`"failed" is ${value.failed}, but "failing" names ${value.failing.length} test(s).`);
  if (kind === 'verdict' && value.decision === 'approve' && value.findings.some((f) => f.severity === 'high')) problems.push('An approval with a high finding: request changes instead.');
  return problems;
}

// ---------- M2 · A team with separate duties ----------

/** The Copilot arguments of one stage: its agent, its prompt (with {goal} and {run} filled in), its cap and permissions. */
export function stageArgs(stage, runDir, goal) {
  const run = String(runDir).replace(/\\/g, '/');
  const prompt = String(stage.prompt ?? '').replaceAll('{goal}', goal ?? '').replaceAll('{run}', run);
  return [
    '--agent', stage.agent,
    '-p', prompt,
    '-s', '--no-ask-user', `--max-ai-credits=${stage.credits}`,
    ...(stage.allow ?? []).map((a) => `--allow-tool=${a}`),
    ...(stage.deny ?? []).map((d) => `--deny-tool=${d}`),
  ];
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
  for (const stage of pipeline.stages) {
    const st = (state.stages[stage.id] ??= { status: 'pending' });
    if (stage.human) {
      const gate = approvalProblem(runDir);
      if (gate) {
        st.status = 'waiting';
        save();
        return { status: 'awaiting-approval', stage: stage.id, reason: gate };
      }
      st.status = 'done';
      save();
      continue;
    }
    // M5: a stage is done when it finished, its output is there, and its inputs are the ones it saw.
    const inputs = Object.fromEntries((stage.reads ?? []).map((f) => [f, sha256File(path.join(runDir, f))]));
    const output = path.join(runDir, stage.writes);
    if (st.status === 'done' && fs.existsSync(output) && Object.entries(inputs).every(([f, h]) => st.inputs?.[f] === h)) continue;
    if (state.spent + stage.credits > state.budget) {
      st.status = 'stopped';
      save();
      return { status: 'stopped', stage: stage.id, reason: `budget: ${stage.id} needs ${stage.credits} credits, and only ${state.budget - state.spent} of ${state.budget} are left.` };
    }
    Object.assign(st, { status: 'running', credits: stage.credits });
    state.spent += stage.credits;
    save();
    const baseline = stage.id === 'implement' ? takeBaseline(runDir, cwd) : null;
    const before = baseline ? snapshot(cwd) : null;
    let answer;
    try {
      answer = await run(stageArgs(stage, runDir, state.goal), { stage: stage.id, cwd });
    } catch (e) {
      st.status = 'failed';
      save();
      return { status: 'stopped', stage: stage.id, reason: `error: ${e.message}` };
    }
    const result = baseline ? patchOf(cwd, baseline, before) : artifactOf(stage, answer);
    if (result.problems.length) {
      st.status = 'failed';
      save();
      return { status: 'stopped', stage: stage.id, reason: `contract: ${result.problems.join(' ')}` };
    }
    fs.writeFileSync(output, result.text);
    Object.assign(st, { status: 'done', output: stage.writes, sha256: sha256File(output), inputs });
    save();
  }
  return { status: 'done', stage: null };
}

/** An agent's answer as an artifact: the JSON in it, kept only when it keeps its contract. */
function artifactOf(stage, answer) {
  const json = extractJson(answer);
  if (!json.ok) return { problems: [json.error] };
  const problems = stage.contract ? contractProblems(stage.contract, json.value) : [];
  return { problems, text: `${JSON.stringify(json.value, null, 2)}\n` };
}

/** Before the first implement: the plan's files as they were (baseline.json), so every patch starts from there. */
function takeBaseline(runDir, cwd) {
  const file = path.join(runDir, 'baseline.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const plan = JSON.parse(fs.readFileSync(path.join(runDir, 'plan.json'), 'utf8'));
  const baseline = { files: plan.files, content: {} };
  for (const f of plan.files) baseline.content[f] = fs.existsSync(path.join(cwd, f)) ? fs.readFileSync(path.join(cwd, f), 'utf8') : '';
  fs.writeFileSync(file, `${JSON.stringify(baseline, null, 2)}\n`);
  return baseline;
}

/** The implementer's work as a patch of the plan's files; a change to any other file during the call breaks the contract. */
function patchOf(cwd, baseline, before) {
  const now = snapshot(cwd);
  const touched = [...new Set([...Object.keys(now), ...Object.keys(before)])].filter((f) => now[f] !== before[f]);
  const outside = touched.filter((f) => !baseline.files.includes(f));
  if (outside.length) return { problems: [`The implementer changed files outside the plan: ${outside.join(', ')}.`] };
  const read = (f) => (fs.existsSync(path.join(cwd, f)) ? fs.readFileSync(path.join(cwd, f), 'utf8') : '');
  const text = baseline.files.map((f) => unifiedDiff(f, baseline.content[f], read(f))).join('');
  return text ? { problems: [], text } : { problems: ['The implementer changed nothing.'] };
}

// ---------- M4 · The approval gate ----------

/** Why the run can't pass the gate, or null: approval.json must hold the sha256 of plan.json as it is now. */
export function approvalProblem(runDir) {
  const file = path.join(runDir, 'approval.json');
  if (!fs.existsSync(file)) return `Waiting for a person: review plan.json, then run node scripts/team.mjs approve ${path.basename(runDir)} --by <you>.`;
  let approval;
  try { approval = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return 'approval.json is broken: approve the plan again.'; }
  if (approval.plan !== sha256File(path.join(runDir, 'plan.json'))) return 'plan.json changed after it was approved: review it and approve it again.';
  return null;
}

/** A person approves plan.json as it is now. Throws when there is no valid plan, no name, or the name is an agent's. */
export function approve(runDir, { by, pipeline, now = () => new Date().toISOString() } = {}) {
  const planFile = path.join(runDir, 'plan.json');
  if (!fs.existsSync(planFile)) throw new Error('There is no plan.json to approve yet.');
  let plan;
  try { plan = JSON.parse(fs.readFileSync(planFile, 'utf8')); } catch { throw new Error('plan.json is not valid JSON.'); }
  const problems = contractProblems('plan', plan);
  if (problems.length) throw new Error(`plan.json breaks its contract: ${problems.join(' ')}`);
  const who = String(by ?? '').trim();
  if (!who) throw new Error('Say who approves: --by <name>.');
  const agents = (pipeline?.stages ?? []).map((s) => s.agent).filter(Boolean);
  if (agents.some((a) => a.toLowerCase() === who.toLowerCase())) throw new Error(`${who} is an agent of the team: a person approves the plan.`);
  const approval = { by: who, at: now(), plan: sha256File(planFile) };
  fs.writeFileSync(path.join(runDir, 'approval.json'), `${JSON.stringify(approval, null, 2)}\n`);
  return approval;
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
  let r = spawnSync('copilot', args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (r.error?.code === 'ENOENT' && process.platform === 'win32') {
    const q = (a) => (/^[\w\-./:=@,]+$/.test(a) ? a : `"${a.replace(/"/g, '""')}"`);
    r = spawnSync('copilot', args.map(q), { cwd, encoding: 'utf8', shell: true, maxBuffer: 16 * 1024 * 1024 });
  }
  if (r.error) throw new Error(`could not start copilot: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`copilot exited with ${r.status}: ${(r.stderr || r.stdout || '').trim().slice(0, 300)}`);
  return r.stdout;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
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
