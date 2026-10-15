#!/usr/bin/env node
// 📊 run-stats: summarise Copilot runs recorded as JSON events (one event per line).
//   node scripts/run-stats.mjs fixtures/sample-run.jsonl                summarise a recorded run
//   node scripts/run-stats.mjs --record "Which functions does grades.js export?"   record a new run first
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Summarise the lines of a recorded run. Every line is one event: { "type": "...", "data": { ... } }.
 * Blank lines are ignored; lines that are not valid JSON are counted as `skipped`.
 * @param {string[]} lines
 * @returns {{ events: number, skipped: number, byType: Record<string, number>, tools: Record<string, number>, tokens: { input: number, output: number } }}
 */
export function summarize(lines) {
  // TODO 1: count events per type, tool calls per tool name, and add up the tokens.
  return { events: 0, skipped: 0, byType: {}, tools: {}, tokens: { input: 0, output: 0 } };
}

/**
 * Arguments for a safe recording run: prompt mode, JSON events, a credit cap, and no file writes.
 * @param {string} prompt
 * @returns {string[]} e.g. ['-p', prompt, ...]
 */
export function recordArgs(prompt) {
  // TODO 2: return the copilot arguments.
  return [];
}

// ---------- you don't need to change anything below this line ----------

function runCopilot(args) {
  let r = spawnSync('copilot', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error?.code === 'ENOENT' && process.platform === 'win32') {
    const q = (a) => (/^[\w\-./:=@,]+$/.test(a) ? a : `"${a.replace(/"/g, '""')}"`);
    r = spawnSync('copilot', args.map(q), { encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024 });
  }
  return r;
}

function print(summary, file) {
  const list = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ×${v}`).join(' · ') || '-';
  console.log(`\n📊 Run summary · ${file}`);
  console.log(`   events   ${summary.events}${summary.skipped ? `  (${summary.skipped} line(s) skipped)` : ''}`);
  console.log(`   by type  ${list(summary.byType)}`);
  console.log(`   tools    ${list(summary.tools)}`);
  console.log(`   tokens   ${summary.tokens.input} in · ${summary.tokens.output} out\n`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  let file = args[0];
  if (args[0] === '--record') {
    const prompt = args.slice(1).join(' ') || 'Which functions does grades.js export? Answer in one line.';
    const runArgs = recordArgs(prompt);
    if (!runArgs.length) {
      console.error('recordArgs() returns nothing yet: finish TODO 2 first.');
      process.exit(1);
    }
    console.log(`🎬 copilot ${runArgs.join(' ')}`);
    const r = runCopilot(runArgs);
    if (r.status !== 0) {
      console.error(`copilot failed (exit ${r.status}): ${(r.stderr || r.stdout || '').trim().slice(0, 500)}`);
      process.exit(1);
    }
    fs.mkdirSync('runs', { recursive: true });
    file = path.join('runs', `run-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
    fs.writeFileSync(file, r.stdout);
  }
  if (!file) {
    console.log('Usage: node scripts/run-stats.mjs <run.jsonl>   |   node scripts/run-stats.mjs --record "<prompt>"');
    process.exit(1);
  }
  print(summarize(fs.readFileSync(file, 'utf8').split(/\r?\n/)), file);
}
