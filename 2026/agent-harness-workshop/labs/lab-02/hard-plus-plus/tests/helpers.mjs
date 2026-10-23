// Helpers for Lab 02 · hard++ checks: the checks' own copy of the lexical pre-check (the rules in todo.md), so your
// descriptions are graded the same way whatever your route() does, and a reader for the six skills.
// (The kit keeps every free check from starting Copilot with a prompt: see labs/_harness/no-copilot.mjs.)
import fs from 'node:fs';
import path from 'node:path';

export const SIX = ['csv-export', 'explain-error', 'new-module', 'release-notes', 'write-docs', 'write-tests'];
export const WHEN = /\buse (it |this )?when\b|\bwhen (the user|you|asked|someone)\b|\buse (it )?(after|before|to|for)\b/i;

const STOPWORDS = new Set(`the and for with that this from into when use used uses using user users ask asks asked
you your are was were has have had not but can could should would will what which who how why all any each one its
our out about also only more most some such than then them they there these those very just does did doing done make
makes made give get got need needs want wants please help helps skill skills new yet`.split(/\s+/));
export const MIN_SCORE = 2;
export const tokens = (text) => String(text ?? '').toLowerCase().split(/[^a-z0-9]+/)
  .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
  .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
export function library(skills) {
  const entries = skills.map((s) => ({ name: s.name, words: new Set(tokens(`${s.name.replace(/-/g, ' ')} ${s.description}`)) }));
  const df = new Map();
  for (const e of entries) for (const w of e.words) df.set(w, (df.get(w) ?? 0) + 1);
  return { skills: entries, df, size: entries.length };
}
export function score(request, entry, lib) {
  let total = 0;
  for (const w of new Set(tokens(request))) if (entry.words.has(w)) total += Math.log(1 + lib.size / lib.df.get(w));
  return total;
}
export function route(request, lib) {
  const ranked = lib.skills.map((e) => ({ name: e.name, score: score(request, e, lib) })).sort((a, b) => b.score - a.score);
  const [best, next] = ranked;
  if (!best || best.score < MIN_SCORE) return null;
  if (next && Math.abs(best.score - next.score) < 1e-9) return null;
  return best.name;
}
export function metrics(results, names) {
  const perSkill = names.map((skill) => {
    const expected = results.filter((r) => r.expect === skill).length;
    const routed = results.filter((r) => r.got.includes(skill)).length;
    const tp = results.filter((r) => r.expect === skill && r.got.includes(skill)).length;
    return { skill, expected, routed, tp, precision: routed ? tp / routed : 0, recall: expected ? tp / expected : 0 };
  });
  const mean = (k) => perSkill.reduce((n, s) => n + s[k], 0) / (perSkill.length || 1);
  const none = results.filter((r) => r.expect === null);
  return { perSkill, macro: { precision: mean('precision'), recall: mean('recall') }, none: { total: none.length, left: none.filter((r) => !r.got.length).length } };
}

/** The skills in .github/skills, read with the kit: [{ folder, name, description, body }]. */
export function readSkills(t) {
  const base = path.join(t.dir, '.github', 'skills');
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(base, e.name, 'SKILL.md')))
    .map((e) => {
      let fm = null;
      try { fm = t.frontmatter(`.github/skills/${e.name}/SKILL.md`); } catch { fm = null; }
      return { folder: e.name, name: String(fm?.data?.name ?? ''), description: String(fm?.data?.description ?? ''), body: fm?.body ?? '' };
    })
    .sort((a, b) => a.folder.localeCompare(b.folder));
}

/** The pre-check over a folder's skills and a request list: { results, m }. */
export function lexicalEval(skills, requests) {
  const lib = library(skills.map((s) => ({ name: s.name || s.folder, description: s.description })));
  const results = requests.map((r) => {
    const name = route(r.request, lib);
    return { id: r.id, request: r.request, expect: r.expect, got: name ? [name] : [] };
  });
  return { results, m: metrics(results, lib.skills.map((s) => s.name).sort()) };
}
