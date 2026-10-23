// Helpers for the Lab 08 · hard+ checks: harness files, Actions and CODEOWNERS patterns, workflow steps, and
// throwaway git repositories with a fixed configuration (no global or system git config, no network).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter, parseYaml } from '../../../_harness/kit.mjs';

export { parseYaml };

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SCORECARD = path.resolve(HERE, '../../../_harness/scorecard.mjs');
export { gatesHarness, maturity, scanHarness, scorecard } from '../../../_harness/scorecard.mjs';
export const norm = (s) => String(s ?? '').replace(/\r\n/g, '\n');
export const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
export const SHA40 = /@[0-9a-f]{40}$/;
export const tail = (s, n = 6) => norm(s).trim().split('\n').slice(-n).join(' ⏎ ');
export const some = (list, n = 6) => `${list.slice(0, n).join(', ')}${list.length > n ? ` and ${list.length - n} more` : ''}`;

/** The next version, from the semver rules (the checks' own, to judge yours). */
export function nextVersion(v, part) {
  const [ma, mi, pa] = String(v).split(/[-+]/)[0].split('.').map(Number);
  return part === 'major' ? `${ma + 1}.0.0` : part === 'minor' ? `${ma}.${mi + 1}.0` : `${ma}.${mi}.${pa + 1}`;
}

// ---------- the harness files of a folder ----------
const SKIP = new Set(['node_modules', '.git', '.agent-logs', 'dist', 'apm_modules']);
export function walk(dir, rel = '') {
  const out = [];
  for (const e of fs.existsSync(path.join(dir, rel)) ? fs.readdirSync(path.join(dir, rel), { withFileTypes: true }) : []) {
    if (SKIP.has(e.name)) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(dir, r));
    else out.push(r);
  }
  return out.sort();
}
/** Files a change to which is a change to the harness (the course's harness paths, plus the version file). */
export const isHarnessFile = (f) => /(^|\/)AGENTS\.md$/.test(f) || /\.instructions\.md$/.test(f) || f === 'HARNESS.md' || f === 'harness.json'
  || f.startsWith('.github/') || f === '.mcp.json' || /^mcp\//.test(f) || f === 'apm.yml' || f === 'apm.lock.yaml'
  || /^scripts\//.test(f) || (/^evals\//.test(f) && !/^evals\/reports\//.test(f)) || /^attacks\//.test(f) || f === 'attacks.local.json';
export const harnessFiles = (dir) => walk(dir).filter((f) => isHarnessFile(f) && f !== 'mcp/state.json');

