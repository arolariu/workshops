#!/usr/bin/env node
// 📊 The governance report: both repositories' session logs in one view, for the people who answer for the harness.
//   node scripts/report.mjs [--json] [<name>=<log file or folder> …]
// Default: studybuddy=audit/2026-w45.jsonl campushub=campushub/audit/2026-w45.jsonl. A log is Copilot's session
// events (`copilot -p … --output-format json`, the same lines Lab 00's run stats read), one session after another; a
// folder means every *.jsonl in it, by name. Markdown on stdout; --json prints the totals.
// Exit codes: 0 done · 2 refused (a log that is missing, or has no session in it).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitRuns } from './eval/score.mjs';

export const DEFAULT_LOGS = ['studybuddy=audit/2026-w45.jsonl', 'campushub=campushub/audit/2026-w45.jsonl'];
const DENIED = /^Denied by preToolUse hook:\s*/;
const SHELLS = new Set(['bash', 'powershell', 'shell']);

/** What one session did: { id, calls, denials: [{ tool, rule, call }], premiumRequests, tokens }. */
export function sessionOf(events) {
  const s = { id: null, calls: 0, denials: [], premiumRequests: 0, tokens: 0 };
  const started = new Map();
  let usage = null;
  for (const e of events) {
    const d = e?.data ?? {};
    if (e?.type === 'tool.execution_start') {
      s.calls++;
      started.set(d.toolCallId, { tool: String(d.toolName ?? ''), args: d.arguments ?? {} });
    } else if (e?.type === 'tool.execution_complete' && d.success === false && d.error?.code === 'denied') {
      const call = started.get(d.toolCallId) ?? { tool: '(unknown)', args: {} };
      const reason = String(d.error?.message ?? '').replace(DENIED, '');
      s.denials.push({ tool: call.tool, rule: (reason.match(/^([a-z0-9][a-z0-9-]*):\s/) ?? [])[1] ?? '(unnamed)', call: callText(call) });
    } else if (e?.type === 'session.usage_checkpoint') usage = d;
    else if (e?.type === 'result') {
      s.id = e.sessionId ? String(e.sessionId) : null;
      s.premiumRequests = Number(e.usage?.premiumRequests) || 0;
    }
  }
  for (const m of Object.values(usage?.accountingSnapshot?.modelMetrics ?? {})) s.tokens += (Number(m?.usage?.inputTokens) || 0) + (Number(m?.usage?.outputTokens) || 0);
  return s;
}

/** A call as one short line: a shell command as typed, anything else as `tool target`. */
function callText({ tool, args }) {
  const text = SHELLS.has(tool) && typeof args.command === 'string' ? args.command : `${tool} ${args.path ?? args.id ?? args.url ?? args.skill ?? JSON.stringify(args)}`;
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > 60 ? `${line.slice(0, 59)}…` : line;
}

/**
 * Everything the report shows, from logs = [{ repo, sessions: [events…] }]:
 * { repos, sessions: [{ repo, id, calls, denied, premiumRequests, tokens, rules, firstDenied }],
 *   byTool: [{ tool, counts: { repo: n }, total }], byRule: [{ rule, repo, denials }],
 *   totals: { sessions, calls, denied, premiumRequests, tokens } }
 */
export function summarize(logs) {
  const repos = logs.map((l) => l.repo);
  const sessions = [];
  const tools = new Map();
  const rules = new Map();
  for (const { repo, sessions: runs } of logs) {
    for (const events of runs) {
      const s = sessionOf(events);
      sessions.push({ repo, id: s.id, calls: s.calls, denied: s.denials.length, premiumRequests: s.premiumRequests, tokens: s.tokens, rules: [...new Set(s.denials.map((d) => d.rule))], firstDenied: s.denials[0]?.call ?? null });
      for (const e of events) {
        if (e?.type !== 'tool.execution_start') continue;
        const tool = String(e.data?.toolName ?? '');
        const row = tools.get(tool) ?? { tool, counts: Object.fromEntries(repos.map((r) => [r, 0])), total: 0 };
        row.counts[repo]++;
        row.total++;
        tools.set(tool, row);
      }
      for (const d of s.denials) {
        const key = `${d.rule}\n${repo}`;
        rules.set(key, { rule: d.rule, repo, denials: (rules.get(key)?.denials ?? 0) + 1 });
      }
    }
  }
  const sum = (k) => sessions.reduce((n, s) => n + s[k], 0);
  return {
    repos,
    sessions,
    byTool: [...tools.values()].sort((a, b) => b.total - a.total || a.tool.localeCompare(b.tool)),
    byRule: [...rules.values()].sort((a, b) => b.denials - a.denials || a.rule.localeCompare(b.rule) || a.repo.localeCompare(b.repo)),
    totals: { sessions: sessions.length, calls: sum('calls'), denied: sum('denied'), premiumRequests: sum('premiumRequests'), tokens: sum('tokens') },
  };
}

