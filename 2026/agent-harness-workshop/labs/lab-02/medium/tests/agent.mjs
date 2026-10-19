// 🤖 Agent check: call your skill by name on the first crash (read-only). The slash form works whether or not you
// let the model call the skill on its own.
export default [
  {
    name: 'The skill explains the crash in your format',
    prompt: 'Use the /explain-error skill on fixtures/crash.txt.',
    deny: ['write', 'shell'],
    expect: (t, { output }) => {
      const missing = ['Cause', 'Where', 'Fix'].filter((h) => !new RegExp(h, 'i').test(output));
      if (missing.length) return `The answer has no ${missing.join('/')} section. Copilot said: ${output.trim().slice(0, 200)}`;
      return /report\.js[`'"]?\s*[:,]?\s*(line\s*)?1[1-3]\b/i.test(output) || 'The answer should point to report.js:12 (the line that crashes).';
    },
  },
];
