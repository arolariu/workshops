#!/usr/bin/env node
// 🎬 sessionStart: runs once when a session begins. Its additionalContext goes into the model's context, so the model
// knows the rules before its first tool call; and the chain records which policies governed this session.
// Input: { sessionId, timestamp, cwd, source: "new" | "startup" | "resume", initialPrompt }.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { append } from './audit-chain.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ORG_POLICY = process.env.HARNESS_ORG_POLICY ? path.resolve(process.env.HARNESS_ORG_POLICY) : path.join(HERE, '..', 'policies', 'org.json');
export const REPO_POLICY = path.join(HERE, '..', 'policies', 'repo.json');
// Hashed as text with LF line endings, so a Windows checkout (CRLF) and a Linux one record the same hash.
const sha = (file) => { try { return crypto.createHash('sha256').update(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')).digest('hex'); } catch { return null; } };

/** What the model should know before it starts: who governs it, and what can never be allowed. */
export function sessionContext(org) {
  // TODO(M2): a few sentences, under 1,500 characters, naming every organisation deny rule by its id.
  return '';
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    // TODO(M2): read the input, append a { type: 'session-start', at, session, source, policies: { org, repo } } entry
    // (sha(ORG_POLICY), sha(REPO_POLICY)), and print { additionalContext: sessionContext(org) }.
  } catch {
    // A session hook must never break the session.
  }
}
