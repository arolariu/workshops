// Shared helpers for the Lab 07 checks.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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

/** null when the schedule runs at most once a day (fuzzy daily/weekly, every N days, or a cron with a fixed minute and hour), else why not. */
export function scheduleProblem(schedule) {
  if (schedule == null || schedule === '') return 'Add a schedule under `on:`, for example `schedule: daily`.';
  const items = typeof schedule === 'string' ? [schedule] : (Array.isArray(schedule) ? schedule : [schedule]).map((s) => (typeof s === 'string' ? s : s?.cron));
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

// Optional: compile with the real gh-aw CLI in a throwaway git repo.
export function compileStrict(t, name) {
  const dir = t.copy(t.tmp());
  execFileSync('git', ['init', '-q'], { cwd: dir });
  try {
    execFileSync('gh', ['aw', 'compile', name, '--strict'], { cwd: dir, encoding: 'utf8', stdio: 'pipe', timeout: 120000 });
  } catch (e) {
    return `gh aw compile --strict failed: ${String(e.stderr || e.stdout || e.message).trim().split('\n').slice(-3).join(' ')}`;
  }
  return fs.existsSync(path.join(dir, '.github', 'workflows', `${name}.lock.yml`)) || 'gh aw compile did not produce a .lock.yml.';
}

// Safe-output keys that are settings, not handlers (they write nothing on their own).
export const GLOBAL_SAFE_OUTPUT_KEYS = ['mentions', 'max-bot-mentions', 'allowed-domains', 'allowed-github-references', 'report-failure-as-issue', 'failure-issue-repo', 'group-reports', 'github-token', 'github-app', 'environment', 'max-patch-size', 'runs-on', 'concurrency-group', 'messages', 'staged', 'footer', 'threat-detection', 'noop', 'missing-tool', 'missing-data', 'report-incomplete', 'data', 'env'];

/** GitHub Actions path filters: does a pull request that changed `files` start the workflow? null = invalid filters. */
export function pathsTrigger(pr, files, globToRegExp) {
  const paths = pr?.paths;
  const ignore = pr?.['paths-ignore'];
  if (paths != null && ignore != null) return null;
  const list = (v) => (Array.isArray(v) ? v : [v]).map(String);
  // The last pattern that matches decides; a pattern starting with ! takes the file back out.
  const hit = (patterns, file) => list(patterns).reduce((on, p) => (p.startsWith('!') ? (globToRegExp(p.slice(1)).test(file) ? false : on) : (globToRegExp(p).test(file) ? true : on)), false);
  if (paths != null) return files.some((f) => hit(paths, f));
  if (ignore != null) return files.some((f) => !hit(ignore, f));
  return true;
}

export const DEFAULT_PR_TYPES = ['opened', 'synchronize', 'reopened'];
/** The checks' own count of review runs: { prs, reviewed, skipped, runs, worstCase }. */
export function refEstimate(prs, pr, maxAiCredits, globToRegExp) {
  const types = Array.isArray(pr?.types) ? pr.types : DEFAULT_PR_TYPES;
  let reviewed = 0;
  let runs = 0;
  for (const p of prs) {
    if (!pathsTrigger(pr, p.files, globToRegExp)) continue;
    const n = (types.includes('opened') ? 1 : 0) + (types.includes('synchronize') ? p.pushes ?? 0 : 0) + (types.includes('reopened') ? p.reopens ?? 0 : 0);
    if (!n) continue;
    reviewed++;
    runs += n;
  }
  return { prs: prs.length, reviewed, skipped: prs.length - reviewed, runs, worstCase: runs * (Number(maxAiCredits) || 0) };
}

// The shipped simulator, from sol/: editing src/scripts/aw-sim.mjs can't change a grade.
export const simulator = (t) => import(pathToFileURL(path.join(t.solDir, 'scripts', 'aw-sim.mjs')).href);
