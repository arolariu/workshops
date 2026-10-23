#!/usr/bin/env node
// 🧪 Does AGENTS.md change the answers? The same prompt, N times, with and without instructions; then one rule at a time.
//   node scripts/ab.mjs --dry-run [--runs N] [--ablate]   show what would run (free)
//   node scripts/ab.mjs --runs 3                          with vs without: 2 variants × 3 runs = 6 prompts
//   node scripts/ab.mjs --ablate --runs 3                 every rule vs one rule removed: 5 variants × 3 runs = 15 prompts
//   node scripts/ab.mjs --from runs/ab-results.json       redo the report from saved results (free)
// Every run uses AI credits and is capped with --max-ai-credits. Every variant runs in its own copy of this folder,
// without scripts/ and evals/ (they quote the canary): "with" is a plain copy, "without" a copy with no instruction
// files at all, "no-<rule>" a copy whose AGENTS.md lacks that one rule. Results and reports go to runs/.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROMPT = 'In 5 short bullets: what must I know before I change code in this project?';
export const SIGNALS = ['canary', 'tests', 'examRule', 'deps'];
export const LABELS = { canary: 'canary', tests: 'test command', examRule: 'exam rule', deps: 'no dependencies' };
/** One AGENTS.md rule per signal. The ablation removes every line of AGENTS.md that matches `line`. */
export const RULES = [
  { id: 'canary', signal: 'canary', line: /Harness check/i },
  { id: 'test-command', signal: 'tests', line: /npm test/i },
  { id: 'exam-rule', signal: 'examRule', line: /exam grade/i },
  { id: 'dependencies', signal: 'deps', line: /dependenc/i },
];
const round2 = (x) => Math.round(x * 100) / 100;

// ---------- M1 · An honest experiment ----------

/**
 * Arguments for one read-only, budget-capped run. 'without' switches custom instructions off; every other variant
 * ('with', 'no-<rule>') keeps them on.
 * @param {string} variant
 * @param {string} prompt
 * @returns {string[]}
 */
export function buildArgs(variant, prompt) {
  const args = ['-p', prompt, '-s', '--no-ask-user', '--max-ai-credits=30', '--deny-tool=write', '--deny-tool=shell'];
  if (variant === 'without') args.push('--no-custom-instructions');
  return args;
}

/**
 * Is this path (relative, with /) a file Copilot reads as instructions? AGENTS.md, CLAUDE.md and GEMINI.md in any
 * folder (also .claude/CLAUDE.md), .github/copilot-instructions.md, and anything in .github/instructions/.
 * @param {string} rel
 */