const n = (x) => x.toLocaleString('en-US');
const short = (id) => (id ? id.slice(0, 8) : '(no id)');
const plural = (k, word) => `${n(k)} ${word}${k === 1 ? '' : 's'}`;

/** The Markdown report (tests/fixtures/governance-report.golden.md for the shipped logs). */
export function render(s) {
  const t = s.totals;
  const out = ['# Governance report', '', `${n(s.repos.length)} ${s.repos.length === 1 ? 'repository' : 'repositories'} · ${plural(t.sessions, 'session')} · ${plural(t.calls, 'tool call')} · ${n(t.denied)} denied · ${plural(t.premiumRequests, 'premium request')} · ${n(t.tokens)} tokens`, ''];
  out.push('## Calls by tool');
  if (!s.byTool.length) out.push('No tool calls.');
  else out.push(`| Tool | ${s.repos.join(' | ')} | Total |`, `|---|${s.repos.map(() => '---|').join('')}---|`, ...s.byTool.map((r) => `| ${r.tool} | ${s.repos.map((repo) => r.counts[repo]).join(' | ')} | ${r.total} |`));
  out.push('', '## Denials by rule');
  if (!s.byRule.length) out.push('No denials.');
  else out.push('| Rule | Repository | Denials |', '|---|---|---|', ...s.byRule.map((r) => `| ${r.rule} | ${r.repo} | ${r.denials} |`));
  out.push('', '## Cost per session');
  if (!s.sessions.length) out.push('No sessions.');
  else {
    out.push('| Session | Repository | Calls | Denied | Premium requests | Tokens |', '|---|---|---|---|---|---|');
    for (const x of s.sessions) out.push(`| ${short(x.id)} | ${x.repo} | ${x.calls} | ${x.denied} | ${x.premiumRequests} | ${n(x.tokens)} |`);
    out.push(`| **Total** | | ${t.calls} | ${t.denied} | ${t.premiumRequests} | ${n(t.tokens)} |`);
  }
  out.push('', '## Riskiest attempts');
  const risky = s.sessions.map((x, i) => ({ ...x, i })).filter((x) => x.denied > 0).sort((a, b) => b.denied - a.denied || a.i - b.i).slice(0, 5);
  if (!risky.length) out.push('No denials, so nothing risky.');
  else risky.forEach((x, k) => out.push(`${k + 1}. \`${short(x.id)}\` (${x.repo}) · ${x.denied} denied · ${x.rules.join(', ')} · first: \`${x.firstDenied}\``));
  return `${out.join('\n')}\n`;
}

/** The --json shape: the totals, calls per tool and denials per rule over every log. */
export function totalsOf(s) {
  const byRule = {};
  for (const r of s.byRule) byRule[r.rule] = (byRule[r.rule] ?? 0) + r.denials;
  return { ...s.totals, byTool: Object.fromEntries(s.byTool.map((r) => [r.tool, r.total])), byRule };
}

// ---------- plumbing: you don't need to change anything below this line ----------
export class Refused extends Error {}

/** `name=path` arguments → [{ repo, file, sessions: [events…] }]. A folder means every *.jsonl in it, by name. */
export function readLogs(specs, cwd = process.cwd()) {
  return specs.map((spec) => {
    const m = String(spec).match(/^([\w.-]+)=(.+)$/);
    if (!m) throw new Refused(`"${spec}" is not <name>=<log file or folder>.`);
    const file = path.resolve(cwd, m[2]);
    if (!fs.existsSync(file)) throw new Refused(`No log at ${m[2]}.`);
    const files = fs.statSync(file).isDirectory() ? fs.readdirSync(file).filter((f) => f.endsWith('.jsonl')).sort().map((f) => path.join(file, f)) : [file];
    const sessions = files.flatMap((f) => splitRuns(fs.readFileSync(f, 'utf8')));
    if (!sessions.length) throw new Refused(`${m[2]} has no session in it.`);
    return { repo: m[1], file: m[2], sessions };
  });
}

export function main(argv) {
  const json = argv.includes('--json');
  const unknown = argv.filter((a) => a.startsWith('--') && a !== '--json');
  if (unknown.length) throw new Refused(`Unknown option: ${unknown.join(', ')}`);
  const specs = argv.filter((a) => !a.startsWith('--'));
  const summary = summarize(readLogs(specs.length ? specs : DEFAULT_LOGS));
  process.stdout.write(json ? `${JSON.stringify(totalsOf(summary), null, 2)}\n` : render(summary));
  return 0;
}

const sameFile = (a, b) => { try { return fs.realpathSync.native(a) === fs.realpathSync.native(b); } catch { return false; } };
if (process.argv[1] && sameFile(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    if (!(e instanceof Refused)) throw e;
    console.error(`✗ ${e.message}`);
    process.exitCode = 2;
  }
}
