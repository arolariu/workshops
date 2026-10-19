#!/usr/bin/env node
// 🕵️ userPromptSubmitted: look at the prompt before the model does, and flag what looks like an injection.
// Copilot drops this hook's output (it can't block or rewrite a prompt), so the flag works through the guard: a
// flagged session is in lockdown (no shell or write calls, except the allow rules marked "lockdown": true).
// Input: { sessionId, timestamp, cwd, prompt }. It prints nothing and never breaks the session.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { append } from './audit-chain.mjs';

const SIGNALS = [
  ['override', /\b(ignore|disregard|forget)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all|your)\b[^.\n]{0,20}\b(instructions?|rules?|prompts?|guardrails?)\b/i],
  ['role', /\byou are now\b|\bdeveloper mode\b|\bjailbr(oken|eak)\b|\bact as (an? )?(unrestricted|jailbroken|evil|uncensored)\b/i],
  ['role', /\bDAN\b/],
  ['system-prompt', /\b(reveal|print|show|repeat|output|dump)\b[^.\n]{0,40}\b(system prompt|hidden instructions|initial instructions)\b/i],
  ['hidden-characters', /[\u200B-\u200D\u2060\uFEFF\u202A-\u202E\u2066-\u2069]|[\u{E0000}-\u{E007F}]/u],
  // 100+ characters: a sha512 integrity hash (88) or a JWT segment is ordinary; a paragraph hidden in base64 isn't.
  ['encoded', /[A-Za-z0-9+/]{100,}={0,2}/],
  ['exfiltration', /\b(send|post|upload|exfiltrate|leak|forward)\b[^\n]{0,60}(https?:\/\/|webhook|pastebin)/i],
];

/** The signals a prompt shows, each once, in SIGNALS order: [] for an ordinary prompt. */
export function scanPrompt(text) {
  const found = [];
  for (const [name, re] of SIGNALS) if (re.test(String(text ?? '')) && !found.includes(name)) found.push(name);
  return found;
}

// A private key is masked from its BEGIN line to its END line: the body is the secret.
const SECRETS = [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, /\bghp_[A-Za-z0-9]{36}\b/g, /\bgithub_pat_[A-Za-z0-9_]{22,}/g, /\bAKIA[0-9A-Z]{16}\b/g, /\bsk-[A-Za-z0-9]{32,}\b/g];
const redact = (text) => SECRETS.reduce((acc, re) => acc.replace(re, '[REDACTED]'), String(text));
const safe = (id) => String(id ?? 'unknown').replace(/[^\w-]/g, '_');

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const input = JSON.parse(fs.readFileSync(0, 'utf8') || 'null');
    const signals = scanPrompt(input?.prompt);
    if (signals.length) {
      const dir = path.join('.agent-logs', 'flags');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${safe(input.sessionId)}.json`), JSON.stringify({ at: new Date().toISOString(), signals }));
      append(path.join('.agent-logs', 'audit-chain.jsonl'), { type: 'prompt-flag', at: new Date().toISOString(), session: String(input.sessionId ?? 'unknown'), signals, excerpt: redact(String(input.prompt).replace(/\s+/g, ' ')).slice(0, 120) });
    }
  } catch {
    // A prompt hook must never break the session.
  }
}
