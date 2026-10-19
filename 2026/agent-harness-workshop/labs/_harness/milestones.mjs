// Milestones: a long level is split into checkpoints (M1, M2, …). Each check names its milestone
// (t.check(name, fn, { milestone: 'M2' })), and each milestone has its own hints in todo.md ("### M2" under Hints).
// Shared by the CLI, the full-screen app and linear mode, so they always agree.

const rank = (id) => (id ? Number(String(id).replace(/\D/g, '')) || 0 : Number.POSITIVE_INFINITY);
const done = (status) => status === 'pass' || status === 'skip';

/** { M1: 'pass' | 'fail' }: a milestone passes when every one of its checks passed or was skipped. */
export function milestoneStatus(results) {
  const out = {};
  for (const r of results ?? []) {
    if (!r?.milestone) continue;
    out[r.milestone] = out[r.milestone] !== 'fail' && done(r.status) ? 'pass' : 'fail';
  }
  return out;
}

/** The first failing (or blocked) check of the earliest milestone that has one; checks without a milestone come last. */
export function nextFixName(results) {
  const bad = (results ?? []).map((r, i) => ({ r, i })).filter(({ r }) => r && (r.status === 'fail' || r.status === 'blocked'));
  if (!bad.length) return null;
  bad.sort((a, b) => rank(a.r.milestone) - rank(b.r.milestone) || a.i - b.i);
  return bad[0].r.name;
}

/**
 * Group a run for display: [{ id, title, items: [{ idx, name, result }], total, passed, failed, done }].
 * Order: the milestones of todo.md (`defined`), then milestones only the checks name, then checks without one (id null).
 * A level without milestones gives one group with id null.
 */
export function groupChecks({ names = [], milestones = [], results = [], defined = [] }) {
  const ids = defined.map((m) => m.id);
  for (const m of milestones) if (m && !ids.includes(m)) ids.push(m);
  const groups = ids.map((id) => ({ id, title: defined.find((m) => m.id === id)?.title ?? '', items: [] }));
  const rest = { id: null, title: '', items: [] };
  names.forEach((name, idx) => {
    const id = milestones[idx] ?? results[idx]?.milestone ?? null;
    (groups.find((g) => g.id === id) ?? rest).items.push({ idx, name, result: results[idx] ?? null });
  });
  const all = [...groups, ...(rest.items.length || !groups.length ? [rest] : [])];
  for (const g of all) {
    g.total = g.items.length;
    g.passed = g.items.filter((it) => done(it.result?.status)).length;
    g.failed = g.items.filter((it) => it.result?.status === 'fail' || it.result?.status === 'blocked').length;
    g.done = g.total > 0 && g.passed === g.total;
  }
  return all;
}

/** ▰▰▱: one cell per check, at most ten. */
export function milestoneBar(passed, total) {
  if (!total) return '';
  const cells = Math.min(10, total);
  const full = Math.round((passed / total) * cells);
  return `${'▰'.repeat(full)}${'▱'.repeat(cells - full)}`;
}

/** The milestone you are working on: the first one whose last recorded status is not a pass (null when all pass). */
export function currentMilestone(ex, entry = {}) {
  if (!ex.milestones?.length) return null;
  const st = entry.milestones ?? {};
  return ex.milestones.find((m) => st[m.id] !== 'pass')?.id ?? null;
}

/** The indexes of the hints revealed so far. Levels with milestones count per milestone (entry.hintsBy, "_" = general). */
export function revealedHints(ex, entry = {}) {
  const hints = ex.hints ?? [];
  const shown = new Set();
  if (!ex.milestones?.length) {
    for (let i = 0; i < Math.min(entry.hints ?? 0, hints.length); i++) shown.add(i);
    return shown;
  }
  const by = entry.hintsBy ?? {};
  const seen = {};
  hints.forEach((h, i) => {
    const k = h.milestone ?? '_';
    seen[k] = (seen[k] ?? 0) + 1;
    if (seen[k] <= (by[k] ?? 0)) shown.add(i);
  });
  return shown;
}

/**
 * The next hint to reveal and the progress patch that records it, or null. With milestones: the current milestone's
 * hints first, then the general ones; another milestone's hints only once every milestone passes (current null).
 */
export function nextHint(ex, entry = {}, current = currentMilestone(ex, entry)) {
  const hints = ex.hints ?? [];
  if (!ex.milestones?.length) {
    const n = entry.hints ?? 0;
    return n < hints.length ? { idx: n, patch: { hints: n + 1 } } : null;
  }
  const shown = revealedHints(ex, entry);
  const free = (k) => hints.findIndex((h, i) => !shown.has(i) && (h.milestone ?? null) === k);
  let idx = current ? free(current) : -1;
  if (idx < 0) idx = free(null);
  if (idx < 0 && !current) idx = hints.findIndex((_, i) => !shown.has(i));
  if (idx < 0) return null;
  const k = hints[idx].milestone ?? '_';
  const hintsBy = { ...(entry.hintsBy ?? {}), [k]: ((entry.hintsBy ?? {})[k] ?? 0) + 1 };
  return { idx, patch: { hintsBy, hints: (entry.hints ?? 0) + 1 } };
}

/** Reveal the next hint and remember it: { hint, idx, milestone, shown, total } or { none: true, milestone }. */
export function revealNextHint(store, ex) {
  const entry = store.get(ex.key);
  const milestone = currentMilestone(ex, entry);
  const next = nextHint(ex, entry, milestone);
  if (!next) return { none: true, milestone };
  store.set(ex.key, next.patch);
  return { hint: ex.hints[next.idx], idx: next.idx, milestone, shown: revealedHints(ex, { ...entry, ...next.patch }).size, total: ex.hints.length };
}
