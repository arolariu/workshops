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
  // TODO(M1): find the JSON (the last ```json block, else the first "{" to the last "}"), parse it, check it.
  return { ok: false, error: 'TODO(M1): parseReview() is not written yet.' };
}

/** How bad a set of findings is: high 3, medium 2, low 1. */
export const score = (findings) => (findings ?? []).reduce((n, f) => n + (WEIGHT[f.severity] ?? 0), 0);

// ---------- M2 · Two roles, two permission sets ----------

/** Copilot arguments for the reviewer: read-only, capped, quiet, answering in JSON. */
export function reviewerArgs(file, { credits = MIN_CREDITS } = {}) {
  // TODO(M2): --agent, a -p prompt that names the file and asks for JSON_FORMAT, -s, --no-ask-user, the cap.
  return [];
}

/** Copilot arguments for the fixer: it may edit files and run npm, never push, within its cap. */
export function fixerArgs(file, findingsPath, { credits = MIN_CREDITS } = {}) {
  // TODO(M2): --agent, a -p prompt with the findings file, -s, --no-ask-user, the cap, and exactly the
  // permissions the job needs (write files, run npm), and never git push.
  return [];
}

/** Split one round's credits between its two calls. Each call needs at least MIN_CREDITS. */
export function roundBudget(creditsPerRound) {
  // TODO(M2): { reviewer, fixer }, each at least MIN_CREDITS, together at most creditsPerRound; a RangeError when
  // the round can't pay for two calls.
  return { reviewer: 0, fixer: 0 };
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
  // TODO(M3): the rounds. Each round pushes an entry to report.rounds:
  //   { round, verdict, findings, score, credits: { reviewer, fixer }, findingsFile, tests }
  // 1. roundBudget(creditsPerRound), or finish('budget', why) before any call.
  // 2. The reviewer: await run(reviewerArgs(file, { credits: … })), then parseReview() its answer.
  // 3. Stop with 'unreadable' (never hand that to the fixer), 'clean', or 'no-progress' (the score isn't lower
  //    than the round before).
  // 4. Write <dir>/round-<n>.findings.json, run the fixer on it, and record runTests().
  // 5. A call that throws stops with 'error'. After maxRounds, 'max-rounds'.
  return finish('todo', 'TODO(M3): the loop is not written yet.');
}

// ---------- M4 · The run report ----------

/** report.md: one row per round, then why the loop stopped and what it could have spent. */
export function renderReport(report) {
  // TODO(M4): a title, the table (| Round | Verdict | Findings | Score | Credits | Tests |, one row per round),
  // then "Stopped: <stop>. <reason>" and the total of the credit caps.
  return `# Review loop · ${report.file}\n\nTODO(M4)\n`;
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
  if (process.env.HARNESS_NO_COPILOT) {
    globalThis.__harnessCopilotCalls = (globalThis.__harnessCopilotCalls ?? 0) + 1;
    throw new Error('copilotRun() refused: the free checks never call Copilot. Use the run() you are given.');
  }
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
