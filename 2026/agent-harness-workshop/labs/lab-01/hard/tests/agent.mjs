// 🤖 Agent check: run YOUR experiment for real (1 run per variant = about 2 prompts).
export default [
  {
    name: 'The real experiment shows the instructions at work',
    command: ['node', 'scripts/ab.mjs', '--runs', '1'],
    prompts: 2,
    expect: (t) => {
      const r = t.json('ab-results.json', 'ab-results.json was not written.');
      const s = r.summary ?? {};
      if (s.with?.runs !== 1 || s.without?.runs !== 1) return `Expected 1 run per variant, got ${JSON.stringify(s)}`;
      return s.with.canary > s.without.canary || `With instructions the canary appeared ${s.with.canary} time(s), without ${s.without.canary}. Is the canary rule in AGENTS.md clear?`;
    },
  },
];
