#!/usr/bin/env node
// 🧪 eval: run the harness's golden cases N times (read-only, quiet, credit-capped) and measure them: pass rate,
// pass@k, variance and tokens per case, a baseline gate, and the value of each layer.
//   node scripts/eval.mjs --dry-run [--runs 3] [--budget 100] [--case <id,…>]  the plan and its worst case; runs nothing
//   node scripts/eval.mjs --runs 1 --budget 240 [--case <id,…>]               real runs → evals/runs/run-<stamp>/
//   node scripts/eval.mjs --from evals/runs/full                              score recorded runs (free)
//   node scripts/eval.mjs … --baseline evals/baseline.json [--threshold 10]   exit 1 on a regression
//   node scripts/eval.mjs --ablate <layer|all> [--from evals/runs/full]       the layer-value report (free)
// Reports: report.json and report.md (layer-value.json and .md for --ablate) in --report (default evals/reports).
// Every run is capped at 30 credits or more (the CLI's minimum), so the worst case is about runs × cases × 30 or more;
// the cap is soft (`copilot help limits`): a run can go over it by one response.
// Exit codes: 0 done · 1 a regression beyond the threshold · 2 refused (arguments, cases, budget, missing runs) or
// nothing measured (no run started: Copilot's error is printed).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCases, evalArgs, facts, plan, score, splitRuns } from './eval/score.mjs';
import { ablation, caseReport, compare } from './eval/stats.mjs';

export * from './eval/score.mjs';
export * from './eval/stats.mjs';

// ---------- plumbing: you don't need to change anything below this line ----------

const DEFAULTS = { cases: 'evals/cases.json', runs: 3, budget: 100, report: 'evals/reports', threshold: 10 };
const FLAGS = { '--cases': 'cases', '--case': 'case', '--runs': 'runs', '--budget': 'budget', '--from': 'from', '--report': 'report', '--baseline': 'baseline', '--threshold': 'threshold', '--ablate': 'ablate' };

class Refused extends Error {}

export function parseArgs(argv) {
  const o = { ...DEFAULTS, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split(/=(.*)/s);
    if (flag === '--dry-run') { o.dryRun = true; continue; }
    if (!(flag in FLAGS)) throw new Refused(`Unknown argument: ${argv[i]}`);
    const value = inline ?? argv[++i];
    if (value === undefined) throw new Refused(`${flag} needs a value.`);
    o[FLAGS[flag]] = value;
  }
  for (const k of ['runs', 'budget', 'threshold']) {
    o[k] = Number(o[k]);
    if (!Number.isFinite(o[k]) || o[k] < 0) throw new Refused(`--${k} must be a number, 0 or more.`);
  }
  if (!Number.isInteger(o.runs) || o.runs < 1 || o.runs > 20) throw new Refused('--runs must be a whole number from 1 to 20.');
  if (o.dryRun && (o.from || o.ablate)) throw new Refused('--dry-run plans real runs: leave out --from and --ablate.');
  return o;
}

const readJson = (file, what) => {
  if (!fs.existsSync(file)) throw new Refused(`${what} not found: ${file}`);
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new Refused(`${what} is not valid JSON (${file}): ${e.message}`); }
};
const slash = (p) => p.replace(/\\/g, '/');
const percent = (x) => (typeof x === 'number' ? `${Math.round(x * 1000) / 10}%` : '–');

/** The recorded runs of a suite folder: case id → runs (arrays of events). Files that match no case are listed. */
export function readSuite(dir, cases) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Refused(`No recorded runs in ${dir}.`);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
  const runs = {};
  for (const c of cases) {
    const file = path.join(dir, `${c.id}.jsonl`);
    runs[c.id] = fs.existsSync(file) ? splitRuns(fs.readFileSync(file, 'utf8')) : [];
  }
  return { runs, unknown: files.map((f) => f.slice(0, -'.jsonl'.length)).filter((id) => !cases.some((c) => c.id === id)) };
}

