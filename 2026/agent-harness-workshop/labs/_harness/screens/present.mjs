// 🎤 Presenter mode: full-screen slides for the facilitator's 11-minute slots, built from each lab's readme (In one
// minute, how the layer works, under the hood), then the closing demo and the homework map. No separate slide deck.
// Slides are laid out once for 80×24, so they fit any terminal the workshop runs in, and the same text prints without
// a terminal.
import fs from 'node:fs';
import { DIFFICULTIES, readmeSections } from '../catalog.mjs';
import { PATHS, pathTime } from '../learning.mjs';
import { renderMarkdown, stripAnsi } from '../ui.mjs';

/** Text width of a slide (80 columns minus the screen's margins and the body's indent). */
export const SLIDE_W = 76;
/** Body rows of a slide (24 rows minus the title box, the blank lines around it and the key line, with room for a notice). */
export const SLIDE_ROWS = 14;

const plain = (t) => String(t).replace(/[^\p{L}\p{N} ]/gu, '').trim().toLowerCase();
// Sections around the explanation that a slide doesn't need: the motivation, the enterprise view, the exercises.
const NOT_HOW = new Set(['why it matters', 'in the enterprise', 'exercises', 'common pitfalls', 'learn more', 'cheat sheet', 'the commands', 'the live closing demo']);

/** The section that says how the layer works: "How …" when the readme has one, else the first section after "Under the
 * hood" that explains the layer (Lab 01's "Where instructions live", Lab 02's "Anatomy of a skill", …). */
export function howSection(sections) {
  const how = sections.find((s) => /^how\b/.test(plain(s.title)));
  if (how) return how;
  const at = sections.findIndex((s) => plain(s.title) === 'under the hood');
  return at < 0 ? null : sections.slice(at + 1).find((s) => !NOT_HOW.has(plain(s.title))) ?? null;
}

const blank = (l) => !stripAnsi(l).trim();
const trim = (lines) => {
  let a = 0;
  let b = lines.length;
  while (a < b && blank(lines[a])) a++;
  while (b > a && blank(lines[b - 1])) b--;
  return lines.slice(a, b);
};

/** One section as one or more slides of at most SLIDE_ROWS lines. A long one is split into parts of about equal length,
 * each ending before a blank line or a list item when there is one nearby, so no part is a stray line or two. */
function slidesOf(lab, kicker, section, md) {
  let rest = trim(renderMarkdown(md, SLIDE_W - 2));
  const chunks = [];
  const cell = (l) => stripAnsi(l).includes('│');
  // A good place to break: a blank line, a list item, or a table row that starts a new record (its first cell set).
  const breakBefore = (l) => blank(l) || /^\s*(\d+\.|•|[-*])\s/.test(stripAnsi(l)) || /^\s*[^│\s─][^│]*│/.test(stripAnsi(l));
  while (rest.length) {
    if (rest.length <= SLIDE_ROWS) { chunks.push(rest); break; }
    const target = Math.ceil(rest.length / Math.ceil(rest.length / SLIDE_ROWS));
    let cut = Math.min(SLIDE_ROWS, target);
    let best = Infinity;
    for (let i = Math.ceil(target * 0.6); i <= SLIDE_ROWS; i++) if (breakBefore(rest[i]) && !/─┼─/.test(stripAnsi(rest[i - 1] ?? '')) && Math.abs(i - target) < best) { best = Math.abs(i - target); cut = i; }
    // Never leave a table's header and rule alone at the bottom of a slide: they go on with the rows.
    if (cut > 2 && /─┼─/.test(stripAnsi(rest[cut - 1]))) cut -= 2;
    const head = rest.slice(0, cut);
    let next = trim(rest.slice(cut));
    // A table that goes on: its header row and rule go on too.
    const rule = head.findIndex((l) => /─┼─/.test(stripAnsi(l)));
    if (cell(head.at(-1)) && next.length && cell(next[0]) && rule > 0) next = [head[rule - 1], head[rule], ...next];
    chunks.push(trim(head));
    rest = next;
  }
  return chunks.map((lines, i) => ({ lab, kicker, section, part: i + 1, parts: chunks.length, title: chunks.length > 1 ? `${section} (${i + 1}/${chunks.length})` : section, lines }));
}

/** The closing slide: the five tiers with their times (and Lab 08's), and every learning path with its time. */
export function homeworkMap(catalog) {
  const tiers = DIFFICULTIES.map((d) => `- ${d.badge} **${d.label}** · ${d.theme} · ${d.time} (Lab 08: ${d.capstoneTime}) · ${d.mode === 'together' ? '👥 together, live' : '🏠 homework'}`);
  const paths = PATHS.filter((p) => p.keys).map((p) => {
    const t = pathTime(catalog, p.id);
    return `- **${p.label}** (\`${p.id}\`)${t ? ` · ${t}` : ''}`;
  });
  return [
    'Start anywhere: every level starts from the reference of the one before.',
    '**Tiers**', ...tiers,
    '', '**Paths** (press **p** in the app, or `node labs/start.mjs path`)', ...paths,
  ].join('\n');
}

/**
 * The deck: [{ lab, kicker, section, title, part, parts, lines, index, total }]. With `lab` (a lab id) only that lab's
 * slides; the capstone (presented alone or as part of the whole deck) adds the closing demo and the homework map.
 */
export function slidesFor(catalog, { lab = null } = {}) {
  const labs = lab ? catalog.filter((l) => l.id === lab) : catalog;
  const out = [];
  for (const l of labs) {
    const secs = readmeSections(fs.readFileSync(l.readmePath, 'utf8'));
    const kicker = `Lab ${l.num} · ${l.emoji} ${l.title}`;
    const byName = (name) => secs.find((s) => plain(s.title) === name);
    for (const s of [byName('in one minute'), howSection(secs), byName('under the hood')].filter(Boolean)) out.push(...slidesOf(l.id, kicker, s.title, s.body));
    if (l.capstone) {
      const demo = secs.find((s) => /closing demo/.test(plain(s.title)));
      if (demo) out.push(...slidesOf(l.id, kicker, demo.title, demo.body));
      out.push(...slidesOf('homework', 'After the workshop', '🏠 The homework map', homeworkMap(catalog)));
    }
  }
  return out.map((s, index) => ({ ...s, index, total: out.length }));
}

/** The deck as plain text (no terminal, or linear mode): one block per slide. */
export function slidesText(slides) {
  return slides.flatMap((s) => ['', `── ${s.index + 1}/${s.total} · ${s.kicker} · ${s.title} ──`, '', ...s.lines.map((l) => `  ${l}`)]);
}
