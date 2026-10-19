#!/usr/bin/env node
// ⛓️ Check the audit chain: every hash, every link, the sequence and the head.
//   node scripts/verify-audit.mjs                       → .agent-logs/audit-chain.jsonl
//   node scripts/verify-audit.mjs path/to/chain.jsonl
// Exit 0: intact. Exit 1: missing or tampered with (each problem names its line).
import fs from 'node:fs';
import path from 'node:path';
import { verify } from '../.github/hooks/scripts/audit-chain.mjs';

const file = process.argv[2] ?? path.join('.agent-logs', 'audit-chain.jsonl');
if (!fs.existsSync(file)) {
  console.error(`${file} does not exist yet: run Copilot in this folder first (the hooks write it).`);
  process.exit(1);
}
const r = verify(file);
if (r.ok) {
  console.log(`✅ ${r.entries.length} entries, and the chain is intact.`);
} else {
  for (const p of r.problems) console.log(`❌ line ${p.line}: ${p.kind}`);
  process.exit(1);
}
