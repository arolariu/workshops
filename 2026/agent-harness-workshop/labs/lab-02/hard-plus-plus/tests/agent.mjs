// 🤖 Agent check: two requests through the real Copilot, read-only, on a throwaway copy of your folder. Each answer
// should end with the canary of the skill that ought to load, and carry no other skill's canary. (The full 24-request
// run is yours to start: node evals/routing/run.mjs --real --max-credits 2.)
const SIX = ['csv-export', 'explain-error', 'new-module', 'release-notes', 'write-docs', 'write-tests'];
const tags = (output) => [...new Set([...String(output).matchAll(/\[skill:([a-z0-9-]+)\]/g)].map((m) => m[1]))].filter((n) => SIX.includes(n));
const only = (want) => (t, { output }) => {
  const got = tags(output);
  if (!got.includes(want)) return `No [skill:${want}] in the answer${got.length ? ` (it carries ${got.map((n) => `[skill:${n}]`).join(', ')})` : ''}. Is the description clear, and does the skill say to end with its tag? Copilot said: ${output.trim().slice(-200)}`;
  const others = got.filter((n) => n !== want);
  return !others.length || `The answer also carries ${others.map((n) => `[skill:${n}]`).join(', ')}: two skills claimed one request.`;
};

export default [
  {
    name: 'A pasted stack trace loads explain-error',
    prompt: "What does this error mean? TypeError: Cannot read properties of undefined (reading 'map') at summary (report.js:12:33). Don't change any files.",
    deny: ['write', 'shell'],
    expect: only('explain-error'),
  },
  {
    name: 'A JSDoc request loads write-docs, and nothing else',
    prompt: "Write JSDoc for hasPassed() in grades.js and show it to me. Don't edit any files.",
    deny: ['write', 'shell'],
    expect: only('write-docs'),
  },
];
