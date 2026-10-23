// The seeded chain: every level's src/ starts from the reference result (sol/) of the level before it, so the labs
// build on each other and nobody is blocked by an unfinished level.
//   Down the easy column (the live track): Lab N easy starts from Lab N-1 easy.
//   Along a row (the homework ladder): each tier starts from the tier to its left in the same lab.
// starters.json (format 2) records every seed file as a git blob ID (`exercises`) and, per level, where it starts from
// and which files are its own starter files (`chain`); everything else in a seed is inherited. Maintainers run
// `node labs/start.mjs sync-seeds` after changing a level; `verify --chain` checks that nothing drifted.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DIFFICULTIES } from './catalog.mjs';
import { levelRules, matchAny } from './course.mjs';
import { workFiles } from './progress.mjs';

export const MANIFEST_NOTE = 'Every seed file of every exercise\'s src/ as a git blob ID (line endings normalised), and the chain: where each level starts from and which files are its own starter files. Regenerate with: node labs/start.mjs sync-seeds';
const isText = (buf) => !buf.subarray(0, 8000).includes(0);
const lf = (buf) => (isText(buf) && buf.includes(13) ? Buffer.from(buf.toString('latin1').replace(/\r\n/g, '\n'), 'latin1') : buf);
/** The git blob ID of a file's content, with CRLF read as LF for text (that is what git stores here). */
export const blobId = (buf) => {
  const b = lf(buf);
  return crypto.createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');
};

/** Map rel → { id, buf } of a folder's work files (no dependencies, logs or runtime output; see workFiles). */
export function snapshot(dir) {
  const out = new Map();
  for (const f of workFiles(dir)) {
    try {
      const buf = fs.readFileSync(f.abs);
      out.set(f.rel, { id: blobId(buf), buf });
    } catch { /* vanished while reading */ }
  }
  return out;
}

export const manifestFile = (labsDir) => path.join(labsDir, '_harness', 'starters.json');
export function loadManifest(labsDir) {
  try { return JSON.parse(fs.readFileSync(manifestFile(labsDir), 'utf8')); } catch { return null; }
}

const tierIndex = (level) => DIFFICULTIES.findIndex((d) => d.id === level);
/** Every level in course order (lab by lab, then tier by tier). */
export function courseOrder(catalog) {
  return catalog.flatMap((lab, labIndex) => lab.levels.map((ex) => ({ key: ex.key, lab, ex, labIndex, tierIndex: tierIndex(ex.level) })));
}

/** The level a level starts from: the tier to its left in the same lab, else the previous lab's easy level. */
export function predecessorOf(order, key) {
  const i = order.findIndex((n) => n.key === key);
  if (i < 0) return null;
  if (i > 0 && order[i - 1].labIndex === order[i].labIndex) return order[i - 1];
  for (let j = i - 1; j >= 0; j--) if (order[j].tierIndex === 0) return order[j];
  return null;
}

const sorted = (m) => [...m.keys()].sort();
const ids = (m, keys) => Object.fromEntries(keys.map((f) => [f, m.get(f).id]));

/**
 * The chain's record for one level: { from, starter: { rel: blobId }, inherited: { rel: blobId } }, or null.
 * Only sync-seeds writes it, so rebuilding `exercises` from git can never change what counts as inherited.
 * (Accepts the first format, where `starter` was a list and the IDs came from `exercises`.)
 */
export function chainEntry(manifest, key) {
  const c = manifest?.chain?.[key];
  if (!c) return null;
  const all = manifest.exercises?.[key] ?? {};
  const starter = Array.isArray(c.starter) ? Object.fromEntries(c.starter.filter((f) => f in all).map((f) => [f, all[f]])) : c.starter ?? {};
  const inherited = c.inherited ?? Object.fromEntries(Object.entries(all).filter(([f]) => !(f in starter)));
  return { from: c.from ?? null, starter, inherited };
}

/**
 * Work out every level's new src/ and sol/ in course order. Reads only: writeChain() writes.
 * manifest: the current starters.json (or null). bootstrap: accept files that differ from their inherited version as
 * overrides (listed in overridesFound, for course.json) instead of reporting them.
 */
