#!/usr/bin/env node
// 🔁 Review → fix loop with two custom agents. The reviewer hands its findings to the fixer as JSON.
//   node scripts/review-loop.mjs deadlines.js --dry-run       show the commands of round 1 (free)
//   node scripts/review-loop.mjs deadlines.js                 run it: uses AI credits!
//        [--max-rounds 3] [--credits-per-round 60]           at most rounds × credits per round
// Everything lands in .agent-logs/review-loop/: one findings file per round, report.json and report.md.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MIN_CREDITS = 30; // `copilot help limits`: the smallest --max-ai-credits a session accepts
export const WEIGHT = { high: 3, medium: 2, low: 1 };
export const JSON_FORMAT = '{"verdict": "CLEAN" | "ISSUES", "findings": [{"severity": "high" | "medium" | "low", "location": "file.js:12", "problem": "…", "suggestion": "…"}]}';

// ---------- M1 · Findings as JSON ----------

/**
 * Read the reviewer's answer. The last ```json block wins (the answer may quote the format first); without one, the
 * text from the first "{" to the last "}". CLEAN means no findings; ISSUES means at least one.
 * @returns {{ ok: true, verdict: 'CLEAN' | 'ISSUES', findings: { severity: string, location: string, problem: string, suggestion: string }[] } | { ok: false, error: string }}
 */
export function parseReview(text) {
  const s = String(text ?? '');
  const blocks = [...s.matchAll(/```json[^\n]*\n([\s\S]*?)```/gi)].map((m) => m[1]);
  const bare = s.indexOf('{') >= 0 && s.lastIndexOf('}') > s.indexOf('{') ? s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1) : null;
  const json = blocks.length ? blocks[blocks.length - 1] : bare;
  if (json == null) return { ok: false, error: 'The answer has no JSON: ask for one ```json block.' };
  let data;
  try { data = JSON.parse(json); } catch (e) { return { ok: false, error: `The JSON doesn't parse: ${e.message}` }; }
  const verdict = String(data?.verdict ?? '').toUpperCase();
  if (!['CLEAN', 'ISSUES'].includes(verdict)) return { ok: false, error: `"verdict" must be CLEAN or ISSUES, not ${JSON.stringify(data?.verdict)}.` };
  if (!Array.isArray(data.findings)) return { ok: false, error: '"findings" must be a list.' };
  const findings = [];
  for (const [i, f] of data.findings.entries()) {
    const severity = String(f?.severity ?? '').toLowerCase();
    const location = String(f?.location ?? '').replace(/`/g, '').trim();
    if (!(severity in WEIGHT)) return { ok: false, error: `Finding ${i + 1}: severity must be high, medium or low, not ${JSON.stringify(f?.severity)}.` };
    if (!/^[\w./-]+:\d+$/.test(location)) return { ok: false, error: `Finding ${i + 1}: location must look like file.js:12.` };
    if (!String(f?.problem ?? '').trim()) return { ok: false, error: `Finding ${i + 1}: say what the problem is.` };
    findings.push({ severity, location, problem: String(f.problem).trim(), suggestion: String(f?.suggestion ?? '').trim() });
  }
  if (verdict === 'CLEAN' && findings.length) return { ok: false, error: 'The verdict is CLEAN but it lists findings.' };
  if (verdict === 'ISSUES' && !findings.length) return { ok: false, error: 'The verdict is ISSUES but it lists no findings.' };
  return { ok: true, verdict, findings };
}

/** How bad a set of findings is: high 3, medium 2, low 1. */
export const score = (findings) => (findings ?? []).reduce((n, f) => n + (WEIGHT[f.severity] ?? 0), 0);

// ---------- M2 · Two roles, two permission sets ----------

/** Copilot arguments for the reviewer: read-only, capped, quiet, answering in JSON. */
export function reviewerArgs(file, { credits = MIN_CREDITS } = {}) {
  return [
    '--agent', 'reviewer',
    '-p', `Review ${file}. A script reads your answer: answer with only one \`\`\`json block in this format: ${JSON_FORMAT}`,
    '-s', '--no-ask-user', `--max-ai-credits=${credits}`,
    '--deny-tool=write', '--deny-tool=shell',
  ];
}