/** The suite's report: every case's numbers, and the suite's pass rate (the mean of the cases' pass rates). */
export function buildReport(cases, recorded, suite) {
  const out = { suite: slash(suite), runs: 0, passRate: null, cases: {} };
  for (const c of cases) {
    const scored = (recorded.runs[c.id] ?? []).map((events) => ({ ...(score(events, c.expect) ?? { pass: false, failed: ['score() returns nothing yet'] }), tokens: facts(events).tokens }));
    const r = caseReport(c, scored);
    out.cases[c.id] = r;
    out.runs += scored.length;
  }
  const rates = Object.values(out.cases).map((r) => r?.passRate).filter((x) => typeof x === 'number');
  out.passRate = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;
  if (recorded.unknown?.length) out.unknown = recorded.unknown;
  return out;
}

export function reportMarkdown(rep) {
  const rows = Object.entries(rep.cases).map(([id, r]) => {
    if (!r) return `| ${id} | | | | | | |`;
    const at = Object.entries(r.passAtK ?? {}).map(([k, v]) => `@${k} ${percent(v)}`).join(' · ') || '–';
    const tok = r.tokens ? `${r.tokens.input.toLocaleString('en-US')} / ${r.tokens.output.toLocaleString('en-US')}` : '–';
    return `| ${id} | ${r.layer} | ${r.runs} | ${percent(r.passRate)} | ${at} | ${typeof r.variance === 'number' ? Math.round(r.variance * 10000) / 10000 : '–'} | ${tok} |`;
  });
  const failures = Object.entries(rep.cases).flatMap(([id, r]) => (r?.failures ?? []).map((f) => `- ${id} · run ${f.run}: ${f.failed.join(' · ')}`));
  const lines = [
    `# Eval report · ${rep.suite}`, '',
    `${rep.runs} runs of ${Object.keys(rep.cases).length} cases · pass rate **${percent(rep.passRate)}** (the mean of the cases' pass rates)`, '',
    '| Case | Layer | Runs | Pass rate | pass@k | Variance | Tokens in / out (mean per run) |',
    '|---|---|---|---|---|---|---|',
    ...rows,
  ];
  if (failures.length) lines.push('', '## Failed runs', '', ...failures);
  if (rep.unknown?.length) lines.push('', `Recorded runs without a case: ${rep.unknown.join(', ')}`);
  const c = rep.comparison;
  if (c) {
    lines.push('', `## Compared with ${c.baseline} (threshold ${c.threshold} pp)`, '',
      `${percent(c.before)} → ${percent(c.after)} over ${Object.keys(rep.cases).length - (c.added?.length ?? 0)} shared cases.`, '',
      c.ok ? '✅ No case dropped by more than the threshold.' : `⛔ ${c.regressions.length} regression(s):`,
      ...(c.regressions ?? []).map((r) => `- ${r.id}: ${percent(r.before)} → ${percent(r.after)} (−${r.dropPp} pp)`));
  }
  return `${lines.join('\n')}\n`;
}

export function layerMarkdown(value) {
  const lines = [
    `# Layer value · ${value.full}`, '',
    `What the suite loses when a layer is removed. A case depends on a layer when it drops by more than ${value.threshold} pp.`, '',
    '| Layer removed | Pass rate | Drop | Cases that depend on it |',
    '|---|---|---|---|',
    ...value.layers.map((l) => `| ${l.layer} | ${percent(l.before)} → ${percent(l.after)} | ${l.dropPp} pp | ${l.cases.map((c) => `${c.id} (−${c.dropPp} pp)`).join(', ') || 'none'} |`),
  ];
  return `${lines.join('\n')}\n`;
}

function write(dir, name, json, md) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.json`), `${JSON.stringify(json, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, `${name}.md`), md);
  console.log(`📝 ${slash(path.join(dir, `${name}.json`))} and ${name}.md`);
}

function runCopilot(args) {
  const opts = { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 300000 };
  // EVAL_COPILOT runs another program instead (a .mjs or .js file runs with node): the free checks use a fake one.
  const fake = process.env.EVAL_COPILOT;
  if (fake) return /\.[cm]?js$/i.test(fake) ? spawnSync(process.execPath, [fake, ...args], opts) : spawnSync(fake, args, opts);
  let r = spawnSync('copilot', args, opts);
  if (r.error?.code === 'ENOENT' && process.platform === 'win32') {
    // copilot.cmd (an npm install) only starts through a shell, so quote every argument for cmd.exe.
    const q = (a) => (/^[\w\-./:=@,]+$/.test(a) ? a : `"${a.replace(/"/g, '""')}"`);
    r = spawnSync(['copilot', ...args.map(q)].join(' '), { ...opts, shell: true });
  }
  if (r.error?.code === 'ENOENT') throw new Refused('The Copilot CLI is not installed (or not on PATH).');
  return r;
}