export function computeChain({ catalog, course, manifest = null, bootstrap = false }) {
  const order = courseOrder(catalog);
  const results = new Map();
  const levels = [];
  const problems = [];
  const overridesFound = {};
  const out = { format: 2, revision: manifest?.revision ?? null, note: MANIFEST_NOTE, exercises: {}, chain: {} };
  for (const node of order) {
    const { key, ex } = node;
    const rules = levelRules(course, key);
    const pred = predecessorOf(order, key);
    const from = pred?.key ?? 'nowhere';
    const flagged = new Set();
    const say = (file, kind, message) => { flagged.add(file); problems.push({ key, file, kind, message }); };
    const src = snapshot(ex.src);
    const sol = snapshot(ex.sol);

    // 1. What this level inherits: the predecessor's new result, minus its local files and this level's drop list.
    const base = new Map();
    if (pred) {
      const local = levelRules(course, pred.key).local;
      for (const [f, e] of results.get(pred.key).sol) if (!matchAny(local, f) && !matchAny(rules.drop, f)) base.set(f, e);
    }
    // 2. Which files of the current src/ are this level's own (starter files)? The last sync's record is the baseline.
    const rec = chainEntry(manifest, key);
    const seed = rec ? { ...rec.inherited, ...rec.starter } : null;
    const wasInherited = (f) => Boolean(rec && f in rec.inherited);
    const starter = new Map();
    for (const [f, e] of src) {
      const up = base.get(f);
      const override = matchAny(rules.overrides, f);
      if (wasInherited(f)) {
        if (e.id === rec.inherited[f] || (up && e.id === up.id)) continue;
        if (override) { starter.set(f, e); continue; }
        say(f, 'edited', `${f} is inherited from ${from} but was changed in this level's src/. Add it to "overrides" for ${key} in course.json, or revert it.`);
        starter.set(f, e);
        continue;
      }
      if (up && up.id === e.id && !override) continue;
      if (up && !override) {
        if (bootstrap) (overridesFound[key] ??= []).push(f);
        else say(f, 'shadow', `${f} differs from the version inherited from ${from}. Add it to "overrides" for ${key} in course.json, or delete it from this level's src/ to inherit it.`);
      }
      starter.set(f, e);
    }
    if (rec) for (const f of Object.keys(rec.inherited)) {
      if (!src.has(f) && base.has(f)) say(f, 'deleted', `${f} is inherited from ${from} but is missing from this level's src/. Add it to "drop" for ${key} in course.json, or restore it.`);
    }
    // 3. The new src/ is the inherited base with the starter files on top.
    const newSrc = new Map([...base, ...starter]);
    // 4. The solution delta: what sol/ changes compared with the current src/. Measured against the last sync, a starter
    //    file changed (or added) only in src/ is a starter change, not something the solution undoes: it goes to sol/ too.
    const delta = new Map();
    for (const [f, e] of sol) {
      const s = src.get(f);
      if (s?.id === e.id) continue;
      if (seed && starter.has(f) && s && seed[f] === e.id) continue;
      delta.set(f, e);
    }
    const removed = [...src.keys()].filter((f) => !sol.has(f) && !(seed && starter.has(f) && !(f in seed))).sort();
    // If the inherited version of a delta file changed upstream, that is a conflict, unless upstream now has exactly
    // the solution's version.
    for (const f of [...delta.keys(), ...removed]) {
      if (flagged.has(f)) continue;
      const now = newSrc.get(f)?.id;
      if (now !== src.get(f)?.id && now !== sol.get(f)?.id) say(f, 'conflict', `The solution changes ${f}, but the version inherited from ${from} changed too. Copy the new inherited version into src/${f}, merge the solution's change into sol/${f}, then run sync-seeds again.`);
    }
    // 5. The new sol/ is the new src/ with the delta applied.
    const newSol = new Map(newSrc);
    for (const [f, e] of delta) newSol.set(f, e);
    for (const f of removed) newSol.delete(f);
    results.set(key, { sol: newSol });

    const inherited = sorted(newSrc).filter((f) => !starter.has(f));
    out.exercises[key] = ids(newSrc, sorted(newSrc));
    out.chain[key] = { from: pred?.key ?? null, starter: ids(starter, sorted(starter)), inherited: ids(newSrc, inherited) };
    const plan = (disk, want) => ({ write: sorted(want).filter((f) => disk.get(f)?.id !== want.get(f).id), remove: sorted(disk).filter((f) => !want.has(f)) });
    levels.push({ key, node, pred, src: plan(src, newSrc), sol: plan(sol, newSol), newSrc, newSol, starter: sorted(starter), inherited, delta: sorted(delta), removed });
  }
  return { levels, problems, manifest: out, overridesFound };
}

