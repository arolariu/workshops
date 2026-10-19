// Recovery for one exercise's src/ folder, with or without git:
//   • the starter: the published original (from git, via labs/_harness/starters.json) or, for ZIP downloads, the copy
//     taken the first time the lab app touched the exercise;
//   • named checkpoints you save yourself;
//   • backups, taken automatically before every restore or reset;
//   • "discard since my latest commit" (git only), kept separate from all of the above.
// Snapshots live in labs/.recovery/<lab>-<level>/ and are published atomically with a hash for every file.
// Also: a source-to-reference comparison with real unified diffs.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSpec } from './process.mjs';
import { workFiles } from './progress.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_MANIFEST = path.join(HERE, 'starters.json');
/** Never copied into snapshots and never deleted by a restore. */
const KEEP = new Set(['node_modules', '.git', '.agent-logs', 'apm_modules']);
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const gitBlobId = (buf) => crypto.createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
const isText = (buf) => !buf.subarray(0, 8000).includes(0);
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const rand = () => crypto.randomBytes(3).toString('hex');

// ---------- git ----------
function gitSync(gitBin, args, { cwd, input } = {}) {
  const spec = spawnSpec(gitBin, args);
  if (spec.missing) return { missing: true, status: null, stdout: '', stderr: `${gitBin} was not found.` };
  const r = spawnSync(spec.file, spec.args, { cwd, input: input === undefined ? undefined : Buffer.from(input), windowsVerbatimArguments: spec.windowsVerbatimArguments, windowsHide: true, timeout: 30000, maxBuffer: 64 * 1024 * 1024 });
  return { missing: false, status: r.status, stdout: r.stdout ?? Buffer.alloc(0), stderr: String(r.stderr ?? ''), error: r.error };
}
const gitText = (gitBin, args, opts) => {
  const r = gitSync(gitBin, args, opts);
  return { ...r, text: r.stdout.toString('utf8') };
};

/** Files changed in `dir` compared to the last commit: [{ file, status: 'new' | 'changed' | 'deleted' }], or null without git. */
export function changes(dir, { gitBin = 'git' } = {}) {
  const prefix = gitText(gitBin, ['rev-parse', '--show-prefix'], { cwd: dir });
  if (prefix.missing || prefix.status !== 0) return null;
  if (gitText(gitBin, ['rev-parse', '--verify', '-q', 'HEAD'], { cwd: dir }).status !== 0) return null;
  const r = gitText(gitBin, ['status', '--porcelain', '--untracked-files=all', '--', '.'], { cwd: dir });
  if (r.status !== 0) return null;
  const pre = prefix.text.trim();
  return r.text.split('\n').filter(Boolean).map((line) => {
    const code = line.slice(0, 2);
    let file = line.slice(3).trim();
    if (file.includes(' -> ')) file = file.split(' -> ').pop();
    file = file.replace(/^"|"$/g, '');
    if (pre && file.startsWith(pre)) file = file.slice(pre.length);
    const status = code.includes('?') || code.includes('A') ? 'new' : code.includes('D') ? 'deleted' : 'changed';
    return { file, status };
  });
}

const NO_GIT = {
  'no-git': 'git is not installed, so there is no last commit to compare with. Install git, or press s to compare your work with the reference solution instead.',
  'no-repo': 'This folder is not in a git repository, so there is no last commit to compare with. To start tracking your work, run `git init`, then `git add -A` and `git commit -m start` in the workshop folder.',
  'no-commit': 'This repository has no commit yet. Run `git add -A` and `git commit -m start` in the workshop folder; after that, your changes show up here.',
};
/**
 * Your changes in `dir` since the last commit, file by file, as unified diffs (line endings normalised):
 * { ok: true, files: [{ path, status, binary, diff, note }] }, or { ok: false, why, message } when git can't tell.
 */
