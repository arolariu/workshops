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

const WRITE_TOOLS = /^(edit|create|write|apply_patch|str_replace_editor|multi_edit)$/;

// "npm install lodash", "npm i -D jest", "yarn add x", "pnpm add x" add a dependency; "npm install" and "npm ci" don't.
// "npm pkg set dependencies.x=1" edits package.json without an editor.
const addsDependency = (segment) => /\b(npm|pnpm|yarn)\s+(install|i|add)\b(\s+-\S+)*\s+[^-\s]/.test(segment) || /\bnpm\s+pkg\s+set\b/.test(segment);

// The shell can write package.json too: a redirect, tee, sed -i, or PowerShell's Set-Content / Out-File / Add-Content.
const WRITES_FILE = /^(tee|sed|truncate|mv|cp|set-content|add-content|out-file|clear-content|new-item|move-item|copy-item)$/i;
function writesPackageJson(segment) {
  if (!/package\.json/i.test(segment)) return false;
  const [cmd] = words(segment);
  return WRITES_FILE.test(cmd ?? '') || />>?\s*\S*package\.json/i.test(segment);
}

// ".env", ".env.local" or ".env.production.local" as a file name, but not ".env.example", and not "process.env".
function mentionsEnvFile(text) {
  for (const m of String(text).matchAll(/(^|[\s"'`/\\=:])\.env((?:\.[\w-]+)*)(?=$|[\s"'`/\\,;)}])/g)) {
    if (!/^\.(example|sample|template)(\.|$)/i.test(m[2] ?? '')) return true;
  }
  return false;
}

const HOOKS_PATH = /(^|[\s"'`/\\])\.github[\\/]+hooks([\\/]|\b)/;
const MODIFIES = /^(rm|mv|cp|sed|tee|truncate|chmod|chown|ln|remove-item|set-content|add-content|out-file|new-item|move-item|copy-item|rename-item|clear-content)$/i;
function changesHooks(segment) {
  if (!HOOKS_PATH.test(segment)) return false;
  const [cmd] = words(segment);
  return MODIFIES.test(cmd ?? '') || /(^|[^>])>>?\s*\S*\.github[\\/]+hooks/.test(segment);
}

// Every reason says what to do instead: the model reads it and picks its next move from it.
const NO_DEPS = 'No new dependencies: StudyBuddy is dependency-free on purpose (see AGENTS.md). Write a small helper instead, or ask the human.';
const NO_ENV = '.env files hold secrets and are off-limits for the agent. Use .env.example for the variable names instead, and ask the human for values.';
const HOOKS = 'The guardrails in .github/hooks are protected. Read them if you need to, and ask the human to change them.';

/**
 * Decide about one tool call.
 * @param {string} toolName - e.g. "bash" or "powershell" (shell), "view", "edit", "create"
 * @param {object} args - the tool's arguments
 * @returns {string | null} a reason to block the call, or null to allow it
 */
export function decide(toolName, args) {
  const text = JSON.stringify(args ?? {});
  if (SHELL_TOOLS.has(toolName)) {
    const parts = segments(args.command);
    if (parts.some(isRecursiveForceDelete)) return 'Recursive force-deletes (rm -rf, Remove-Item -Recurse) are blocked in this project. Delete specific files instead, or ask the human.';
    if (parts.some(addsDependency) || parts.some(writesPackageJson)) return NO_DEPS;
    if (parts.some(changesHooks)) return HOOKS;
  }
  if (mentionsEnvFile(text)) return NO_ENV;
  if (WRITE_TOOLS.test(toolName)) {
    if (HOOKS_PATH.test(text)) return HOOKS;
    if (/package\.json/.test(text)) return NO_DEPS;
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