export function isInstructionFile(rel) {
  const p = String(rel).replace(/\\/g, '/').replace(/^\.\//, '');
  return /(^|\/)(AGENTS|CLAUDE|GEMINI)\.md$/.test(p) || p === '.github/copilot-instructions.md' || p.startsWith('.github/instructions/');
}

// ---------- M2 · Score every rule ----------

/**
 * Which of the project's rules show up in one answer?
 * @param {string} answer
 * @returns {{ canary: boolean, tests: boolean, examRule: boolean, deps: boolean }}
 */
export function score(answer) {
  const text = String(answer ?? '');
  return {
    canary: /harness check/i.test(text),
    tests: /npm test|node --test|node:test/i.test(text),
    examRule: /exam/i.test(text) && /\b5\b|\bfive\b/i.test(text),
    deps: /\b(no|never|zero|without|avoid|don'?t add)\b[^.\n]{0,30}\bdependenc|dependency[- ]free/i.test(text),
  };
}

// ---------- M3 · N runs and the spread ----------

/**
 * Mean and sample standard deviation (divide by n − 1), both rounded to 2 decimals. Fewer than 2 values: sd 0 (there
 * is no spread to measure; the report prints n/a).
 * @param {number[]} values
 * @returns {{ n: number, mean: number, sd: number }}
 */
export function stats(values) {
  const xs = (values ?? []).map(Number);
  const n = xs.length;
  if (!n) return { n: 0, mean: 0, sd: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = n < 2 ? 0 : Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1));
  return { n, mean: round2(mean), sd: round2(sd) };
}

/**
 * Per variant: runs, hits per signal, hit rate per signal (hits / runs, 2 decimals), and the spread of the score
 * (how many signals one answer hit). Results with a variant that isn't asked for are ignored.
 * @param {{ variant: string, answer: string }[]} results
 * @param {string[]} [variants]
 */
export function summarize(results, variants = ['with', 'without']) {
  const zero = () => Object.fromEntries(SIGNALS.map((k) => [k, 0]));
  const out = {};
  const scores = {};
  for (const v of variants) {
    out[v] = { runs: 0, hits: zero(), rate: zero(), score: stats([]) };
    scores[v] = [];
  }
  for (const r of results ?? []) {
    if (!Object.hasOwn(out, r?.variant)) continue;
    const bucket = out[r.variant];
    bucket.runs++;
    const s = score(r.answer);
    for (const k of SIGNALS) if (s[k]) bucket.hits[k]++;
    scores[r.variant].push(SIGNALS.filter((k) => s[k]).length);
  }
  for (const v of variants) {
    const b = out[v];
    for (const k of SIGNALS) b.rate[k] = b.runs ? round2(b.hits[k] / b.runs) : 0;
    b.score = stats(scores[v]);
  }
  return out;
}

// ---------- M4 · The report ----------

const pct = (b, k) => `${Math.round(share(b, k) * 100)}%`;
const signed = (x, digits = 0) => `${x >= 0 ? '+' : ''}${x.toFixed(digits)}`;
const share = (b, k) => (Number.isFinite(b.runs) && b.hits ? (b.runs ? b.hits[k] / b.runs : 0) : b.rate[k]);

/**
 * The A/B report in Markdown: one row per signal (hits/runs, the rate, the difference in percentage points, worked out
 * from the hits, not from rounded rates), then the score as mean ± sd (n/a below two runs).
 * @param {ReturnType<typeof summarize>} summary
 * @param {{ prompt?: string, runs?: number }} [meta]
 */
export function report(summary, { prompt = PROMPT, runs } = {}) {
  const w = summary.with;
  const wo = summary.without;
  const cell = (b, k) => `${b.hits[k]}/${b.runs} (${pct(b, k)})`;
  const spread = (b) => `${b.score.mean.toFixed(2)} ± ${b.score.n < 2 ? 'n/a' : b.score.sd.toFixed(2)}`;
  return [
    '# A/B: does AGENTS.md change the answers?',
    '',
    `Prompt: "${prompt}"`,
    `Runs: ${runs ?? w.runs} per variant, each in its own copy of the project (without scripts/ and evals/).`,
    'With: the project\'s instruction files, plus your personal and plugin instructions if you have any.',
    'Without: no instruction files, and --no-custom-instructions (no personal or plugin instructions either).',
    '',
    '| Signal | With | Without | Δ |',
    '|---|---|---|---|',
    ...SIGNALS.map((k) => `| ${LABELS[k]} | ${cell(w, k)} | ${cell(wo, k)} | ${signed(Math.round((share(w, k) - share(wo, k)) * 100))} pts |`),
    `| score (0–4) | ${spread(w)} | ${spread(wo)} | ${signed(w.score.mean - wo.score.mean, 2)} |`,
    '',
    'Score: how many signals one answer hit, as mean ± sample standard deviation over the runs.',
    '',
  ].join('\n');
}

// ---------- M5 · Take one rule away ----------

/**
 * AGENTS.md without one rule: every line that matches rule.line goes. Throws when no line matches.
 * @param {string} text
 * @param {{ id: string, line: RegExp }} rule
 * @returns {{ text: string, removed: number }}
 */
export function removeRule(text, rule) {
  const lines = String(text).split(/\r?\n/);
  const keep = lines.filter((l) => !rule.line.test(l));
  const removed = lines.length - keep.length;
  if (!removed) throw new Error(`No line of AGENTS.md matches the rule "${rule.id}" (${rule.line}).`);
  return { text: keep.join('\n'), removed };
}

/**
 * The signal whose hit rate fell the most from `base` to `other`, in percentage points (from hits / runs when the
 * summaries have them, else from `rate`), or null when none fell. On a tie, the first signal in SIGNALS order.
 */
export function biggestDrop(base, other) {
  let best = null;
  for (const k of SIGNALS) {
    const drop = Math.round((share(base, k) - share(other, k)) * 100);
    if (drop > 0 && (!best || drop > best.drop)) best = { signal: k, drop };
  }
  return best;
}

/**
 * The ablation table in Markdown: a row with every rule ("(none)" removed), then one row per rule in RULES order with
 * the hit rate of every signal and the biggest drop. Variants missing from the summary are left out.
 * @param {ReturnType<typeof summarize>} summary - keys 'with' and 'no-<rule id>'
 */
export function ablationTable(summary, { runs } = {}) {
  const base = summary.with;
  const row = (label, b, drop) => `| ${label} | ${SIGNALS.map((k) => pct(b, k)).join(' | ')} | ${drop} |`;
  const lines = [
    '# Ablation: which rule carries which signal?',
    '',
    `Runs: ${runs ?? base.runs} per variant. Each row runs with one rule removed from AGENTS.md.`,
    '',
    `| Rule removed | ${SIGNALS.map((k) => LABELS[k]).join(' | ')} | Biggest drop |`,
    `|---|${SIGNALS.map(() => '---|').join('')}---|`,
    row('(none)', base, ''),
  ];
  for (const rule of RULES) {
    const b = summary[`no-${rule.id}`];
    if (!b) continue;
    const d = biggestDrop(base, b);
    lines.push(row(rule.id, b, d ? `${LABELS[d.signal]} (-${d.drop} pts)` : 'none'));
  }
  return `${lines.join('\n')}\n`;
}

// ---------- you don't need to change anything below this line ----------

// Never copied: dependencies, logs, run output, and the folders that quote the canary (this script, the evals).
const SKIP_COPY = /(^|[\\/])(node_modules|\.git|\.agent-logs|runs)([\\/]|$)|^(scripts|evals)([\\/]|$)|^ab-results\.json$/;
const RUN_TIMEOUT = 5 * 60 * 1000;
const TEMP = new Set();

/** Copy the project (without dependencies, logs, run output, scripts/ and evals/) to `to`. */
export function copyProject(from, to) {
  fs.cpSync(from, to, { recursive: true, filter: (src) => { const rel = path.relative(from, src); return !rel || !SKIP_COPY.test(rel); } });
  return to;
}

/** Every file in a folder (relative paths, with /), without node_modules and .git. */
function filesIn(dir) {
  const out = [];
  const walk = (abs, rel) => {
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!/^(node_modules|\.git)$/.test(e.name)) walk(path.join(abs, e.name), r); } else if (e.isFile()) out.push(r);
    }
  };
  walk(dir, '');
  return out.sort();
}