export function changesDiff(dir, { gitBin = 'git' } = {}) {
  const fail = (why) => ({ ok: false, why, message: NO_GIT[why] });
  const prefix = gitText(gitBin, ['rev-parse', '--show-prefix'], { cwd: dir });
  if (prefix.missing) return fail('no-git');
  if (prefix.status !== 0) return fail('no-repo');
  if (gitText(gitBin, ['rev-parse', '--verify', '-q', 'HEAD'], { cwd: dir }).status !== 0) return fail('no-commit');
  const pre = prefix.text.trim();
  const text = (buf) => buf.toString('utf8').replace(/\r\n/g, '\n');
  const files = (changes(dir, { gitBin }) ?? []).map(({ file, status }) => {
    const shown = status === 'new' ? null : gitSync(gitBin, ['show', `HEAD:${pre}${file}`], { cwd: dir });
    const before = shown && shown.status === 0 ? shown.stdout : Buffer.alloc(0);
    let after = Buffer.alloc(0);
    if (status !== 'deleted') { try { after = fs.readFileSync(path.join(dir, ...file.split('/'))); } catch { /* removed meanwhile */ } }
    if (!isText(before) || !isText(after)) return { path: file, status, binary: true, diff: '', note: 'A binary file: no line-by-line view.' };
    const diff = text(before) === text(after) ? '' : unifiedDiff(text(before), text(after), { from: 'last commit', to: 'yours' });
    return { path: file, status, binary: false, diff, note: diff ? null : 'Only the line endings changed.' };
  }).sort((a, b) => a.path.localeCompare(b.path));
  return { ok: true, files };
}

// ---------- paths and safety ----------
/** labs/.recovery/<lab>-<level>, after checking the exercise really is a lab exercise inside labsDir. */
export function recoveryDir(labsDir, ex) {
  if (!/^lab-\d\d$/.test(ex?.labId ?? '') || !/^[a-z-]+$/.test(ex?.level ?? '')) throw new Error('Not a lab exercise.');
  const rel = path.relative(path.resolve(labsDir), path.resolve(ex.src));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('The exercise folder is outside the labs.');
  return path.join(labsDir, '.recovery', `${ex.labId}-${ex.level}`);
}

/** Every file under `root` (skipping KEEP folders), refusing links of any kind. */
function scan(root) {
  const files = [];
  const links = [];
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (KEEP.has(e.name)) continue;
      const abs = path.join(dir, e.name);
      const st = fs.lstatSync(abs);
      if (st.isSymbolicLink()) { links.push(r); continue; }
      if (st.isDirectory()) walk(abs, r);
      else if (st.isFile()) files.push({ rel: r, abs, size: st.size });
      else links.push(r);
    }
  };
  if (fs.existsSync(root)) {
    if (fs.lstatSync(root).isSymbolicLink()) links.push('.');
    else walk(root, '');
  }
  return { files: files.sort((a, b) => (a.rel < b.rel ? -1 : 1)), links };
}
const refuseLinks = (links) => (links.length ? `Your folder contains a link (${links.slice(0, 3).join(', ')}). The lab app does not follow links, so it refuses to touch this folder. Move the link away and try again.` : null);

/** A snapshot path must stay inside its folder: relative, forward slashes, no "..", no drive letters. */
const safeRel = (p) => typeof p === 'string' && p.length > 0 && p.length < 400 && !p.includes('\\') && !p.includes('\0') && !/^[A-Za-z]:/.test(p) && !p.startsWith('/') && p.split('/').every((s) => s && s !== '.' && s !== '..');

// ---------- snapshots ----------
/** Copy `src` into parent/<name> atomically (via a .tmp- folder). Returns { dir, meta }. Throws with a reason. */
function publish(src, parent, name, meta) {
  const { files, links } = scan(src);
  const linkProblem = refuseLinks(links);
  if (linkProblem) throw new Error(linkProblem);
  const final = path.join(parent, name);
  if (fs.existsSync(final)) throw new Error(`"${name}" already exists.`);
  fs.mkdirSync(parent, { recursive: true });
  const tmp = path.join(parent, `.tmp-${process.pid}-${rand()}`);
  try {
    const list = [];
    for (const f of files) {
      const dest = path.join(tmp, 'files', ...f.rel.split('/'));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const buf = fs.readFileSync(f.abs);
      fs.writeFileSync(dest, buf);
      list.push({ path: f.rel, size: buf.length, sha256: sha256(buf) });
    }
    fs.mkdirSync(path.join(tmp, 'files'), { recursive: true });
    const full = { format: 1, ...meta, name, createdAt: new Date().toISOString(), files: list, complete: true };
    fs.writeFileSync(path.join(tmp, 'meta.json'), `${JSON.stringify(full, null, 2)}\n`);
    fs.renameSync(tmp, final);
    return { dir: final, meta: full };
  } catch (e) {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* the .tmp- folder will be listed as incomplete */ }
    throw e;
  }
}

