#!/usr/bin/env node
// 🔏 Lock verifier (Lab 06 · hard+), a small offline `apm audit --ci`: does what is installed still match
// apm.lock.yaml, and does the lock still match apm.yml?
//   node scripts/verify-lock.mjs [project folder]     exit 0 when clean, 1 on any drift
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The hash APM records for a deployed file: SHA-256, hex, over the UTF-8 text with every CRLF turned into LF
 * (so a Windows checkout of the same file is not drift).
 * @param {string} text
 * @returns {string} 64 hex characters
 */
export function hashText(text) {
  // TODO(M2): hash like APM does (node:crypto's createHash('sha256')).
  return '';
}

/**
 * Compare a project's apm.yml, apm.lock.yaml and the files the lock says were deployed.
 * @param {string} root - the project folder
 * @returns {{ ok: boolean, problems: { kind: string, dep?: string, file?: string, message: string }[] }}
 *   kind: no-lock | missing | modified | not-locked | orphan | ref-mismatch | unpinned-commit
 */
export function verifyLock(root) {
  // TODO(M2): readLock(root) and readManifest(root) give you both files; depKey()/depRef() match apm.yml's
  // dependencies to the lock's entries (repo_url). Then check every deployed file against its hash.
  return { ok: true, problems: [] };
}

// ---------- plumbing (given): read and write apm.yml and apm.lock.yaml, no dependencies ----------
// The YAML subset APM writes: maps, lists, "quoted" and plain scalars, flow lists [a, b], # comments.
export const LOCK = 'apm.lock.yaml';
export const MANIFEST = 'apm.yml';

// ---------- YAML (the subset) ----------
function stripComment(line) {
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === q) q = null; } else if (ch === '"' || ch === "'") q = ch;
    else if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}
