// Reads the labs: lab-XX/readme.md (title, intro) and <level>/todo.md (mission, where, done-when, milestones, hints).
// The difficulty table below drives order, labels, keys, badges, themes, times, counts and help everywhere.
import fs from 'node:fs';
import path from 'node:path';
import { loadCourse } from './course.mjs';
import { parseQuiz } from './quiz.mjs';

// mode: 'together' levels are done live in the workshop; 'homework' levels are optional and go deeper.
// time / capstoneTime: the suggested time budget for Labs 00-07 and for the capstone lab.
export const DIFFICULTIES = [
  { id: 'easy', label: 'Easy', aliases: ['e'], badge: '🟢', ascii: 'E', key: '1', theme: 'Use it', time: '8–10 min', capstoneTime: 'about 1 h', mode: 'together' },
  { id: 'medium', label: 'Medium', aliases: ['m'], badge: '🟡', ascii: 'M', key: '2', theme: 'Shape it', time: '30–45 min', capstoneTime: '1.5–2 h', mode: 'homework' },
  { id: 'hard', label: 'Hard', aliases: ['h'], badge: '🔴', ascii: 'H', key: '3', theme: 'Prove it', time: '1–1.5 h', capstoneTime: '2–2.5 h', mode: 'homework' },
  { id: 'hard-plus', label: 'Hard+', aliases: ['hard+', 'h+'], badge: '🟣', ascii: 'H+', key: '4', theme: 'Break it', time: '1.5–2 h', capstoneTime: 'about 3 h', mode: 'homework' },
  { id: 'hard-plus-plus', label: 'Hard++', aliases: ['hard++', 'h++'], badge: '💎', ascii: 'H++', key: '5', theme: 'Scale it', time: '2–3 h', capstoneTime: '3–4 h', mode: 'homework' },
];
export const LEVELS = DIFFICULTIES.map((d) => d.id);
export const LEVEL_BADGE = Object.fromEntries(DIFFICULTIES.map((d) => [d.id, d.badge]));
export const LEVEL_LABEL = Object.fromEntries(DIFFICULTIES.map((d) => [d.id, d.label]));
export const difficulty = (id) => DIFFICULTIES.find((d) => d.id === id) ?? null;
/** The difficulties as help text: "easy, medium, hard, hard+ (hard-plus), hard++ (hard-plus-plus)". */
export const levelChoices = () => DIFFICULTIES.map((d) => (d.label.includes('+') ? `${d.label.toLowerCase()} (${d.id})` : d.id)).join(', ');

/** Exact difficulty ID for an ID, label, alias or key ('hard+' → 'hard-plus', '4' → 'hard-plus'), or null. Prefixes are not accepted. */
export function normalizeLevel(input) {
  const s = String(input ?? '').trim().toLowerCase();
  if (!s) return null;
  return DIFFICULTIES.find((d) => d.id === s || d.label.toLowerCase() === s || d.aliases.includes(s) || d.key === s)?.id ?? null;
}

const UNIT = { min: 1, minutes: 1, h: 60, hour: 60, hours: 60 };
/** [lower, upper] minutes from a todo.md meta line ("🕐 10–15 min" → [10, 15], "🕐 1.5–2 h" → [90, 120]), or null. */
export function parseDurationRange(meta) {
  const s = String(meta ?? '');
  const part = s.match(/🕐([^·]*)/)?.[1] ?? s;
  const m = part.match(/(\d+(?:\.\d+)?)(?:\s*[–-]\s*(\d+(?:\.\d+)?))?\s*(minutes|min|hours|hour|h)\b/i);
  if (!m) return null;
  const k = UNIT[m[3].toLowerCase()];
  return [Math.round(Number(m[1]) * k), Math.round(Number(m[2] ?? m[1]) * k)];
}
/** Minutes from a todo.md meta line, using the upper bound ("🕐 10–15 min" → 15), or null when it does not say. */
export const parseDuration = (meta) => parseDurationRange(meta)?.[1] ?? null;

