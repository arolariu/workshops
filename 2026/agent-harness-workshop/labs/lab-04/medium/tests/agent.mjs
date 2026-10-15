// 🤖 Agent check: does the model pick YOUR tool from its description?
import { serverConfig } from './common.mjs';

export default [
  {
    name: 'Copilot uses get_exam_dates to answer',
    prompt: 'Which of my exams comes first, and how much does it count towards the final grade?',
    allow: (t) => [serverConfig(t).name],
    deny: ['write', 'shell'],
    expect: (t, { output }) => (/DB220|Databases/i.test(output) && /50/.test(output)) || `Expected DB220 (Databases), counting 50%. Copilot said: ${output.trim().slice(0, 200)}`,
  },
];
