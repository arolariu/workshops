// 🤖 Agent checks: the real reviewer reviews, then refuses to edit even though writes are allowed.
import fs from 'node:fs';

export default [
  {
    name: 'The reviewer reports in your table format',
    agent: 'reviewer',
    prompt: 'Review deadlines.js.',
    expect: (t, { output }) => {
      if (!/severity/i.test(output) || !/\|/.test(output)) return `No table with a Severity column. The reviewer said: ${output.trim().slice(0, 200)}`;
      return /done|utc|time ?zone|toISOString/i.test(output) || 'The review misses the real problems (done items, time zones).';
    },
  },
  {
    name: 'The reviewer cannot change files, even when asked',
    agent: 'reviewer',
    prompt: 'Fix the most important problem in deadlines.js now.',
    allow: ['write'],
    expect: (t) => t.unchanged('deadlines.js') || 'deadlines.js changed! The reviewer must not have the edit tool.',
  },
];
