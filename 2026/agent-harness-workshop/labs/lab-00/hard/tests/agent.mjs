// 🤖 Agent check: record a real run with YOUR recordArgs(), then summarise it with YOUR summarize().
import fs from 'node:fs';

export default [
  {
    name: 'Record a real run and summarise it',
    command: ['node', 'scripts/run-stats.mjs', '--record', 'Which functions does grades.js export? Answer in one line.'],
    expect: async (t, { output }) => {
      const runs = t.files('runs').filter((f) => f.endsWith('.jsonl'));
      if (!runs.length) return 'No runs/*.jsonl file was written.';
      const { summarize } = await t.import('scripts/run-stats.mjs');
      const s = summarize(fs.readFileSync(t.path(runs[0]), 'utf8').split(/\r?\n/));
      return (s.events > 0 && /📊/.test(output)) || `The recorded run has ${s.events} events. Is --output-format json in recordArgs()?`;
    },
  },
];