// ---------- GitHub Actions path filters ----------
/** An Actions filter pattern as a RegExp: `*` stays in a folder, `**` crosses folders. */
export function actionsGlob(glob) {
  let re = '';
  const g = String(glob).replace(/^\.\//, '');
  for (let i = 0; i < g.length; i++) {
    const ch = g[i];
    if (ch === '*' && g[i + 1] === '*') { re += g[i + 2] === '/' ? '(?:.*/)?' : '.*'; i += g[i + 2] === '/' ? 2 : 1; }
    else if (ch === '*') re += '[^/]*';
    else if (ch === '?') re += '[^/]';
    else re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}
/** Would a change to `file` start a run, given an event's `paths` / `paths-ignore`? */
export function triggers(event, file) {
  const e = event && typeof event === 'object' ? event : {};
  const list = (v) => (v == null ? null : (Array.isArray(v) ? v : [v]).map(String));
  const paths = list(e.paths);
  const ignored = list(e['paths-ignore']);
  if (paths) {
    let hit = false;
    for (const p of paths) if (p.startsWith('!')) { if (actionsGlob(p.slice(1)).test(file)) hit = false; } else if (actionsGlob(p).test(file)) hit = true;
    return hit;
  }
  if (ignored) return !ignored.some((p) => actionsGlob(p).test(file));
  return true;
}
/** The `on:` block as an object of events. */
export function eventsOf(on) {
  if (typeof on === 'string') return { [on]: null };
  if (Array.isArray(on)) return Object.fromEntries(on.map((e) => [String(e), null]));
  return on && typeof on === 'object' ? on : {};
}

// ---------- workflow steps ----------
const IDLE_IF = /^\s*(\$\{\{\s*)?(always\(\)|success\(\)|!\s*cancelled\(\))(\s*\}\})?\s*$/;
/** Does this `if:` actually restrict when something runs? */
export const restricts = (c) => c != null && !IDLE_IF.test(String(c));
/** Every step of every job: { job, step, run, uses, cond (job and step `if`), env (workflow, job and step env) }. */
export function stepsOf(wf) {
  const out = [];
  for (const [name, job] of Object.entries(wf?.jobs ?? {})) {
    if (!job || typeof job !== 'object') continue;
    const steps = Array.isArray(job.steps) ? job.steps : [];
    for (const s of steps) {
      if (!s || typeof s !== 'object') continue;
      const conds = [job.if, s.if].filter((c) => c != null && !IDLE_IF.test(String(c))).map(String);
      out.push({ job: name, step: s, run: s.run == null ? '' : String(s.run), uses: s.uses == null ? '' : String(s.uses), cond: conds.join(' && '), env: { ...(wf.env ?? {}), ...(job.env ?? {}), ...(s.env ?? {}) } });
    }
  }
  return out;
}
/** The jobs a job waits for, all the way up. */
export function ancestors(wf, name, seen = new Set()) {
  const needs = wf?.jobs?.[name]?.needs;
  for (const n of (Array.isArray(needs) ? needs : needs ? [needs] : []).map(String)) if (!seen.has(n)) { seen.add(n); ancestors(wf, n, seen); }
  return seen;
}
/** Every `uses:` of a workflow (steps and reusable-workflow jobs) that isn't pinned to a full commit SHA. */
export function unpinned(wf) {
  const uses = [];
  for (const job of Object.values(wf?.jobs ?? {})) {
    if (job?.uses) uses.push(String(job.uses));
    for (const s of Array.isArray(job?.steps) ? job.steps : []) if (s?.uses) uses.push(String(s.uses));
  }
  return uses.filter((u) => !u.startsWith('./') && !/^docker:\/\/.+@sha256:[0-9a-f]{64}$/.test(u) && !SHA40.test(u));
}
/** Are these permissions read-only? (`read-all`, or every scope read or none.) */
export function readOnly(perms) {
  if (perms === 'read-all' || perms === 'read') return true;
  if (!perms || typeof perms !== 'object') return false;
  return Object.values(perms).every((v) => v === 'read' || v === 'none');
}
/** Is the scorecard's location given to the step (variable or --scorecard)? */
export const toldScorecard = (s) => /--scorecard\s+\S/.test(s.run) || /HARNESS_SCORECARD=/.test(s.run) || Boolean(s.env?.HARNESS_SCORECARD);

// ---------- GitHub Actions expressions (enough of them to judge an `if:`) ----------
class Filtered extends Array {}
const lower = (v) => (typeof v === 'string' ? v.toLowerCase() : v);
const truthy = (v) => !(v === false || v === 0 || v === '' || v == null || Number.isNaN(v));
function looseEq(a, b) {
  if (typeof a === 'string' && typeof b === 'string') return a.toLowerCase() === b.toLowerCase();
  if (typeof a === typeof b) return a === b;
  const num = (v) => (v == null ? 0 : typeof v === 'boolean' ? Number(v) : typeof v === 'string' ? (v.trim() === '' ? 0 : Number(v)) : typeof v === 'number' ? v : NaN);
  return num(a) === num(b);
}
const FUNCS = {
  contains: (a, b) => (Array.isArray(a) ? a.some((x) => looseEq(x, b)) : String(a ?? '').toLowerCase().includes(String(b ?? '').toLowerCase())),
  startswith: (a, b) => String(a ?? '').toLowerCase().startsWith(String(b ?? '').toLowerCase()),
  endswith: (a, b) => String(a ?? '').toLowerCase().endsWith(String(b ?? '').toLowerCase()),
  success: () => true, always: () => true, cancelled: () => false, failure: () => false,
};
/** Evaluates an `if:` expression (`${{ }}` optional) against a context such as { github: { … } }. Throws on what it can't read. */
export function evalExpr(src, ctx) {
  const text = String(src ?? '').trim().replace(/^\$\{\{([\s\S]*)\}\}$/, '$1').trim();
  const toks = [];
  const re = /\s*(?:('(?:[^']|'')*')|(\d+(?:\.\d+)?)|(==|!=|<=|>=|&&|\|\||[()!<>,.[\]*])|([A-Za-z_][\w-]*))/y;
  while (re.lastIndex < text.length) {
    const at = re.lastIndex;
    const m = re.exec(text);
    if (!m) { if (!text.slice(at).trim()) break; throw new Error(`can't read "${text.slice(at, at + 24)}"`); }
    toks.push(m[1] != null ? { t: 'str', v: m[1].slice(1, -1).replace(/''/g, "'") } : m[2] != null ? { t: 'num', v: Number(m[2]) } : m[3] != null ? { t: 'op', v: m[3] } : { t: 'id', v: m[4] });
  }
  let i = 0;
  const peek = (v) => toks[i]?.t === 'op' && toks[i].v === v;
  const take = (v) => { if (!peek(v)) throw new Error(`expected "${v}" in ${text}`); i++; };
  const or = () => { let v = and(); while (peek('||')) { i++; const r = and(); v = truthy(v) ? v : r; } return v; };
  const and = () => { let v = cmp(); while (peek('&&')) { i++; const r = cmp(); v = truthy(v) ? r : v; } return v; };
  const cmp = () => {
    const a = unary();
    for (const op of ['==', '!=', '<=', '>=', '<', '>']) {
      if (!peek(op)) continue;
      i++;
      const b = unary();
      if (op === '==') return looseEq(a, b);
      if (op === '!=') return !looseEq(a, b);
      return { '<': lower(a) < lower(b), '>': lower(a) > lower(b), '<=': lower(a) <= lower(b), '>=': lower(a) >= lower(b) }[op];
    }
    return a;
  };
  const unary = () => (peek('!') ? (i++, !truthy(unary())) : postfix());
  const prop = (v, k) => (v instanceof Filtered ? Filtered.from(v.flatMap((x) => (x != null && typeof x === 'object' ? [x[k]] : []))) : v != null && typeof v === 'object' && !Array.isArray(v) ? v[k] ?? null : null);
  const postfix = () => {
    let v = primary();
    for (;;) {
      if (peek('.')) {
        i++;
        if (peek('*')) { i++; v = Filtered.from(Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : []); continue; }
        const id = toks[i++];
        if (id?.t !== 'id') throw new Error(`expected a name after "." in ${text}`);
        v = prop(v, id.v);
      } else if (peek('[')) {
        i++;
        const k = or();
        take(']');
        v = Array.isArray(v) && !(v instanceof Filtered) ? v[k] ?? null : prop(v, k);
      } else return v;
    }
  };
  const primary = () => {
    const tok = toks[i++];
    if (!tok) throw new Error(`the expression ends too early: ${text}`);
    if (tok.t === 'str' || tok.t === 'num') return tok.v;
    if (tok.t === 'op' && tok.v === '(') { const v = or(); take(')'); return v; }
    if (tok.t !== 'id') throw new Error(`unexpected "${tok.v}" in ${text}`);
    if (peek('(')) {
      i++;
      const args = [];
      while (!peek(')')) { args.push(or()); if (peek(',')) i++; else break; }
      take(')');
      const fn = FUNCS[tok.v.toLowerCase()];
      if (!fn) throw new Error(`the checks can't evaluate ${tok.v}()`);
      return fn(...args);
    }
    const word = tok.v.toLowerCase();
    if (word === 'true') return true;
    if (word === 'false') return false;
    if (word === 'null') return null;
    return ctx[tok.v] ?? null;
  };
  const v = or();
  if (i < toks.length) throw new Error(`can't read "${toks.slice(i).map((x) => x.v).join(' ')}" in ${text}`);
  return truthy(v);
}
/** Would this step run for this event? Its job, every job it needs, and the step itself must all say yes. */
export function stepRuns(wf, s, ctx) {
  const ifs = [...ancestors(wf, s.job), s.job].map((j) => wf.jobs?.[j]?.if).concat(s.step?.if).filter((c) => c != null);
  return ifs.every((c) => evalExpr(c, ctx));
}
/** The events a paid step may and may not run on. */
export const EVENTS = [
  ['a pull request is opened', false, { event_name: 'pull_request', ref: 'refs/pull/7/merge', event: { action: 'opened', pull_request: { number: 7, labels: [] } } }],
  ['someone pushes to a pull request that has the run-evals label', false, { event_name: 'pull_request', ref: 'refs/pull/7/merge', event: { action: 'synchronize', pull_request: { number: 7, labels: [{ name: 'run-evals' }] } } }],
  ['someone adds another label to a pull request that has run-evals', false, { event_name: 'pull_request', ref: 'refs/pull/7/merge', event: { action: 'labeled', label: { name: 'documentation' }, pull_request: { number: 7, labels: [{ name: 'run-evals' }, { name: 'documentation' }] } } }],
  ['a pull request with the run-evals label is reopened', false, { event_name: 'pull_request', ref: 'refs/pull/7/merge', event: { action: 'reopened', pull_request: { number: 7, labels: [{ name: 'run-evals' }] } } }],
  ['someone adds the run-evals label', true, { event_name: 'pull_request', ref: 'refs/pull/7/merge', event: { action: 'labeled', label: { name: 'run-evals' }, pull_request: { number: 7, labels: [{ name: 'run-evals' }] } } }],
  ['a push to main', true, { event_name: 'push', ref: 'refs/heads/main', event: { ref: 'refs/heads/main' } }],
];

// ---------- a gh-aw workflow's frontmatter ----------
function depthOf(s) {
  let d = 0, q = null;
  for (const ch of s) {
    if (q) { if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") q = ch;
    else if (ch === '[' || ch === '{') d++;
    else if (ch === ']' || ch === '}') d--;
  }
  return d;
}
/** The frontmatter, with flow lists that wrap over several lines joined back into one line. */
export function front(t, rel, hint) {
  const lines = norm(t.need(rel, hint)).split('\n');
  if (lines[0] === '---') {
    for (let i = 1; i < lines.length && lines[i] !== '---'; i++) {
      while (/(:\s+|^\s*-\s+)[[{]/.test(lines[i]) && depthOf(lines[i].replace(/\s#.*$/, '')) > 0 && lines[i + 1] && lines[i + 1] !== '---') lines.splice(i, 2, `${lines[i].replace(/\s#.*$/, '').trimEnd()} ${lines[i + 1].trim()}`);
    }
  }
  let fm;
  try { fm = parseFrontmatter(lines.join('\n')); } catch (e) { t.fail(`The frontmatter of \`${rel}\` is not valid YAML: ${e.message}`); }
  if (!fm) t.fail(`\`${rel}\` needs a YAML frontmatter block at the very top (between two \`---\` lines).`);
  return fm;
}
// Safe-output keys that are settings, not handlers (https://github.github.com/gh-aw/reference/safe-outputs/).
export const SAFE_OUTPUT_SETTINGS = new Set(['allowed-domains', 'allowed-github-references', 'mentions', 'max-bot-mentions', 'messages', 'report-failure-as-issue', 'failure-issue-repo', 'group-reports', 'github-token', 'github-app', 'app', 'environment', 'needs', 'data', 'max-patch-size', 'allow-full-history-fetch', 'runs-on', 'concurrency-group', 'staged', 'env', 'jobs', 'actions', 'threat-detection', 'noop', 'missing-tool', 'missing-data', 'report-incomplete', 'footer']);
export function unrestrictedBash(tools) {
  const bash = tools?.bash;
  if (bash === undefined || bash === null || bash === false) return false;
  if (bash === true) return true;
  return (Array.isArray(bash) ? bash : [bash]).some((x) => /^:?\*$|^\*/.test(String(x)));
}

// ---------- CODEOWNERS ----------
/** A CODEOWNERS pattern as a RegExp over repository paths (gitignore-like; GitHub's rules). */
export function ownersRe(pattern) {
  let p = String(pattern);
  const anchored = p.startsWith('/') || p.replace(/\/$/, '').includes('/');
  p = p.replace(/^\//, '');
  const dir = p.endsWith('/');
  p = p.replace(/\/$/, '');
  const last = p.split('/').pop();
  let re = '';
  for (let i = 0; i < p.length; i++) {
    const ch = p[i];
    if (ch === '*' && p[i + 1] === '*') { re += p[i + 2] === '/' ? '(?:.*/)?' : '.*'; i += p[i + 2] === '/' ? 2 : 1; }
    else if (ch === '*') re += '[^/]*';
    else if (ch === '?') re += '[^/]';
    else re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  const rest = dir ? '/.*' : /\*/.test(last) && last !== '**' ? '' : '(?:/.*)?';
  return new RegExp(`^${anchored ? '' : '(?:.*/)?'}${re}${rest}$`);
}
const OWNER = /^@[\w.-]+(\/[\w.-]+)?$|^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/** CODEOWNERS lines: [{ line, pattern, owners, re, bad }] (bad: tokens that are not owners). */
export function codeowners(text) {
  const rules = [];
  norm(text).split('\n').forEach((raw, i) => {
    const s = raw.replace(/(^|\s)#.*$/, '').trim();
    if (!s) return;
    const [pattern, ...owners] = s.split(/\s+/);
    rules.push({ line: i + 1, pattern, owners, re: ownersRe(pattern), bad: owners.filter((o) => !OWNER.test(o)) });
  });
  return rules;
}
/** The owners of a file: the last matching rule wins (an empty list: un-owned). */
export function ownersOf(rules, file) {
  let owners = [];
  for (const r of rules) if (r.re.test(file)) owners = r.owners;
  return owners;
}

// ---------- Markdown ----------
/** `## ` sections: [{ title, body }]. */
export function sections(md) {
  const out = [];
  for (const part of norm(md).split(/^(?=## )/m)) {
    if (!part.startsWith('## ')) continue;
    const title = part.split('\n')[0].slice(3).trim();
    out.push({ title, body: part.slice(part.indexOf('\n') + 1) });
  }
  return out;
}
/** The `- [ ]` items of a checklist, continuation lines joined. */
export function checklist(md) {
  const items = [];
  for (const line of norm(md).replace(/<!--[\s\S]*?-->/g, '').split('\n')) {
    const m = line.match(/^\s*[-*]\s+\[[ xX]\]\s+(.*)$/);
    if (m) items.push(m[1]);
    else if (items.length && /^\s{2,}\S/.test(line) && !/^\s*[-*]\s/.test(line)) items[items.length - 1] += ` ${line.trim()}`;
    else if (!line.trim()) items.push(null);
  }
  return items.filter(Boolean);
}
/** Keep a Changelog: the Unreleased notes and the releases, newest first. */
export function changelog(md) {
  const out = { unreleased: null, releases: [] };
  for (const s of sections(md)) {
    if (/^\[?unreleased\]?$/i.test(s.title)) { out.unreleased = s.body; continue; }
    const m = s.title.match(/^\[?v?([^\]\s]+)\]?(?:\s+[-–]\s+(\d{4}-\d{2}-\d{2}))?\s*$/);
    out.releases.push({ title: s.title, version: m?.[1] ?? null, date: m?.[2] ?? null, body: s.body });
  }
  return out;
}
export function compareSemver(a, b) {
  const pa = String(a).split(/[-+]/)[0].split('.').map(Number);
  const pb = String(b).split(/[-+]/)[0].split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

// ---------- throwaway git repositories ----------
/** Git and script environment: no global or system config, a fixed identity, the workshop's scorecard. */
export function gitEnv(t) {
  const home = t.tmp();
  const cfg = path.join(home, 'gitconfig');
  fs.writeFileSync(cfg, '');
  return {
    GIT_CONFIG_GLOBAL: cfg, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0',
    GIT_AUTHOR_NAME: 'Harness Check', GIT_AUTHOR_EMAIL: 'check@example.com', GIT_COMMITTER_NAME: 'Harness Check', GIT_COMMITTER_EMAIL: 'check@example.com',
    HARNESS_SCORECARD: SCORECARD,
  };
}
export function git(cwd, args, env) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, env: { ...process.env, ...env } });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${`${r.stderr}${r.stdout}`.trim()}`);
  return (r.stdout ?? '').trim();
}
export const gitTry = (cwd, args, env) => spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, env: { ...process.env, ...env } });
/** Copies the folder under test into `dir` (without dist/) and makes `top` (default: `dir`) a repository with it committed. */
export function repoOf(t, env, { dir = t.tmp(), top = dir } = {}) {
  t.copy(dir);
  fs.rmSync(path.join(dir, 'dist'), { recursive: true, force: true });
  git(top, ['init', '-q', '-b', 'main'], env);
  git(top, ['add', '-A'], env);
  git(top, ['commit', '-q', '-m', 'The harness'], env);
  return dir;
}
export const commitAll = (dir, msg, env) => { git(dir, ['add', '-A'], env); git(dir, ['commit', '-q', '-m', msg], env); };
export const readIn = (dir, rel) => { try { return norm(fs.readFileSync(path.join(dir, ...rel.split('/')), 'utf8')); } catch { return null; } };
export function writeIn(dir, rel, text) {
  const file = path.join(dir, ...rel.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}
/** Runs one of the folder's scripts in `dir` with the check environment. */
export function script(t, dir, rel, args, env, timeout = 180000) {
  const r = t.node([path.join(dir, ...rel.split('/')), ...args], { cwd: dir, env, timeout });
  return { ...r, code: r.code ?? 1 };
}
/** The first JSON object in a script's output. */
export function jsonOut(text) {
  const s = norm(text);
  const i = s.indexOf('{');
  if (i < 0) return null;
  try { return JSON.parse(s.slice(i, s.lastIndexOf('}') + 1)); } catch { return null; }
}
/** Every file under `dir` (POSIX paths, relative). */
export const filesUnder = (dir) => (fs.existsSync(dir) ? walkAll(dir) : []);
function walkAll(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walkAll(dir, r));
    else out.push(r);
  }
  return out.sort();
}
/** The scripts a hook command runs with Node (`node <file>`). */
export const hookScripts = (cmd) => [...String(cmd ?? '').matchAll(/\bnode\s+(?:"([^"]+)"|'([^']+)'|(\S+\.[cm]?js))/g)].map((m) => m[1] ?? m[2] ?? m[3]);
