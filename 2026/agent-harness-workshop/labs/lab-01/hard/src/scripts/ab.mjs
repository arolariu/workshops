#!/usr/bin/env node
// 🧪 Does AGENTS.md change the answers? The same prompt, N times, with and without instructions; then one rule at a time.
//   node scripts/ab.mjs --dry-run [--runs N] [--ablate]   show what would run (free)
//   node scripts/ab.mjs --runs 3                          with vs without: 2 variants × 3 runs = 6 prompts
//   node scripts/ab.mjs --ablate --runs 3                 every rule vs one rule removed: 5 variants × 3 runs = 15 prompts
//   node scripts/ab.mjs --from runs/ab-results.json       redo the report from saved results (free)
// Every run uses AI credits and is capped with --max-ai-credits. Every variant runs in its own copy of this folder:
// "with" is a plain copy, "without" a copy with no instruction files at all, "no-<rule>" a copy whose AGENTS.md lacks
// that one rule. Results and reports go to runs/.
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
  // TODO(M1): -p with the prompt, -s, --no-ask-user, a credit cap (30-50), and deny writes and the shell.
  // The 'without' variant also switches custom instructions off (see `copilot --help`).
  return [];
}

/**
 * Is this path (relative, with /) a file Copilot reads as instructions? AGENTS.md, CLAUDE.md and GEMINI.md in any
 * folder (also .claude/CLAUDE.md), .github/copilot-instructions.md, and anything in .github/instructions/.
 * @param {string} rel
 */
export function isInstructionFile(rel) {
  // TODO(M1): true for every file Copilot reads as instructions (see the comment above).
  return false;
}

// ---------- M2 · Score every rule ----------

/**
 * Which of the project's rules show up in one answer?
 * @param {string} answer
 * @returns {{ canary: boolean, tests: boolean, examRule: boolean, deps: boolean }}
 */
export function score(answer) {
  // TODO(M2): one boolean per signal; case doesn't matter. The exam rule needs the exam and 5 (or five).
  return { canary: false, tests: false, examRule: false, deps: false };
}

// ---------- M3 · N runs and the spread ----------

/**
 * Mean and sample standard deviation (divide by n − 1), both rounded to 2 decimals. Fewer than 2 values: sd 0.
 * @param {number[]} values
 * @returns {{ n: number, mean: number, sd: number }}
 */
export function stats(values) {
  // TODO(M3)
  return { n: 0, mean: 0, sd: 0 };
}

/**
 * Per variant: runs, hits per signal, hit rate per signal (hits / runs, 2 decimals), and the spread of the score
 * (how many signals one answer hit). Results with a variant that isn't asked for are ignored.
 * @param {{ variant: string, answer: string }[]} results
 * @param {string[]} [variants]
 */
export function summarize(results, variants = ['with', 'without']) {
  // TODO(M3): start every variant at { runs: 0, hits, rate, score: stats([]) }, then add up score(answer).
  const zero = () => Object.fromEntries(SIGNALS.map((k) => [k, 0]));
  return Object.fromEntries(variants.map((v) => [v, { runs: 0, hits: zero(), rate: zero(), score: stats([]) }]));
}

// ---------- M4 · The report ----------

/**
 * The A/B report in Markdown: one row per signal (hits/runs, the rate, the difference in percentage points), then the
 * score as mean ± sd.
 * @param {ReturnType<typeof summarize>} summary
 * @param {{ prompt?: string, runs?: number }} [meta]
 */
export function report(summary, { prompt = PROMPT, runs } = {}) {
  // TODO(M4): the title, the prompt, the table (see todo.md for the exact cells), the score row.
  return '';
}

// ---------- M5 · Take one rule away ----------

/**
 * AGENTS.md without one rule: every line that matches rule.line goes. Throws when no line matches.
 * @param {string} text
 * @param {{ id: string, line: RegExp }} rule
 * @returns {{ text: string, removed: number }}
 */
export function removeRule(text, rule) {
  // TODO(M5): drop every line that matches rule.line; throw when none does.
  return { text, removed: 0 };
}

/**
 * The signal whose hit rate fell the most from `base` to `other`, in percentage points, or null when none fell.
 * On a tie, the first signal in SIGNALS order.
 */
export function biggestDrop(base, other) {
  // TODO(M5)
  return null;
}

/**
 * The ablation table in Markdown: a row with every rule ("(none)" removed), then one row per rule in RULES order with
 * the hit rate of every signal and the biggest drop. Variants missing from the summary are left out.
 * @param {ReturnType<typeof summarize>} summary - keys 'with' and 'no-<rule id>'
 */
export function ablationTable(summary, { runs } = {}) {
  // TODO(M5): a row for "(none)" (summary.with), then one per rule that has a summary, with biggestDrop().
  return '';
}

// ---------- you don't need to change anything below this line ----------

const SKIP_COPY = /(^|[\\/])(node_modules|\.git|\.agent-logs|runs)([\\/]|$)|^ab-results\.json$/;

/** Copy the project (without dependencies, logs and run output) to `to`. */
export function copyProject(from, to) {
  fs.cpSync(from, to, { recursive: true, filter: (src) => { const rel = path.relative(from, src); return !rel || !SKIP_COPY.test(rel); } });
  return to;
}

/** The instruction files in a folder (relative paths, with /). */
export function instructionsIn(dir) {
  const out = [];
  const walk = (abs, rel) => {
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!/^(node_modules|\.git)$/.test(e.name)) walk(path.join(abs, e.name), r); } else if (isInstructionFile(r)) out.push(r);
    }
  };
  walk(dir, '');
  return out.sort();
}

/** Delete every instruction file in a folder; returns what was removed. */
export function stripInstructions(dir) {
  const found = instructionsIn(dir);
  for (const f of found) fs.rmSync(path.join(dir, f), { force: true });
  return found;
}

/** A fresh copy of the project for one variant, in the system temp folder: { dir, instructions }. */
export function prepare(variant, project) {
  const dir = copyProject(project, fs.mkdtempSync(path.join(os.tmpdir(), `ab-${variant}-`)));
  if (variant === 'without') stripInstructions(dir);
  const rule = RULES.find((r) => variant === `no-${r.id}`);
  if (rule) {
    const file = path.join(dir, 'AGENTS.md');
    fs.writeFileSync(file, removeRule(fs.readFileSync(file, 'utf8'), rule).text);
  }
  return { dir, instructions: instructionsIn(dir) };
}

function runCopilot(args, cwd) {
  const opts = { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 };
  let r = spawnSync('copilot', args, opts);
  if (r.error?.code === 'ENOENT' && process.platform === 'win32') {
    const q = (a) => (/^[\w\-./:=@,]+$/.test(a) ? a : `"${a.replace(/"/g, '""')}"`);
    r = spawnSync('copilot', args.map(q), { ...opts, shell: true });
  }
  return r;
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
  if (!dry) fs.rmSync(path.join(out, resultsFile), { force: true });
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
      const { dir, instructions } = prepare(variant, project);
      let r;
      try { r = runCopilot(args, dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
      if (r.status !== 0) {
        console.log('❌');
        console.error((r.stderr || r.stdout || r.error?.message || '').trim().slice(0, 400));
        process.exit(1);
      }
      results.push({ variant, run: i + 1, answer: r.stdout.trim(), folder: dir, instructions });
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

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main(process.argv.slice(2));
