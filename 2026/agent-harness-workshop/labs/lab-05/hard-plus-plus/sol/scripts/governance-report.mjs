#!/usr/bin/env node
// 📋 The governance report: what the hooks decided, by rule and by session, from the audit chain. It checks the chain
// first, and refuses to report on one that may have been changed.
//   node scripts/governance-report.mjs                      → .agent-logs/audit-chain.jsonl
//   node scripts/governance-report.mjs path/to/chain.jsonl
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verify } from '../.github/hooks/scripts/audit-chain.mjs';

/**
 * The report for a verified chain's entries, as Markdown (the exact format is in todo.md, M5).
 * Entries: { type: 'session-start' | 'prompt-flag' | 'decision', session, … }.
 */
export function governanceReport(entries) {
  const sessions = new Map();
  const session = (id) => {
    if (!sessions.has(id)) sessions.set(id, { id, calls: 0, denials: 0, signals: null });
    return sessions.get(id);
  };
  const rules = new Map();
  const flags = [];
  for (const e of entries) {
    const s = session(e.session ?? 'unknown');
    if (e.type === 'prompt-flag') {
      s.signals = e.signals ?? [];
      flags.push(`- ${s.id} · ${(e.signals ?? []).join(', ')} · "${e.excerpt ?? ''}"`);
    } else if (e.type === 'decision') {
      s.calls++;
      if (e.decision === 'deny') {
        s.denials++;
        const key = e.rule ?? '(default)';
        const r = rules.get(key) ?? { rule: key, layer: e.layer ?? '?', severity: e.severity ?? '?', count: 0 };
        r.count++;
        rules.set(key, r);
      }
    }
  }
  const last = entries.at(-1);
  const out = ['# Governance report', '', `✅ The audit chain is intact: ${entries.length} entries, seq 1 to ${last?.seq ?? 0}.`, '', '## Denials by rule'];
  const byRule = [...rules.values()].sort((a, b) => b.count - a.count || a.rule.localeCompare(b.rule));
  if (byRule.length) out.push('| Rule | Layer | Severity | Denials |', '|---|---|---|---|', ...byRule.map((r) => `| ${r.rule} | ${r.layer} | ${r.severity} | ${r.count} |`));
  else out.push('No denials.');
  out.push('', '## Sessions');
  if (sessions.size) out.push('| Session | Calls | Denials | Flagged |', '|---|---|---|---|', ...[...sessions.values()].map((s) => `| ${s.id} | ${s.calls} | ${s.denials} | ${s.signals ? s.signals.join(', ') : 'no'} |`));
  else out.push('No sessions.');
  out.push('', '## Flagged prompts', ...(flags.length ? flags : ['No flagged prompts.']));
  return `${out.join('\n')}\n`;
}

// ---------- plumbing: you don't need to change anything below this line ----------
// Real paths on both sides: through a symlink (macOS /var), a junction or an 8.3 name the spellings differ.
const sameFile = (a, b) => { try { return fs.realpathSync.native(a) === fs.realpathSync.native(b); } catch { return false; } };
const isMain = process.argv[1] && sameFile(process.argv[1], fileURLToPath(import.meta.url));
if (isMain) {
  const file = process.argv[2] ?? path.join('.agent-logs', 'audit-chain.jsonl');
  if (!fs.existsSync(file)) {
    console.error(`${file} does not exist yet: run Copilot in this folder first (the hooks write it).`);
    process.exit(1);
  }
  const r = verify(file);
  if (!r.ok) {
    const p = r.problems[0];
    console.error(`The audit chain is broken (line ${p.line}: ${p.kind}): no report from a log that may have been changed. Run scripts/verify-audit.mjs for every problem.`);
    process.exit(2);
  }
  process.stdout.write(governanceReport(r.entries));
}
