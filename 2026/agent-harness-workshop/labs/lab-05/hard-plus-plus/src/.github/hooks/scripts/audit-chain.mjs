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
/** Run fn while holding <file>.lock, so two hooks running at once can't both append after the same entry. */
export function withLock(file, fn) {
  const lock = `${file}.lock`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (let i = 0; ; i++) {
    try {
      fs.closeSync(fs.openSync(lock, 'wx'));
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 5000) fs.rmSync(lock, { force: true }); } catch { /* gone already */ }
      if (i > 400) throw new Error(`${lock} is held by someone else`);
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
/** Append one entry (an object without seq, prev or hash): link it to the last one, and update the head file. */
export function append(file, entry) {
  // TODO (M4): inside withLock(file, …): read the last line (readLines) for its seq and hash (or 0 and GENESIS), build
  // body = { ...entry, seq: seq + 1, prev }, hash it, append { ...body, hash } as one JSON line, and write the head file.
  throw new Error('append() is not written yet (M4)');
}

/** { ok, entries, problems: [{ line, kind: 'unreadable' | 'hash' | 'link' | 'seq' | 'head' }] } */
export function verify(file) {
  // TODO (M4): walk the lines; for each one check that it parses ('unreadable'), that its hash is right ('hash'), that
  // prev is the hash of the line before ('link'), that seq goes 1, 2, 3 … ('seq'); then that the head file names the
  // last seq and hash ('head'). A file that doesn't exist yet is an empty, intact chain.
  return { ok: false, entries: [], problems: [{ line: 0, kind: 'unreadable' }] };
}
