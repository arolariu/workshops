// 🤖 Agent check: does the real agent follow your AGENTS.md? (read-only)
export default [
  {
    name: 'Copilot follows your rules (canary)',
    prompt: 'What rules should you follow when you change code in this project? Answer in 3 short bullets.',
    deny: ['write', 'shell'],
    expect: (t, { output }) => /Harness check/i.test(output) || `No "Harness check" line in the answer. Is the canary rule clear? Copilot said: ${output.trim().slice(-200)}`,
  },
];