const isResult = (line) => { try { return JSON.parse(line)?.type === 'result'; } catch { return false; } };
const errorTail = (r) => `${(r.stderr ?? '').trim() || (r.error?.message ?? '')}`.slice(-300) || 'no error output';

/**
 * Real runs: every case, N times, appended to evals/runs/run-<stamp>/<case>.jsonl. A run that failed (Copilot exited
 * with another code than 0) or never started (no result event of its own) is recorded as a failed run, and its error
 * is printed. `started` counts the runs that got as far as Copilot's own result event.
 */
function record(cases, runs) {
  const args = Object.fromEntries(cases.map((c) => [c.id, evalArgs(c)]));
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-');
  let dir = path.join('evals', 'runs', `run-${stamp}`);
  for (let n = 2; fs.existsSync(dir); n++) dir = path.join('evals', 'runs', `run-${stamp}-${n}`);
  fs.mkdirSync(dir, { recursive: true });
  let started = 0;
  let total = 0;
  let lastError = null;
  for (const c of cases) {
    const file = path.join(dir, `${c.id}.jsonl`);
    for (let i = 1; i <= runs; i++) {
      console.log(`▶ ${c.id} · run ${i}/${runs}`);
      total++;
      const r = runCopilot(args[c.id]);
      const code = r.status ?? 1;
      const lines = String(r.stdout ?? '').split(/\r?\n/).filter((l) => l.trim());
      const at = lines.findLastIndex(isResult);
      if (at < 0) {
        lastError = `exit ${r.status ?? r.signal}: ${errorTail(r)}`;
        console.log(`   ⚠ Copilot never got to its result event (${lastError}). Recorded as a failed run.`);
        lines.push(JSON.stringify({ type: 'result', exitCode: code || 1, note: 'added by eval.mjs: the run never got to its result event' }));
      } else {
        started++;
        if (code !== 0) {
          lastError = `exit ${code}: ${errorTail(r)}`;
          console.log(`   ⚠ Copilot exited with code ${code} (${errorTail(r)}). Recorded as a failed run.`);
          const e = JSON.parse(lines[at]);
          if (e.exitCode === 0) lines[at] = JSON.stringify({ ...e, exitCode: code, note: 'eval.mjs: the process exited with this code' });
        }
      }
      fs.appendFileSync(file, `${lines.join('\n')}\n`);
    }
  }
  return { dir, args, started, total, lastError };
}

