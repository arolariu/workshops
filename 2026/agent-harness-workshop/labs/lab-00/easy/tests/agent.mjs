const firstWord = (output) => (output.trim().match(/[A-Za-z]+/) ?? [''])[0].toUpperCase();

// 🤖 Agent check: the real Copilot CLI grades your FINDINGS.md (read-only: no writes, no shell).
export default [
  {
    name: 'Copilot agrees with your findings',
    prompt: 'Read FINDINGS.md and grades.js. Is FINDINGS.md a correct explanation of why the failing test fails? Start your reply with one word, YES or NO, then add one short sentence.',
    deny: ['write', 'shell'],
    expect: (t, { output }) => firstWord(output) === 'YES' || `Copilot was not convinced: ${output.trim().slice(0, 200)}`,
  },
];