/** Read and fully verify a snapshot folder. Returns { ok, meta, problem }. */
function inspectSnapshot(dir) {
  const name = path.basename(dir);
  if (name.startsWith('.tmp-')) return { ok: false, problem: 'Unfinished: saving was interrupted. It cannot be restored.' };
  let meta;
  try { meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')); } catch (e) {
    return { ok: false, problem: `Its description (meta.json) is missing or unreadable (${e.code ?? 'invalid JSON'}).` };
  }
  if (meta?.format !== 1 || meta.complete !== true || !Array.isArray(meta.files)) return { ok: false, meta, problem: 'Its description is incomplete or from an unknown version.' };
  for (const f of meta.files) {
    if (!safeRel(f?.path)) return { ok: false, meta, problem: `It lists an unsafe path (${String(f?.path).slice(0, 60)}).` };
    let buf;
    try { buf = fs.readFileSync(path.join(dir, 'files', ...f.path.split('/'))); } catch { return { ok: false, meta, problem: `${f.path} is missing from it.` }; }
    if (buf.length !== f.size || sha256(buf) !== f.sha256) return { ok: false, meta, problem: `${f.path} changed after it was saved.` };
  }
  return { ok: true, meta };
}

function listKind(parent, kind) {
  const ok = [];
  const bad = [];
  let entries = [];
  try { entries = fs.readdirSync(parent, { withFileTypes: true }).filter((d) => d.isDirectory()); } catch { return { ok, bad }; }
  for (const d of entries) {
    const dir = path.join(parent, d.name);
    const r = inspectSnapshot(dir);
    const entry = { id: `${kind}:${d.name}`, kind, name: d.name, dir, createdAt: r.meta?.createdAt ?? null, fileCount: r.meta?.files?.length ?? 0, reason: r.meta?.reason ?? null };
    if (r.ok) ok.push(entry); else bad.push({ ...entry, problem: r.problem });
  }
  ok.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return { ok, bad };
}

