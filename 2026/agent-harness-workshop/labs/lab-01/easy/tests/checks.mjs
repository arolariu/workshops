// Free checks for Lab 01 · easy.
const SECTIONS = {
  commands: /command|how to run|scripts?|build|test/i,
  conventions: /convention|style|code/i,
  domain: /domain|business|rule|grad/i,
  boundaries: /boundar|never|don.?t|must not|forbid|safety/i,
  done: /done|definition|finish|checklist/i,
};

export default (t) => [
  t.check('AGENTS.md exists and is short', () => {
    const s = t.need('AGENTS.md', 'Create `AGENTS.md` in src/ (Copilot can draft it from team-notes.md).');
    const n = s.split('\n').length;
    return n <= 100 || `AGENTS.md has ${n} lines. Keep it under 100: every line should change behaviour.`;
  }),
  t.check('It has the sections a new teammate needs', () => {
    const headings = (t.read('AGENTS.md') ?? '').split('\n').filter((l) => /^#{2,3}\s/.test(l)).join('\n');
    const missing = Object.entries(SECTIONS).filter(([, re]) => !re.test(headings)).map(([k]) => k);
    return missing.length <= 1 || `Add headings (## ...) for: ${missing.join(', ')}.`;
  }),
  t.check('It says how to run the tests', () => /npm test/.test(t.read('AGENTS.md') ?? '') || 'Mention the exact test command (`npm test`).'),
  t.check('It captures the exam rule', () => {
    const lines = (t.read('AGENTS.md') ?? '').split('\n');
    const ok = lines.some((l) => /exam/i.test(l) && /(\b5\b|\bfive\b)/i.test(l));
    return ok || 'The most important rule is missing: what does a student need on the exam to pass? (Put the exam and the number on the same line.)';
  }),
  t.check('It sets boundaries (dependencies, tests, .env)', () => {
    const s = t.read('AGENTS.md') ?? '';
    const missing = [[/depend|npm\s+install|lodash/i, 'no new dependencies'], [/test/i, "don't edit tests to make them pass"], [/\.env/, 'never touch .env']].filter(([re]) => !re.test(s)).map(([, m]) => m);
    return !missing.length || `Add these boundaries: ${missing.join('; ')}.`;
  }),
  t.check('It has a canary rule', () => /Harness check/i.test(t.read('AGENTS.md') ?? '') || 'Add a rule like: End every answer with `Harness check: AGENTS.md loaded`.'),
  t.check('Copilot lists AGENTS.md as an instruction source', () => {
    const r = t.copilot(['instruction', 'list', '--json']);
    return /AGENTS\.md/.test(r.stdout) || 'Copilot does not list AGENTS.md. Is it in src/ (where you start copilot)?';
  }, { needs: ['copilot'] }),
  t.check('The build is green and the test is untouched', () => {
    if (!t.unchanged('grades.test.js')) return 'grades.test.js was changed. Fix the code, not the test! (Undo with `git checkout -- grades.test.js`.)';
    const r = t.unitTests();
    return (r.fail === 0 && r.pass > 0) || `Still red: ${r.failing.slice(0, 2).join(' | ')}`;
  }),
];
