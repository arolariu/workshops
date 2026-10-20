#!/usr/bin/env node
// 🔒 preToolUse guard. Copilot runs this before EVERY tool call and sends the call as JSON on stdin:
//   { "toolName": "bash", "toolArgs": "{\"command\":\"npm test\"}", "cwd": "...", ... }
// To block the call, print { "permissionDecision": "deny", "permissionDecisionReason": "..." }.
// To allow it, print nothing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SHELL_TOOLS = new Set(['bash', 'powershell', 'shell']);

// Split "cd build && rm -rf x; ls" into separate commands, and drop "sudo" / "VAR=value" prefixes.
const segments = (command) => String(command ?? '').split(/&&|\|\||[;|\n]/).map((s) => s.trim()).filter(Boolean);
const words = (segment) => {
  const list = segment.split(/\s+/);
  while (list[0] === 'sudo' || /^\w+=\S*$/.test(list[0] ?? '')) list.shift();
  return list;
};

function isRecursiveForceDelete(segment) {
  const [cmd, ...rest] = words(segment);
  if (cmd === 'rm') {
    const flags = rest.filter((x) => x.startsWith('-'));
    const short = flags.filter((f) => !f.startsWith('--')).join('');
    const recursive = /[rR]/.test(short) || flags.includes('--recursive');
    const force = /f/.test(short) || flags.includes('--force');
    return recursive && force;
  }
  if (/^remove-item$/i.test(cmd ?? '')) return rest.some((x) => /^-recurse$/i.test(x));
  return false;
}

/**
 * Decide about one tool call.
 * @param {string} toolName - e.g. "bash" or "powershell" (shell), "view", "edit", "create"
 * @param {object} args - the tool's arguments, e.g. { command: "rm -rf build" } for a shell call
 * @returns {string | null} a reason to block the call, or null to allow it
 */
export function decide(toolName, args) {
  if (SHELL_TOOLS.has(toolName)) {
    if (segments(args.command).some(isRecursiveForceDelete)) {
      return 'Recursive force-deletes (rm -rf, Remove-Item -Recurse) are blocked in this project. Delete specific files instead, or ask the human.';
    }
  }
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
// Real paths on both sides: through a symlink (macOS /var), a junction or an 8.3 name the spellings differ.
const sameFile = (a, b) => { try { return fs.realpathSync.native(a) === fs.realpathSync.native(b); } catch { return false; } };
const isMain = process.argv[1] && sameFile(process.argv[1], fileURLToPath(import.meta.url));
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
