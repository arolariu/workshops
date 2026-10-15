// Free checks for Lab 03 · medium.
const AGENT = '.github/agents/test-writer.agent.md';
const toolList = (data) => (Array.isArray(data.tools) ? data.tools : String(data.tools ?? '').split(',')).map((x) => String(x).trim().toLowerCase()).filter(Boolean);
const DONE = /done|finished|complete/i;

export default (t) => [
  t.check('The test-writer agent file exists', () => t.exists(AGENT) || `Create \`${AGENT}\`.`),
  t.check('It can read, edit and run (and has a description)', () => {
    const { data } = t.frontmatter(AGENT);
    if (String(data.description ?? '').length < 20) return 'Write a description: what it does and when to use it.';
    const tools = toolList(data);
    if (!tools.length) return 'Add an explicit `tools:` list.';
    const missing = [['edit', ['edit']], ['execute', ['execute', 'shell', 'bash', 'powershell']], ['read', ['read', 'view']]].filter(([, alts]) => !alts.some((a) => tools.includes(a))).map(([k]) => k);
    return !missing.length || `To write and run tests it needs: ${missing.join(', ')}.`;
  }),
  t.check('Its instructions draw the boundary', () => {
    const { body } = t.frontmatter(AGENT);
    if (!/\.test\.js|test files/i.test(body)) return 'Say which files it may edit (test files).';
    if (!/never|must not|do not|don.?t/i.test(body)) return 'Say what it must never do (change library code).';
    return /report|BUGS\.md/i.test(body) || 'Tell it to report bugs (in BUGS.md) instead of fixing them.';
  }),
  t.check('deadlines.js is unchanged', () => t.unchanged('deadlines.js') || 'deadlines.js was changed. The test-writer proves bugs; it does not fix them. Undo with `git checkout -- deadlines.js`.'),
  t.check('A new test is about done assignments', () => {
    const names = [...(t.read('deadlines.test.js') ?? '').matchAll(/\btest\s*\(\s*(['"`])(.*?)\1/g)].map((m) => m[2]);
    return names.some((n) => DONE.test(n)) || 'Add a test for upcoming() and assignments that are already done (mention "done" in the test name).';
  }),
  t.check('That test fails, proving the bug (and nothing else fails)', () => {
    const r = t.unitTests();
    if (!r.failing.some((n) => DONE.test(n))) return 'Your done-items test passes, so it does not prove the bug yet. Does it include a done assignment inside the window?';
    const other = r.failing.filter((n) => !DONE.test(n));
    return !other.length || `Other tests fail too: ${other.join(' | ')}`;
  }),
  t.check('BUGS.md reports the bug (expected vs actual)', () => {
    const s = t.need('BUGS.md', 'Create `BUGS.md` with a bug report.');
    return (/upcoming/i.test(s) && DONE.test(s) && /expected/i.test(s) && /actual/i.test(s)) || 'The report needs: what (upcoming + done), expected and actual.';
  }),
];
