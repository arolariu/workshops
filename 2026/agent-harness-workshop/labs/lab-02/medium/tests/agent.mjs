// 🤖 Agent check: use your skill on the original crash (read-only).
export default [
  {
    name: 'The skill explains the crash in your format',
    prompt: 'Use the explain-error skill on the error in fixtures/crash.txt.',
    deny: ['write', 'shell'],
    expect: (t, { output }) => {
      const missing = ['Cause', 'Where', 'Fix'].filter((h) => !new RegExp(h, 'i').test(output));
      if (missing.length) return `The answer has no ${missing.join('/')} section. Copilot said: ${output.trim().slice(0, 200)}`;
      return /report\.js[`'"]?\s*[:,]?\s*(line\s*)?1[01]\b/i.test(output) || 'The answer should point to report.js:11 (the line that crashes).';
    },
  },
];
