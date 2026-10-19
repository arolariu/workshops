// Shared helpers for the Lab 07 checks.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

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