/** "🧱 builds on: Lab 02 · easy" → "lab-02/easy"; "🧱 starts the chain" → "start"; otherwise null. */
export function parseBuildsOn(meta) {
  const s = String(meta ?? '');
  if (/🧱\s*starts the chain/i.test(s)) return 'start';
  const m = s.match(/🧱\s*builds on:\s*Lab\s*(\d+)\s*·\s*([\w+-]+)/i);
  const level = m && normalizeLevel(m[2]);
  return level ? `lab-${m[1].padStart(2, '0')}/${level}` : null;
}

const read = (f) => { try { return fs.readFileSync(f, 'utf8').replace(/\r/g, ''); } catch { return ''; } };
const LABEL_PREFIX = new RegExp(`^(${DIFFICULTIES.flatMap((d) => [d.id, d.label]).map((s) => s.replace(/\+/g, '\\+')).sort((a, b) => b.length - a.length).join('|')})\\s*·\\s*`, 'i');

function sections(md) {
  const out = {};
  let key = '_intro';
  for (const line of md.split('\n')) {
    const h = line.match(/^##\s+(.*)$/);
    if (h) { key = h[1].replace(/[^\p{L}\p{N} ]/gu, '').trim().toLowerCase(); out[key] = ''; continue; }
    out[key] = `${out[key] ?? ''}${line}\n`;
  }
  return out;
}
const pick = (secs, ...names) => {
  for (const n of names) {
    const k = Object.keys(secs).find((s) => s.includes(n));
    if (k) return secs[k].trim();
  }
  return '';
};

// A milestone heading: "M2 · The engine" (also "M2: …", "M2 - …", or just "M2").
const MILESTONE = /^(M\d+)\b\s*[·:.\-–—]?\s*(.*)$/i;
/** "### M1 · Title" subsections of the Milestones section → [{ id, title, body }]. */
function parseMilestones(block) {
  const parts = block.split(/^###\s+(.+)$/m);
  const out = [];
  for (let i = 1; i < parts.length; i += 2) {
    const m = parts[i].trim().match(MILESTONE);
    if (m) out.push({ id: m[1].toUpperCase(), title: m[2].trim(), body: (parts[i + 1] ?? '').trim() });
  }
  return out;
}
/** <details> hints; the ones under a "### M2" subsection belong to milestone M2. */
function parseHints(block) {
  const parts = block.split(/^###\s+(.+)$/m);
  const hints = [];
  for (let i = 0; i < parts.length; i += 2) {
    const milestone = i === 0 ? null : (parts[i - 1].trim().match(MILESTONE)?.[1].toUpperCase() ?? null);
    for (const m of parts[i].matchAll(/<details>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)) hints.push({ title: m[1].trim(), body: m[2].trim(), milestone });
  }
  return hints;
}

export function parseTodo(md) {
  const title = (md.match(/^#\s+(.*)$/m)?.[1] ?? '').replace(/^\S+\s+/, '').replace(LABEL_PREFIX, '').trim();
  const meta = (md.match(/^>\s*(.*)$/m)?.[1] ?? '').trim();
  const secs = sections(md);
  return {
    title,
    meta,
    mission: pick(secs, 'mission'),
    requirements: pick(secs, 'requirements'),
    milestones: parseMilestones(pick(secs, 'milestones')),
    where: pick(secs, 'work here', 'where'),
    done: pick(secs, 'done when'),
    hints: parseHints(pick(secs, 'hint')),
    further: pick(secs, 'going further', 'bonus'),
    takeaway: pick(secs, 'takeaway'),
    quiz: parseQuiz(pick(secs, 'check yourself')),
    buildsOn: parseBuildsOn(meta),
  };
}

/** The readme's header blockquote (the `>` lines before the first section): layer, maturity and threads. */
function labSpine(readme) {
  const header = (readme.split(/^##\s/m)[0].match(/^>.*$/gm) ?? []).map((l) => l.replace(/^>\s?/, '')).join('\n');
  const field = (name) => header.match(new RegExp(`\\*\\*${name}:\\*\\*\\s*([^·\\n]+)`))?.[1].trim() ?? null;
  const mat = field('Maturity')?.match(/^(L\d(?:\s*→\s*L\d)?)\s*(.*)$/);
  return {
    layer: field('Harness layer'),
    maturity: mat ? { level: mat[1].replace(/\s+/g, ' '), name: mat[2].trim() } : null,
    threads: (header.match(/\*\*Threads:\*\*\s*(.+)/)?.[1] ?? '').split('·').map((s) => s.trim()).filter(Boolean),
  };
}

/** An exercise is authored when its folder has a todo.md (its src/ may be missing if a learner deleted it: recovery still works). */
const authored = (dir) => fs.existsSync(path.join(dir, 'todo.md'));

export function loadCatalog(labsDir, { course = loadCourse(labsDir, { strict: false }) } = {}) {
  return fs.readdirSync(labsDir)
    .filter((n) => /^lab-\d\d$/.test(n) && fs.statSync(path.join(labsDir, n)).isDirectory())
    .sort()
    .map((id) => {
      const readme = read(path.join(labsDir, id, 'readme.md'));
      const h1 = readme.match(/^#\s+(.*)$/m)?.[1] ?? id;
      const m = h1.match(/^Lab\s+(\d+)\s*·\s*(\S+)\s+(.*?)(?:\s+—\s+(.*))?$/);
      const secs = sections(readme);
      const num = m?.[1] ?? id.slice(4);
      const capstone = id === course.capstone;
      const levels = DIFFICULTIES.filter((d) => authored(path.join(labsDir, id, d.id))).map((d) => {
        const dir = path.join(labsDir, id, d.id);
        const todo = parseTodo(read(path.join(dir, 'todo.md')));
        return {
          level: d.id,
          label: d.label,
          badge: d.badge,
          theme: d.theme,
          mode: capstone ? 'homework' : d.mode,
          key: `${id}/${d.id}`,
          labId: id,
          labNum: num,
          dir,
          src: path.join(dir, 'src'),
          sol: path.join(dir, 'sol'),
          todoPath: path.join(dir, 'todo.md'),
          ...todo,
          time: todo.meta.match(/🕐\s*([^·🧱]+)/u)?.[1].trim() || (capstone ? d.capstoneTime : d.time),
          minutes: parseDuration(todo.meta),
          minutesRange: parseDurationRange(todo.meta),
          hasAgent: fs.existsSync(path.join(dir, 'tests', 'agent.mjs')),
        };
      });
      return {
        id,
        num,
        emoji: m?.[2] ?? '🧪',
        title: m?.[3] ?? h1,
        tagline: m?.[4] ?? '',
        intro: pick(secs, 'in one minute', 'idea'),
        ...labSpine(readme),
        underTheHood: pick(secs, 'under the hood'),
        enterprise: pick(secs, 'in the enterprise'),
        readmePath: path.join(labsDir, id, 'readme.md'),
        capstone,
        levels,
      };
    });
}

/** Normalize "lab-01", "lab01", "01" or "1" to "lab-01", or null. */
export function normalizeLabId(arg) {
  const m = String(arg ?? '').trim().toLowerCase().match(/^(?:lab-?)?(\d{1,2})$/);
  return m ? `lab-${m[1].padStart(2, '0')}` : null;
}

/** { lab, ex, error } for "lab-01" + "hard+"; null when the lab does not exist. ex is null (with an error) otherwise. */
export function findExercise(catalog, labArg, levelArg) {
  const id = normalizeLabId(labArg);
  const lab = id && catalog.find((l) => l.id === id);
  if (!lab) return null;
  if (levelArg == null || levelArg === '') return { lab, ex: null, error: `Which difficulty? Lab ${lab.num} has: ${lab.levels.map((e) => e.level).join(', ')}.` };
  const level = normalizeLevel(levelArg);
  if (!level) return { lab, ex: null, error: `"${levelArg}" is not a difficulty. Use one of: ${levelChoices()}.` };
  const ex = lab.levels.find((e) => e.level === level);
  return ex ? { lab, ex, error: null } : { lab, ex: null, error: `Lab ${lab.num} has no ${LEVEL_LABEL[level]} exercise. It has: ${lab.levels.map((e) => e.label).join(', ')}.` };
}

/** The exercise for a key like "lab-01/hard-plus", as { lab, ex }, or null. */
export function exerciseByKey(catalog, key) {
  const [labId, level] = String(key ?? '').split('/');
  const lab = catalog.find((l) => l.id === labId);
  const ex = lab?.levels.find((e) => e.level === level);
  return ex ? { lab, ex } : null;
}
