#!/usr/bin/env node
// 🔒 preToolUse guard. Copilot runs this before EVERY tool call and sends the call as JSON on stdin:
//   { "toolName": "bash", "toolArgs": "{\"command\":\"npm test\"}", "cwd": "...", ... }
// To block the call, print { "permissionDecision": "deny", "permissionDecisionReason": "..." }.
// To allow it, print nothing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Decide about one tool call.
 * @param {string} toolName - e.g. "bash" or "powershell" (shell), "view", "edit", "create"
 * @param {object} args - the tool's arguments, e.g. { command: "rm -rf build" } for a shell call
 * @returns {string | null} a reason to block the call, or null to allow it
 */
export function decide(toolName, args) {
  // TODO: block recursive force-deletes (rm -rf and all its spellings, and PowerShell's Remove-Item -Recurse).
  return null;
}

// ---------- plumbing: you don't need to change anything below this line ----------
function readInput() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8') || 'null'); } catch { return null; }
}
function log(entry) {
  try {
    fs.mkdirSync('.agent-logs', { recursive: true });
    fs.appendFileSync(path.join('.agent-logs', 'guard.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
  } catch { /* logging must never break the agent */ }
}
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const input = isMain ? readInput() : null;
if (input && typeof input === 'object') {
  let args = input.toolArgs ?? {};
  if (typeof args === 'string') {
    try { args = JSON.parse(args); } catch { args = { raw: args }; }
  }
  if (!args || typeof args !== 'object') args = {};
  const tool = String(input.toolName ?? '');
  let reason;
  try {
    reason = decide(tool, args);
  } catch (e) {
    reason = `The guard crashed (${e.message}), so the call is blocked to be safe.`; // fail closed
  }
  log({ tool, decision: reason ? 'deny' : 'allow', reason: reason || undefined, args: JSON.stringify(args).slice(0, 300) });
  if (reason) process.stdout.write(JSON.stringify({ permissionDecision: 'deny', permissionDecisionReason: reason }));
}
