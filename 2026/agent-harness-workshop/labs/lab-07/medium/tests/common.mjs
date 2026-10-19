// Shared helpers for the Lab 07 checks.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseFrontmatter } from '../../../_harness/kit.mjs';

export const WRITE_OUTPUTS = ['create-pull-request', 'push-to-pull-request-branch', 'update-issue', 'close-issue', 'close-pull-request', 'merge-pull-request', 'create-discussion', 'create-issue'];

export function readOnly(perms) {
  if (perms === 'read-all' || perms === 'read') return true;
  if (!perms || typeof perms !== 'object') return false;
  return Object.values(perms).every((v) => v === 'read' || v === 'none');
}

export function unrestrictedBash(tools) {
  const bash = tools?.bash;
  if (bash === undefined || bash === null || bash === false) return false;
  if (bash === true) return true;
  const list = Array.isArray(bash) ? bash : [bash];
  return list.some((x) => /^:?\*$|^\*/.test(String(x)));
}

// ---------- reading a workflow's frontmatter ----------
/** Bracket depth of a YAML line, ignoring quoted text. */
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
/** The frontmatter with flow lists and maps that wrap over several lines joined back into one line. */
export function joinWrapped(text) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  if (lines[0] !== '---') return lines.join('\n');
  const out = [lines[0]];
  let i = 1;
  for (; i < lines.length && lines[i] !== '---'; i++) {
    let s = lines[i];
    while (/(:\s+|^\s*-\s+)[[{]/.test(s) && depthOf(s.replace(/\s#.*$/, '')) > 0 && i + 1 < lines.length && lines[i + 1] !== '---') s = `${s.replace(/\s#.*$/, '').trimEnd()} ${lines[++i].trim()}`;
    out.push(s);
  }
  return [...out, ...lines.slice(i)].join('\n');
}
/** Like t.frontmatter(), but a list such as `allowed: [bug,` + `question]` on two lines is read as one list. */
export function front(t, rel, hint) {
  const s = t.need(rel, hint);
  let fm;
  try { fm = parseFrontmatter(joinWrapped(s)); } catch (e) { t.fail(`The frontmatter of \`${rel}\` is not valid YAML: ${e.message}`); }
  if (!fm) t.fail(`\`${rel}\` needs a YAML frontmatter block at the very top (between two \`---\` lines).`);
  return fm;
}

/** null when the schedule runs at most once a day (one fuzzy daily/weekly entry, every N days, or a cron with a fixed minute and hour), else why not. */
export function scheduleProblem(schedule) {
  if (schedule == null || schedule === '') return 'Add a schedule under `on:`, for example `schedule: daily`.';
  const items = typeof schedule === 'string' ? [schedule] : (Array.isArray(schedule) ? schedule : [schedule]).map((s) => (typeof s === 'string' ? s : s?.cron));
  if (items.length > 1) return `There are ${items.length} schedules, so the sweep runs ${items.length} times a day or more: keep one.`;
  for (const item of items) {
    const v = String(item ?? '').trim();
    if (!v) return 'Each schedule entry needs a value, for example `- cron: daily`.';
    if (/^(daily|weekly|bi-weekly|tri-weekly)\b/i.test(v)) continue;
    if (/^every\s+\d+\s*(d|days?|w|weeks?|mo|months?)\b/i.test(v)) continue;
    const f = v.split(/\s+/);
    if (f.length === 5 && /^\d+$/.test(f[0]) && /^\d+$/.test(f[1])) continue;
    return `"${v}" runs more than once a day (or isn't a schedule gh aw knows). An hourly sweep spends 24 times the credits of a daily one: use daily or weekly.`;
  }
  return null;
}

/** The body rows of every Markdown table in `md`, as trimmed cells (header and --- rows skipped). */
export function tableRows(md) {
  const rows = [];
  let inTable = false;
  for (const line of String(md ?? '').split('\n')) {
    if (!/^\s*\|/.test(line)) { inTable = false; continue; }
    const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
    if (!inTable) { inTable = true; continue; }
    rows.push(cells);
  }
  return rows;
}

// ---------- free checks never reach GitHub or spend credits ----------
const REACH = /^(gh_token|github_token|gh_enterprise_token|github_enterprise_token|copilot_github_token|gh_host|gh_config_dir|copilot_home|harness_copilot)$/i;
/** The environment minus every token and config folder that gh or Copilot could use: unauthenticated, nothing to spend. */
export function noReachEnv(t, { keepPath = true } = {}) {
  const empty = t.tmp();
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !REACH.test(k) && (keepPath || !/^path$/i.test(k))));
  return { ...env, GH_CONFIG_DIR: empty, COPILOT_HOME: empty, HARNESS_COPILOT: path.join(empty, 'no-copilot'), GH_PROMPT_DISABLED: '1', ...(keepPath ? {} : { PATH: path.dirname(process.execPath) }) };
}
/** Run one of your scripts with Node only: no gh, no copilot and no token in reach, so a bug can't reach GitHub. */
export function runOffline(t, args) {
  const r = spawnSync(process.execPath, args, { cwd: t.dir, env: noReachEnv(t, { keepPath: false }), encoding: 'utf8', timeout: 20000 });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', all: `${r.stdout ?? ''}\n${r.stderr ?? ''}` };
}
/** Import and call your code with the same environment in this process, then put everything back. */
export async function withOffline(t, fn) {
  const saved = { ...process.env };
  const env = noReachEnv(t, { keepPath: false });
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, env);
  try { return await fn(); } finally {
    for (const k of Object.keys(process.env)) delete process.env[k];
    Object.assign(process.env, saved);
  }
}

/** Frontmatter references gh aw would fetch from GitHub at compile time (remote imports, skills, plugins). */
function remoteRefs(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }) : []) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.endsWith('.md')) continue;
      let data = {};
      try { data = parseFrontmatter(joinWrapped(fs.readFileSync(p, 'utf8')))?.data ?? {}; } catch { continue; }
      const imports = (Array.isArray(data.imports) ? data.imports : data.imports ? [data.imports] : []).map((i) => String(typeof i === 'string' ? i : i?.uses ?? i?.path ?? ''));
      for (const i of imports) if (/^[\w.-]+\/[\w.-]+\/.+@/.test(i)) out.push(`${e.name}: imports ${i}`);
      for (const k of ['skills', 'plugins']) if (data[k]) out.push(`${e.name}: ${k}`);
    }
  };
  walk(path.join(dir, '.github', 'workflows'));
  return out;
}
/** Optional: compile with the real gh-aw CLI in a throwaway git repo, offline and unauthenticated. */
export function compileStrict(t, names) {
  const dir = t.copy(t.tmp());
  const remote = remoteRefs(dir);
  if (remote.length) return `This optional check compiles offline, but gh aw would fetch these from GitHub: ${remote.join('; ')}. Use local files here.`;
  execFileSync('git', ['init', '-q'], { cwd: dir });
  const list = [names].flat().filter(Boolean);
  try {
    execFileSync('gh', ['aw', 'compile', ...list, '--strict', '--no-check-update'], { cwd: dir, env: noReachEnv(t), encoding: 'utf8', stdio: 'pipe', timeout: 180000 });
  } catch (e) {
    return `gh aw compile --strict failed: ${String(e.stderr || e.stdout || e.message).trim().split('\n').slice(-4).join(' ')}`;
  }
  const missing = list.filter((n) => !fs.existsSync(path.join(dir, '.github', 'workflows', `${n}.lock.yml`)));
  return !missing.length || `gh aw compile made no .lock.yml for: ${missing.join(', ')}.`;
}
