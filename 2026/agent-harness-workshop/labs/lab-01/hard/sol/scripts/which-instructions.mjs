#!/usr/bin/env node
// Which instruction files apply to a path? Copilot sends the always-on files (AGENTS.md, .github/copilot-instructions.md)
// on every turn. A scoped file (.github/instructions/*.instructions.md) joins only when its applyTo matches a file the
// agent works on, and a nested AGENTS.md covers the files in its own folder.
//   node scripts/which-instructions.mjs                       every file in this folder
//   node scripts/which-instructions.mjs grades.js README.md   just these paths
//   node scripts/which-instructions.mjs --json …              the same, as JSON
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Does a glob match a path? Paths are relative to the project, with / between folders.
 *   **     any number of folders, including none ("**" + "/*.test.js" matches "grades.test.js")
 *   *      any characters except /
 *   ?      one character except /
 *   {a,b}  one of the alternatives
 */
export function matches(glob, file) {
  return new RegExp(`^${globSource(String(glob).trim().replace(/^\.\//, ''))}$`).test(clean(file));
}
function globSource(g) {
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*' && g[i + 1] === '*') {
      if (g[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (c === '{' && g.indexOf('}', i) > i) {
      const end = g.indexOf('}', i);
      re += `(?:${g.slice(i + 1, end).split(',').map(globSource).join('|')})`;
      i = end;
    } else re += c.replace(/[.+^$()|[\]\\{}]/g, '\\$&');
  }
  return re;
}

/** The paths of the sources that apply to `file`: every always-on source (applyTo null), and every glob that matches. */
export function applicable(sources, file) {
  return sources.filter((s) => s.applyTo == null || s.applyTo.some((g) => matches(g, file))).map((s) => s.path);
}

// ---------- you don't need to change anything below this line ----------

const ALWAYS = ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', '.github/copilot-instructions.md', '.claude/CLAUDE.md'];
const SKIP = new Set(['node_modules', '.git', '.agent-logs', 'runs']);
const clean = (p) => String(p).replace(/\\/g, '/').replace(/^\.\//, '');

/** Every file under root (relative, with /), without dependencies, logs and run output. */
export function listFiles(root) {
  const out = [];
  const walk = (dir, rel) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (SKIP.has(e.name)) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else if (e.isFile()) out.push(r);
    }
  };
  walk(root, '');
  return out.sort();
}

/** "README.md,docs/{a,b}/*.md" → ["README.md", "docs/{a,b}/*.md"]: commas outside braces separate globs. */
export function splitGlobs(value) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of String(value)) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (ch === ',' && depth <= 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  parts.push(cur);
  return parts.map((s) => s.trim()).filter(Boolean);
}

/** The applyTo of a .instructions.md file as a list of globs ([] when it has none: then it applies to nothing). */
export function readApplyTo(text) {
  const m = String(text).replace(/^\uFEFF/, '').replace(/\r/g, '').match(/^---\n([\s\S]*?)\n---/);
  if (!m) return [];
  const lines = m[1].split('\n');
  const i = lines.findIndex((l) => /^applyTo\s*:/.test(l));
  if (i < 0) return [];
  const unquote = (s) => s.trim().replace(/^(['"])(.*)\1$/, '$2');
  const rest = lines[i].replace(/^applyTo\s*:\s*/, '').trim();
  if (rest.startsWith('[')) return splitGlobs(rest.slice(1, rest.lastIndexOf(']'))).map(unquote).filter(Boolean);
  if (rest) return splitGlobs(unquote(rest));
  const list = [];
  for (const l of lines.slice(i + 1)) {
    const item = l.match(/^\s*-\s*(.*)$/);
    if (!item) break;
    list.push(...splitGlobs(unquote(item[1])));
  }
  return list;
}

/**
 * The instruction files under root: [{ path, applyTo }], always-on files first (applyTo null), then the scoped files
 * (applyTo null too for "**": Copilot sends those on every turn), then nested AGENTS.md files (applyTo: their folder).
 */
export function instructionSources(root) {
  const files = listFiles(root);
  const out = ALWAYS.filter((f) => files.includes(f)).map((f) => ({ path: f, applyTo: null }));
  for (const f of files.filter((x) => /^\.github\/instructions\/.+\.instructions\.md$/.test(x))) {
    const globs = readApplyTo(fs.readFileSync(path.join(root, f), 'utf8'));
    // Copilot treats `applyTo: "**"` as an always-on file (it lists it without an applyTo).
    out.push({ path: f, applyTo: globs.some((g) => g === '**' || g === '**/*') ? null : globs });
  }
  for (const f of files.filter((x) => /\/AGENTS\.md$/.test(x))) out.push({ path: f, applyTo: [`${path.posix.dirname(f)}/**`] });
  return out;
}

// Real paths: a symlinked temp folder, a junction or an 8.3 short path must not make the script silently do nothing.
const isMain = (() => {
  try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isMain) {
  const args = process.argv.slice(2);
  const unknown = args.find((a) => a.startsWith('--') && a !== '--json');
  if (unknown) {
    console.error(`Unknown option ${unknown}. Usage: node scripts/which-instructions.mjs [--json] [paths…]`);
    process.exit(2);
  }
  const root = process.cwd();
  const sources = instructionSources(root);
  const asked = args.filter((a) => !a.startsWith('--')).map(clean);
  const rows = (asked.length ? asked : listFiles(root)).map((p) => ({ path: p, files: applicable(sources, p) }));
  if (args.includes('--json')) {
    console.log(JSON.stringify(rows, null, 2));
  } else {
    const w = Math.max(10, ...rows.map((r) => r.path.length));
    for (const r of rows) console.log(`${r.path.padEnd(w)}  ${r.files.join(' · ') || '(no instructions)'}`);
  }
}
