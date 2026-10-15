#!/usr/bin/env node
// 🔁 Review → fix loop with two custom agents.
//   node scripts/review-loop.mjs deadlines.js --dry-run   show the commands
//   node scripts/review-loop.mjs deadlines.js             run it (up to 2 rounds, uses AI credits!)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Copilot arguments for the reviewer: read-only, budget-capped, quiet output.
 * @param {string} file - the file to review, e.g. "deadlines.js"
 * @returns {string[]}
 */
export function reviewerArgs(file) {
  // TODO 1
  return [];
}

/**
 * Copilot arguments for the fixer: it may edit files and run npm, but never push.
 * @param {string} file - the reviewed file
 * @param {string} reviewPath - where the review was saved, e.g. ".agent-logs/review-1.md"
 * @returns {string[]}
 */
export function fixerArgs(file, reviewPath) {
  // TODO 2
  return [];
}

/**
 * Read the reviewer's verdict. The LAST "VERDICT: CLEAN|ISSUES" line wins (case-insensitive).
 * @param {string} text
 * @returns {'CLEAN' | 'ISSUES' | 'UNKNOWN'}
 */
export function verdict(text) {
  // TODO 3
  return 'UNKNOWN';
}

// ---------- you don't need to change anything below this line ----------

function runCopilot(args) {
  let r = spawnSync('copilot', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (r.error?.code === 'ENOENT' && process.platform === 'win32') {
    const q = (a) => (/^[\w\-./:=@,]+$/.test(a) ? a : `"${a.replace(/"/g, '""')}"`);
    r = spawnSync('copilot', args.map(q), { encoding: 'utf8', shell: true, maxBuffer: 16 * 1024 * 1024 });
  }
  if (r.status !== 0) {
    console.error(`copilot failed (exit ${r.status}): ${(r.stderr || r.stdout || '').trim().slice(0, 400)}`);
    process.exit(1);
  }
  return r.stdout;
}

const show = (args) => `copilot ${args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}`;
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const file = argv.find((a) => !a.startsWith('--')) ?? 'deadlines.js';
  if (!reviewerArgs(file).length || !fixerArgs(file, 'x').length) {
    console.error('reviewerArgs() / fixerArgs() return nothing yet: finish the TODOs first.');
    process.exit(1);
  }
  if (argv.includes('--dry-run')) {
    console.log(`🔎 ${show(reviewerArgs(file))}`);
    console.log(`🛠  ${show(fixerArgs(file, '.agent-logs/review-1.md'))}`);
    process.exit(0);
  }
  fs.mkdirSync('.agent-logs', { recursive: true });
  for (let round = 1; round <= 2; round++) {
    console.log(`\n🔎 Round ${round}: the reviewer reads ${file}…`);
    const review = runCopilot(reviewerArgs(file));
    const reviewPath = `.agent-logs/review-${round}.md`;
    fs.writeFileSync(reviewPath, review);
    const v = verdict(review);
    console.log(`   verdict: ${v}  (saved to ${reviewPath})`);
    if (v === 'CLEAN') { console.log('✅ The reviewer is happy.'); break; }
    if (v === 'UNKNOWN') { console.log('🤔 No VERDICT line in the review. Check the reviewer agent.'); break; }
    console.log('🛠  The fixer works on the findings…');
    runCopilot(fixerArgs(file, reviewPath));
    const tests = spawnSync(process.execPath, ['--test'], { encoding: 'utf8' });
    console.log(tests.status === 0 ? '🧪 Tests are green.' : '🧪 Tests are red.');
  }
}
