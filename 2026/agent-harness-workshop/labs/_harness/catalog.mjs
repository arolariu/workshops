// Reads the labs: lab-XX/readme.md (title, intro) and <level>/todo.md (mission, where, done-when, hints).
// The difficulty table below drives order, labels, keys, badges, counts and help everywhere.
import fs from 'node:fs';
import path from 'node:path';

export const DIFFICULTIES = [
  { id: 'easy', label: 'Easy', aliases: ['e'], badge: '🟢', ascii: 'E', key: '1' },
  { id: 'medium', label: 'Medium', aliases: ['m'], badge: '🟡', ascii: 'M', key: '2' },
  { id: 'hard', label: 'Hard', aliases: ['h'], badge: '🔴', ascii: 'H', key: '3' },
  { id: 'hard-plus', label: 'Hard+', aliases: ['hard+'], badge: '🟣', ascii: 'H+', key: '4' },
  { id: 'hard-plus-plus', label: 'Hard++', aliases: ['hard++'], badge: '⚫', ascii: 'H++', key: '5' },
];
export const LEVELS = DIFFICULTIES.map((d) => d.id);
export const LEVEL_BADGE = Object.fromEntries(DIFFICULTIES.map((d) => [d.id, d.badge]));
export const LEVEL_LABEL = Object.fromEntries(DIFFICULTIES.map((d) => [d.id, d.label]));
export const difficulty = (id) => DIFFICULTIES.find((d) => d.id === id) ?? null;
/** The difficulties as help text: "easy, medium, hard, hard+ (hard-plus), hard++ (hard-plus-plus)". */
export const levelChoices = () => DIFFICULTIES.map((d) => (d.label.includes('+') ? `${d.label.toLowerCase()} (${d.id})` : d.id)).join(', ');

/** Exact difficulty ID for an ID, label or alias ('hard+' → 'hard-plus'), or null. Prefixes are not accepted. */
export function normalizeLevel(input) {
  const s = String(input ?? '').trim().toLowerCase();
  if (!s) return null;
  return DIFFICULTIES.find((d) => d.id === s || d.label.toLowerCase() === s || d.aliases.includes(s))?.id ?? null;
}

/** Minutes from a todo.md meta line ("🕐 15 min", "🕐 10–15 min" → 15), or null when it does not say. */
export function parseDuration(meta) {
  const s = String(meta ?? '');
  const range = s.match(/(\d+)\s*[–-]\s*(\d+)\s*min/i);
  if (range) return Number(range[2]);
  const one = s.match(/(\d+)\s*(?:min|minutes)\b/i);
  return one ? Number(one[1]) : null;
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

export function parseTodo(md) {
  const title = (md.match(/^#\s+(.*)$/m)?.[1] ?? '').replace(/^\S+\s+/, '').replace(LABEL_PREFIX, '').trim();
  const meta = (md.match(/^>\s*(.*)$/m)?.[1] ?? '').trim();
  const secs = sections(md);
  const hintsBlock = pick(secs, 'hint');
  const hints = [...hintsBlock.matchAll(/<details>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)].map((m) => ({ title: m[1].trim(), body: m[2].trim() }));
  return {
    title,
    meta,
    mission: pick(secs, 'mission'),
    where: pick(secs, 'work here', 'where'),
    done: pick(secs, 'done when'),
    hints,
    further: pick(secs, 'going further', 'bonus'),
  };
}

/** An exercise is authored when its folder has a todo.md (its src/ may be missing if a learner deleted it: recovery still works). */
const authored = (dir) => fs.existsSync(path.join(dir, 'todo.md'));

export function loadCatalog(labsDir) {
  return fs.readdirSync(labsDir)
    .filter((n) => /^lab-\d\d$/.test(n) && fs.statSync(path.join(labsDir, n)).isDirectory())
    .sort()
    .map((id) => {
      const readme = read(path.join(labsDir, id, 'readme.md'));
      const h1 = readme.match(/^#\s+(.*)$/m)?.[1] ?? id;
      const m = h1.match(/^Lab\s+(\d+)\s*·\s*(\S+)\s+(.*?)(?:\s+—\s+(.*))?$/);
      const secs = sections(readme);
      const num = m?.[1] ?? id.slice(4);
      const levels = DIFFICULTIES.filter((d) => authored(path.join(labsDir, id, d.id))).map((d) => {
        const dir = path.join(labsDir, id, d.id);
        const todo = parseTodo(read(path.join(dir, 'todo.md')));
        return {
          level: d.id,
          label: d.label,
          badge: d.badge,
          key: `${id}/${d.id}`,
          labId: id,
          labNum: num,
          dir,
          src: path.join(dir, 'src'),
          sol: path.join(dir, 'sol'),
          todoPath: path.join(dir, 'todo.md'),
          ...todo,
          minutes: parseDuration(todo.meta),
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
        readmePath: path.join(labsDir, id, 'readme.md'),
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
