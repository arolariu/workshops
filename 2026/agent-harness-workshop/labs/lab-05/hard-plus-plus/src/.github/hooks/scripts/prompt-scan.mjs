#!/usr/bin/env node
// 🕵️ userPromptSubmitted: look at the prompt before the model does, and flag what looks like an injection.
// Copilot drops this hook's output (it can't block or rewrite a prompt), so the flag works through the guard: a
// flagged session is in lockdown (no shell or write calls, except the allow rules marked "lockdown": true).
// Input: { sessionId, timestamp, cwd, prompt }. It prints nothing and never breaks the session.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { append } from './audit-chain.mjs';

// TODO (M3): one regex per signal. The names to use: 'override', 'role', 'system-prompt', 'hidden-characters', 'encoded',
// 'exfiltration' (tests/fixtures/prompts.json has twelve prompts that should be flagged, and twelve that shouldn't).
const SIGNALS = [];

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
    // TODO (M3): read { sessionId, prompt } from stdin; when scanPrompt() finds signals, write
    // .agent-logs/flags/<sessionId>.json and append a { type: 'prompt-flag', at, session, signals, excerpt } entry.
  } catch {
    // A prompt hook must never break the session.
  }
}
