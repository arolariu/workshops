// Learning paths, search and filters, bookmarks, "Next", and local learning summaries. Everything here reads the same
// fresh evidence (see progress.mjs), so navigation and reports never disagree with the checks.
import fs from 'node:fs';
import path from 'node:path';
import { DIFFICULTIES, normalizeLevel, levelChoices } from './catalog.mjs';
import { deriveStatus, evidenceTracker } from './progress.mjs';

export class SelectionError extends Error {}

/** The workshop's suggested paths for lab time, in their explicit order (see readme.md). */
export const PATHS = [
  { id: 'all', label: 'All exercises', description: 'Every exercise: all easy levels first, then medium, then hard.', keys: null },
  { id: 'foundations', label: 'Foundations', description: 'Instructions, skills, agents and guardrails.', keys: ['lab-01/medium', 'lab-02/medium', 'lab-03/medium', 'lab-05/medium'] },
  { id: 'security', label: 'Security', description: 'Hooks and least privilege (free checks, few credits).', keys: ['lab-05/medium', 'lab-05/hard', 'lab-03/medium'] },
  { id: 'builder', label: 'Builder', description: 'MCP servers and plugins.', keys: ['lab-04/medium', 'lab-04/hard', 'lab-06/medium'] },
  { id: 'automation', label: 'Automation', description: 'Agents in scripts and in CI.', keys: ['lab-00/hard', 'lab-07/medium', 'lab-07/hard'] },
];
export const STATUS_FILTERS = ['unfinished', 'pass', 'fail', 'stale', 'not-run', 'blocked', 'skipped', 'interrupted'];
export const pathById = (id) => PATHS.find((p) => p.id === id) ?? null;

/** Statuses per exercise, from the store plus fresh fingerprints. Call refresh() at a boundary (screen change, Next, export). */
export function progressView(store, catalog, tracker = evidenceTracker()) {
  return {
    store,
    catalog,
    tracker,
    refresh() { store.reload(); tracker.invalidate(); },
    entry: (ex) => store.get(ex.key),
    checks: (ex) => deriveStatus(store.get(ex.key), tracker.current(ex, 'checks'), 'checks'),
    agent: (ex) => (ex.hasAgent ? deriveStatus(store.get(ex.key), tracker.current(ex, 'agent'), 'agent') : 'none'),
    bookmarked: (ex) => Boolean(store.get(ex.key).bookmarked),
    hints: (ex) => store.get(ex.key).hints ?? 0,
  };
}

/** Validate selection options. Throws SelectionError with a message a student can act on. */
export function parseSelection({ query = '', level = null, status = null, maxMinutes = null, bookmarked = false, path: pathId = null } = {}) {
  const out = { query: String(query ?? '').trim().toLowerCase(), level: null, status: null, maxMinutes: null, bookmarked: Boolean(bookmarked), path: pathId || 'all' };
  if (level) {
    out.level = normalizeLevel(level);
    if (!out.level) throw new SelectionError(`"${level}" is not a difficulty. Use one of: ${levelChoices()}.`);
  }
  if (status) {
    const s = String(status).toLowerCase() === 'done' ? 'pass' : String(status).toLowerCase();
    if (!STATUS_FILTERS.includes(s)) throw new SelectionError(`"${status}" is not a status. Use one of: ${STATUS_FILTERS.join(', ')}.`);
    out.status = s;
  }
  if (maxMinutes !== null && maxMinutes !== undefined && maxMinutes !== '') {
    const n = Number(maxMinutes);
    if (!Number.isFinite(n) || n <= 0) throw new SelectionError(`"${maxMinutes}" is not a number of minutes.`);
    out.maxMinutes = n;
  }
  if (!pathById(out.path)) throw new SelectionError(`"${pathId}" is not a learning path. Use one of: ${PATHS.map((p) => p.id).join(', ')}.`);
  return out;
}

/** Exercises in a path's order: the path's own list, or for "all" every easy level, then medium, then hard… */
function ordered(catalog, pathId) {
  const p = pathById(pathId);
  const byKey = new Map(catalog.flatMap((lab) => lab.levels.map((ex) => [ex.key, { lab, ex }])));
  if (p.keys) return p.keys.map((k) => byKey.get(k)).filter(Boolean);
  return DIFFICULTIES.flatMap((d) => catalog.flatMap((lab) => lab.levels.filter((ex) => ex.level === d.id).map((ex) => ({ lab, ex }))));
}