/** Copilot arguments for the fixer: it may edit files and run npm, never push, within its cap. */
export function fixerArgs(file, findingsPath, { credits = MIN_CREDITS } = {}) {
  return [
    '--agent', 'fixer',
    '-p', `Fix the findings in ${findingsPath} (JSON from the reviewer) in ${file}. Add a regression test for each fix and run npm test until it is green.`,
    '-s', '--no-ask-user', `--max-ai-credits=${credits}`,
    '--allow-tool=write', '--allow-tool=shell(npm:*)',
    '--deny-tool=shell(git push)',
  ];
}

/** Split one round's credits between its two calls. Each call needs at least MIN_CREDITS. */
export function roundBudget(creditsPerRound) {
  const n = Math.floor(Number(creditsPerRound));
  if (!Number.isFinite(n) || n < 2 * MIN_CREDITS) throw new RangeError(`A round needs at least ${2 * MIN_CREDITS} credits (two calls of at least ${MIN_CREDITS}); got ${creditsPerRound}.`);
  return { reviewer: MIN_CREDITS, fixer: n - MIN_CREDITS };
}

// ---------- M3 · The loop and its stop rules ----------

/**
 * review → (stop?) → findings file → fix → tests, round after round. Stops: clean, no-progress (the score didn't go
 * down), max-rounds, unreadable (never hand a review you can't read to the fixer), budget (a round can't be paid
 * for), error (a call failed). Always writes report.json and report.md.
 * @param {{ file?: string, maxRounds?: number, creditsPerRound?: number, dir?: string,
 *           run?: (args: string[]) => string | Promise<string>, runTests?: () => { pass: number, fail: number } }} options
 */
export async function reviewLoop({ file = 'deadlines.js', maxRounds = 3, creditsPerRound = 60, dir = '.agent-logs/review-loop', run = copilotRun, runTests = nodeTests } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const report = { file, maxRounds, creditsPerRound, rounds: [], stop: null, reason: '' };
  const finish = (stop, reason) => {
    Object.assign(report, { stop, reason });
    writeReport(dir, report);
    return report;
  };
  let budget;
  try { budget = roundBudget(creditsPerRound); } catch (e) { return finish('budget', e.message); }
  let previous = Infinity;
  for (let round = 1; round <= maxRounds; round++) {
    const entry = { round, verdict: null, findings: 0, score: 0, credits: { reviewer: budget.reviewer, fixer: null }, findingsFile: null, tests: null };
    report.rounds.push(entry);
    let answer;
    try { answer = await run(reviewerArgs(file, { credits: budget.reviewer })); } catch (e) { return finish('error', `The reviewer call failed: ${e.message}`); }
    const review = parseReview(answer);
    if (!review.ok) {
      entry.verdict = 'UNREADABLE';
      return finish('unreadable', review.error);
    }
    Object.assign(entry, { verdict: review.verdict, findings: review.findings.length, score: score(review.findings) });
    if (review.verdict === 'CLEAN') return finish('clean', 'The reviewer found nothing left to fix.');
    if (entry.score >= previous) return finish('no-progress', `Round ${round} scores ${entry.score}, round ${round - 1} scored ${previous}: the fixes aren't helping.`);
    previous = entry.score;
    const findingsFile = path.join(dir, `round-${round}.findings.json`).replace(/\\/g, '/');
    fs.writeFileSync(findingsFile, `${JSON.stringify({ round, file, verdict: review.verdict, findings: review.findings }, null, 2)}\n`);
    Object.assign(entry, { findingsFile, credits: { ...entry.credits, fixer: budget.fixer } });
    try { await run(fixerArgs(file, findingsFile, { credits: budget.fixer })); } catch (e) { return finish('error', `The fixer call failed: ${e.message}`); }
    entry.tests = await runTests();
  }
  return finish('max-rounds', `${maxRounds} round(s) done: the last fix hasn't been reviewed yet.`);
}

