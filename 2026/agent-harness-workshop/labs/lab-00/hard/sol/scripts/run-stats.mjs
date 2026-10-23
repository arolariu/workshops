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
  const calls = new Map();
  let current = null;
  let usage = null;
  const turnOf = (id) => {
    const key = String(id ?? current?.id ?? '0');
    let t = s.turns.find((x) => x.id === key);
    if (!t) s.turns.push((t = { id: key, tools: [], said: false }));
    return t;
  };
  for (const raw of lines) {
    const line = String(raw).trim();
    if (!line) continue;
    let e;
    try { e = JSON.parse(line); } catch { s.skipped++; continue; }
    if (!e || typeof e !== 'object' || Array.isArray(e)) { s.skipped++; continue; }
    s.events++;
    const type = String(e.type ?? 'unknown');
    s.byType[type] = (s.byType[type] ?? 0) + 1;
    const d = e.data ?? {};
    if (!s.model && typeof d.model === 'string' && d.model) s.model = d.model;
    switch (type) {
      case 'assistant.turn_start':
        current = turnOf(d.turnId);
        break;
      case 'assistant.message':
        if (String(d.content ?? '').trim()) turnOf(d.turnId).said = true;
        break;
      case 'tool.execution_start': {
        const step = { name: String(d.toolName ?? 'tool'), outcome: 'running' };
        turnOf(d.turnId).tools.push(step);
        calls.set(d.toolCallId, step);
        (s.tools[step.name] ??= { calls: 0, ok: 0, failed: 0, denied: 0 }).calls++;
        break;
      }
      case 'tool.execution_complete': {
        const step = calls.get(d.toolCallId);
        if (!step || step.outcome !== 'running') break;
        step.outcome = d.success ? 'ok' : d.error?.code === 'denied' ? 'denied' : 'failed';
        s.tools[step.name][step.outcome]++;
        break;
      }
      case 'session.usage_checkpoint':
        usage = d;
        break;
      case 'session.error':
        s.errors.push(String(d.message ?? d.errorType ?? 'error'));
        break;
      case 'result':
        s.exitCode = Number.isFinite(Number(e.exitCode)) ? Number(e.exitCode) : null;
        s.premiumRequests = e.usage?.premiumRequests ?? null;
        break;
      default:
        break;
    }
  }
  for (const m of Object.values(usage?.accountingSnapshot?.modelMetrics ?? {})) {
    s.tokens.input += Number(m?.usage?.inputTokens) || 0;
    s.tokens.output += Number(m?.usage?.outputTokens) || 0;
    s.tokens.cacheRead += Number(m?.usage?.cacheReadTokens) || 0;
  }
  s.outcome = s.exitCode === null ? 'incomplete' : s.exitCode !== 0 || s.errors.length ? 'failed' : 'ok';
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
  return [
    '-p', prompt, '-s',
    '--output-format', 'json',
    '--no-ask-user',
    '--max-ai-credits=30',
    '--deny-tool=write',
    '--deny-tool=shell',
    ...(model ? ['--model', model] : []),
  ];
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
    console.log(`     turn ${String(t.id).padEnd(3)} ${steps.join(' · ') || '-'}`);
  }
  console.log('');
}

// Run as a script, not imported? Compare real paths: a symlink, a junction or a short 8.3 name must still count.
const isMain = (() => {
  try { return Boolean(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
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
