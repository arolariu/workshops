// 🤖 Agent check: an unattended run on YOUR leash, inside YOUR guardrails.
export default [
  {
    name: 'An autonomous run on a leash fixes a bug, with tests after every edit',
    command: ['node', 'scripts/leash.mjs', 'Make upcoming() in deadlines.js skip assignments that are already done, and add a test for it.'],
    prompts: 1, // one copilot -p run (leash.mjs); its own --max-ai-credits caps it
    timeout: 600000,
    expect: (t) => {
      if (t.unchanged('deadlines.js')) return 'deadlines.js was not changed.';
      if (!/"result":"(pass|fail)"/.test(t.read('.agent-logs/tests.jsonl') ?? '')) return 'No tests.jsonl entries: did the postToolUse hook run? (Is the folder trusted?)';
      const r = t.unitTests();
      return r.fail === 0 || `Tests are red after the run: ${r.failing.slice(0, 2).join(' | ')}`;
    },
  },
];
