#!/usr/bin/env node
// 📒 postToolUse audit: one JSON line per tool call in .agent-logs/audit.jsonl. It never blocks anything.
import fs from 'node:fs';
import path from 'node:path';

try {
  const input = JSON.parse(fs.readFileSync(0, 'utf8') || 'null');
  if (input && typeof input === 'object') {
    let args = input.toolArgs ?? {};
    if (typeof args === 'string') {
      try { args = JSON.parse(args); } catch { args = { raw: args }; }
    }
    const entry = {
      at: new Date().toISOString(),
      tool: input.toolName ?? 'unknown',
      args: JSON.stringify(args).slice(0, 200),
      result: input.toolResult?.resultType ?? 'unknown',
    };
    fs.mkdirSync('.agent-logs', { recursive: true });
    fs.appendFileSync(path.join('.agent-logs', 'audit.jsonl'), `${JSON.stringify(entry)}\n`);
  }
} catch {
  // An audit hook must never break the session.
}
