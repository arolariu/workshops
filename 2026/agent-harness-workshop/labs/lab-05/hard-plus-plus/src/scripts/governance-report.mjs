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
  // TODO(M5): count decisions and denials per session, denials per rule, and collect the flagged prompts; then build
  // the Markdown exactly as todo.md shows it (tests/fixtures/governance-report.golden.md is the expected output).
  return '';
}

// ---------- plumbing: you don't need to change anything below this line ----------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
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
