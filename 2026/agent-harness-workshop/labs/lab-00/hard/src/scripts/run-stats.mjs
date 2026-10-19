#!/usr/bin/env node
// 📊 run-stats: what happened in a Copilot run, from its JSON events (`copilot -p … --output-format json`, one event
// per line): event types, tools and their success rate, tokens, the outcome, and a timeline per turn.
//   node scripts/run-stats.mjs fixtures/denied.jsonl [more.jsonl …]      summarise recorded runs
//   node scripts/run-stats.mjs --record "Which functions does grades.js export?"   record a new run first
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Summarise the lines of a recorded run. Each line is one event: { type, data, id, timestamp, parentId }, except the
 * last one, `result`, which is flat: { type, sessionId, exitCode, usage: { premiumRequests, … } }.
 * Blank lines are ignored; lines that are not JSON are counted as `skipped`.
 * @param {string[]} lines
 */
export function summarize(lines) {
  const s = {
    events: 0, skipped: 0, byType: {}, model: null,
    tools: {}, turns: [],
    tokens: { input: 0, output: 0, cacheRead: 0 },
    premiumRequests: null, exitCode: null, errors: [], outcome: 'incomplete',
  };
  // TODO(M1): for each line: skip blank ones, JSON.parse the rest (a line that doesn't parse is `skipped`), count
  //           `events` and `byType[type]`, and keep the first `data.model` you see as `model`.
  // TODO(M2): tool.execution_start → s.tools[toolName].calls; tool.execution_complete (same toolCallId) → ok, denied
  //           (success false, error.code "denied") or failed (success false, any other code).
  // TODO(M3): s.turns: one { id, tools: [{ name, outcome }], said } per turnId (assistant.turn_start, and the turnId
  //           of the tool events); tokens from the LAST session.usage_checkpoint (data.accountingSnapshot.modelMetrics,
  //           summed over models); premiumRequests and exitCode from `result`; errors from session.error; outcome.
  return s;
}

/**
 * Arguments for a recording run: prompt mode, JSON events, never waits for a human, read-only (no file tools that
 * write, no shell), and a credit cap.
 * @param {string} prompt
 * @param {{ model?: string }} [options]
 * @returns {string[]}
 */
export function recordArgs(prompt, { model } = {}) {
  // TODO(M5): return the copilot arguments, e.g. ['-p', prompt, '-s', '--output-format', 'json', …].
  return [];
}

// ---------- plumbing: you don't need to change anything below this line ----------

function runCopilot(args) {
  let r = spawnSync('copilot', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error?.code === 'ENOENT' && process.platform === 'win32') {
    const q = (a) => (/^[\w\-./:=@,]+$/.test(a) ? a : `"${a.replace(/"/g, '""')}"`);
    r = spawnSync('copilot', args.map(q), { encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024 });
  }
  return r;
}

const ICON = { ok: '🔧', denied: '⛔', failed: '❌', running: '⏳' };
const MARK = { ok: ' ✓', denied: ' (denied)', failed: ' (failed)', running: ' (never finished)' };
function print(s, file) {
  const list = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ×${v}`).join(' · ') || '-';
  const tools = Object.entries(s.tools).map(([name, t]) => {
    const extra = [t.denied && `${t.denied} denied`, t.failed && `${t.failed} failed`].filter(Boolean).join(', ');
    return `${name} ${t.ok}/${t.calls} ok${extra ? ` (${extra})` : ''}`;
  }).join(' · ') || '-';
  const exit = s.exitCode === null ? 'no result event' : `exit ${s.exitCode}`;
  const paid = s.premiumRequests == null ? '' : ` · ${s.premiumRequests} premium request(s)`;
  console.log(`\n📊 Run summary · ${file}`);
  console.log(`   events    ${s.events}${s.skipped ? `  (${s.skipped} line(s) skipped)` : ''}`);
  console.log(`   by type   ${list(s.byType)}`);
  console.log(`   model     ${s.model ?? '-'}`);
  console.log(`   tools     ${tools}`);
  console.log(`   tokens    ${s.tokens.input} in · ${s.tokens.output} out · ${s.tokens.cacheRead} cached`);
  console.log(`   outcome   ${s.outcome} · ${exit}${paid}${s.errors.length ? ` · ${s.errors[0]}` : ''}`);
  console.log('   timeline');
  for (const t of s.turns) {
    const steps = t.tools.map((x) => `${ICON[x.outcome] ?? '🔧'} ${x.name}${MARK[x.outcome] ?? ''}`);
    if (t.said) steps.push('💬');
    console.log(`     turn ${t.id.padEnd(3)} ${steps.join(' · ') || '-'}`);
  }
  console.log('');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  let files = args;
  if (args[0] === '--record') {
    const prompt = args.slice(1).join(' ') || 'Which functions does grades.js export? Answer in one line.';
    const runArgs = recordArgs(prompt);
    if (!runArgs.length) {
      console.error('recordArgs() returns nothing yet: finish M5 first.');
      process.exit(1);
    }
    console.log(`🎬 copilot ${runArgs.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}`);
    const r = runCopilot(runArgs);
    if (r.status !== 0 && !String(r.stdout ?? '').trim()) {
      console.error(`copilot failed (exit ${r.status}): ${(r.stderr || '').trim().slice(0, 500)}`);
      process.exit(1);
    }
    fs.mkdirSync('runs', { recursive: true });
    const file = path.join('runs', `run-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
    fs.writeFileSync(file, r.stdout);
    files = [file];
  }
  if (!files.length) {
    console.log('Usage: node scripts/run-stats.mjs <run.jsonl> [more.jsonl …]   |   node scripts/run-stats.mjs --record "<prompt>"');
    process.exit(1);
  }
  for (const file of files) {
    if (!fs.existsSync(file)) {
      console.error(`${file} does not exist.`);
      process.exit(1);
    }
    print(summarize(fs.readFileSync(file, 'utf8').split(/\r?\n/)), file);
  }
}
