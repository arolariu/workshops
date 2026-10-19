// The course rules a maintainer writes by hand (labs/_harness/course.json): the capstone lab, the harness paths that
// `bring` carries forward, and per-level exceptions for the seeded chain. The tiers themselves live in catalog.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { globToRegExp } from './kit.mjs';

export const DEFAULT_HARNESS_PATHS = ['AGENTS.md', '*.instructions.md', '.github/**', '.mcp.json', 'mcp/**', 'apm.yml', 'apm.lock.yaml', 'scripts/**', 'evals/**', 'HARNESS.md'];
const RULES = ['local', 'keep', 'overrides', 'drop'];
export const courseFile = (labsDir) => path.join(labsDir, '_harness', 'course.json');

/** The course rules, with defaults when the file is missing (test fixtures, older checkouts). */
export function loadCourse(labsDir) {
  const file = courseFile(labsDir);
  let raw = {};
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
    if (e.code !== 'ENOENT') throw new Error(`${file} is not valid JSON: ${e.message}`);
  }
  return { ...raw, file, capstone: raw.capstone ?? 'lab-08', harnessPaths: raw.harnessPaths ?? DEFAULT_HARNESS_PATHS, levels: raw.levels ?? {} };
}

/** { local, keep, overrides, drop } for a level key like "lab-05/hard-plus": lists of path patterns. */
export function levelRules(course, key) {
  const c = course.levels?.[key] ?? {};
  return Object.fromEntries(RULES.map((k) => [k, Array.isArray(c[k]) ? c[k].map(String) : []]));
}

// gitignore-style patterns: "dir/" is a folder at any depth; a pattern with a slash (or a leading one) starts at the
// level's root; anything else matches a name at any depth. * ** ? and {a,b} work as in applyTo globs.
const cache = new Map();
function compile(pattern) {
  const p = String(pattern).trim();
  if (cache.has(p)) return cache.get(p);
  const dirOnly = p.endsWith('/');
  const body = dirOnly ? p.slice(0, -1) : p;
  const anchored = body.includes('/');
  const core = globToRegExp(body.replace(/^\//, '')).source.replace(/^\^/, '').replace(/\$$/, '');
  const re = new RegExp(`${anchored ? '^' : '(?:^|/)'}${core}${dirOnly ? '/' : '(?:/|$)'}`);
  cache.set(p, re);
  return re;
}
export const matchPath = (pattern, rel) => compile(pattern).test(String(rel).replace(/\\/g, '/'));
export const matchAny = (patterns, rel) => (patterns ?? []).some((p) => matchPath(p, rel));
export const isHarnessPath = (course, rel) => matchAny(course.harnessPaths, rel);

const inline = (v) => (Array.isArray(v) ? `[${v.map(inline).join(', ')}]`
  : v && typeof v === 'object' ? (Object.keys(v).length ? `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(', ')} }` : '{}')
    : JSON.stringify(v));
/** JSON with short objects and arrays on one line, so a hand-written file stays readable after a tool updates it. */
export function formatJson(v, indent = '', width = 110) {
  const one = inline(v);
  if (!v || typeof v !== 'object' || indent.length + one.length <= width) return one;
  const next = `${indent}  `;
  if (Array.isArray(v)) return `[\n${v.map((x) => `${next}${formatJson(x, next, width)}`).join(',\n')}\n${indent}]`;
  return `{\n${Object.entries(v).map(([k, x]) => `${next}${JSON.stringify(k)}: ${formatJson(x, next, width - JSON.stringify(k).length - 2)}`).join(',\n')}\n${indent}}`;
}

/** Write course.json (the raw object, without the `file` field loadCourse adds). */
export function saveCourse(labsDir, raw) {
  const file = courseFile(labsDir);
  const { file: _drop, ...data } = raw;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${formatJson(data)}\n`);
  return file;
}
