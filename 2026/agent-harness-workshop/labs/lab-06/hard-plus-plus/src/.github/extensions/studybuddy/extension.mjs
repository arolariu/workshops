// 🧩 StudyBuddy extension for GitHub Copilot CLI (experimental: start with `copilot --experimental`).
// Slash commands run locally in Node.js: no AI, no AI credits, always the same answer.
import fs from 'node:fs';
import { joinSession } from '@github/copilot-sdk/extension';

// The portal's data, next to the Lab 04 MCP server: the extension and the server always agree.
const DATA_URL = new URL('../../../mcp/portal-data.json', import.meta.url);
const load = () => JSON.parse(fs.readFileSync(DATA_URL, 'utf8'));
const DAY = 24 * 60 * 60 * 1000;

// Results go to the timeline as normal output; problems as errors, so they stand out.
const say = (text) => session.log(text);
const fail = (text) => session.log(text, { level: 'error' });

const GRADES_USAGE = 'Usage: /grades <course>';
const DUE_USAGE = 'Usage: /due [days] [--course <code>]';

// Round UP to 2 decimals (needing 7.241 means you need 7.25), without floating-point noise.
const up2 = (x) => Math.ceil(Math.round(x * 1e6) / 1e4) / 100;

/** The exam grade needed for a final grade of `target`, given the items graded so far. */
function neededExamGrade(course, target) {
  const sum = Math.round(course.grades.reduce((s, g) => s + g.grade * g.weight, 0) * 100) / 100;
  return up2((target * 100 - sum) / course.examWeight);
}

/** Split the raw argument text into words: "30  --course=SE201" → ["30", "--course=SE201"]. */
const words = (raw) => String(raw ?? '').trim().split(/\s+/).filter(Boolean);

/** Levenshtein distance, to suggest a course for a near miss. */
function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const keep = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = keep;
    }
  }
  return row[b.length];
}

/** The course for a code (case-insensitive), or an error message that helps. */
function findCourse(data, raw) {
  const code = raw.toUpperCase();
  const course = data.courses.find((c) => c.code === code);
  if (course) return { course };
  const codes = data.courses.map((c) => c.code);
  const near = codes.filter((c) => distance(c, code) === 1);
  const hint = near.length === 1 ? ` Did you mean ${near[0]}?` : '';
  return { error: `❓ Unknown course "${code}".${hint} Your courses: ${codes.join(', ')}` };
}

/** Parse "/due" arguments: [days] [--course <code>] or --course=<code>. */
function parseDueArgs(raw) {
  const list = words(raw);
  const out = { days: 7, course: null };
  let sawDays = false;
  for (let i = 0; i < list.length; i++) {
    const w = list[i];
    const eq = w.match(/^--course=(.*)$/);
    if (eq || w === '--course') {
      const value = eq ? eq[1] : list[++i];
      if (!value || value.startsWith('--')) return { error: '--course needs a course code, like --course SE201.' };
      out.course = value;
    } else if (w.startsWith('-') && !/^-\d/.test(w)) {
      return { error: `Unknown option "${w}".` };
    } else {
      if (sawDays) return { error: 'Give the number of days once.' };
      if (!/^\d+$/.test(w) || Number(w) < 1 || Number(w) > 60) return { error: `"${w}" is not a number of days: use a whole number from 1 to 60.` };
      out.days = Number(w);
      sawDays = true;
    }
  }
  return out;
}

const session = await joinSession({
  commands: [
    {
      name: 'due',
      description: 'What is due soon: /due [days] [--course <code>] (default 7 days; no AI, no credits)',
      // ctx.args is the raw text after the command name, e.g. " 14 --course se201 ".
      handler: async (ctx) => {
        const data = load();
        const args = parseDueArgs(ctx?.args);
        if (args.error) return fail(`${args.error}\n${DUE_USAGE}`);
        let course = null;
        if (args.course) {
          const found = findCourse(data, args.course);
          if (found.error) return fail(`${found.error}\n${DUE_USAGE}`);
          course = found.course;
        }
        const left = (d) => Math.round((Date.parse(d) - Date.parse(data.today)) / DAY);
        const items = data.assignments
          .filter((a) => !a.done && left(a.due) >= 0 && left(a.due) <= args.days)
          .filter((a) => !course || a.course === course.code)
          .sort((a, b) => a.due.localeCompare(b.due));
        const span = `the next ${args.days} day${args.days === 1 ? '' : 's'}${course ? ` for ${course.code}` : ''}`;
        if (!items.length) return say(`🎉 Nothing due in ${span}.`);
        await say([`📅 Due in ${span}:`, ...items.map((a) => `   ${a.due} (${left(a.due)}d)  ${a.course}  ${a.title}`)].join('\n'));
      },
    },
    {
      name: 'grades',
      description: 'Your grades in a course and the exam grade you need: /grades SE201 (no AI, no credits)',
      handler: async (ctx) => {
        const data = load();
        const codes = data.courses.map((c) => c.code).join(', ');
        const list = words(ctx?.args);
        if (!list.length) return fail(`Which course? ${GRADES_USAGE}. Your courses: ${codes}`);
        if (list.length > 1) return fail(`One course at a time, please. ${GRADES_USAGE}. Your courses: ${codes}`);
        const found = findCourse(data, list[0]);
        if (found.error) return fail(`${found.error}\n${GRADES_USAGE}`);
        const { course } = found;
        const lines = [`📊 ${course.code} · ${course.name}`];
        if (!course.grades.length) {
          lines.push("   No grades yet, so I can't tell what you need on the exam.");
          return say(lines.join('\n'));
        }
        lines.push(`   ${course.grades.map((g) => `${g.item} ${g.grade} (${g.weight}%)`).join(' · ')} · exam ${course.examWeight}%`);
        const pass = Math.max(5, neededExamGrade(course, 5));
        lines.push(`   To pass: at least ${pass} on the exam`);
        const eight = Math.max(5, neededExamGrade(course, 8));
        lines.push(eight > 10 ? `   For an 8: not reachable (you would need ${eight})` : `   For an 8: at least ${eight} on the exam`);
        await say(lines.join('\n'));
      },
    },
  ],
});