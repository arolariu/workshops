// 🤖 Agent check: call your skill the way a person does, by name at the start of the prompt, on the first crash
// (read-only). A prompt that starts with /explain-error is a person invoking the skill, which disable-model-invocation
// doesn't block, so either choice should pass; the reference solution (the one validated) chooses false.
export default [
  {
    name: 'The skill explains the crash in your format',
    prompt: '/explain-error fixtures/crash.txt',
    deny: ['write', 'shell'],
    expect: (t, { output }) => {
      const missing = ['Cause', 'Where', 'Fix'].filter((h) => !new RegExp(h, 'i').test(output));
      if (missing.length) return `The answer has no ${missing.join('/')} section. Copilot said: ${output.trim().slice(0, 200)}`;
      return /report\.js[`'"]?\s*[:,]?\s*(line\s*)?1[1-3]\b/i.test(output) || 'The answer should point to report.js:12 (the line that crashes).';
    },
  },
];
