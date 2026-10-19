#!/usr/bin/env node
// 📒 Audit: one JSON line per tool call in .agent-logs/audit.jsonl. Registered for postToolUse (the call succeeded:
// toolResult.resultType is "success") and postToolUseFailure (it failed: `error` says why). It never blocks anything.
import fs from 'node:fs';
import path from 'node:path';

// A private key is masked from its BEGIN line to its END line: the body is the secret.
const SECRETS = [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, /\bghp_[A-Za-z0-9]{36}\b/g, /\bgithub_pat_[A-Za-z0-9_]{22,}/g, /\bAKIA[0-9A-Z]{16}\b/g, /\bsk-[A-Za-z0-9]{32,}\b/g];
const redact = (text) => SECRETS.reduce((acc, re) => acc.replace(re, '[REDACTED]'), String(text));

try {
  const input = JSON.parse(fs.readFileSync(0, 'utf8') || 'null');
  if (input && typeof input === 'object') {
    let args = input.toolArgs ?? {};
    if (typeof args === 'string') {
      try { args = JSON.parse(args); } catch { args = { raw: args }; }
    }
    const failed = typeof input.error === 'string' || input.toolResult?.resultType === 'failure';
    const entry = {
      at: new Date().toISOString(),
      tool: input.toolName ?? 'unknown',
      args: redact(JSON.stringify(args)).slice(0, 200),
      result: failed ? 'failure' : (input.toolResult?.resultType ?? 'unknown'),
      ...(typeof input.error === 'string' ? { error: redact(input.error).slice(0, 200) } : {}),
    };
    fs.mkdirSync('.agent-logs', { recursive: true });
    fs.appendFileSync(path.join('.agent-logs', 'audit.jsonl'), `${JSON.stringify(entry)}\n`);
  }
} catch {
  // An audit hook must never break the session.
}
