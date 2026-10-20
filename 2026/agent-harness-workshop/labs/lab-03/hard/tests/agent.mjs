// 🤖 Agent check: one real round of YOUR loop on a copy: the reviewer answers in JSON, the fixer works from the
// findings file (2 prompts, each capped by your roundBudget()). Judged on the report and the tests, not on wording.
export default [
  {
    name: 'One round: JSON findings go from the reviewer to the fixer, and red tests turn green',
    command: ['node', 'scripts/review-loop.mjs', 'deadlines.js', '--max-rounds', '1'],
    prompts: 2, // one review, one fix
    timeout: 900000,
    expect: (t) => {
      let report;
      try { report = JSON.parse(t.read('.agent-logs/review-loop/report.json') ?? ''); } catch { return 'No .agent-logs/review-loop/report.json: did the loop run?'; }
      const r1 = report.rounds?.[0];
      if (r1?.verdict !== 'ISSUES' || !(r1.findings >= 1)) return `Round 1 should find issues in deadlines.js. The report says: ${JSON.stringify(r1 ?? { stop: report.stop, reason: report.reason }).slice(0, 300)}`;
      if (!r1.findingsFile || !t.exists(r1.findingsFile)) return 'The findings file the fixer was given is missing.';
      if (t.unchanged('deadlines.js')) return 'deadlines.js was not changed: did the fixer run?';
      const before = t.unitTests({ cwd: t.solDir }).failing; // the red tests the test-writer left behind
      const now = t.unitTests();
      const broken = now.failing.filter((n) => !before.includes(n));
      if (broken.length) return `The fix broke tests that were green: ${broken.slice(0, 2).join(' | ')}`;
      // A red test that disappeared, or was renamed, is not a red test that turned green.
      const turned = before.filter((n) => !now.failing.includes(n));
      const gone = turned.filter((n) => !now.passing.includes(n));
      if (gone.length) return `These red tests are gone instead of green (deleted or renamed?): ${gone.slice(0, 2).join(' | ')}`;
      return turned.length > 0 || `None of the red tests turned green: ${now.failing.slice(0, 2).join(' | ')}`;
    },
  },
];