/** The instruction files in a folder (relative paths, with /). */
export const instructionsIn = (dir) => filesIn(dir).filter(isInstructionFile);

/** The files in a folder that mention the canary: in a "without" copy there must be none, or the agent can read it. */
export function canaryIn(dir) {
  return filesIn(dir).filter((f) => {
    try { return fs.statSync(path.join(dir, f)).size < 1024 * 1024 && /harness check/i.test(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return false; }
  });
}

/** Delete every instruction file in a folder; returns what was removed. */
export function stripInstructions(dir) {
  const found = instructionsIn(dir);
  for (const f of found) fs.rmSync(path.join(dir, f), { force: true });
  return found;
}

/** A fresh copy of the project for one variant, in the system temp folder: { dir, instructions, canary }. */
export function prepare(variant, project) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `ab-${variant}-`));
  TEMP.add(dir);
  try {
    copyProject(project, dir);
    if (variant === 'without') stripInstructions(dir);
    const rule = RULES.find((r) => variant === `no-${r.id}`);
    if (rule) {
      const file = path.join(dir, 'AGENTS.md');
      fs.writeFileSync(file, removeRule(fs.readFileSync(file, 'utf8'), rule).text);
    }
    return { dir, instructions: instructionsIn(dir), canary: canaryIn(dir) };
  } catch (e) {
    release(dir);
    throw e;
  }
}

/** Remove a copy made by prepare(). Copies left at exit (an error, Ctrl+C) are removed too. */
export function release(dir) {
  TEMP.delete(dir);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* the OS cleans its temp folder */ }
}

function copilot(args, cwd, timeout) {
  const opts = { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout };
  let r = spawnSync('copilot', args, opts);
  if (r.error?.code === 'ENOENT' && process.platform === 'win32') {
    const q = (a) => (/^[\w\-./:=@,]+$/.test(a) ? a : `"${a.replace(/"/g, '""')}"`);
    r = spawnSync('copilot', args.map(q), { ...opts, shell: true });
  }
  return r;
}

/** What Copilot loads in a folder (`copilot instruction list --json`, free): source paths, or null when unknown. */
function listedIn(dir) {
  const r = copilot(['instruction', 'list', '--json'], dir, 60000);
  try { return JSON.parse(r.stdout).map((s) => String(s.sourcePath ?? s.label).replace(/\\/g, '/')); } catch { return null; }
}

