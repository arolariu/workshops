// Remembers what you finished (labs/.progress.json, ignored by git), and binds every result to evidence:
// a fingerprint of your source and of the grader, captured before the run. A pass only counts while both match.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROGRESS_VERSION = 2;
const HARNESS = path.dirname(fileURLToPath(import.meta.url));

// ---------- fingerprints ----------
const SKIP_DIRS = new Set(['node_modules', '.git', '.agent-logs', 'apm_modules']);
const SKIP_ROOT = new Set(['runs', 'ab-results.json', 'mcp/state.json']);
const SKIP_FILE = /(^|\/)(\.DS_Store|Thumbs\.db)$|\.log$/i;
const hashCache = new Map();

function fileHash(abs, st) {
  const sig = `${st.size}:${st.mtimeMs}:${st.ctimeMs}:${st.ino}`;
  const hit = hashCache.get(abs);
  if (hit?.sig === sig) return hit.hash;
  const hash = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
  hashCache.set(abs, { sig, hash });
  return hash;
}

/** Files under `root` that count as work (no dependencies, VCS data, logs or generated output). */
export function workFiles(root) {
  const out = [];
  const walk = (dir, rel) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (SKIP_DIRS.has(e.name) || SKIP_ROOT.has(r) || SKIP_FILE.test(r)) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs, r);
      else if (e.isFile() || e.isSymbolicLink()) out.push({ rel: r, abs });
    }
  };
  walk(root, '');
  return out.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
}

function treeHash(parts) {
  const h = crypto.createHash('sha256');
  for (const [label, root] of parts) {
    for (const f of workFiles(root)) {
      let st;
      try { st = fs.statSync(f.abs); } catch { continue; }
      if (!st.isFile()) continue;
      h.update(`${label}/${f.rel}\0${fileHash(f.abs, st)}\n`);
    }
  }
  return h.digest('hex');
}

/** Fingerprint of a learner's work folder. */
export const sourceFingerprint = (src) => treeHash([['src', src]]);

const HARNESS_FILES = { checks: ['kit.mjs', 'run-checks.mjs', 'checks.mjs', 'process.mjs', 'fake-sdk'], agent: ['kit.mjs', 'agent.mjs', 'process.mjs'] };
/** Fingerprint of everything that decides the verdict: the exercise's tests and reference files, and the grading harness. */
export function assessmentFingerprint(ex, kind = 'checks') {
  const parts = [['tests', path.join(ex.dir, 'tests')], ['sol', ex.sol]];
  const h = crypto.createHash('sha256').update(treeHash(parts));
  for (const name of HARNESS_FILES[kind] ?? HARNESS_FILES.checks) {
    const abs = path.join(HARNESS, name);
    try {
      const st = fs.statSync(abs);
      h.update(`${name}\0${st.isDirectory() ? treeHash([[name, abs]]) : fileHash(abs, st)}\n`);
    } catch { h.update(`${name}\0missing\n`); }
  }
  return h.digest('hex');
}

/** Evidence stamp to capture BEFORE running an assessment. */
export function captureEvidence(ex, kind = 'checks') {
  return { sourceFingerprint: sourceFingerprint(ex.src), assessmentFingerprint: assessmentFingerprint(ex, kind), recordedAt: new Date().toISOString() };
}

/** Caches the current fingerprints per exercise until invalidated (refresh boundaries: screen changes, Next, export). */
export function evidenceTracker() {
  const cache = new Map();
  return {
    current(ex, kind = 'checks') {
      const k = `${ex.key}|${kind}`;
      if (!cache.has(k)) cache.set(k, { sourceFingerprint: sourceFingerprint(ex.src), assessmentFingerprint: assessmentFingerprint(ex, kind) });
      return cache.get(k);
    },
    invalidate(key) {
      if (!key) { cache.clear(); return; }
      for (const k of [...cache.keys()]) if (k.startsWith(`${key}|`)) cache.delete(k);
    },
  };
}

/**
 * The status a stored result has NOW: pass | fail | blocked | skipped | interrupted | stale | not-run.
 * A result whose evidence does not match the current fingerprints is stale, whatever it said.
 */
export function deriveStatus(entry, current, kind = 'checks') {
  const state = entry?.[kind];
  if (!state) return 'not-run';
  const ev = entry[`${kind}Evidence`];
  if (entry.legacy && !ev) return 'stale';
  if (!ev || !current) return 'stale';
  if (ev.sourceFingerprint !== current.sourceFingerprint || ev.assessmentFingerprint !== current.assessmentFingerprint) return 'stale';
  return state;
}

// ---------- the store ----------
function migrate(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && raw.version === PROGRESS_VERSION && raw.entries && typeof raw.entries === 'object' && !Array.isArray(raw.entries)) return { data: raw, migrated: false };
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && raw.version === undefined) {
    const entries = {};
    for (const [k, v] of Object.entries(raw)) {
      if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
      entries[k] = /^lab-\d\d\//.test(k) && (v.checks || v.agent) ? { ...v, legacy: true } : { ...v };
    }
    return { data: { version: PROGRESS_VERSION, entries }, migrated: true };
  }
  return null;
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const LOCK_STALE_MS = 5000;
const LOCK_WAIT_MS = 6000;
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const gone = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return false; } catch (e) { return e.code === 'ESRCH'; }
};

