#!/usr/bin/env node
// 📊 What did the agent do? Reads the guard's log (.agent-logs/guard.jsonl: one line per tool call the guard saw, with
// its decision) and reports the calls per tool and every denial.
//   node scripts/audit-report.mjs                      → reads .agent-logs/guard.jsonl
//   node scripts/audit-report.mjs path/to/guard.jsonl
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Summarise the guard's log lines.
 * @param {string[]} lines - the lines of guard.jsonl: { at, tool, decision: "allow" | "deny", reason?, args }
 * @returns {{ calls: number, unreadable: number, perTool: { tool: string, calls: number, denied: number }[],
 *             denials: { at: string, tool: string, reason: string }[] }}
 *   perTool: most calls first (then by tool name); denials: in log order. Skip blank lines; count broken ones as unreadable.
 */
export function summarize(lines) {
  const tools = new Map();
  const denials = [];
  let calls = 0;
  let unreadable = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    let e;
    try { e = JSON.parse(line); } catch { unreadable++; continue; }
    if (!e || typeof e !== 'object' || typeof e.tool !== 'string') { unreadable++; continue; }
    calls++;
    const t = tools.get(e.tool) ?? { tool: e.tool, calls: 0, denied: 0 };
    t.calls++;
    if (e.decision === 'deny') {
      t.denied++;
      denials.push({ at: String(e.at ?? ''), tool: e.tool, reason: String(e.reason ?? '') });
    }
    tools.set(e.tool, t);
  }
  const perTool = [...tools.values()].sort((a, b) => b.calls - a.calls || a.tool.localeCompare(b.tool));
  return { calls, unreadable, perTool, denials };
}

// ---------- plumbing: you don't need to change anything below this line ----------
export function markdown(s) {
  const out = [`# Agent activity: ${s.calls} call${s.calls === 1 ? '' : 's'}${s.unreadable ? ` (${s.unreadable} unreadable line${s.unreadable === 1 ? '' : 's'} skipped)` : ''}`, '', '| Tool | Calls | Denied |', '|---|---|---|'];
  for (const t of s.perTool) out.push(`| ${t.tool} | ${t.calls} | ${t.denied} |`);
  out.push('', '## Denials');
  if (!s.denials.length) out.push('No denials.');
  for (const d of s.denials) out.push(`- ${d.at} · ${d.tool} · ${d.reason}`);
  return `${out.join('\n')}\n`;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const file = process.argv[2] ?? path.join('.agent-logs', 'guard.jsonl');
  if (!fs.existsSync(file)) {
    console.error(`${file} does not exist yet: run Copilot in this folder first (the guard writes it).`);
    process.exit(1);
  }
  process.stdout.write(markdown(summarize(fs.readFileSync(file, 'utf8').split(/\r?\n/))));
}
