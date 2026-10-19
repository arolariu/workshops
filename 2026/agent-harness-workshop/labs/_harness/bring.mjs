// Bring your work forward: copy the harness files you changed in earlier levels into this level's src/.
// Sources are the earlier levels, in course order, whose checks pass on their current files (a fresh pass). From each
// one, only the files under the harness paths (course.json) that differ from that level's seed travel: your work.
// App code never travels. A later source wins for the same file. This level's own starter files (and the files in
// its `keep` list) are never overwritten. Everything is backed up first, and "x" can restore the starter.
import fs from 'node:fs';
import path from 'node:path';
import { isHarnessPath, levelRules, matchAny } from './course.mjs';
import { courseOrder, snapshot, manifestFile, chainEntry } from './chain.mjs';
import { backupWork, ensureStarter } from './workspace.mjs';

/** Harness files in `dir` that differ from the seed ({ rel: blobId }) or that the seed doesn't have (minus `local` files). */
export function workIn(dir, seed, course, local = []) {
  const out = new Map();
  for (const [f, e] of snapshot(dir)) if (isHarnessPath(course, f) && !matchAny(local, f) && seed?.[f] !== e.id) out.set(f, { ...e, added: !seed?.[f] });
  return out;
}

/** Merge the sources' work (later sources win) and apply the target level's rules. */
export function planFor({ sources, target, manifest, course }) {
  const seed = manifest?.exercises?.[target.key] ?? {};
  const starter = new Set(Object.keys(chainEntry(manifest, target.key)?.starter ?? {}));
  const rules = levelRules(course, target.key);
  const merged = new Map();
  for (const s of sources) {
    for (const [file, e] of s.work) {
      const prev = merged.get(file);
      merged.set(file, { file, from: s.key, id: e.id, buf: e.buf, alsoIn: prev ? [...prev.alsoIn, prev.from] : [] });
    }
  }
  const now = snapshot(target.ex.src);
  const items = [];
  const kept = [];
  for (const it of [...merged.values()].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))) {
    if (matchAny(rules.drop, it.file)) { kept.push({ ...it, reason: 'drop' }); continue; }
    if (matchAny(rules.keep, it.file)) { kept.push({ ...it, reason: 'keep' }); continue; }
    if (starter.has(it.file) && !matchAny(rules.overrides, it.file)) { kept.push({ ...it, reason: 'starter' }); continue; }
    const cur = now.get(it.file);
    if (cur?.id === it.id) continue;
    items.push({ ...it, action: !cur ? 'new' : cur.id === seed[it.file] ? 'replace' : 'replace-yours' });
  }
  return { items, kept };
}

const WHY_NOT = { fail: 'its checks fail now', 'not-run': 'its checks have not been run yet' };

/**
 * What `bring` would do for `target` (a courseOrder node): { target, sources, skipped: [{ key, reason }], items, kept, error }.
 * `view` is a learning.progressView: only a fresh pass counts. Levels where you changed harness files but that don't
 * pass are listed in `skipped` with the reason.
 */
export function bringPlan({ catalog, course, manifest, view, target }) {
  const empty = { target, sources: [], skipped: [], items: [], kept: [] };
  if (!manifest?.exercises?.[target.key] || !chainEntry(manifest, target.key)) return { ...empty, error: `This level has no seed record in starters.json, so your work cannot be compared with it. (Maintainers: run node labs/start.mjs sync-seeds.)` };
  const order = courseOrder(catalog);
  const idx = order.findIndex((n) => n.key === target.key);
  const sources = [];
  const skipped = [];
  for (const node of order.slice(0, Math.max(0, idx))) {
    const seed = manifest.exercises[node.key];
    const status = view.checks(node.ex);
    if (!seed) { if (status === 'pass') skipped.push({ key: node.key, node, reason: 'it has no seed record in starters.json' }); continue; }
    const work = workIn(node.ex.src, seed, course, levelRules(course, node.key).local);
    if (!work.size) continue;
    if (status !== 'pass') {
      const wasPass = status === 'stale' && view.entry(node.ex).checks === 'pass';
      skipped.push({ key: node.key, node, reason: wasPass ? 'changed since its checks last passed: run them again to bring it' : WHY_NOT[status] ?? 'its checks have not passed' });
      continue;
    }
    sources.push({ key: node.key, node, work });
  }
  return { target, sources: sources.map((s) => s.key), skipped, ...planFor({ sources, target, manifest, course }) };
}

/** Apply a plan: keep the first-use starter, back up src/ (recovery backups), then copy the files byte for byte. */
export function applyBring({ labsDir, target, plan }) {
  if (!plan.items.length) return { ok: true, backup: null, files: [] };
  const ex = target.ex;
  const starter = ensureStarter(labsDir, ex, { manifestFile: manifestFile(labsDir) });
  let backup;
  try { backup = backupWork(labsDir, ex, 'bring'); } catch (e) {
    return { ok: false, reason: `Nothing was changed, because your current files could not be backed up first: ${e.message}` };
  }
  try {
    for (const it of plan.items) {
      const abs = path.join(ex.src, ...it.file.split('/'));
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, it.buf);
    }
  } catch (e) {
    return { ok: false, reason: `Bringing your work stopped part-way (${e.message}). Your previous files are safe in ${backup.dir}.`, backup };
  }
  return { ok: true, backup, files: plan.items.map((it) => ({ file: it.file, from: it.from })), starterProblem: starter.problem ?? null };
}

/** Facilitators: a learner who did every earlier level exactly like the reference brings it all in. */
export function perfectLearnerPlan({ catalog, course, manifest, target }) {
  const order = courseOrder(catalog);
  const idx = order.findIndex((n) => n.key === target.key);
  const sources = order.slice(0, Math.max(0, idx))
    .filter((n) => manifest?.exercises?.[n.key])
    .map((n) => ({ key: n.key, node: n, work: workIn(n.ex.sol, manifest.exercises[n.key], course, levelRules(course, n.key).local) }))
    .filter((s) => s.work.size);
  return { sources: sources.map((s) => s.key), ...planFor({ sources, target, manifest, course }) };
}

/**
 * Copies of src/ and sol/ in labs/.runs/verify-bring/<lab>-<level>/ with the perfect learner's work brought in. On the
 * sol/ copy, the level's own solution files are not overwritten. Returns { plan, base, src, sol }.
 */
export function simulateBring({ labsDir, catalog, course, manifest, target }) {
  const plan = perfectLearnerPlan({ catalog, course, manifest, target });
  const base = path.join(labsDir, '.runs', 'verify-bring', target.key.replace('/', '-'));
  fs.rmSync(base, { recursive: true, force: true });
  const put = (root, rel, buf) => {
    const abs = path.join(root, ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, buf);
  };
  const src = path.join(base, 'src');
  const sol = path.join(base, 'sol');
  const srcNow = snapshot(target.ex.src);
  const solNow = snapshot(target.ex.sol);
  fs.mkdirSync(src, { recursive: true });
  fs.mkdirSync(sol, { recursive: true });
  for (const [f, e] of srcNow) put(src, f, e.buf);
  for (const [f, e] of solNow) put(sol, f, e.buf);
  const own = new Set([...solNow].filter(([f, e]) => srcNow.get(f)?.id !== e.id).map(([f]) => f));
  for (const it of plan.items) {
    put(src, it.file, it.buf);
    if (!own.has(it.file)) put(sol, it.file, it.buf);
  }
  return { plan, base, src, sol };
}