// ---------- the published starter ----------
function readManifest(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

/** Build starters.json from git HEAD: every tracked file of every exercise's src/, as git blob IDs. */
export function buildStarterManifest(labsDir, catalog, { gitBin = 'git' } = {}) {
  const head = gitText(gitBin, ['rev-parse', 'HEAD'], { cwd: labsDir });
  if (head.missing || head.status !== 0) throw new Error('Building the starter manifest needs git and a commit.');
  const exercises = {};
  for (const lab of catalog) {
    for (const ex of lab.levels) {
      const r = gitSync(gitBin, ['ls-tree', '-r', '-z', 'HEAD', '.'], { cwd: ex.src });
      if (r.status !== 0) continue;
      const files = {};
      for (const rec of r.stdout.toString('utf8').split('\0').filter(Boolean)) {
        const m = rec.match(/^\d+ blob ([0-9a-f]{40,64})\t(.+)$/);
        if (m) files[m[2]] = m[1];
      }
      if (Object.keys(files).length) exercises[ex.key] = files;
    }
  }
  return { format: 1, revision: head.text.trim(), note: 'Git blob IDs of every published starter file. Regenerate with: node labs/start.mjs starters --write', exercises };
}

/** Does the folder's content match the published starter? (Line endings are normalized for the comparison.) */
function matchesManifest(entries, files) {
  if (!entries) return false;
  const want = Object.entries(entries);
  if (want.length !== files.length) return false;
  const byRel = new Map(files.map((f) => [f.rel, f]));
  return want.every(([rel, id]) => {
    const f = byRel.get(rel);
    if (!f) return false;
    const buf = f.buffer ?? fs.readFileSync(f.abs);
    return gitBlobId(buf) === id || (isText(buf) && gitBlobId(Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'))) === id);
  });
}

/** The published starter's files from git objects, or null when this checkout cannot provide them. */
function publishedFiles(ex, entries, gitBin) {
  if (!entries) return null;
  const prefix = gitText(gitBin, ['rev-parse', '--show-prefix'], { cwd: ex.src });
  if (prefix.missing || prefix.status !== 0) return null;
  const ids = Object.values(entries);
  const check = gitText(gitBin, ['cat-file', '--batch-check'], { cwd: ex.src, input: `${ids.join('\n')}\n` });
  if (check.status !== 0 || /missing/.test(check.text)) return null;
  const out = [];
  for (const [rel, id] of Object.entries(entries)) {
    if (!safeRel(rel)) return null;
    let r = gitSync(gitBin, ['cat-file', '--filters', `--path=${prefix.text.trim()}${rel}`, id], { cwd: ex.src });
    if (r.status !== 0) r = gitSync(gitBin, ['cat-file', 'blob', id], { cwd: ex.src });
    if (r.status !== 0) return null;
    out.push({ rel, buffer: r.stdout });
  }
  return out;
}

/**
 * Make sure the exercise has an immutable starter before the lab app runs checks or opens an editor on it.
 * For ZIP downloads this first-use copy is the only starter; it records whether it matches the published starter.
 */
export function ensureStarter(labsDir, ex, { manifestFile = DEFAULT_MANIFEST } = {}) {
  const parent = recoveryDir(labsDir, ex);
  const existing = inspectSnapshot(path.join(parent, 'starter'));
  if (existing.ok) return { created: false, verified: Boolean(existing.meta.verified) };
  if (fs.existsSync(path.join(parent, 'starter'))) return { created: false, verified: false, problem: existing.problem };
  try {
    const entries = readManifest(manifestFile)?.exercises?.[ex.key];
    const verified = matchesManifest(entries, scan(ex.src).files);
    publish(ex.src, parent, 'starter', { kind: 'starter', exercise: ex.key, reason: 'first-use', verified });
    return { created: true, verified };
  } catch (e) {
    return { created: false, verified: false, problem: e.message };
  }
}

/** Starter, checkpoints, backups, legacy backups and anything incomplete, for one exercise. */
export function listRecovery(labsDir, ex, { manifestFile = DEFAULT_MANIFEST } = {}) {
  const parent = recoveryDir(labsDir, ex);
  const starterDir = path.join(parent, 'starter');
  const s = fs.existsSync(starterDir) ? inspectSnapshot(starterDir) : null;
  const checkpoints = listKind(path.join(parent, 'checkpoints'), 'checkpoint');
  const backups = listKind(path.join(parent, 'backups'), 'backup');
  const legacy = [];
  try {
    for (const d of fs.readdirSync(path.join(labsDir, '.backups'), { withFileTypes: true })) {
      if (d.isDirectory() && d.name.startsWith(`${ex.labId}-${ex.level}-`)) legacy.push({ id: `legacy:${d.name}`, kind: 'legacy', name: d.name, dir: path.join(labsDir, '.backups', d.name), createdAt: null, note: 'Made by an older version of the lab app; not verified.' });
    }
  } catch { /* none */ }
  const incomplete = [...checkpoints.bad, ...backups.bad];
  if (s && !s.ok) incomplete.push({ id: 'starter', kind: 'starter', name: 'starter', dir: starterDir, problem: s.problem });
  return {
    published: Boolean(readManifest(manifestFile)?.exercises?.[ex.key]),
    starter: s?.ok ? { id: 'starter', kind: 'starter', name: 'starter', dir: starterDir, createdAt: s.meta.createdAt, verified: Boolean(s.meta.verified), fileCount: s.meta.files.length } : null,
    checkpoints: checkpoints.ok,
    backups: backups.ok,
    legacy,
    incomplete,
  };
}

/** Save the current work as a named checkpoint. */
export function createCheckpoint(labsDir, ex, name) {
  if (!NAME.test(String(name ?? '')) || RESERVED.test(name)) return { ok: false, reason: 'Use a short name made of letters, digits, dots, dashes or underscores (for example: before-refactor).' };
  try {
    const { dir } = publish(ex.src, path.join(recoveryDir(labsDir, ex), 'checkpoints'), name, { kind: 'checkpoint', exercise: ex.key });
    return { ok: true, id: `checkpoint:${name}`, dir };
  } catch (e) {
    return { ok: false, reason: `Could not save the checkpoint: ${e.message}` };
  }
}

function backupNow(labsDir, ex, reason) {
  const name = `${stamp()}-${rand()}`;
  const { dir } = publish(ex.src, path.join(recoveryDir(labsDir, ex), 'backups'), name, { kind: 'backup', exercise: ex.key, reason });
  return { id: `backup:${name}`, dir };
}
/** Back up the work folder to the recovery backups (restorable with "x"), before something else changes it. */
export const backupWork = (labsDir, ex, reason) => backupNow(labsDir, ex, reason);

/** Replace the work folder's files (not KEEP folders) with `files` [{ rel, buffer }]. A backup is taken first. */
function replaceWork(labsDir, ex, files, reason) {
  const { files: current, links } = scan(ex.src);
  const linkProblem = refuseLinks(links);
  if (linkProblem) return { ok: false, reason: linkProblem };
  if (!files.every((f) => safeRel(f.rel))) return { ok: false, reason: 'The snapshot lists an unsafe path, so it was not restored.' };
  let backup;
  try { backup = backupNow(labsDir, ex, reason); } catch (e) {
    return { ok: false, reason: `Nothing was changed, because your current files could not be backed up first: ${e.message}` };
  }
  try {
    for (const f of current) fs.rmSync(f.abs, { force: true });
    fs.mkdirSync(ex.src, { recursive: true });
    const prune = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!e.isDirectory() || KEEP.has(e.name)) continue;
        const abs = path.join(dir, e.name);
        prune(abs);
        if (!fs.readdirSync(abs).length) fs.rmdirSync(abs);
      }
    };
    prune(ex.src);
    for (const f of files) {
      const dest = path.join(ex.src, ...f.rel.split('/'));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, f.buffer);
    }
  } catch (e) {
    return { ok: false, reason: `The restore stopped part-way (${e.message}). Your previous files are safe in ${backup.dir}.`, backup };
  }
  return { ok: true, backup, restored: files.length, removed: current.length };
}

