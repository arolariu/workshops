// 🧩 StudyBuddy extension for GitHub Copilot CLI (experimental: start with `copilot --experimental`).
// Slash commands run locally in Node.js: no AI, no AI credits, always the same answer.
import fs from 'node:fs';
import { joinSession } from '@github/copilot-sdk/extension';

const DATA_URL = new URL('../../../data/portal-data.json', import.meta.url);
const load = () => JSON.parse(fs.readFileSync(DATA_URL, 'utf8'));
const DAY = 24 * 60 * 60 * 1000;

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
    // 👉 Lab 06 · medium: add the /grades command here.
  ],
});
