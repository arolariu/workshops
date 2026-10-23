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

const session = await joinSession({
  commands: [
    {
      name: 'due',
      description: 'What is due in the next 7 days (no AI, no credits)',
      // ctx.args is the raw text after the command name, e.g. " 14 --course se201 ".
      handler: async (ctx) => {
        // 👉 Lab 06 · medium (M3): read [days] and --course <code> from ctx.args.
        const data = load();
        const left = (d) => Math.round((Date.parse(d) - Date.parse(data.today)) / DAY);
        const items = data.assignments
          .filter((a) => !a.done && left(a.due) >= 0 && left(a.due) <= 7)
          .sort((a, b) => a.due.localeCompare(b.due));
        if (!items.length) return say('🎉 Nothing due in the next 7 days.');
        await say(['📅 Due in the next 7 days:', ...items.map((a) => `   ${a.due} (${left(a.due)}d)  ${a.course}  ${a.title}`)].join('\n'));
      },
    },
    // 👉 Lab 06 · medium (M1, M2): add the /grades command here.
  ],
});