function snapshotFiles(dir) {
  const r = inspectSnapshot(dir);
  if (!r.ok) return { problem: r.problem };
  return { files: r.meta.files.map((f) => ({ rel: f.path, buffer: fs.readFileSync(path.join(dir, 'files', ...f.path.split('/'))) })), meta: r.meta };
}

/** Put the original starter back: the published one when git can provide it, else the first-use copy. */
export function restoreStarter(labsDir, ex, { gitBin = 'git', manifestFile = DEFAULT_MANIFEST } = {}) {
  let parent;
  try { parent = recoveryDir(labsDir, ex); } catch (e) { return { ok: false, reason: e.message }; }
  const entries = readManifest(manifestFile)?.exercises?.[ex.key];
  const published = publishedFiles(ex, entries, gitBin);
  if (published) {
    const r = replaceWork(labsDir, ex, published, 'restore-starter');
    return { ...r, source: 'published', note: 'This is the starter exactly as the workshop published it.' };
  }
  const local = snapshotFiles(path.join(parent, 'starter'));
  if (local.files) {
    const r = replaceWork(labsDir, ex, local.files, 'restore-starter');
    const note = local.meta.verified
      ? 'This is the copy taken the first time you used the lab app on this exercise; it matches the published starter.'
      : 'This is the copy taken the first time you used the lab app on this exercise. Without git it cannot be compared with the published starter, so it may include changes you made before that.';
    return { ...r, source: 'first-use', note };
  }
  return { ok: false, reason: local.problem && fs.existsSync(path.join(parent, 'starter')) ? `The starter copy cannot be used: ${local.problem}` : 'No starter is available: this checkout has no published starter in git and no first-use copy was taken. Extract this level\'s src/ again from the workshop download.' };
}