const haystack = (lab, ex) => [lab.id, `lab ${lab.num}`, lab.title, lab.tagline, ex.title, ex.label, ex.level, ex.mission].join(' ').toLowerCase();

/** { matches: [{ key, lab, ex, progress }], notes: [string] } */
export function describeSelection(catalog, view, opts = {}) {
  const sel = parseSelection(opts);
  const notes = [];
  let unknown = 0;
  const tokens = sel.query.split(/\s+/).filter(Boolean);
  const matches = [];
  for (const { lab, ex } of ordered(catalog, sel.path)) {
    if (sel.level && ex.level !== sel.level) continue;
    if (tokens.length) {
      const text = haystack(lab, ex);
      if (!tokens.every((t) => text.includes(t))) continue;
    }
    if (sel.bookmarked && !view.bookmarked(ex)) continue;
    if (sel.maxMinutes !== null) {
      if (ex.minutes === null) { unknown++; continue; }
      if (ex.minutes > sel.maxMinutes) continue;
    }
    const checks = view.checks(ex);
    if (sel.status === 'unfinished' ? checks === 'pass' : sel.status && checks !== sel.status) continue;
    matches.push({ key: ex.key, lab, ex, progress: { checks, agent: view.agent(ex), hints: view.hints(ex), bookmarked: view.bookmarked(ex), minutes: ex.minutes } });
  }
  if (unknown) notes.push(`${unknown} exercise${unknown === 1 ? ' has an' : 's have an'} unknown duration, so ${unknown === 1 ? 'it is' : 'they are'} not counted as fitting ${sel.maxMinutes} minutes.`);
  if (!matches.length) notes.push('Nothing matches these filters.');
  return { matches, notes, selection: sel };
}

export const selectExercises = (catalog, view, opts) => describeSelection(catalog, view, opts).matches;

/**
 * The exercise "Next" suggests, or null when the selection is complete. On a learning path: the first exercise of the
 * path that is not passing. On the default "all" path, the workshop's own rule (spec: the live track, then homework):
 *   1. on an easy level (`current`): the next lab's easy level, finished or not, so nobody falls behind the room;
 *   2. not on a level: the level you were last on (`last`), if it is unfinished;
 *   3. the first unfinished easy level;
 *   4. the next unfinished tier in the lab of your last level;
 *   5. the lowest unfinished tier of a later lab;
 *   6. any unfinished level, in course order.
 * `current` and `last` are exercise keys ("lab-02/easy").
 */
export function nextExercise(catalog, view, opts = {}) {
  const { status: _ignored, current = null, last = null, ...rest } = opts;
  const matches = selectExercises(catalog, view, rest);
  const filtered = ['query', 'level', 'maxMinutes', 'bookmarked'].some((k) => rest[k]);
  if ((rest.path ?? 'all') !== 'all' || filtered) return matches.find((m) => m.progress.checks !== 'pass') ?? null;
  const byKey = new Map(matches.map((m) => [m.key, m]));
  const order = catalog.flatMap((lab, li) => lab.levels.map((ex) => ({ m: byKey.get(ex.key), li, tier: DIFFICULTIES.findIndex((d) => d.id === ex.level) }))).filter((n) => n.m);
  const open = (n) => n.m.progress.checks !== 'pass' && n.m.key !== current;
  const cur = order.find((n) => n.m.key === current);
  if (cur && cur.tier === 0) {
    const down = order.find((n) => n.li > cur.li && n.tier === 0);
    if (down) return down.m;
  }
  const mine = order.find((n) => n.m.key === (current ?? last));
  if (!current && mine && open(mine)) return mine.m;
  const pick = (fn) => order.find((n) => open(n) && fn(n))?.m ?? null;
  return pick((n) => n.tier === 0)
    ?? (mine && pick((n) => n.li === mine.li && n.tier > mine.tier))
    ?? (mine && pick((n) => n.li > mine.li))
    ?? pick(() => true);
}

/** Remember the chosen learning path. */
export function choosePath(store, id) {
  if (!pathById(id)) throw new SelectionError(`"${id}" is not a learning path. Use one of: ${PATHS.map((p) => p.id).join(', ')}.`);
  store.set('_ui', { path: id });
  return id;
}

