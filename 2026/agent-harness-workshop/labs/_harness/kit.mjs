// The check kit: small helpers every exercise's tests/checks.mjs uses.
// A check returns true/undefined (pass), a string (fail, shown to the student) or throws CheckFail.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export class CheckFail extends Error {}

// ---------- YAML (the subset used by frontmatter, apm.yml and agentic workflows) ----------
function stripComment(line) {
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === q) q = null;
    } else if (ch === '"' || ch === "'") q = ch;
    else if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}
function splitFlow(s) {
  const parts = [];
  let depth = 0, q = null, cur = '';
  for (const ch of s) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === '[' || ch === '{') depth++;
    if (ch === ']' || ch === '}') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim());
}
const unquote = (s) => {
  s = s.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
  return s;
};
function scalar(v) {
  v = v.trim();
  if (v.startsWith('[') && v.endsWith(']')) return splitFlow(v.slice(1, -1)).map(scalar);
  if (v.startsWith('{') && v.endsWith('}')) {
    const o = {};
    for (const part of splitFlow(v.slice(1, -1))) {
      const m = part.match(/^("[^"]*"|'[^']*'|[^:]+?)\s*:\s*(.*)$/);
      if (m) o[unquote(m[1])] = scalar(m[2]);
    }
    return o;
  }
  if (/^(["']).*\1$/.test(v)) return v.slice(1, -1);
  if (/^(true|yes|on)$/i.test(v) && !/^on$/i.test(v)) return true;
  if (/^(true)$/i.test(v)) return true;
  if (/^(false|no)$/i.test(v)) return false;
  if (/^(null|~)$/i.test(v) || v === '') return null;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}
export function parseYaml(src) {
  const lines = [];
  for (const raw of String(src).replace(/\r/g, '').replace(/\t/g, '  ').split('\n')) {
    const s = stripComment(raw);
    if (!s.trim() || /^---\s*$/.test(s)) continue;
    lines.push({ indent: s.match(/^ */)[0].length, text: s.trim() });
  }
  let i = 0;
  const isItem = (l) => l.text === '-' || l.text.startsWith('- ');
  const isKey = (t) => /^("[^"]*"|'[^']*'|[^\s"'\[{][^:]*?)\s*:(\s|$)/.test(t);
  function block(indent) {
    return isItem(lines[i]) ? list(indent) : map(indent);
  }
  function map(indent) {
    const obj = {};
    while (i < lines.length && lines[i].indent === indent && !isItem(lines[i])) {
      const m = lines[i].text.match(/^("[^"]*"|'[^']*'|[^:]+?)\s*:(?:\s+(.*))?$/);
      if (!m) throw new Error(`cannot read the line "${lines[i].text}"`);
      const key = unquote(m[1]);
      const rest = m[2] ?? '';
      i++;
      if (rest === '') {
        if (i < lines.length && lines[i].indent > indent) obj[key] = block(lines[i].indent);
        else if (i < lines.length && lines[i].indent === indent && isItem(lines[i])) obj[key] = list(indent);
        else obj[key] = null;
      } else if (/^[|>][-+]?$/.test(rest)) {
        const parts = [];
        while (i < lines.length && lines[i].indent > indent) parts.push(lines[i++].text);
        obj[key] = parts.join(rest.startsWith('|') ? '\n' : ' ');
      } else obj[key] = scalar(rest);
    }
    return obj;
  }
  function list(indent) {
    const arr = [];
    while (i < lines.length && lines[i].indent === indent && isItem(lines[i])) {
      const content = lines[i].text === '-' ? '' : lines[i].text.slice(2).trim();
      if (!content) {
        i++;
        arr.push(i < lines.length && lines[i].indent > indent ? block(lines[i].indent) : null);
      } else if (isKey(content)) {
        lines[i] = { indent: indent + 2, text: content };
        arr.push(map(indent + 2));
      } else {
        arr.push(scalar(content));
        i++;
      }
    }
    return arr;
  }
  if (!lines.length) return {};
  return block(lines[0].indent);
}

export function parseFrontmatter(text) {
  const s = String(text).replace(/^\uFEFF/, '').replace(/\r/g, '');
  const m = s.match(/^---\n([\s\S]*?)\n---\s*(?:\n|$)([\s\S]*)$/);
  if (!m) return null;
  return { data: parseYaml(m[1]) ?? {}, body: m[2], raw: m[1] };
}

// ---------- globs (for applyTo) ----------
export function globToRegExp(glob) {
  let re = '';
  const g = glob.trim().replace(/^\.\//, '');
  for (let i = 0; i < g.length; i++) {
    const ch = g[i];
    if (ch === '*') {
      if (g[i + 1] === '*') {
        if (g[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
      } else re += '[^/]*';
    } else if (ch === '?') re += '[^/]';
    else if (ch === '{' && g.indexOf('}', i) > i) {
      const end = g.indexOf('}', i);
      re += `(?:${g.slice(i + 1, end).split(',').map((p) => p.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')).join('|')})`;
      i = end;
    } else re += ch.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}
export function applyToMatches(applyTo, file) {
  const split = (str) => {
    const parts = [];
    let depth = 0, cur = '';
    for (const ch of String(str)) {
      if (ch === '{') depth++;
      if (ch === '}') depth--;
      if (ch === ',' && depth <= 0) { parts.push(cur); cur = ''; } else cur += ch;
    }
    parts.push(cur);
    return parts;
  };
  const patterns = (Array.isArray(applyTo) ? applyTo : split(applyTo ?? '')).map((p) => String(p).trim()).filter(Boolean);
  return patterns.some((p) => globToRegExp(p).test(file));
}

// ---------- processes ----------
const winQuote = (a) => (/^[\w\-./:=@,]+$/.test(a) ? a : `"${String(a).replace(/"/g, '""')}"`);
export function spawnCompat(cmd, args, opts = {}) {
  let r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (r.error && r.error.code === 'ENOENT' && process.platform === 'win32') {
    r = spawnSync(cmd, args.map(winQuote), { encoding: 'utf8', ...opts, shell: true });
    if (r.status === 9009 || /is not recognized/.test(r.stderr ?? '')) r.error = Object.assign(new Error('not found'), { code: 'ENOENT' });
  }
  return r;
}
const existsCache = new Map();
export function commandExists(cmd) {
  if (!existsCache.has(cmd)) {
    const r = spawnCompat(cmd, ['--version'], { timeout: 20000 });
    existsCache.set(cmd, !(r.error && r.error.code === 'ENOENT'));
  }
  return existsCache.get(cmd);
}
export const copilotBin = () => process.env.HARNESS_COPILOT || 'copilot';

export function runCopilot(args, { cwd, timeout = 90000, env } = {}) {
  const r = spawnCompat(copilotBin(), args, { cwd, timeout, env: { ...process.env, ...env } });
  if (r.error && r.error.code === 'ENOENT') {
    throw new CheckFail('GitHub Copilot CLI is not installed (or not on PATH). Install it: npm install -g @github/copilot');
  }
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', timedOut: r.error?.code === 'ETIMEDOUT', all: `${r.stdout ?? ''}\n${r.stderr ?? ''}` };
}

export const TRUST_HINT = 'Copilot only loads project MCP servers, hooks and agents from folders you trust. Run `copilot` once in the workshop root folder and choose "Yes, and remember this folder", then try again.';

// ---------- folder trust (read from Copilot's own config, never written) ----------
export const copilotHome = () => process.env.COPILOT_HOME || path.join(os.homedir(), '.copilot');
export function trustedFolders() {
  let found = null;
  for (const f of ['config.json', 'settings.json']) {
    try {
      const raw = fs.readFileSync(path.join(copilotHome(), f), 'utf8');
      const json = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, ''));
      found = found ?? [];
      if (Array.isArray(json.trustedFolders)) found.push(...json.trustedFolders);
    } catch { /* missing or unreadable */ }
  }
  return found; // null = unknown
}
export function isTrusted(dir) {
  const list = trustedFolders();
  if (list === null) return null;
  const norm = (p) => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p));
  const d = norm(dir);
  return list.some((f) => {
    const r = path.relative(norm(f), d);
    return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
  });
}

// ---------- MCP client (JSON-RPC over stdio) ----------
export async function mcpClient({ command, args = [], env = {}, cwd }) {
  const bin = command === 'node' ? process.execPath : command;
  const child = spawn(bin, args, { cwd, env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '';
  let stderr = '';
  let exitInfo = null;
  const pending = new Map();
  let nextId = 1;
  child.on('error', (e) => { exitInfo = `could not start: ${e.message}`; for (const [, fn] of pending) fn(null); });
  child.on('exit', (code) => { exitInfo = exitInfo ?? `exited with code ${code}`; for (const [, fn] of pending) fn(null); pending.clear(); });
  child.stderr.on('data', (d) => (stderr += d));
  child.stdout.on('data', (d) => {
    buf += d;
    let n;
    while ((n = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, n).trim();
      buf = buf.slice(n + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.id != null && pending.has(msg.id)) { const fn = pending.get(msg.id); pending.delete(msg.id); fn(msg); }
    }
  });
  const why = () => `${exitInfo ? ` The server ${exitInfo}.` : ''}${stderr.trim() ? ` It said: ${stderr.trim().split('\n').slice(-3).join(' | ').slice(0, 300)}` : ''}`;
  function request(method, params, timeout = 8000) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new CheckFail(`The MCP server did not answer "${method}" within ${timeout / 1000}s.${why()}`)); }, timeout);
      pending.set(id, (msg) => {
        clearTimeout(timer);
        if (!msg) reject(new CheckFail(`The MCP server stopped before answering "${method}".${why()}`));
        else resolve(msg);
      });
      try { child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`); } catch { /* reported by exit */ }
    });
  }
  const init = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'harness-check', version: '1.0.0' } });
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  return {
    init: init.result,
    async tools() {
      const r = await request('tools/list', {});
      if (r.error) throw new CheckFail(`tools/list failed: ${r.error.message}`);
      return r.result?.tools ?? [];
    },
    async call(name, args = {}) {
      const r = await request('tools/call', { name, arguments: args });
      if (r.error) return { isError: true, rpcError: r.error, text: r.error.message ?? '', data: null };
      const res = r.result ?? {};
      const text = (res.content ?? []).map((c) => c.text ?? '').join('\n');
      let data = null;
      try { data = JSON.parse(text); } catch { /* plain text */ }
      return { ...res, isError: Boolean(res.isError), text, data };
    },
    close() { try { child.kill(); } catch { /* already gone */ } },
    get stderr() { return stderr; },
  };
}

// ---------- the per-target kit ----------
const SKIP_DIRS = new Set(['node_modules', '.git', '.agent-logs']);
export function listFiles(root, rel = '.') {
  const out = [];
  const walk = (abs, relp, depth) => {
    if (depth > 8 || !fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      if (SKIP_DIRS.has(e.name)) continue;
      const r = relp === '.' ? e.name : `${relp}/${e.name}`;
      if (e.isDirectory()) walk(path.join(abs, e.name), r, depth + 1);
      else out.push(r);
    }
  };
  walk(path.join(root, rel), rel === '.' ? '.' : rel.replace(/\\/g, '/'), 0);
  return out;
}

export function makeKit({ dir, exDir }) {
  const solDir = path.join(exDir, 'sol');
  const P = (rel) => path.join(dir, rel);
  const norm = (s) => (s == null ? s : s.replace(/\r\n/g, '\n'));
  const t = {
    dir,
    exDir,
    solDir,
    CheckFail,
    path: P,
    check: (name, run, opts = {}) => ({ name, run, ...opts }),
    fail: (msg) => { throw new CheckFail(msg); },
    ok: (cond, msg) => { if (!cond) throw new CheckFail(msg); return true; },
    exists: (rel) => fs.existsSync(P(rel)),
    read: (rel) => { try { return norm(fs.readFileSync(P(rel), 'utf8')); } catch { return null; } },
    need(rel, hint) {
      const s = t.read(rel);
      if (s == null) throw new CheckFail(hint ?? `\`${rel}\` doesn't exist yet.`);
      return s;
    },
    json(rel, hint) {
      const s = t.need(rel, hint);
      try { return JSON.parse(s); } catch (e) { throw new CheckFail(`\`${rel}\` is not valid JSON: ${e.message}`); }
    },
    yaml(rel, hint) {
      const s = t.need(rel, hint);
      try { return parseYaml(s); } catch (e) { throw new CheckFail(`\`${rel}\` is not valid YAML: ${e.message}`); }
    },
    frontmatter(rel, hint) {
      const s = t.need(rel, hint);
      let fm;
      try { fm = parseFrontmatter(s); } catch (e) { throw new CheckFail(`The frontmatter of \`${rel}\` is not valid YAML: ${e.message}`); }
      if (!fm) throw new CheckFail(`\`${rel}\` needs a YAML frontmatter block at the very top (between two \`---\` lines).`);
      return fm;
    },
    files: (rel = '.') => listFiles(dir, rel),
    find: (re, rel = '.') => listFiles(dir, rel).filter((f) => re.test(f)),
    sol: (rel) => { try { return norm(fs.readFileSync(path.join(solDir, rel), 'utf8')); } catch { return null; } },
    unchanged(rel) {
      const now = t.read(rel);
      const orig = t.sol(rel);
      return now != null && orig != null && now.trim() === orig.trim();
    },
    async import(rel) {
      const file = P(rel);
      if (!fs.existsSync(file)) throw new CheckFail(`\`${rel}\` doesn't exist yet.`);
      try {
        return await import(`${pathToFileURL(file).href}?v=${Date.now()}${Math.random()}`);
      } catch (e) {
        throw new CheckFail(`\`${rel}\` could not be loaded: ${e.message.split('\n')[0]}`);
      }
    },
    node(args, opts = {}) {
      const r = spawnSync(process.execPath, args, { cwd: opts.cwd ?? dir, input: opts.input, env: { ...process.env, ...(opts.env ?? {}) }, encoding: 'utf8', timeout: opts.timeout ?? 20000 });
      return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', all: `${r.stdout ?? ''}\n${r.stderr ?? ''}` };
    },
    unitTests(opts = {}) {
      const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...(opts.files ?? [])], { cwd: opts.cwd ?? dir, encoding: 'utf8', timeout: 90000, env: { ...process.env, NODE_OPTIONS: '' } });
      const out = r.stdout ?? '';
      const num = (k) => Number((out.match(new RegExp(`^# ${k} (\\d+)`, 'm')) ?? [])[1] ?? 0);
      const failing = [...out.matchAll(/^\s*not ok \d+ - (.*)$/gm)].map((m) => m[1].trim()).filter((n) => !/\.(m?js|cjs)$/.test(n));
      const passing = [...out.matchAll(/^\s*ok \d+ - (.*)$/gm)].map((m) => m[1].trim()).filter((n) => !/\.(m?js|cjs)$/.test(n));
      return { pass: num('pass'), fail: num('fail'), total: num('tests'), failing, passing, output: out + (r.stderr ?? '') };
    },
    copilot: (args, opts = {}) => runCopilot(args, { cwd: dir, ...opts }),
    globs: { applyToMatches, globToRegExp },
    trusted: () => isTrusted(dir),
    needTrust() {
      if (isTrusted(dir) === false) throw new CheckFail(TRUST_HINT);
      return true;
    },
    mcp: (cfg) => mcpClient({ cwd: dir, ...cfg }),
    hook(script, payload = {}, opts = {}) {
      const cwd = opts.cwd ?? t.tmp();
      const input = payload.raw ?? JSON.stringify({
        sessionId: 'harness-check',
        timestamp: Date.now(),
        cwd,
        toolName: payload.toolName,
        toolArgs: typeof payload.toolArgs === 'string' ? payload.toolArgs : JSON.stringify(payload.toolArgs ?? {}),
        ...(payload.toolResult ? { toolResult: payload.toolResult } : {}),
      });
      const scriptPath = path.isAbsolute(script) ? script : P(script);
      if (!fs.existsSync(scriptPath)) throw new CheckFail(`\`${script}\` doesn't exist yet.`);
      const r = spawnSync(process.execPath, [scriptPath], { cwd, input, encoding: 'utf8', timeout: opts.timeout ?? 15000, env: { ...process.env, ...(opts.env ?? {}) } });
      const text = (r.stdout ?? '').trim();
      let out = null;
      if (text) {
        try { out = JSON.parse(text.split('\n').filter(Boolean).pop()); } catch { out = { invalid: text }; }
      }
      return {
        code: r.status,
        stdout: r.stdout ?? '',
        stderr: r.stderr ?? '',
        out,
        cwd,
        decision: out?.permissionDecision ?? (out?.invalid ? 'invalid' : 'allow'),
        reason: out?.permissionDecisionReason ?? '',
      };
    },
    async loadExtension(rel) {
      globalThis.__fakeCopilot = null;
      await t.import(rel);
      const state = globalThis.__fakeCopilot;
      if (!state) throw new CheckFail(`\`${rel}\` never called joinSession() - the extension must join the session.`);
      return {
        ...state,
        command: (name) => state.commands.find((c) => c.name === name || c.name === `/${name}`),
        async run(name, args = '') {
          const cmd = state.commands.find((c) => c.name === name || c.name === `/${name}`);
          if (!cmd) throw new CheckFail(`The extension has no /${name} command yet.`);
          state.logs.length = 0;
          await cmd.handler({ sessionId: 'harness-check', command: `/${name}${args ? ` ${args}` : ''}`, commandName: name, args });
          return state.logs.map((l) => l.msg).join('\n');
        },
        async emit(event, data) {
          for (const fn of state.listeners[event] ?? []) await fn({ type: event, data });
          for (const fn of state.listeners['*'] ?? []) await fn({ type: event, data });
        },
      };
    },
    tmp() {
      return fs.mkdtempSync(path.join(os.tmpdir(), 'harness-'));
    },
    copy(dest) {
      fs.cpSync(dir, dest, { recursive: true, filter: (src) => !/[\\/](node_modules|\.git|\.agent-logs)([\\/]|$)/.test(path.relative(dir, src) ? `/${path.relative(dir, src)}` : '') });
      return dest;
    },
  };
  return t;
}
