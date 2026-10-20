// 🛑 Free checks never start Copilot with a prompt: that would spend AI credits, and the free checks promise not to.
// run-checks installs this guard before any checks or learner code load:
//   · in-process, it wraps child_process (spawn, spawnSync, exec, execSync, execFile, execFileSync), so a call that
//     would start a Copilot session throws instead and is logged;
//   · through NODE_OPTIONS (--import of this file) every Node child process installs it too;
//   · a stub `copilot` first on PATH catches shells and other programs: it refuses a session and passes free
//     subcommands (--version, help, instruction, skill, plugin, mcp) through to the real CLI. On Windows, PATH folders
//     that hold a copilot.exe are swapped for mirrors without it (a program started by name without a shell only
//     finds .exe files, so the stub couldn't shadow it).
// run-checks fails a check whose code tried (the log, HARNESS_COPILOT_LOG, says which command). Agent checks run
// outside run-checks and are not affected.
import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
export const NO_COPILOT = 'Free checks never start Copilot with a prompt (they would spend AI credits). Use the runner the check gives your code; real runs belong in the agent check (a).';

const FREE = new Set(['help', 'version', 'instruction', 'instructions', 'skill', 'skills', 'plugin', 'plugins', 'mcp']);
const SESSION = /^(-p|--prompt|-i|--interactive|--resume|--continue)(=|$)/;
// Options that take a value, so the value isn't mistaken for the subcommand (`--plugin-dir ./p skill list`).
const WITH_VALUE = new Set(['--plugin-dir', '--add-dir', '--config-dir', '--log-dir', '--log-level', '--model', '--agent', '--allow-tool', '--deny-tool', '--available-tools', '--excluded-tools', '--additional-mcp-config', '--max-ai-credits']);

/** Would `copilot <args>` start a session (and spend credits)? Only a few listing and help commands are free. */
export function isPaidCopilot(args = []) {
  const a = args.map(String);
  if (a.some((x) => SESSION.test(x))) return true;
  if (a.length === 1 && /^(--version|-v|--help|-h)$/.test(a[0])) return false;
  for (let i = 0; i < a.length; i++) {
    if (WITH_VALUE.has(a[i])) { i++; continue; }
    if (a[i].startsWith('-')) continue;
    return !FREE.has(a[i].toLowerCase());
  }
  return true;  // a bare `copilot` starts an interactive session
}

