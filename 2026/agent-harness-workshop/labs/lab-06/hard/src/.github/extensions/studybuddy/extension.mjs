// 🧩 StudyBuddy extension for GitHub Copilot CLI (experimental: start with `copilot --experimental`).
// Slash commands run locally in Node.js: no AI, no AI credits, always the same answer.
import fs from 'node:fs';
import { joinSession } from '@github/copilot-sdk/extension';

const DATA_URL = new URL('../../../data/portal-data.json', import.meta.url);
const load = () => JSON.parse(fs.readFileSync(DATA_URL, 'utf8'));
const DAY = 24 * 60 * 60 * 1000;

// Round UP to 2 decimals (needing 7.241 means you need 7.25), without floating-point noise.
const up2 = (x) => Math.ceil(Math.round(x * 1e6) / 1e4) / 100;

/** The exam grade needed for a final grade of `target`, given the items graded so far. */
function neededExamGrade(course, target) {
  const sum = Math.round(course.grades.reduce((s, g) => s + g.grade * g.weight, 0) * 100) / 100;
  return up2((target * 100 - sum) / course.examWeight);
}

const session = await joinSession({
  commands: [
    {
      name: 'due',
      description: 'What is due in the next 7 days (no AI, no credits)',
      handler: async () => {
        const data = load();
        const left = (d) => Math.round((Date.parse(d) - Date.parse(data.today)) / DAY);
        const items = data.assignments
          .filter((a) => !a.done && left(a.due) >= 0 && left(a.due) <= 7)
          .sort((a, b) => a.due.localeCompare(b.due));
        if (!items.length) return session.log('🎉 Nothing due in the next 7 days.');
        await session.log(['📅 Due in the next 7 days:', ...items.map((a) => `   ${a.due} (${left(a.due)}d)  ${a.course}  ${a.title}`)].join('\n'));
      },
    },
    {
      name: 'grades',
      description: 'Your grades in a course and the exam grade you need: /grades SE201 (no AI, no credits)',
      handler: async (ctx) => {
        const data = load();
        const codes = data.courses.map((c) => c.code).join(', ');
        const code = String(ctx?.args ?? '').trim().toUpperCase();
        if (!code) return session.log(`Usage: /grades <course>. Your courses: ${codes}`);
        const course = data.courses.find((c) => c.code === code);
        if (!course) return session.log(`❓ Unknown course "${code}". Your courses: ${codes}`);
        const lines = [`📊 ${course.code} · ${course.name}`];
        if (!course.grades.length) {
          lines.push("   No grades yet, so I can't tell what you need on the exam.");
          return session.log(lines.join('\n'));
        }
        lines.push(`   ${course.grades.map((g) => `${g.item} ${g.grade} (${g.weight}%)`).join(' · ')} · exam ${course.examWeight}%`);
        const pass = Math.max(5, neededExamGrade(course, 5));
        lines.push(`   To pass: at least ${pass} on the exam`);
        const eight = Math.max(5, neededExamGrade(course, 8));
        lines.push(eight > 10 ? `   For an 8: not reachable (you would need ${eight})` : `   For an 8: at least ${eight} on the exam`);
        await session.log(lines.join('\n'));
      },
    },
  ],
});
