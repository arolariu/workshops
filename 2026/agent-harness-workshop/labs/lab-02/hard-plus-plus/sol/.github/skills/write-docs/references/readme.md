# README sections

The README is the first thing a new student or contributor reads. It answers three questions in this order: what is
StudyBuddy, how do I run it, and what's inside.

1. Keep the title and the one-sentence pitch at the top. Never move them down.
2. A "Getting started" section has exactly the commands a new person types: clone, `npm test`. Copy commands from
   `package.json`; never invent a script.
3. A "Usage" section shows one short example per module, in a fenced `js` block, with the output in a comment:
   ```js
   import { weightedAverage } from './grades.js';
   weightedAverage([{ grade: 8, weight: 50 }, { grade: 9, weight: 50 }]); // 8.5
   ```
4. The "Modules" list has one line per module: `` `file.js` - what it does``. Keep it in sync with `index.js`.
5. Use sentence case for headings, no emoji in headings, and keep each section under 15 lines.
6. Link to other documents instead of copying them (`See CHANGELOG.md`).
