#!/usr/bin/env node
// 🧪 A/B experiment: the same prompt, with and without custom instructions.
//   node scripts/ab.mjs --dry-run          show the commands without running them
//   node scripts/ab.mjs --runs 2           run each variant twice (uses AI credits!)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROMPT = 'In 3 short bullets: what must I know before I change code in this project?';

/**
 * Arguments for one read-only, budget-capped run.
 * @param {'with' | 'without'} variant - 'without' switches off custom instructions
 * @param {string} prompt
 * @returns {string[]}
 */
export function buildArgs(variant, prompt) {
  // TODO 1
  return [];
}

/**
 * Which of the project's rules show up in one answer?
 * @param {string} answer
 * @returns {{ canary: boolean, tests: boolean, examRule: boolean }}
 */
export function score(answer) {
  // TODO 2
  return { canary: false, tests: false, examRule: false };
}

/**
 * Count runs and hits per variant.
 * @param {{ variant: 'with' | 'without', answer: string }[]} results
 * @returns {{ with: { runs: number, canary: number, tests: number, examRule: number }, without: { runs: number, canary: number, tests: number, examRule: number } }}
 */
export function summarize(results) {
  // TODO 3
  return { with: { runs: 0, canary: 0, tests: 0, examRule: 0 }, without: { runs: 0, canary: 0, tests: 0, examRule: 0 } };
}

// ---------- you don't need to change anything below this line ----------

function runCopilot(args) {
  let r = spawnSync('copilot', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (r.error?.code === 'ENOENT' && process.platform === 'win32') {
    const q = (a) => (/^[\w\-./:=@,]+$/.test(a) ? a : `"${a.replace(/"/g, '""')}"`);
    r = spawnSync('copilot', args.map(q), { encoding: 'utf8', shell: true, maxBuffer: 16 * 1024 * 1024 });
  }
  return r;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const runs = argv.includes('--runs') && Number(argv[argv.indexOf('--runs') + 1]) > 0 ? Number(argv[argv.indexOf('--runs') + 1]) : 1;
  const dry = argv.includes('--dry-run');
  const results = [];
  console.log(`\n🧪 A/B: "${PROMPT}"  (${runs} run(s) per variant)\n`);
  for (let i = 0; i < runs; i++) {
    for (const variant of ['with', 'without']) {
      const args = buildArgs(variant, PROMPT);
      if (!args.length) {
        console.error('buildArgs() returns nothing yet: finish TODO 1 first.');
        process.exit(1);
      }
      const shown = args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ');
      if (dry) {
        console.log(`   copilot ${shown}`);
        continue;
      }
      process.stdout.write(`   ⏳ ${variant.padEnd(7)} run ${i + 1}… `);
      const r = runCopilot(args);
      if (r.status !== 0) {
        console.log('❌');
        console.error((r.stderr || r.stdout || '').trim().slice(0, 400));
        process.exit(1);
      }
      results.push({ variant, answer: r.stdout.trim() });
      console.log('✅');
    }
  }
  if (dry) process.exit(0);
  const summary = summarize(results);
  fs.writeFileSync('ab-results.json', `${JSON.stringify({ prompt: PROMPT, runs, results, summary }, null, 2)}\n`);
  const row = (label, key) => `   ${label.padEnd(12)} ${`${summary.with[key]}/${summary.with.runs}`.padEnd(9)} ${summary.without[key]}/${summary.without.runs}`;
  console.log(`\n                with      without`);
  console.log(row('canary', 'canary'));
  console.log(row('test command', 'tests'));
  console.log(row('exam rule', 'examRule'));
  console.log('\n   Saved to ab-results.json\n');
}
