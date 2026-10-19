// ⛓️ A tamper-evident audit log: a hash chain. Every entry carries the hash of the entry before it, so changing,
// removing or reordering any line breaks every link after it, and the head file catches a cut-off tail.
//   entry on disk: { ...fields, seq, prev, hash }   seq: 1, 2, 3 …   prev: the previous entry's hash (64 zeros first)
//   hash = sha256 hex of: prev + "\n" + canonical(the entry without its hash)
//   <file>.head holds "<seq> <hash>" of the last entry
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const GENESIS = '0'.repeat(64);

// ---------- plumbing: you don't need to change anything in this block ----------
/** JSON with the keys of every object sorted (and undefined fields dropped, as on disk), so an entry always hashes the same. */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).filter((k) => value[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
/** Run fn while holding <file>.lock, so two hooks running at once can't both append after the same entry. It waits about
 * a second at most (a hook must stay fast), and breaks a lock older than two seconds (its holder crashed). */
export function withLock(file, fn) {
  const lock = `${file}.lock`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (let i = 0; ; i++) {
    try {
      fs.closeSync(fs.openSync(lock, 'wx'));
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 2000) fs.rmSync(lock, { force: true }); } catch { /* gone already */ }
      if (i >= 100) throw new Error(`${lock} is held by someone else`);
      sleep(10);
    }
  }
  try { return fn(); } finally { fs.rmSync(lock, { force: true }); }
}
/** The lines of a file, without the empty one after the last newline. */
export function readLines(file) {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

// ---------- M4 · append and verify ----------
/** The last entry that parses (a torn or damaged last line must not stop the log: verify() still reports it). */
function lastEntry(lines) {
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const e = JSON.parse(lines[i]);
      if (Number.isInteger(e?.seq) && typeof e.hash === 'string') return e;
    } catch { /* keep looking */ }
  }
  return null;
}

/** Append one entry (an object without seq, prev or hash): link it to the last one, and update the head file. */
export function append(file, entry) {
  return withLock(file, () => {
    const last = lastEntry(readLines(file));
    const prev = last?.hash ?? GENESIS;
    const seq = last?.seq ?? 0;
    const body = { ...entry, seq: seq + 1, prev };
    const hash = sha256(`${prev}\n${canonical(body)}`);
    // A last line without its newline (a write that was cut off) gets one, so the new entry starts on its own line.
    const torn = fs.existsSync(file) && fs.statSync(file).size > 0 && !fs.readFileSync(file, 'utf8').endsWith('\n');
    fs.appendFileSync(file, `${torn ? '\n' : ''}${JSON.stringify({ ...body, hash })}\n`);
    fs.writeFileSync(`${file}.head`, `${body.seq} ${hash}\n`);
    return { seq: body.seq, hash };
  });
}

/** { ok, entries, problems: [{ line, kind: 'unreadable' | 'hash' | 'link' | 'seq' | 'head' }] } */
export function verify(file) {
  const problems = [];
  const entries = [];
  let prev = GENESIS;
  let seq = 0;
  const lines = readLines(file);
  lines.forEach((line, i) => {
    let e;
    try { e = JSON.parse(line); } catch { problems.push({ line: i + 1, kind: 'unreadable' }); return; }
    const { hash, ...body } = e ?? {};
    if (hash !== sha256(`${body.prev}\n${canonical(body)}`)) problems.push({ line: i + 1, kind: 'hash' });
    if (body.prev !== prev) problems.push({ line: i + 1, kind: 'link' });
    if (body.seq !== seq + 1) problems.push({ line: i + 1, kind: 'seq' });
    prev = hash;
    seq = body.seq;
    entries.push(e);
  });
  // The head file catches a cut-off tail, and a chain emptied after it was written.
  const head = fs.existsSync(`${file}.head`) ? fs.readFileSync(`${file}.head`, 'utf8').trim() : null;
  if ((lines.length || head !== null) && head !== `${seq} ${prev}`) problems.push({ line: lines.length, kind: 'head' });
  return { ok: problems.length === 0, entries, problems };
}
