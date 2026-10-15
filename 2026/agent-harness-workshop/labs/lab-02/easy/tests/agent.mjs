// 🤖 Agent check: ask for a NEW module without mentioning the recipe. Does your skill kick in?
export default [
  {
    name: 'The agent follows your recipe for a new module',
    prompt: 'Add a participation module: participationScore(weeks) takes a list of { week, points } and returns the total points.',
    allow: ['write', 'shell(npm:*)', 'shell(node:*)'],
    timeout: 360000,
    expect: (t) => {
      const missing = [];
      if (!/^\/\/ StudyBuddy participation/m.test(t.read('participation.js') ?? '')) missing.push('participation.js with the template header');
      if (!t.exists('participation.test.js')) missing.push('participation.test.js');
      if (!/participation\.js/.test(t.read('index.js') ?? '')) missing.push('export in index.js');
      if (!/participation/i.test(t.read('README.md') ?? '')) missing.push('README line');
      if (missing.length) return `The agent skipped part of the recipe: ${missing.join(', ')}.`;
      const r = t.unitTests();
      return r.fail === 0 || `The new tests fail: ${r.failing.slice(0, 2).join(' | ')}`;
    },
  },
];
