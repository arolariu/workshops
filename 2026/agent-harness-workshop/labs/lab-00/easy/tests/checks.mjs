// Free checks for Lab 00 · easy. Each check returns true (pass) or a message (fail).
export default (t) => [
  t.check('FINDINGS.md exists and has real content', () => {
    const s = t.need('FINDINGS.md', 'Create `FINDINGS.md` in src/ (ask Copilot to write its explanation there).');
    const words = s.split(/\s+/).filter((w) => /\w/.test(w)).length;
    return words >= 20 || `FINDINGS.md has ${words} word(s). Write a few sentences (20+ words): what fails, where, and why.`;
  }),
  t.check('It names the failing test', () =>
    /hasPassed/.test(t.read('FINDINGS.md') ?? '') || 'Which test fails? Mention the function it tests (run `!npm test` in Copilot and read the failing line).'),
  t.check('It points at the guilty file', () =>
    /grades\.js/.test(t.read('FINDINGS.md') ?? '') || 'Which file holds the bug? Mention it by name.'),
  t.check('It explains the rule the code forgets', () => {
    const s = (t.read('FINDINGS.md') ?? '').toLowerCase();
    return (/exam/.test(s) && /\b5\b|five/.test(s)) || 'Explain the missing rule. What about the exam grade? (A number is involved.)';
  }),
  t.check("The code is untouched (investigate, don't fix)", () =>
    (t.unchanged('grades.js') && t.unchanged('grades.test.js')) || 'This level is about investigating. Undo your changes to grades.js / grades.test.js (`/rewind` in Copilot, or `git checkout -- .`). Fixing comes in Lab 01.'),
];
