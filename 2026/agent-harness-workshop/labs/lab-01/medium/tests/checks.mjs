// Free checks for Lab 01 · medium.
const findFile = (t) => t.find(/^\.github\/instructions\/.+\.instructions\.md$/)[0];
const count = (s, re) => (s.match(re) ?? []).length;

export default (t) => [
  t.check('A path-specific instructions file exists', () =>
    Boolean(findFile(t)) || 'Create a file like `.github/instructions/tests.instructions.md`.'),
  t.check('Its applyTo matches test files only', () => {
    const f = findFile(t);
    if (!f) return 'No .instructions.md file yet.';
    const { data } = t.frontmatter(f);
    if (!data.applyTo) return 'Add `applyTo: "<glob>"` to the frontmatter.';
    const { applyToMatches } = t.globs;
    const must = ['grades.test.js', 'lib/deep/deadlines.test.js'];
    const mustNot = ['grades.js', 'README.md'];
    const bad = must.filter((p) => !applyToMatches(data.applyTo, p));
    const wrong = mustNot.filter((p) => applyToMatches(data.applyTo, p));
    if (bad.length) return `applyTo "${data.applyTo}" does not match ${bad.join(', ')}.`;
    if (wrong.length) return `applyTo "${data.applyTo}" also matches ${wrong.join(', ')}. Only test files, please.`;
    return Boolean(data.description) || 'Add a one-line `description:` to the frontmatter.';
  }),
  t.check('It has real rules (node:test, assert/strict, 3+ bullets)', () => {
    const f = findFile(t);
    if (!f) return 'No .instructions.md file yet.';
    const { body } = t.frontmatter(f);
    const bullets = body.split('\n').filter((l) => /^\s*([-*]|\d+[.)])\s+\S/.test(l)).length;
    if (bullets < 3) return `Only ${bullets} rule(s). Write at least 3 bullet rules.`;
    return (/node:test/.test(body) && /assert\/strict/.test(body)) || 'Name the test runner and assert style: `node:test` and `node:assert/strict`.';
  }),
  t.check('Copilot lists it with its applyTo', () => {
    const r = t.copilot(['instruction', 'list', '--json']);
    let list = [];
    try { list = JSON.parse(r.stdout); } catch { return `Could not read the list: ${r.all.trim().slice(0, 200)}`; }
    const hit = list.find((s) => /\.github\/instructions\/.+\.instructions\.md/.test(String(s.sourcePath ?? '').replace(/\\/g, '/')));
    return (hit && Array.isArray(hit.applyTo) && hit.applyTo.length > 0) || 'Copilot does not list your file with an applyTo. Check the folder, the file name and the frontmatter.';
  }, { needs: ['copilot'] }),
  t.check('grades.test.js has 3+ new weightedAverage tests', () => {
    const s = t.read('grades.test.js') ?? '';
    const tests = count(s, /\btest\s*\(/g);
    const calls = count(s, /weightedAverage\s*\(/g);
    if (tests < 8) return `grades.test.js has ${tests} tests (it started with 5). Add at least 3 new tests for weightedAverage.`;
    return calls >= 6 || `Your new tests should call weightedAverage(...): found ${calls} calls, expected at least 6 (3 existing + 3 new).`;
  }),
  t.check('The new tests cover error cases', () => {
    const n = ((t.read('grades.test.js') ?? '').match(/assert\.throws\s*\(/g) ?? []).length;
    return n >= 3 || `Found ${n} assert.throws. Add at least 2 new error-case tests (for example a total weight of zero, or not an array).`;
  }),
  t.check('npm test is green', () => {
    const r = t.unitTests();
    return (r.fail === 0 && r.pass > 0) || `${r.fail} failing: ${r.failing.slice(0, 2).join(' | ')}`;
  }),
];