/** Restore "checkpoint:<name>", "backup:<name>" or "legacy:<name>". */
export function restoreSnapshot(labsDir, ex, id) {
  const m = String(id ?? '').match(/^(checkpoint|backup|legacy):(.+)$/);
  if (!m || !NAME.test(m[2])) return { ok: false, reason: `"${id}" is not a checkpoint or backup of this exercise.` };
  let parent;
  try { parent = recoveryDir(labsDir, ex); } catch (e) { return { ok: false, reason: e.message }; }
  const [, kind, name] = m;
  if (kind === 'legacy') {
    if (!name.startsWith(`${ex.labId}-${ex.level}-`)) return { ok: false, reason: 'That backup belongs to another exercise.' };
    const dir = path.join(labsDir, '.backups', name);
    if (!fs.existsSync(dir)) return { ok: false, reason: `There is no backup called ${name}.` };
    const { files, links } = scan(dir);
    if (links.length) return { ok: false, reason: refuseLinks(links) };
    return { ...replaceWork(labsDir, ex, files.map((f) => ({ rel: f.rel, buffer: fs.readFileSync(f.abs) })), `restore-${kind}`), source: 'legacy' };
  }
  const dir = path.join(parent, kind === 'checkpoint' ? 'checkpoints' : 'backups', name);
  if (!fs.existsSync(dir)) return { ok: false, reason: `There is no ${kind} called ${name}.` };
  const snap = snapshotFiles(dir);
  if (!snap.files) return { ok: false, reason: `That ${kind} cannot be restored: ${snap.problem}` };
  return { ...replaceWork(labsDir, ex, snap.files, `restore-${kind}`), source: kind };
}

/** Discard everything since your latest commit (git only). Your current files are backed up first. */
export function resetToCommit(labsDir, ex, { gitBin = 'git' } = {}) {
  const prefix = gitText(gitBin, ['rev-parse', '--show-prefix'], { cwd: ex.src });
  if (prefix.missing) return { ok: false, reason: 'git is not installed. Use "restore the starter" instead.' };
  if (prefix.status !== 0) return { ok: false, reason: 'this folder is not inside a git repository (did you download the zip?). Use "restore the starter" instead.' };
  if (gitText(gitBin, ['rev-parse', '--verify', '-q', 'HEAD'], { cwd: ex.src }).status !== 0) return { ok: false, reason: 'the repository has no commit yet to go back to.' };
  const changed = changes(ex.src, { gitBin }) ?? [];
  if (!changed.length) return { ok: false, reason: 'nothing to discard: this folder already matches your latest commit.', clean: true };
  const { links } = scan(ex.src);
  if (links.length) return { ok: false, reason: refuseLinks(links) };
  let backup;
  try { backup = backupNow(labsDir, ex, 'reset-to-commit'); } catch (e) {
    return { ok: false, reason: `Nothing was changed, because your current files could not be backed up first: ${e.message}` };
  }
  const co = gitText(gitBin, ['checkout', 'HEAD', '--', '.'], { cwd: ex.src });
  if (co.status !== 0 && !/did not match/.test(co.stderr)) return { ok: false, reason: co.stderr.trim() || 'git checkout failed.', backup };
  const cl = gitText(gitBin, ['clean', '-fdq', '--', '.'], { cwd: ex.src });
  if (cl.status !== 0) return { ok: false, reason: cl.stderr.trim() || 'git clean failed.', backup };
  return { ok: true, backup, count: changed.length };
}

// ---------- comparison with the reference ----------
function splitLines(text) {
  if (text === '') return [];
  const lines = text.split('\n');
  const noEol = !text.endsWith('\n');
  if (!noEol) lines.pop();
  return lines.map((l, i) => (noEol && i === lines.length - 1 ? `${l}\u0000` : l));
}

/** Myers diff of two line arrays → [{ op: ' ' | '-' | '+', line }]. */
function diffLines(a, b) {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const off = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace = [];
  for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[off + k] = x;
      if (x >= n && y >= m) {
        const ops = [];
        let cx = n;
        let cy = m;
        for (let dd = d; dd > 0; dd--) {
          const pv = trace[dd];
          const kk = cx - cy;
          const prevK = kk === -dd || (kk !== dd && pv[off + kk - 1] < pv[off + kk + 1]) ? kk + 1 : kk - 1;
          const px = pv[off + prevK];
          const py = px - prevK;
          while (cx > px && cy > py) { ops.push({ op: ' ', line: a[--cx] }); cy--; }
          if (cx === px) ops.push({ op: '+', line: b[--cy] });
          else ops.push({ op: '-', line: a[--cx] });
        }
        while (cx > 0 && cy > 0) { ops.push({ op: ' ', line: a[--cx] }); cy--; }
        return ops.reverse();
      }
    }
  }
  return [];
}