export function main(argv) {
  const o = parseArgs(argv);
  const cfg = readJson(o.cases, 'The cases');
  const problems = checkCases(cfg);
  if (problems.length) throw new Refused(`${o.cases} has problems:\n  - ${problems.join('\n  - ')}`);
  let cases = Array.isArray(cfg) ? cfg : cfg.cases;
  if (o.case) {
    const wanted = String(o.case).split(',').map((s) => s.trim()).filter(Boolean);
    const unknown = wanted.filter((id) => !cases.some((c) => c.id === id));
    if (unknown.length || !wanted.length) throw new Refused(`No case with the id "${unknown[0] ?? o.case}" in ${o.cases}.`);
    cases = cases.filter((c) => wanted.includes(c.id));
  }

  if (o.ablate) {
    const full = o.from ?? path.join('evals', 'runs', 'full');
    const root = path.dirname(full);
    const layers = o.ablate === 'all'
      ? (fs.existsSync(root) ? fs.readdirSync(root).filter((n) => n.startsWith('ablate-')).map((n) => n.slice('ablate-'.length)) : [])
      : [o.ablate];
    if (!layers.length) throw new Refused(`No ablate-<layer> folders next to ${full}.`);
    const fullReport = buildReport(cases, readSuite(full, cases), full);
    const removed = {};
    for (const layer of layers) {
      const dir = path.join(root, `ablate-${layer}`);
      if (!fs.existsSync(dir)) throw new Refused(`No recorded runs without the ${layer} layer: ${slash(dir)} doesn't exist.`);
      removed[layer] = buildReport(cases, readSuite(dir, cases), dir);
    }
    const layersValue = ablation(fullReport, removed, { threshold: o.threshold });
    if (!Array.isArray(layersValue)) throw new Refused('ablation() returns nothing yet.');
    const value = { threshold: o.threshold, full: slash(full), layers: layersValue };
    for (const l of layersValue) console.log(`🧱 without ${l.layer}: ${percent(l.before)} → ${percent(l.after)} (${l.dropPp} pp)${l.cases?.length ? `; depends on it: ${l.cases.map((c) => c.id).join(', ')}` : ''}`);
    write(o.report, 'layer-value', value, layerMarkdown(value));
    return 0;
  }

  let recorded;
  let suite;
  let args = null;
  if (o.from) {
    recorded = readSuite(o.from, cases);
    suite = o.from;
  } else {
    const p = plan(cases, { runs: o.runs, budget: o.budget });
    if (!p) throw new Refused('plan() returns nothing yet.');
    console.log(`📋 ${cases.length} case(s) × ${o.runs} run(s) = ${p.runs} runs, each capped (--max-ai-credits).`);
    for (const row of p.cases) console.log(`   ${row.id}: ${row.runs} × ${row.credits} credits`);
    console.log(`   Worst case: about ${p.worstCase} credits, if every run uses its whole cap (a run can go over its cap by one response) · budget: ${o.budget} credits`);
    if (!p.ok) throw new Refused(`The worst case (about ${p.worstCase} credits) is over the budget (${o.budget}): fewer runs or cases, or a bigger --budget.`);
    if (o.dryRun) {
      console.log(`   One run: copilot ${evalArgs(cases[0]).map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}`);
      console.log('🧪 Dry run: nothing ran.');
      return 0;
    }
    const rec = record(cases, o.runs);
    if (rec.started === 0) throw new Refused(`${rec.total === 1 ? 'The run never started' : `None of the ${rec.total} runs started`}, so nothing was measured (the failed runs are in ${slash(rec.dir)}). Copilot's last error: ${rec.lastError}`);
    if (rec.started < rec.total) console.log(`⚠ ${rec.total - rec.started} of ${rec.total} runs never started: they count as failed runs.`);
    ({ dir: suite, args } = rec);
    recorded = readSuite(suite, cases);
  }

  const rep = buildReport(cases, recorded, suite);
  if (args) for (const [id, a] of Object.entries(args)) if (rep.cases[id]) rep.cases[id].args = a;
  let code = 0;
  if (o.baseline) {
    const c = compare(readJson(o.baseline, 'The baseline'), rep, { threshold: o.threshold });
    if (!c) throw new Refused('compare() returns nothing yet.');
    rep.comparison = { baseline: slash(o.baseline), ...c };
    if (!c.ok) code = 1;
  }
  for (const [id, r] of Object.entries(rep.cases)) console.log(`${r?.runs ? (r.passRate === 1 ? '✅' : r.passRate === 0 ? '❌' : '🟡') : '⚪'} ${id}: ${r?.runs ? `${r.passed}/${r.runs} passed` : 'no runs'}`);
  console.log(`📊 Pass rate ${percent(rep.passRate)} over ${rep.runs} runs.`);
  if (rep.comparison) {
    const c = rep.comparison;
    if (c.ok) console.log(`✅ No regression beyond ${c.threshold} pp against ${c.baseline}.`);
    else console.log(`⛔ Regression beyond ${c.threshold} pp against ${c.baseline}: ${c.regressions.map((r) => `${r.id} ${percent(r.before)} → ${percent(r.after)} (−${r.dropPp} pp)`).join(', ')}`);
  }
  write(o.report, 'report', rep, reportMarkdown(rep));
  return code;
}

const sameFile = (a, b) => { try { return fs.realpathSync.native(a) === fs.realpathSync.native(b); } catch { return false; } };
if (process.argv[1] && sameFile(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(`⛔ ${e instanceof Refused ? e.message : e.stack ?? e}`);
    process.exitCode = 2;
  }
}