// ---------- M4 · The run report ----------

/** report.md: one row per round, then why the loop stopped and what it could have spent. */
export function renderReport(report) {
  const cell = (r) => (r.credits.fixer == null ? `${r.credits.reviewer}` : `${r.credits.reviewer} + ${r.credits.fixer}`);
  const tests = (r) => (r.tests ? `${r.tests.pass} pass · ${r.tests.fail} fail` : '–');
  const capped = report.rounds.reduce((n, r) => n + r.credits.reviewer + (r.credits.fixer ?? 0), 0);
  return [
    `# Review loop · ${report.file}`,
    '',
    '| Round | Verdict | Findings | Score | Credits | Tests |',
    '|---|---|---|---|---|---|',
    ...report.rounds.map((r) => `| ${r.round} | ${r.verdict} | ${r.findings} | ${r.score} | ${cell(r)} | ${tests(r)} |`),
    '',
    `Stopped: ${report.stop}. ${report.reason}`,
    `Credit caps: ${capped} in total (${report.creditsPerRound} per round, ${report.maxRounds} round(s) at most).`,
    '',
  ].join('\n');
}

// ---------- plumbing: you don't need to change anything below this line ----------

/** Write report.json and report.md into `dir`. */
export function writeReport(dir, report) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, 'report.md'), renderReport(report));
}

/** One real Copilot call: returns what it printed, throws when it fails. */
export function copilotRun(args) {
  let r = spawnSync('copilot', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (r.error?.code === 'ENOENT' && process.platform === 'win32') {
    const q = (a) => (/^[\w\-./:=@,]+$/.test(a) ? a : `"${a.replace(/"/g, '""')}"`);
    r = spawnSync('copilot', args.map(q), { encoding: 'utf8', shell: true, maxBuffer: 16 * 1024 * 1024 });
  }
  if (r.error) throw new Error(`could not start copilot: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`copilot exited with ${r.status}: ${(r.stderr || r.stdout || '').trim().slice(0, 300)}`);
  return r.stdout;
}

/** Run the unit tests: { pass, fail }. */
export function nodeTests() {
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const num = (k) => Number(((r.stdout ?? '').match(new RegExp(`^# ${k} (\\d+)`, 'm')) ?? [])[1] ?? 0);
  return { pass: num('pass'), fail: num('fail') };
}

const show = (args) => `copilot ${args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}`;
// Real paths: a symlinked temp folder, a junction or a short 8.3 path still counts as "run directly".
const isMain = (() => {
  try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isMain) {
  const argv = process.argv.slice(2);
  const VALUE = new Set(['--max-rounds', '--credits-per-round']);
  const opt = (name, fallback) => (argv.includes(name) ? Number(argv[argv.indexOf(name) + 1]) : fallback);
  const file = argv.find((a, i) => !a.startsWith('--') && !VALUE.has(argv[i - 1])) ?? 'deadlines.js';
  const maxRounds = opt('--max-rounds', 3);
  const creditsPerRound = opt('--credits-per-round', 60);
  if (argv.includes('--dry-run')) {
    const budget = roundBudget(creditsPerRound);
    if (!reviewerArgs(file).length || !fixerArgs(file, 'x').length) {
      console.error('reviewerArgs() / fixerArgs() return nothing yet: finish M2 first.');
      process.exit(1);
    }
    console.log(`🔎 ${show(reviewerArgs(file, { credits: budget.reviewer }))}`);
    console.log(`🛠  ${show(fixerArgs(file, '.agent-logs/review-loop/round-1.findings.json', { credits: budget.fixer }))}`);
    process.exit(0);
  }
  const report = await reviewLoop({
    file, maxRounds, creditsPerRound,
    run: (args) => {
      console.log(args.includes('reviewer') ? `🔎 the reviewer reads ${file}…` : '🛠  the fixer works on the findings…');
      return copilotRun(args);
    },
  });
  console.log(`\n${renderReport(report)}`);
  process.exit(['error', 'unreadable', 'budget'].includes(report.stop) ? 1 : 0);
}
