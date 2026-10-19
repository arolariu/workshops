// 🤖 Agent check: load your plugin with --plugin-dir (nothing is installed) and run its reviewer. One prompt proves
// two things the free checks can't: Copilot finds the plugin's agent, and the plugin's guard hook runs from the
// plugin's folder (it logs every call the reviewer makes into the session's .agent-logs/sb-guard.jsonl).
const VERDICT = /VERDICT:\s*(CLEAN|ISSUES)/;

export default [
  {
    name: 'The packaged reviewer runs, and the packaged guard sees its calls',
    prompt: 'Review report.js for bugs. Reply with your findings table and the verdict line.',
    agent: 'sb-reviewer',
    pluginDirs: ['studybuddy-plugin'],
    deny: ['write', 'shell'],
    expect: (t, { output }) => {
      if (!VERDICT.test(output)) return 'No "VERDICT: CLEAN" or "VERDICT: ISSUES" line: did Copilot load sb-reviewer from the plugin?';
      if (!/\|.*\|/.test(output)) return 'The reviewer should report its findings in a table.';
      if (!t.unchanged('report.js')) return 'report.js was changed, but the reviewer is read-only!';
      const log = (t.read('.agent-logs/sb-guard.jsonl') ?? '').split('\n').filter(Boolean);
      return log.length > 0 || 'No line in .agent-logs/sb-guard.jsonl: the plugin\'s preToolUse hook never ran (or couldn\'t find its script, or logged somewhere else).';
    },
  },
];