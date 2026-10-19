#!/usr/bin/env node
// 🔒 The studybuddy-harness plugin's preToolUse guard (the Lab 05 guard, packaged).
// A plugin's hook runs from the PLUGIN's folder, not from the project. So everything about the project (where to
// log, which paths a call touches) comes from the payload's "cwd": the folder the Copilot session runs in.
//   stdin:  { "toolName": "bash", "toolArgs": { "command": "rm -rf build" }, "cwd": "/the/project", ... }
//   stdout: { "permissionDecision": "deny", "permissionDecisionReason": "..." } to block; nothing to allow.
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
  if (SHELL_TOOLS.has(toolName) && segments(args.command).some(isRecursiveForceDelete)) {
    return 'Recursive force-deletes (rm -rf, Remove-Item -Recurse) are blocked by the studybuddy-harness plugin. Delete specific files instead, or ask the human.';
  }
  return null;
}

// ---------- plumbing ----------
function readInput() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8') || 'null'); } catch { return null; }
}
/** One JSON line per decision, in the SESSION's folder (never inside the plugin). */
function log(cwd, entry) {
  try {
    const dir = path.join(cwd, '.agent-logs');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'sb-guard.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
  } catch { /* logging must never break the agent */ }
}
// Run as a script (not imported)? Compare real paths: a symlink, a junction or an 8.3 short name must not switch it off.
const isMain = (() => {
  try {
    const real = (p) => fs.realpathSync.native(p);
    const [a, b] = [real(process.argv[1]), real(fileURLToPath(import.meta.url))];
    return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
  } catch { return false; }
})();
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
  if (typeof input.cwd === 'string' && path.isAbsolute(input.cwd)) {
    log(input.cwd, { tool, decision: reason ? 'deny' : 'allow', reason: reason || undefined, args: JSON.stringify(args).slice(0, 300) });
  }
  if (reason) process.stdout.write(JSON.stringify({ permissionDecision: 'deny', permissionDecisionReason: reason }));
}