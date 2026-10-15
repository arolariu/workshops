// Reads the labs: lab-XX/readme.md (title, intro) and <level>/todo.md (mission, where, done-when, hints).
import fs from 'node:fs';
import path from 'node:path';

export const LEVELS = ['easy', 'medium', 'hard'];
export const LEVEL_BADGE = { easy: '🟢', medium: '🟡', hard: '🔴' };
const read = (f) => { try { return fs.readFileSync(f, 'utf8').replace(/\r/g, ''); } catch { return ''; } };

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
  const title = (md.match(/^#\s+(.*)$/m)?.[1] ?? '').replace(/^\S+\s+/, '').replace(/^(easy|medium|hard)\s*·\s*/i, '').trim();
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

export function loadCatalog(labsDir) {
  return fs.readdirSync(labsDir)
    .filter((n) => /^lab-\d\d$/.test(n) && fs.statSync(path.join(labsDir, n)).isDirectory())
    .sort()
    .map((id) => {
      const readme = read(path.join(labsDir, id, 'readme.md'));
      const h1 = readme.match(/^#\s+(.*)$/m)?.[1] ?? id;
      const m = h1.match(/^Lab\s+(\d+)\s*·\s*(\S+)\s+(.*?)(?:\s+—\s+(.*))?$/);
      const secs = sections(readme);
      const levels = LEVELS.filter((l) => fs.existsSync(path.join(labsDir, id, l))).map((level) => {
        const dir = path.join(labsDir, id, level);
        return { level, dir, src: path.join(dir, 'src'), sol: path.join(dir, 'sol'), todoPath: path.join(dir, 'todo.md'), ...parseTodo(read(path.join(dir, 'todo.md'))), hasAgent: fs.existsSync(path.join(dir, 'tests', 'agent.mjs')) };
      });
      return {
        id,
        num: m?.[1] ?? id.slice(4),
        emoji: m?.[2] ?? '🧪',
        title: m?.[3] ?? h1,
        tagline: m?.[4] ?? '',
        intro: pick(secs, 'in one minute', 'idea'),
        readmePath: path.join(labsDir, id, 'readme.md'),
        levels,
      };
    });
}

export function findExercise(catalog, labArg, levelArg) {
  const n = String(labArg ?? '').replace(/^lab-?/i, '').padStart(2, '0');
  const lab = catalog.find((l) => l.id === `lab-${n}`);
  if (!lab) return null;
  const level = lab.levels.find((l) => l.level.startsWith(String(levelArg ?? '').toLowerCase().slice(0, 1)) && levelArg);
  return level ? { lab, ex: level } : { lab, ex: null };
}