export function progressStore(labsDir, { fileName = '.progress.json' } = {}) {
  const file = path.join(labsDir, fileName);
  let data = { version: PROGRESS_VERSION, entries: {} };
  let seen = null;
  let writable = true;
  let error = null;
  let warning = null;
  // Every save renames a fresh file into place, so the inode tells writes apart even when size and mtime match.
  const sigOf = () => { try { const st = fs.statSync(file); return st.isFile() ? `${st.size}:${st.mtimeMs}:${st.ino}` : 'not-a-file'; } catch { return null; } };
  const lockFile = `${file}.lock`;

  /** Run `fn` while holding a cross-process lock, so reload-merge-save never interleaves with another app or command. */
  function locked(fn) {
    let held = false;
    const until = Date.now() + LOCK_WAIT_MS;
    for (;;) {
      try { fs.writeFileSync(lockFile, `${process.pid}\n`, { flag: 'wx' }); held = true; break; } catch (e) {
        if (e.code !== 'EEXIST') break; // no lock possible here (read-only folder…): save() reports the real problem
        try {
          const st = fs.statSync(lockFile);
          const owner = Number.parseInt(fs.readFileSync(lockFile, 'utf8'), 10);
          if (Date.now() - st.mtimeMs > LOCK_STALE_MS || gone(owner)) { fs.rmSync(lockFile, { force: true }); continue; }
        } catch { continue; }
        if (Date.now() > until) break;
        pause(5 + Math.floor(Math.random() * 20));
      }
    }
    try { return fn(); } finally {
      if (held) { try { fs.rmSync(lockFile, { force: true }); } catch { /* best effort */ } }
    }
  }

  function load({ initial = false } = {}) {
    const sig = sigOf();
    if (sig === null) { seen = null; return initial ? false : false; }
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch (e) {
      writable = false;
      error = `Your progress file could not be read (${e.code ?? e.message}); progress is kept in memory only.`;
      seen = sig;
      return false;
    }
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { parsed = undefined; }
    if (parsed && typeof parsed === 'object' && Number.isInteger(parsed.version) && parsed.version > PROGRESS_VERSION) {
      writable = false;
      error = `${fileName} was written by a newer version of the lab app; it is left untouched and progress is kept in memory only.`;
      seen = sig;
      return false;
    }
    const m = parsed === undefined ? null : migrate(parsed);
    if (!m) {
      const copy = path.join(labsDir, `.progress.corrupt-${stamp()}-${process.pid}.json`);
      try {
        fs.copyFileSync(file, copy, fs.constants.COPYFILE_EXCL);
        warning = `Your progress file could not be read, so a copy was kept at ${copy} and the app started fresh.`;
      } catch (e) {
        writable = false;
        error = `Your progress file could not be read and could not be backed up (${e.code ?? e.message}); it is left untouched and progress is kept in memory only.`;
      }
      seen = sig;
      return false;
    }
    data = m.data;
    seen = sig;
    return true;
  }

  function save() {
    if (!writable) return false;
    const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    try {
      fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { flag: 'wx' });
      for (let i = 0; ; i++) {
        try { fs.renameSync(tmp, file); break; } catch (e) {
          if (i >= 4 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
          const until = Date.now() + 20 * (i + 1);
          while (Date.now() < until) { /* brief retry for Windows file locks */ }
        }
      }
      seen = sigOf();
      error = null;
      return true;
    } catch (e) {
      try { fs.rmSync(tmp, { force: true }); } catch { /* best effort */ }
      error = `Progress could not be saved (${e.code ?? e.message}); it is kept in memory for now.`;
      if (['EISDIR', 'ENOTDIR', 'EROFS'].includes(e.code)) writable = false;
      return false;
    }
  }

  /** Re-read the file if someone else changed it. Returns true when new data was loaded. */
  function reload() {
    if (!writable && error) return false;
    const sig = sigOf();
    if (sig === seen) return false;
    return load();
  }

  load({ initial: true });
  if (sigOf() === 'not-a-file') { writable = false; error = `${file} is not a file; progress is kept in memory only.`; }

  const store = {
    file,
    get: (key) => data.entries[key] ?? {},
    all: () => data.entries,
    reload,
    status: () => ({ file, writable, error, warning }),
    set(key, patch) {
      const apply = () => {
        reload();
        data.entries[key] = { ...(data.entries[key] ?? {}), ...patch, updated: new Date().toISOString() };
        save();
      };
      if (writable) locked(apply); else apply();
    },
    /** Record a check run. Complete results replace the evidence; a cancelled run keeps the previous result. */
    recordChecks(key, result, evidence) {
      const attempt = { state: result.state, at: new Date().toISOString() };
      if (result.state === 'cancelled') { store.set(key, { lastAttempt: attempt }); return; }
      const firstFail = result.results?.find((r) => r.status === 'fail' || r.status === 'blocked');
      store.set(key, {
        checks: result.state,
        passed: result.passed ?? 0,
        total: result.total ?? 0,
        nextFix: firstFail?.name ?? null,
        checksEvidence: evidence,
        lastAttempt: attempt,
        legacy: false,
      });
    },
    /** Record an agent suite with the same evidence rules. */
    recordAgent(key, result, evidence) {
      const attempt = { state: result.state, at: new Date().toISOString(), runId: result.runId ?? null };
      if (result.state === 'cancelled') { store.set(key, { lastAgentAttempt: attempt }); return; }
      store.set(key, { agent: result.state, agentEvidence: evidence, agentRunId: result.runId ?? null, lastAgentAttempt: attempt, legacy: false });
    },
  };
  return store;
}