const sameEntries = (a, b) => JSON.stringify(Object.entries(a ?? {}).sort()) === JSON.stringify(Object.entries(b ?? {}).sort());
const sameChain = (manifest, key, want) => {
  const have = chainEntry(manifest, key);
  return Boolean(have) && have.from === want.from && sameEntries(have.starter, want.starter) && sameEntries(have.inherited, want.inherited);
};

/** Per level, what is out of sync between the files on disk, starters.json and the computed chain. */
export function chainIssues({ result, manifest }) {
  return result.levels.map((l) => {
    const issues = [];
    const list = (xs) => `${xs.slice(0, 6).join(', ')}${xs.length > 6 ? `, +${xs.length - 6} more` : ''}`;
    for (const side of ['src', 'sol']) {
      if (l[side].write.length) issues.push(`${side}/ out of date: ${list(l[side].write)}`);
      if (l[side].remove.length) issues.push(`${side}/ has files the chain doesn't: ${list(l[side].remove)}`);
    }
    if (!sameEntries(manifest?.exercises?.[l.key], result.manifest.exercises[l.key]) || !sameChain(manifest, l.key, result.manifest.chain[l.key])) issues.push('starters.json is out of date for this level');
    for (const p of result.problems.filter((x) => x.key === l.key)) issues.push(p.message);
    return { key: l.key, from: l.pred?.key ?? null, issues };
  });
}

function gitHead(cwd) {
  const r = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8', windowsHide: true, timeout: 10000 });
  return r.status === 0 ? r.stdout.trim() : null;
}
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
function prune(root, rel) {
  let dir = path.dirname(path.join(root, ...rel.split('/')));
  while (path.relative(root, dir) && !path.relative(root, dir).startsWith('..')) {
    try { if (fs.readdirSync(dir).length) break; fs.rmdirSync(dir); } catch { break; }
    dir = path.dirname(dir);
  }
}

/**
 * Write a computed chain: every file that changes is backed up to labs/.backups/sync-seeds-<stamp>/ first, then sol/ and
 * src/ are updated byte for byte and starters.json is rewritten. A chain with problems is refused.
 */
export function writeChain({ labsDir, result }) {
  if (result.problems?.length) throw new Error(`The chain has ${result.problems.length} problem(s), so nothing was written. Fix them first (see sync-seeds).`);
  const root = path.resolve(labsDir);
  const inside = (p) => {
    const r = path.relative(root, path.resolve(p));
    return Boolean(r) && !r.startsWith('..') && !path.isAbsolute(r);
  };
  for (const l of result.levels) for (const side of ['src', 'sol']) if (!inside(l.node.ex[side])) throw new Error(`${l.node.ex[side]} is outside the labs folder, so the chain was not written.`);
  const backupDir = path.join(labsDir, '.backups', `sync-seeds-${stamp()}`);
  let written = 0;
  let removed = 0;
  for (const l of result.levels) {
    // sol/ before src/: if a write fails half-way, the next run sees a solution file that equals the new inherited
    // version (absorbed), never a stale inherited file posing as a solution change.
    for (const side of ['sol', 'src']) {
      const dir = l.node.ex[side];
      const want = side === 'src' ? l.newSrc : l.newSol;
      const { write, remove } = l[side];
      for (const f of [...write, ...remove]) {
        const abs = path.join(dir, ...f.split('/'));
        if (!fs.existsSync(abs)) continue;
        const dest = path.join(backupDir, l.key.replace('/', '-'), side, ...f.split('/'));
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(abs, dest);
      }
      for (const f of write) {
        const abs = path.join(dir, ...f.split('/'));
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, want.get(f).buf);
        written++;
      }
      for (const f of remove) {
        fs.rmSync(path.join(dir, ...f.split('/')), { force: true });
        prune(dir, f);
        removed++;
      }
    }
  }
  const manifest = { ...result.manifest, revision: gitHead(labsDir) ?? result.manifest.revision };
  fs.mkdirSync(path.dirname(manifestFile(labsDir)), { recursive: true });
  fs.writeFileSync(manifestFile(labsDir), `${JSON.stringify(manifest, null, 2)}\n`);
  return { written, removed, backupDir: written + removed ? backupDir : null };
}