const base = (word) => String(word ?? '').trim().replace(/^["']|["']$/g, '').split(/[\\/]/).pop().replace(/\.(exe|cmd|bat|ps1|com)$/i, '').toLowerCase();
/** Words of a shell command, quotes removed (good enough to find a command and its arguments). */
function words(s) {
  return [...String(s).matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
}
const PREFIX = new Set(['sudo', 'env', 'npx', 'call', '&', 'exec', 'command', 'time', 'nohup', 'start']);
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'cmd', 'powershell', 'pwsh']);

/** Does a shell command line start Copilot with a session anywhere (wrappers like `cmd /c "…"` and `bash -c "…"` opened)? */
export function paidInShell(command, depth = 0) {
  if (depth > 4) return false;
  return String(command).split(/&&|\|\||[;&|\n]/).some((segment) => {
    const w = words(segment);
    let i = 0;
    while (i < w.length && (PREFIX.has(base(w[i])) || /^\w+=/.test(w[i]))) i++;
    const name = base(w[i]);
    if (name === 'copilot') return isPaidCopilot(w.slice(i + 1));
    if (SHELLS.has(name)) {
      const at = w.findIndex((x, j) => j > i && /^(\/c|\/k|-c|-lc|-ec|-command)$/i.test(x));
      if (at > i) return paidInShell(w.slice(at + 1).join(' '), depth + 1);
    }
    return false;
  });
}

/** Would this child_process call start Copilot with a session? */
export function paidCall(file, args, options) {
  const list = Array.isArray(args) ? args.map(String) : [];
  if (options?.shell || typeof args === 'undefined' && /\s/.test(String(file))) return paidInShell([file, ...list].join(' '));
  if (base(file) === 'copilot') return isPaidCopilot(list);
  if (SHELLS.has(base(file))) {
    // cmd /d /s /c "^"C:\…\copilot.cmd^" -p x" (the kit) or "C:\…\copilot.cmd -p x" (process.mjs), bash -c "…",
    // powershell -Command …. cmd /s drops the outer quotes, so the command is what is inside them.
    const at = list.findIndex((x) => /^(\/c|\/k|-c|-lc|-ec|-command)$/i.test(x));
    if (at < 0) return false;
    let command = list.slice(at + 1).join(' ').replace(/\^/g, '').trim();
    if (base(file) === 'cmd' && /^".*"$/s.test(command)) command = command.slice(1, -1);
    return paidInShell(command);
  }
  return false;
}

function refuse(log, file, args) {
  try { fs.appendFileSync(log, `${JSON.stringify({ at: new Date().toISOString(), command: [file, ...(Array.isArray(args) ? args : [])].join(' ').slice(0, 300) })}\n`); } catch { /* the throw still stops it */ }
  const e = new Error(NO_COPILOT);
  e.code = 'HARNESS_NO_COPILOT';
  throw e;
}

let installed = false;
/** Wrap child_process in this process. Calls that would start a Copilot session throw (and are logged). */
export function installGuard({ log = process.env.HARNESS_COPILOT_LOG } = {}) {
  if (installed || !log) return;
  installed = true;
  const cp = childProcess;
  const wrap = (name, shellString) => {
    const original = cp[name];
    cp[name] = function guarded(file, args, options) {
      const opts = Array.isArray(args) ? options : args;
      const list = Array.isArray(args) ? args : undefined;
      const paid = shellString ? paidInShell(file) : paidCall(file, list, opts);
      if (paid) refuse(log, file, list);
      return original.apply(this, arguments);
    };
  };
  for (const name of ['spawn', 'spawnSync', 'execFile', 'execFileSync']) wrap(name, false);
  for (const name of ['exec', 'execSync']) wrap(name, true);
  syncBuiltinESMExports();
}

/** NODE_OPTIONS that carry the guard into Node child processes ('' when the guard isn't active). */
export const guardNodeOptions = (env = process.env) => (env.HARNESS_COPILOT_LOG ? `--import=${pathToFileURL(SELF).href}` : '');

/**
 * Windows only: a program started by name without a shell (CreateProcess, libuv, Python, Go …) is found as .com or
 * .exe, never as the stub copilot.cmd, so a PATH folder that holds copilot.exe/.com would let it reach the real CLI.
 * Each such folder is replaced by a mirror of its other files: hard links, else symlinks, else a .cmd shim (found by
 * shells, and by the kit, which falls back to the shell when a name isn't found).
 */
function hideCopilotExe(dir, value) {
  if (process.platform !== 'win32') return value;
  const has = (d, f) => { try { fs.lstatSync(path.join(d, f)); return true; } catch { return false; } };
  return value.split(';').map((entry, i) => {
    const d = entry.replace(/^"|"$/g, '');
    if (!d || !(has(d, 'copilot.exe') || has(d, 'copilot.com'))) return entry;
    const mirror = path.join(dir, `path-${i}`);
    fs.mkdirSync(mirror, { recursive: true });
    let names = [];
    try { names = fs.readdirSync(d); } catch { /* unreadable: leave it out entirely */ }
    for (const name of names) {
      if (/^copilot(\.|$)/i.test(name)) continue;
      const src = path.join(d, name);
      const dst = path.join(mirror, name);
      try { if (fs.lstatSync(src).isDirectory()) continue; } catch { continue; }
      try { fs.linkSync(src, dst); continue; } catch { /* App Execution Aliases and other volumes */ }
      try { fs.symlinkSync(src, dst, 'file'); continue; } catch { /* needs Developer Mode */ }
      const shim = path.join(mirror, name.replace(/\.(exe|com)$/i, '.cmd'));
      if (/\.(exe|com)$/i.test(name) && !names.some((n) => n.toLowerCase() === path.basename(shim).toLowerCase())) fs.writeFileSync(shim, `@"${src}" %*\r\n`);
    }
    return mirror;
  }).join(';');
}

/**
 * Prepare the guard for a free-check run: a stub `copilot` in `dir` (first on PATH), and the environment that points
 * at it. `real` is the real CLI (or null). Returns the variables to put into process.env.
 */
export function guardEnvironment({ dir, env = process.env, real = null }) {
  fs.mkdirSync(dir, { recursive: true });
  const log = path.join(dir, 'attempts.jsonl');
  fs.writeFileSync(log, '');
  const cmd = path.join(dir, 'copilot.cmd');
  fs.writeFileSync(cmd, `@"${process.execPath}" "${SELF}" --stub %*\r\n`);
  const sh = path.join(dir, 'copilot');
  fs.writeFileSync(sh, `#!/bin/sh\nexec "${process.execPath}" "${SELF}" --stub "$@"\n`);
  try { fs.chmodSync(sh, 0o755); } catch { /* Windows */ }
  const key = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
  const options = [env.NODE_OPTIONS, `--import=${pathToFileURL(SELF).href}`].filter(Boolean).join(' ');
  return {
    [key]: `${dir}${path.delimiter}${hideCopilotExe(dir, env[key] ?? '')}`,
    HARNESS_COPILOT: process.platform === 'win32' ? cmd : sh,
    HARNESS_COPILOT_REAL: real ?? '',
    HARNESS_COPILOT_LOG: log,
    HARNESS_NO_COPILOT: '1',
    NODE_OPTIONS: options,
  };
}

/** New attempts in the log since `offset` (bytes): [{ at, command }], and the new offset. */
export function attemptsSince(log, offset = 0) {
  let text = '';
  try { text = fs.readFileSync(log, 'utf8'); } catch { return { attempts: [], offset }; }
  const fresh = text.slice(offset).split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return { command: l }; } });
  return { attempts: fresh, offset: text.length };
}

