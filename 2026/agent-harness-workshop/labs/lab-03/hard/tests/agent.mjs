// 🤖 Agent check: run YOUR loop for real on a copy (up to 2 rounds = up to 4 prompts).
import fs from 'node:fs';
import path from 'node:path';

export default [
  {
    name: 'The loop reviews, fixes and ends green',
    command: ['node', 'scripts/review-loop.mjs', 'deadlines.js'],
    prompts: 4,
    timeout: 900000,
    expect: (t) => {
      if (!t.exists('.agent-logs/review-1.md')) return 'No review was saved.';
      if (t.unchanged('deadlines.js')) return 'deadlines.js was not changed: did the fixer run?';
      const orig = (fs.readFileSync(path.join(t.solDir, 'deadlines.test.js'), 'utf8').match(/\btest\s*\(/g) ?? []).length;
      const now = ((t.read('deadlines.test.js') ?? '').match(/\btest\s*\(/g) ?? []).length;
      if (now <= orig) return 'No regression tests were added.';
      const r = t.unitTests();
      return r.fail === 0 || `The loop ended with red tests: ${r.failing.slice(0, 2).join(' | ')}`;
    },
  },
];