/** A unified diff (`--- from` / `+++ to` / `@@` hunks) of two texts. Empty string when equal. */
export function unifiedDiff(aText, bText, { from = 'a', to = 'b', context = 3 } = {}) {
  const a = splitLines(aText);
  const b = splitLines(bText);
  if (a.length + b.length > 20000) return `--- ${from}\n+++ ${to}\n(These files are too large to compare line by line.)\n`;
  const ops = diffLines(a, b);
  if (!ops.some((o) => o.op !== ' ')) return '';
  const fmt = (o) => {
    const noEol = o.line.endsWith('\u0000');
    return `${o.op}${noEol ? o.line.slice(0, -1) : o.line}\n${noEol ? '\\ No newline at end of file\n' : ''}`;
  };
  const range = (start, count) => (count === 1 ? `${start}` : `${count === 0 ? start - 1 : start},${count}`);
  let out = `--- ${from}\n+++ ${to}\n`;
  let i = 0;
  let ai = 0;
  let bi = 0;
  const pos = ops.map((o) => {
    const p = { a: ai, b: bi };
    if (o.op !== '+') ai++;
    if (o.op !== '-') bi++;
    return p;
  });
  while (i < ops.length) {
    if (ops[i].op === ' ') { i++; continue; }
    let start = Math.max(0, i - context);
    let end = i;
    while (end < ops.length) {
      if (ops[end].op !== ' ') { end++; continue; }
      let run = 0;
      while (end + run < ops.length && ops[end + run].op === ' ') run++;
      if (end + run >= ops.length || run > context * 2) { end = Math.min(ops.length, end + context); break; }
      end += run;
    }
    const slice = ops.slice(start, end);
    const aCount = slice.filter((o) => o.op !== '+').length;
    const bCount = slice.filter((o) => o.op !== '-').length;
    out += `@@ -${range(pos[start].a + 1, aCount)} +${range(pos[start].b + 1, bCount)} @@\n${slice.map(fmt).join('')}`;
    i = end;
  }
  return out;
}

/**
 * Compare your folder with the reference solution. Reference solutions are examples, not a byte-for-byte target.
 * { files: [{ path, status: changed | missing | extra, binary, note, diff }], summary: { changed, missing, extra, same } }
 */
export function compareTrees(mineDir, refDir) {
  const mine = new Map(workFiles(mineDir).map((f) => [f.rel, f.abs]));
  const ref = new Map(workFiles(refDir).map((f) => [f.rel, f.abs]));
  const names = [...new Set([...mine.keys(), ...ref.keys()])].sort();
  const files = [];
  const summary = { changed: 0, missing: 0, extra: 0, same: 0 };
  for (const p of names) {
    const a = mine.has(p) ? fs.readFileSync(mine.get(p)) : null;
    const b = ref.has(p) ? fs.readFileSync(ref.get(p)) : null;
    if (a && b && a.equals(b)) { summary.same++; continue; }
    const status = !a ? 'missing' : !b ? 'extra' : 'changed';
    summary[status]++;
    const binary = (a && !isText(a)) || (b && !isText(b));
    const labelA = a ? `yours/${p}` : '/dev/null';
    const labelB = b ? `reference/${p}` : '/dev/null';
    if (binary) { files.push({ path: p, status, binary: true, note: null, diff: `Binary files ${labelA} and ${labelB} differ\n` }); continue; }
    const ta = a ? a.toString('utf8') : '';
    const tb = b ? b.toString('utf8') : '';
    const note = a && b && ta.replace(/\r\n/g, '\n') === tb.replace(/\r\n/g, '\n') ? 'Only line endings differ (CRLF vs LF).' : null;
    files.push({ path: p, status, binary: false, note, diff: note ? '' : unifiedDiff(ta, tb, { from: labelA, to: labelB }) });
  }
  return { files, summary };
}
