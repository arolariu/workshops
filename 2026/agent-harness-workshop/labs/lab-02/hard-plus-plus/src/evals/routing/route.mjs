// The lexical pre-check: which skill would a request load, judging only by the words in the skills' names and
// descriptions? Free, instant and deterministic: a proxy for the model's routing, not the real thing.
// Given: STOPWORDS, MIN_SCORE, tokens(), loadSkills(), library(). Your work: TODO(M2) score() and route().
import fs from 'node:fs';
import path from 'node:path';

export const STOPWORDS = new Set(`the and for with that this from into when use used uses using user users ask asks asked
you your are was were has have had not but can could should would will what which who how why all any each one its
our out about also only more most some such than then them they there these those very just does did doing done make
makes made give get got need needs want wants please help helps skill skills new yet`.split(/\s+/));
export const MIN_SCORE = 2;

/** Lower-case words of 3+ letters or digits, minus STOPWORDS, with one trailing "s" removed ("tests" → "test"). */
export function tokens(text) {
  return String(text ?? '').toLowerCase().split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
}

/** name and description from a SKILL.md frontmatter (plain, quoted, or a folded > / | block). */
function frontmatter(text) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  if (lines[0].trim() !== '---') return {};
  const out = {};
  for (let i = 1; i < lines.length && lines[i].trim() !== '---'; i++) {
    const m = lines[i].match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (/^[>|][-+]?$/.test(v)) {
      const block = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) block.push(lines[++i].trim());
      v = block.join(' ');
    }
    out[m[1]] = v.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  }
  return out;
}

/** The skills in <root>/.github/skills: [{ name, description, dir }], sorted by name. */
export function loadSkills(root) {
  const base = path.join(root, '.github', 'skills');
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(base, e.name, 'SKILL.md')))
    .map((e) => {
      const fm = frontmatter(fs.readFileSync(path.join(base, e.name, 'SKILL.md'), 'utf8'));
      return { name: fm.name || e.name, description: fm.description ?? '', dir: path.join(base, e.name) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** What the pre-check works on: each skill's words (its name and description), and how many skills have each word. */
export function library(skills) {
  const entries = skills.map((s) => ({ name: s.name, words: new Set(tokens(`${s.name.replace(/-/g, ' ')} ${s.description}`)) }));
  const df = new Map();
  for (const e of entries) for (const w of e.words) df.set(w, (df.get(w) ?? 0) + 1);
  return { skills: entries, df, size: entries.length };
}

/** How strongly a request points at one skill: Σ log(1 + size / df(w)) over the distinct request words it has. */
export function score(request, entry, lib) {
  // TODO(M2): for each distinct word of tokens(request) that entry.words has, add Math.log(1 + lib.size / lib.df.get(w)).
  return 0;
}

/** The skill a request loads: the best score, if it reaches MIN_SCORE and no other skill ties it; else null. */
export function route(request, lib) {
  // TODO(M2): score every skill in lib.skills; return the best one's name, or null (below MIN_SCORE, or a tie).
  return null;
}
