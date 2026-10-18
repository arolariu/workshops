// Child processes with limits: resolve programs like the shell would (including Windows .cmd shims and paths with
// spaces), capture bounded output, time out, and cancel the whole process tree with an AbortSignal.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const envGet = (env, name) => {
  if (env[name] !== undefined) return env[name];
  const key = Object.keys(env).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? env[key] : undefined;
};

function isRunnable(file, platform) {
  try {
    if (!fs.statSync(file).isFile()) return false;
    if (platform !== 'win32') fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Absolute path of `cmd` as the shell would find it on PATH (with PATHEXT on Windows), or null. */
export function resolveCommand(cmd, { env = process.env, platform = process.platform } = {}) {
  if (!cmd) return null;
  const exts = platform === 'win32' ? (envGet(env, 'PATHEXT') ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean) : [''];
  const candidates = (base) => {
    if (platform !== 'win32') return [base];
    const hasExt = exts.some((e) => base.toLowerCase().endsWith(e.toLowerCase()));
    return [...(hasExt ? [base] : []), ...exts.map((e) => base + e)];
  };
  if (path.isAbsolute(cmd) || /[\\/]/.test(cmd)) return candidates(path.resolve(cmd)).find((f) => isRunnable(f, platform)) ?? null;
  const dirs = (envGet(env, 'PATH') ?? '').split(platform === 'win32' ? ';' : ':').filter(Boolean);
  for (const dir of dirs) {
    const found = candidates(path.join(dir.replace(/^"|"$/g, ''), cmd)).find((f) => isRunnable(f, platform));
    if (found) return found;
  }
  return null;
}

// cmd.exe quoting for .cmd/.bat files (the approach used by cross-spawn): quote, then caret-escape metacharacters.
const META = /([()\][%!^"`<>&|;, *?])/g;
const escapeCmdArg = (arg, twice) => {
  let s = String(arg).replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, '$1$1');
  s = `"${s}"`.replace(META, '^$1');
  return twice ? s.replace(META, '^$1') : s;
};

/** How to start `cmd args` without a shell: { file, args, windowsVerbatimArguments, resolved } or { missing: true }. */
export function spawnSpec(cmd, args = [], { env = process.env, platform = process.platform } = {}) {
  const resolved = resolveCommand(cmd, { env, platform });
  if (!resolved) return { missing: true };
  if (platform === 'win32' && /\.(cmd|bat)$/i.test(resolved)) {
    const twice = /node_modules[\\/]\.bin[\\/][^\\/]+\.cmd$/i.test(resolved);
    const line = [resolved.replace(META, '^$1'), ...args.map((a) => escapeCmdArg(a, twice))].join(' ');
    return { file: envGet(env, 'ComSpec') || 'cmd.exe', args: ['/d', '/s', '/c', `"${line}"`], windowsVerbatimArguments: true, resolved };
  }
  return { file: resolved, args, windowsVerbatimArguments: false, resolved };
}

const live = new Set();
let exitHook = false;

/** Stop a process and everything it started. Safe to call on processes that are already gone. */
export function killTree(pid, signal = 'SIGTERM') {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true, timeout: 10000 });
    return;
  }
  try { process.kill(-pid, signal); } catch { try { process.kill(pid, signal); } catch { /* already gone */ } }
}

/**
 * Run a program to completion. Never throws. Resolves:
 * { code, signal, stdout, stderr, timedOut, cancelled, missing, error, truncated, pid, durationMs }
 */
export function runProcess(cmd, args = [], opts = {}) {
  const { cwd, env = process.env, timeout = 0, signal, input, maxOutput = 8 * 1024 * 1024, onStdout, onStderr, killGrace = 2000 } = opts;
  const started = Date.now();
  const base = { code: null, signal: null, stdout: '', stderr: '', timedOut: false, cancelled: false, missing: false, error: null, truncated: false, pid: null };
  if (signal?.aborted) return Promise.resolve({ ...base, cancelled: true, durationMs: 0 });
  const spec = spawnSpec(cmd, args, { env });
  if (spec.missing) return Promise.resolve({ ...base, missing: true, error: `\`${cmd}\` was not found on PATH.`, durationMs: 0 });

  return new Promise((resolve) => {
    const r = { ...base };
    let child;
    let settled = false;
    let timer = null;
    let graceTimer = null;
    let closeTimer = null;
    const append = (key, chunk) => {
      const text = String(chunk);
      const room = maxOutput - r[key].length;
      if (room <= 0) { r.truncated = true; return; }
      if (text.length > room) { r[key] += text.slice(0, room); r.truncated = true; } else r[key] += text;
    };
    const stop = () => {
      if (!child?.pid) return;
      killTree(child.pid, 'SIGTERM');
      if (process.platform !== 'win32') graceTimer = setTimeout(() => killTree(child.pid, 'SIGKILL'), killGrace);
    };
    const onAbort = () => { r.cancelled = true; stop(); };
    const finish = (extra = {}) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(graceTimer);
      clearTimeout(closeTimer);
      signal?.removeEventListener('abort', onAbort);
      if (child) live.delete(child);
      resolve({ ...r, ...extra, durationMs: Date.now() - started });
    };
    try {
      child = spawn(spec.file, spec.args, {
        cwd,
        env,
        stdio: [input == null ? 'ignore' : 'pipe', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
        windowsHide: true,
        windowsVerbatimArguments: spec.windowsVerbatimArguments,
      });
    } catch (e) {
      finish({ error: e.message });
      return;
    }
    r.pid = child.pid ?? null;
    live.add(child);
    if (!exitHook) {
      exitHook = true;
      process.on('exit', () => { for (const c of live) killTree(c.pid, 'SIGKILL'); });
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    if (timeout > 0) timer = setTimeout(() => { r.timedOut = true; stop(); }, timeout);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => { append('stdout', d); onStdout?.(d); });
    child.stderr.on('data', (d) => { append('stderr', d); onStderr?.(d); });
    if (input != null) { child.stdin.on('error', () => {}); child.stdin.end(input); }
    child.on('error', (e) => {
      const missingCwd = e.code === 'ENOENT' && cwd && !fs.existsSync(cwd);
      finish({ error: missingCwd ? `The folder ${cwd} does not exist.` : e.message, missing: e.code === 'ENOENT' && !missingCwd });
    });
    child.on('exit', (code, sig) => {
      r.code = code;
      r.signal = sig;
      // Descendants that kept our pipes open must not keep us waiting forever.
      if (process.platform !== 'win32') killTree(child.pid, 'SIGKILL');
      closeTimer = setTimeout(() => {
        child.stdout.destroy();
        child.stderr.destroy();
        finish();
      }, 1500);
    });
    child.on('close', () => finish());
  });
}