/** A local, structured learning summary. Nothing is uploaded; raw run logs are never included. */
export function learningReport(catalog, view, { path: pathId = 'all' } = {}) {
  const sel = parseSelection({ path: pathId });
  const exercises = ordered(catalog, sel.path).map(({ lab, ex }) => {
    const e = view.entry(ex);
    return {
      key: ex.key,
      lab: lab.id,
      labTitle: lab.title,
      level: ex.level,
      label: ex.label,
      title: ex.title,
      minutes: ex.minutes,
      checks: view.checks(ex),
      passed: e.passed ?? null,
      total: e.total ?? null,
      lastChecked: e.checksEvidence?.recordedAt ?? e.lastAttempt?.at ?? (e.legacy ? e.updated ?? null : null),
      agent: view.agent(ex),
      lastAgentRun: e.agentEvidence?.recordedAt ?? e.lastAgentAttempt?.at ?? null,
      hints: e.hints ?? 0,
      solutionViewed: Boolean(e.peeked),
      bookmarked: Boolean(e.bookmarked),
      quiz: e.quiz === 'right' || e.quiz === 'wrong' ? e.quiz : null,
    };
  });
  const count = (fn) => exercises.filter(fn).length;
  return {
    kind: 'learning-summary',
    format: 1,
    generatedAt: new Date().toISOString(),
    path: sel.path,
    network: 'none',
    note: 'Generated locally by the lab companion. "pass" means the checks passed on the current files with the current grader; "stale" means the files or the grader changed since. Raw run logs are not included.',
    totals: {
      exercises: exercises.length,
      passed: count((x) => x.checks === 'pass'),
      stale: count((x) => x.checks === 'stale'),
      failed: count((x) => x.checks === 'fail'),
      blocked: count((x) => x.checks === 'blocked'),
      notRun: count((x) => x.checks === 'not-run'),
      agentPassed: count((x) => x.agent === 'pass'),
      hintsViewed: exercises.reduce((n, x) => n + x.hints, 0),
    },
    exercises,
    bookmarks: exercises.filter((x) => x.bookmarked).map((x) => x.key),
  };
}

export function reportMarkdown(report) {
  const p = pathById(report.path);
  const t = report.totals;
  const cell = (s) => String(s ?? '—').replace(/\|/g, '\\|');
  const lines = [
    '# 🧠 Learning summary',
    '',
    `Generated ${report.generatedAt} · path: **${p?.label ?? report.path}** · created locally, nothing was sent anywhere.`,
    '',
    `**${t.passed} of ${t.exercises}** exercises pass on their current files${t.stale ? ` · ${t.stale} stale (changed since they were checked)` : ''}${t.agentPassed ? ` · ${t.agentPassed} agent check(s) passed` : ''} · ${t.hintsViewed} hint(s) revealed.`,
    '',
    '| Exercise | Title | Checks | Agent | Last checked | Hints | Solution viewed | Bookmarked | Check yourself |',
    '|---|---|---|---|---|---|---|---|---|',
    ...report.exercises.map((x) => `| ${x.key} | ${cell(x.title)} | ${x.checks}${x.passed !== null && x.total ? ` (${x.passed}/${x.total})` : ''} | ${x.agent} | ${cell(x.lastChecked)} | ${x.hints} | ${x.solutionViewed ? 'yes' : ''} | ${x.bookmarked ? '⭐' : ''} | ${x.quiz === 'right' ? '✅' : x.quiz === 'wrong' ? '💡' : ''} |`),
    '',
    `> ${report.note}`,
    '',
  ];
  return lines.join('\n');
}

/** Write a summary file. Refuses to overwrite: pick another name instead. Returns { file }. */
export function writeReport(report, { dir, format = 'md', name } = {}) {
  if (!['md', 'json'].includes(format)) throw new SelectionError(`"${format}" is not a report format. Use md or json.`);
  const base = name ?? `learning-summary-${new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)}`;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(base)) throw new SelectionError(`"${base}" is not a safe file name.`);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${base}.${format}`);
  const text = format === 'json' ? `${JSON.stringify(report, null, 2)}\n` : reportMarkdown(report);
  try {
    fs.writeFileSync(file, text, { flag: 'wx' });
  } catch (e) {
    if (e.code === 'EEXIST') throw new SelectionError(`${file} already exists; choose another name.`);
    throw e;
  }
  return { file };
}
