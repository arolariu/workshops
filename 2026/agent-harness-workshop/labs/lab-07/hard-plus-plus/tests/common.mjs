// Shared helpers for the Lab 07 checks.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
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

// ---------- gh aw and learner scripts run without a GitHub token ----------
// (Copilot is the kit's job: run-checks refuses any Copilot session a check or your code tries to start.)
/** Environment overrides: no GitHub token and an empty gh config, so gh and gh aw run unauthenticated. */
export function noGitHubEnv(t) {
  return { GH_TOKEN: '', GITHUB_TOKEN: '', GH_ENTERPRISE_TOKEN: '', GITHUB_ENTERPRISE_TOKEN: '', GH_CONFIG_DIR: t.tmp(), GH_PROMPT_DISABLED: '1' };
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
/** Optional: compile with the real gh-aw CLI in a throwaway git repo: unauthenticated, no update check, no remote fetches. */
export function compileStrict(t, names) {
  const dir = t.copy(t.tmp());
  const remote = remoteRefs(dir);
  if (remote.length) return `This optional check compiles offline, but gh aw would fetch these from GitHub: ${remote.join('; ')}. Use local files here.`;
  execFileSync('git', ['init', '-q'], { cwd: dir });
  const list = [names].flat().filter(Boolean);
  try {
    execFileSync('gh', ['aw', 'compile', ...list, '--strict', '--no-check-update'], { cwd: dir, env: { ...process.env, ...noGitHubEnv(t) }, encoding: 'utf8', stdio: 'pipe', timeout: 180000 });
  } catch (e) {
    return `gh aw compile --strict failed: ${String(e.stderr || e.stdout || e.message).trim().split('\n').slice(-4).join(' ')}`;
  }
  const missing = list.filter((n) => !fs.existsSync(path.join(dir, '.github', 'workflows', `${n}.lock.yml`)));
  return !missing.length || `gh aw compile made no .lock.yml for: ${missing.join(', ')}.`;
}

// Safe-output keys that are settings, not handlers (they write nothing on their own).
export const GLOBAL_SAFE_OUTPUT_KEYS = ['mentions', 'max-bot-mentions', 'allowed-domains', 'allowed-github-references', 'report-failure-as-issue', 'failure-issue-repo', 'group-reports', 'github-token', 'github-app', 'environment', 'max-patch-size', 'runs-on', 'concurrency-group', 'messages', 'staged', 'footer', 'threat-detection', 'noop', 'missing-tool', 'missing-data', 'report-incomplete', 'data', 'env'];

/**
 * GitHub Actions filter patterns, as the docs' cheat sheet defines them: `*` stays inside a folder, `**` crosses
 * folders, `?` is "zero or one of the preceding character", `+` "one or more of the preceding character", and `[…]`
 * one character from the set. Everything else is literal.
 */
export function actionsGlob(glob) {
  let re = '';
  let after = false;
  const g = String(glob).trim();
  for (let i = 0; i < g.length; i++) {
    const ch = g[i];
    if (ch === '*' && g[i + 1] === '*') {
      if (g[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
      after = false;
    } else if (ch === '*') { re += '[^/]*'; after = false; }
    else if ((ch === '?' || ch === '+') && after) { re += ch; after = false; }
    else if (ch === '[' && g.indexOf(']', i + 2) > i) {
      const end = g.indexOf(']', i + 2);
      re += `[${g.slice(i + 1, end).replace(/[\\\]^]/g, '\\$&')}]`;
      i = end;
      after = true;
    } else { re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); after = true; }
  }
  return new RegExp(`^${re}$`);
}

/** GitHub Actions path filters: does a pull request that changed `files` start the workflow? null = invalid filters. */
export function pathsTrigger(pr, files, glob = actionsGlob) {
  const paths = pr?.paths;
  const ignore = pr?.['paths-ignore'];
  if (paths != null && ignore != null) return null;
  const list = (v) => (Array.isArray(v) ? v : [v]).map(String);
  // The last pattern that matches decides; a pattern starting with ! takes the file back out.
  const hit = (patterns, file) => list(patterns).reduce((on, p) => (p.startsWith('!') ? (glob(p.slice(1)).test(file) ? false : on) : (glob(p).test(file) ? true : on)), false);
  if (paths != null) return files.some((f) => hit(paths, f));
  if (ignore != null) return files.some((f) => !hit(ignore, f));
  return true;
}

export const DEFAULT_PR_TYPES = ['opened', 'synchronize', 'reopened'];
/** The checks' own count of review runs: { prs, reviewed, skipped, runs, worstCase }. */
export function refEstimate(prs, pr, maxAiCredits) {
  const types = Array.isArray(pr?.types) ? pr.types : DEFAULT_PR_TYPES;
  let reviewed = 0;
  let runs = 0;
  for (const p of prs) {
    if (!pathsTrigger(pr, p.files)) continue;
    const n = (types.includes('opened') ? 1 : 0) + (types.includes('synchronize') ? p.pushes ?? 0 : 0) + (types.includes('reopened') ? p.reopens ?? 0 : 0);
    if (!n) continue;
    reviewed++;
    runs += n;
  }
  return { prs: prs.length, reviewed, skipped: prs.length - reviewed, runs, worstCase: runs * (Number(maxAiCredits) || 0) };
}

// The shipped simulator, from sol/: editing src/scripts/aw-sim.mjs can't change a grade.
export const simulator = (t) => import(pathToFileURL(path.join(t.solDir, 'scripts', 'aw-sim.mjs')).href);

/** The imports of a workflow, as paths from the repository root. */
export function importsOf(d) {
  return (Array.isArray(d?.imports) ? d.imports : d?.imports ? [d.imports] : []).map((i) => String(typeof i === 'string' ? i : i?.uses ?? i?.path ?? ''))
    .map((p) => p.replace(/[?]$/, '').replace(/^\/+/, ''))
    .map((p) => (p.startsWith('.github/') ? path.posix.normalize(p) : path.posix.normalize(`.github/workflows/${p}`)));
}

// ---------- the checks' own cost report (the rules todo.md gives) ----------
export const FAILED = ['failure', 'timed_out'];
const r1 = (x) => Math.round(x * 10) / 10;
export const runWorkflow = (run) => path.basename(String(run?.workflow_path ?? run?.workflow_name ?? '?')).replace(/\.(lock\.yml|yml|md)$/, '');
export function refCostReport(logs, budgets = {}) {
  const by = new Map();
  const runs = Array.isArray(logs?.runs) ? logs.runs : [];
  for (const run of runs) {
    const id = runWorkflow(run);
    const w = by.get(id) ?? { id, runs: 0, failed: 0, credits: [], days: {} };
    const aic = Number(run.aic) || 0;
    w.runs++;
    if (FAILED.includes(run.conclusion)) w.failed++;
    w.credits.push(aic);
    const day = new Date(run.created_at).toISOString().slice(0, 10);
    w.days[day] = (w.days[day] ?? 0) + aic;
    by.set(id, w);
  }
  const workflows = [...by.values()].map((w) => {
    const budget = { run: budgets[w.id]?.run ?? null, daily: budgets[w.id]?.daily ?? null };
    const total = w.credits.reduce((a, b) => a + b, 0);
    const peakDay = r1(Math.max(0, ...Object.values(w.days)));
    return {
      id: w.id, runs: w.runs, failed: w.failed, aic: r1(total), avg: r1(total / w.runs), max: r1(Math.max(...w.credits)), peakDay, budget,
      nearBudget: budget.run ? w.credits.filter((c) => c >= 0.8 * budget.run).length : 0,
      overDaily: budget.daily != null && peakDay > budget.daily,
    };
  }).sort((a, b) => b.aic - a.aic || a.id.localeCompare(b.id));
  const failures = runs.filter((r) => FAILED.includes(r.conclusion)).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .map((r) => ({ run_id: r.run_id, id: runWorkflow(r), conclusion: r.conclusion, failure_kind: r.failure_kind ?? null }));
  return { runs: runs.length, failed: failures.length, aic: r1(runs.reduce((n, r) => n + (Number(r.aic) || 0), 0)), workflows, failures };
}

