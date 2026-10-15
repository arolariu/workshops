// 🤖 Agent check: the test-writer proves the bug on a fresh copy, without touching deadlines.js.
import fs from 'node:fs';
import path from 'node:path';

export default [
  {
    name: 'The test-writer proves the bug and leaves the code alone',
    agent: 'test-writer',
    prompt: 'Prove with a test that upcoming() wrongly includes assignments that are already done.',
    allow: ['write', 'shell(npm:*)', 'shell(node:*)'],
    timeout: 360000,
    setup: (t) => fs.copyFileSync(path.join(t.exDir, 'tests', 'original-deadlines.test.js'), t.path('deadlines.test.js')),
    expect: (t) => {
      if (!t.unchanged('deadlines.js')) return 'deadlines.js was changed. The boundary did not hold.';
      const r = t.unitTests();
      return r.failing.some((n) => /done|finished|complete/i.test(n)) || 'No failing test about done assignments was added.';
    },
  },
];