const WHERE = (v) => (v === 'with' ? 'a copy of this folder' : v === 'without' ? 'a copy with no instruction files' : `a copy whose AGENTS.md lacks the ${v.slice(3)} rule`);
const ABLATION = ['with', ...RULES.map((r) => `no-${r.id}`)];

function main(argv) {
  const value = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const bad = argv.find((a, i) => a.startsWith('--') && !['--dry-run', '--runs', '--ablate', '--from'].includes(a) && !['--runs', '--from'].includes(argv[i - 1]));
  if (bad) {
    console.error(`Unknown option ${bad}. Usage: node scripts/ab.mjs [--dry-run] [--runs N] [--ablate] | --from <results.json>`);
    process.exit(2);
  }
  const project = process.cwd();
  const out = path.join(project, 'runs');
  const save = (name, text) => { fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, name), text); return `runs/${name}`; };

  if (argv.includes('--from')) {
    let saved;
    try { saved = JSON.parse(fs.readFileSync(path.resolve(project, value('--from') ?? ''), 'utf8')); } catch (e) {
      console.error(`Could not read ${value('--from')}: ${e.message}`);
      process.exit(1);
    }
    const ablation = (saved.results ?? []).some((r) => /^no-/.test(r.variant));
    const md = ablation
      ? ablationTable(summarize(saved.results, ABLATION), { runs: saved.runs })
      : report(summarize(saved.results), { prompt: saved.prompt, runs: saved.runs });
    console.log(md);
    console.log(`Saved to ${save(ablation ? 'ablation-report.md' : 'ab-report.md', md)}`);
    return;
  }

  const runs = Math.max(1, Math.floor(Number(value('--runs'))) || 1);
  const ablate = argv.includes('--ablate');
  const dry = argv.includes('--dry-run');
  const variants = ablate ? ABLATION : ['with', 'without'];
  console.log(`\n🧪 ${ablate ? 'Ablation' : 'A/B'}: "${PROMPT}"`);
  console.log(`   ${variants.length} variants × ${runs} run(s) = ${variants.length * runs} prompts, each capped with --max-ai-credits.\n`);
  const resultsFile = ablate ? 'ablation-results.json' : 'ab-results.json';
  if (!dry) {
    fs.rmSync(path.join(out, resultsFile), { force: true });
    process.on('exit', () => [...TEMP].forEach(release));
    process.on('SIGINT', () => process.exit(130));
  }
  const results = [];
  for (let i = 0; i < runs; i++) {
    for (const variant of variants) {
      const args = buildArgs(variant, PROMPT);
      if (!args?.length) {
        console.error('buildArgs() returns nothing yet: finish M1 first.');
        process.exit(1);
      }
      const shown = args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ');
      if (dry) {
        console.log(`   copilot ${shown}`);
        console.log(`      ↳ ${variant}: runs in ${WHERE(variant)}`);
        continue;
      }
      process.stdout.write(`   ⏳ ${variant.padEnd(16)} run ${i + 1}… `);
      const { dir, instructions, canary } = prepare(variant, project);
      let r;
      let listed = null;
      try {
        if (variant !== 'without') listed = listedIn(dir);
        r = copilot(args, dir, RUN_TIMEOUT);
      } finally {
        release(dir);
      }
      if (r.status !== 0) {
        console.log('❌');
        console.error(r.error?.code === 'ETIMEDOUT' ? `The run took longer than ${RUN_TIMEOUT / 60000} minutes and was stopped.` : (r.stderr || r.stdout || r.error?.message || '').trim().slice(0, 400));
        process.exit(1);
      }
      results.push({ variant, run: i + 1, answer: r.stdout.trim(), folder: dir, instructions, canaryFiles: canary, listed });
      console.log(`✅ (${instructions.length ? instructions.join(', ') : 'no instruction files'})`);
    }
  }
  if (dry) return;
  const summary = summarize(results, variants);
  save(resultsFile, `${JSON.stringify({ prompt: PROMPT, runs, results, summary }, null, 2)}\n`);
  const md = ablate ? ablationTable(summary, { runs }) : report(summary, { prompt: PROMPT, runs });
  console.log(`\n${md}`);
  console.log(`Saved to runs/${resultsFile} and ${save(ablate ? 'ablation-report.md' : 'ab-report.md', md)}\n`);
}

// Real paths: a symlinked temp folder, a junction or an 8.3 short path must not make the script silently do nothing.
const isMain = (() => {
  try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isMain) main(process.argv.slice(2));
