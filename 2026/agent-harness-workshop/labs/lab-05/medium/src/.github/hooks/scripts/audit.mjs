#!/usr/bin/env node
// 📒 Audit: one JSON line per tool call in .agent-logs/audit.jsonl. Register it for postToolUse (the call succeeded:
// toolResult.resultType is "success") and postToolUseFailure (it failed: `error` says why). It never blocks anything.
import fs from 'node:fs';
import path from 'node:path';

try {
  const input = JSON.parse(fs.readFileSync(0, 'utf8') || 'null');
  if (input && typeof input === 'object') {
    let args = input.toolArgs ?? {};
    if (typeof args === 'string') {
      try { args = JSON.parse(args); } catch { args = { raw: args }; }
    }
    // TODO(M3): build { at, tool, args, result } (result: "success", or "failure" with the error when input.error
    // is there), then append it as one JSON line to .agent-logs/audit.jsonl (create the folder first).
  }
} catch {
  // An audit hook must never break the session.
}