// Loaded with --import (a Node child of a free-check run): guard this process too.
if (process.env.HARNESS_COPILOT_LOG && !process.argv.includes('--stub')) installGuard();

// The stub `copilot`: refuse a session, pass free subcommands to the real CLI.
const isMain = process.argv[1] && (() => { try { return fs.realpathSync.native(process.argv[1]) === fs.realpathSync.native(SELF); } catch { return false; } })();
if (isMain && process.argv[2] === '--stub') {
  const args = process.argv.slice(3);
  if (isPaidCopilot(args)) {
    try { fs.appendFileSync(process.env.HARNESS_COPILOT_LOG, `${JSON.stringify({ at: new Date().toISOString(), command: ['copilot', ...args].join(' ').slice(0, 300) })}\n`); } catch { /* still refused */ }
    process.stderr.write(`${NO_COPILOT}\n`);
    process.exit(97);
  }
  const real = process.env.HARNESS_COPILOT_REAL;
  if (!real) { process.stderr.write('copilot is not installed on this machine.\n'); process.exit(127); }
  // A .cmd or .bat only runs through the shell on Windows; one command string (args with a shell are deprecated).
  const q = (a) => (/^[\w\-./:=@,]+$/.test(a) ? a : `"${String(a).replace(/"/g, '""')}"`);
  const r = process.platform === 'win32' && /\.(cmd|bat)$/i.test(real)
    ? childProcess.spawnSync([`"${real}"`, ...args.map(q)].join(' '), { stdio: 'inherit', shell: true })
    : childProcess.spawnSync(real, args, { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}
