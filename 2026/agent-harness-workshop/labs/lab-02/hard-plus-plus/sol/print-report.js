// StudyBuddy print-report: the report for the sample courses. Run it with: node print-report.js
import { summary, attendanceLines } from './report.js';
import { upcoming } from './deadlines.js';

const COURSES = [
  {
    code: 'SE201',
    name: 'Software Engineering',
    grades: [{ grade: 8, weight: 50 }, { grade: 9, weight: 50 }],
    sessions: [{ attended: true }, { attended: true }, { attended: false }],
  },
  { code: 'WEB230', name: 'Web Development', sessions: [] },
];
const ASSIGNMENTS = [
  { id: 'A1', title: 'Sprint 2 demo', due: '2026-10-21', done: false },
  { id: 'A2', title: 'Normalize the schema to 3NF', due: '2026-11-30', done: false },
];

for (const line of summary(COURSES)) console.log(line);
for (const line of attendanceLines(COURSES)) console.log(line);
for (const a of upcoming(ASSIGNMENTS, '2026-10-19')) console.log(`Due ${a.due}: ${a.title}`);