const unquote = (s) => {
  s = s.trim();
  if (s.startsWith('"') && s.endsWith('"') && s.length > 1) return JSON.parse(s);
  if (s.startsWith("'") && s.endsWith("'") && s.length > 1) return s.slice(1, -1).replace(/''/g, "'");
  return s;
};
function scalar(v) {
  v = v.trim();
  if (v.startsWith('[') && v.endsWith(']')) return v.slice(1, -1).split(',').map((x) => x.trim()).filter(Boolean).map(scalar);
  if (/^(["']).*\1$/.test(v)) return unquote(v);
  if (/^(true|false)$/.test(v)) return v === 'true';
  if (/^(null|~)?$/.test(v)) return null;
  if (/^-?\d+(\.\d+)?$/.test(v) && !/^0\d/.test(v)) return Number(v);
  return v;
}
/** Parse the YAML subset into plain objects and arrays. Throws on a line it can't read. */
export function parseYaml(src) {
  const lines = [];
  for (const raw of String(src).replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n')) {
    const s = stripComment(raw);
    if (!s.trim() || /^---\s*$/.test(s)) continue;
    lines.push({ indent: s.match(/^ */)[0].length, text: s.trim() });
  }
  let i = 0;
  const isItem = (l) => l.text === '-' || l.text.startsWith('- ');
  const keyRe = /^("[^"]*"|'[^']*'|[^\s"'[{][^:]*?)\s*:(?:\s+(.*))?$/;
  const block = (indent) => (isItem(lines[i]) ? list(indent) : map(indent));
  function map(indent) {
    const obj = {};
    while (i < lines.length && lines[i].indent === indent && !isItem(lines[i])) {
      const m = lines[i].text.match(keyRe);
      if (!m) throw new Error(`cannot read the line "${lines[i].text}"`);
      const key = unquote(m[1]);
      const rest = m[2] ?? '';
      i++;
      if (rest === '') {
        if (i < lines.length && lines[i].indent > indent) obj[key] = block(lines[i].indent);
        else if (i < lines.length && lines[i].indent === indent && isItem(lines[i])) obj[key] = list(indent);
        else obj[key] = null;
      } else obj[key] = scalar(rest);
    }
    return obj;
  }
  function list(indent) {
    const arr = [];
    while (i < lines.length && lines[i].indent === indent && isItem(lines[i])) {
      const content = lines[i].text === '-' ? '' : lines[i].text.slice(2).trim();
      if (!content) {
        i++;
        arr.push(i < lines.length && lines[i].indent > indent ? block(lines[i].indent) : null);
      } else if (keyRe.test(content) && !/^["']/.test(content)) {
        lines[i] = { indent: indent + 2, text: content };
        arr.push(map(indent + 2));
      } else {
        arr.push(scalar(content));
        i++;
      }
    }
    return arr;
  }
  if (!lines.length) return {};
  return block(lines[0].indent);
}

const PLAIN = /^[A-Za-z0-9_./@-]+$/;
const plain = (s) => PLAIN.test(s) && !/^(true|false|null|~|-?\d+(\.\d+)?)$/.test(s) && !/^[-.@]/.test(s);
const str = (s) => (plain(s) ? s : JSON.stringify(s));
const val = (v) => (typeof v === 'string' ? str(v) : v === null || v === undefined ? 'null' : String(v));
/** Write plain objects and arrays as YAML (two-space indent, lists of maps like APM writes them). */
export function stringifyYaml(value, indent = '') {
  const out = [];
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      if (!v.length) { out.push(`${indent}${str(k)}: []`); continue; }
      out.push(`${indent}${str(k)}:`);
      for (const item of v) {
        if (item && typeof item === 'object') {
          const inner = stringifyYaml(item, `${indent}    `).split('\n');
          out.push(`${indent}  - ${inner[0].trimStart()}`, ...inner.slice(1));
        } else out.push(`${indent}  - ${val(item)}`);
      }
    } else if (v && typeof v === 'object') {
      if (!Object.keys(v).length) { out.push(`${indent}${str(k)}: {}`); continue; }
      out.push(`${indent}${str(k)}:`, stringifyYaml(v, `${indent}  `));
    } else out.push(`${indent}${str(k)}: ${val(v)}`);
  }
  return out.join('\n');
}

// ---------- apm.yml and apm.lock.yaml ----------
const read = (file) => { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } };

/** The parsed apm.yml of a project, or null when there is none. */
export function readManifest(root) {
  const text = read(path.join(root, MANIFEST));
  return text == null ? null : parseYaml(text);
}
/** The direct APM dependencies listed in a parsed apm.yml (strings or objects, as written). */
export const manifestDeps = (manifest) => {
  const deps = manifest?.dependencies?.apm ?? [];
  return Array.isArray(deps) ? deps : [];
};
/** The parsed apm.lock.yaml of a project, or null when there is none. */
export function readLock(root) {
  const text = read(path.join(root, LOCK));
  return text == null ? null : parseYaml(text);
}
/** Write a lock object back to apm.lock.yaml. */
export function writeLock(root, lock) {
  fs.writeFileSync(path.join(root, LOCK), `${stringifyYaml(lock)}\n`);
}

/**
 * The identity of a dependency: "owner/repo" (lowercase), from "owner/repo#v1", "github.com/owner/repo",
 * "https://github.com/owner/repo.git", { git: …, ref } or a lock entry's repo_url. Local paths stay as written.
 */
export function depKey(dep) {
  let s = typeof dep === 'string' ? dep : String(dep?.repo_url ?? dep?.git ?? dep?.repo ?? dep?.url ?? '');
  s = s.split('#')[0].trim();
  if (/^(\.{1,2}\/|\/|file:)/.test(s)) return s;
  s = s.replace(/^[a-z]+:\/\//i, '').replace(/^git@([^:]+):/, '$1/').replace(/^(www\.)?github\.com\//i, '').replace(/\.git$/, '');
  return s.split('/').slice(0, 2).join('/').toLowerCase();
}
/** The ref a dependency asks for: the part after "#", or the object's ref (null when there is none). */
export function depRef(dep) {
  if (typeof dep === 'string') return dep.includes('#') ? dep.slice(dep.lastIndexOf('#') + 1).trim() : null;
  return dep?.ref ?? dep?.sha ?? null;
}

// ---------- CLI (given) ----------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = path.resolve(process.argv[2] ?? '.');
  const { ok, problems } = verifyLock(root);
  if (ok) console.log(`✅ ${path.basename(root)}: apm.lock.yaml matches apm.yml and every deployed file`);
  else console.log(problems.map((p) => `❌ ${p.kind.padEnd(15)} ${p.message}`).join('\n'));
  process.exit(ok ? 0 : 1);
}