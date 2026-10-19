// Free checks for Lab 01 · medium: rules for one folder.
import fs from 'node:fs';
import path from 'node:path';

const TESTS = '.github/instructions/tests.instructions.md';
const DOCS = '.github/instructions/docs.instructions.md';
const WHICH = 'scripts/which-instructions.mjs';
const SCOPED = /^\.github\/instructions\/.+\.instructions\.md$/;
const count = (s, re) => (s.match(re) ?? []).length;
const bullets = (body) => body.split('\n').filter((l) => /^\s*([-*]|\d+[.)])\s+\S/.test(l));
const slash = (p) => String(p ?? '').replace(/\\/g, '/');

/** Does the file's applyTo cover `must` and none of `mustNot`, and does it have a description? */
function globCheck(t, file, must, mustNot, hint) {
  const { data } = t.frontmatter(file, `\`${file}\` doesn't exist yet.`);
  if (!data.applyTo) return `Add \`applyTo: "<glob>"\` to the frontmatter of ${file}.`;
  const { applyToMatches } = t.globs;
  const missed = must.filter((p) => !applyToMatches(data.applyTo, p));
  if (missed.length) return `applyTo \`${data.applyTo}\` does not match ${missed.join(', ')}.`;
  const extra = mustNot.filter((p) => applyToMatches(data.applyTo, p));
  if (extra.length) return `applyTo \`${data.applyTo}\` also matches ${extra.join(', ')}. ${hint}`;
  return Boolean(String(data.description ?? '').trim()) || `Add a one-line \`description:\` to the frontmatter of ${file}.`;
}

// A scoped rule that says the opposite of AGENTS.md, unless the line says "never …" / "not …" / "instead of …".
const NEGATED = /\b(never|not|no|don'?t|instead of|avoid|rather than)\b/i;
const CONFLICTS = [
  { re: /require\s*\(|CommonJS/i, why: 'asks for CommonJS (`require()`), but AGENTS.md says "ES modules only"' },
  { re: /percent|\d\s*%/i, also: /grade/i, why: 'shows grades as percentages, but AGENTS.md says grades use the 1-10 scale' },
];

const GLOBS = [
  ['**/*.test.js', 'grades.test.js', true],
  ['**/*.test.js', 'lib/deep/deadlines.test.js', true],
  ['**/*.test.js', 'grades.js', false],
  ['**/*.test.js', 'grades.test.json', false],
  ['*.md', 'README.md', true],
  ['*.md', 'docs/grading.md', false],
  ['docs/**', 'docs/a/b.md', true],
  ['docs/**/*.md', 'docs/grading.md', true],
  ['docs/**/*.md', 'README.md', false],
  ['src/*.js', 'src/a.js', true],
  ['src/*.js', 'src/a/b.js', false],
  ['**/*.{js,mjs}', 'scripts/x.mjs', true],
  ['**/*.{js,mjs}', 'x.ts', false],
  ['grade?.js', 'grades.js', true],
  ['grade?.js', 'grade.js', false],
  ['README.md', 'docs/README.md', false],
  ['packages/x/**', 'packages/x/a.js', true],
  ['packages/x/**', 'packages/xy/a.js', false],
];

export default (t) => [
  // M1 · Rules for tests
  t.check('tests.instructions.md applies to every test file, and only to test files', () =>
    globCheck(t, TESTS, ['grades.test.js', 'lib/deep/deadlines.test.js'], ['grades.js', 'README.md'], 'Only test files, please.'), { milestone: 'M1' }),
  t.check('It has real rules (node:test, assert/strict, 3+ bullets)', () => {
    const { body } = t.frontmatter(TESTS);
    const n = bullets(body).length;
    if (n < 3) return `${TESTS} has ${n} rule(s). Write at least 3 bullet rules.`;
    return (/node:test/.test(body) && /assert\/strict/.test(body)) || 'Name the test runner and assert style: `node:test` and `node:assert/strict`.';
  }, { milestone: 'M1' }),
  t.check('grades.test.js has 3+ new weightedAverage tests, with error cases', () => {
    const s = t.read('grades.test.js') ?? '';
    const tests = count(s, /\btest\s*\(/g);
    const calls = count(s, /weightedAverage\s*\(/g);
    if (tests < 8) return `grades.test.js has ${tests} tests (it started with 5). Ask the agent for at least 3 new tests for weightedAverage.`;
    if (calls < 6) return `Your new tests should call weightedAverage(...): found ${calls} calls, expected at least 6 (3 existing + 3 new).`;
    const throws = count(s, /assert\.throws\s*\(/g);
    return throws >= 3 || `Found ${throws} assert.throws. Add at least 2 new error-case tests (for example a total weight of zero, or not an array).`;
  }, { milestone: 'M1' }),
  t.check('npm test is green', () => {
    const r = t.unitTests();
    return (r.fail === 0 && r.pass > 0) || `${r.fail} failing: ${r.failing.slice(0, 2).join(' | ')}`;
  }, { milestone: 'M1' }),
  t.check('Copilot lists the tests file with its applyTo', () => {
    const r = t.copilot(['instruction', 'list', '--json']);
    let list = [];
    try { list = JSON.parse(r.stdout); } catch { return `Could not read the list: ${r.all.trim().slice(0, 200)}`; }
    const hit = list.find((s) => /\.github\/instructions\/tests\.instructions\.md$/.test(slash(s.sourcePath)));
    return (hit && Array.isArray(hit.applyTo) && hit.applyTo.length > 0) || 'Copilot does not list tests.instructions.md with an applyTo. Check the folder, the file name and the frontmatter.';
  }, { needs: ['copilot'], milestone: 'M1' }),

  // M2 · Rules for docs
  t.check('docs.instructions.md applies to the docs, and only to the docs', () =>
    globCheck(t, DOCS, ['README.md', 'docs/grading.md', 'docs/guides/setup.md'], ['grades.js', 'grades.test.js', 'AGENTS.md', TESTS],
      'A docs rule that reaches code, tests or the instruction files themselves is a rule for everything: list the docs (a comma separates globs).'), { milestone: 'M2' }),
  t.check('The docs file has 3+ rules', () => {
    const n = bullets(t.frontmatter(DOCS).body).length;
    return n >= 3 || `${DOCS} has ${n} rule(s). Keep at least 3.`;
  }, { milestone: 'M2' }),

  // M3 · One rule, not two
  t.check('No scoped rule contradicts AGENTS.md', () => {
    const hits = [];
    for (const f of t.find(SCOPED)) {
      const { body } = t.frontmatter(f);
      for (const line of bullets(body)) {
        for (const c of CONFLICTS) {
          if (c.re.test(line) && (!c.also || c.also.test(line)) && !NEGATED.test(line)) hits.push(`${f}: "${line.trim().replace(/^[-*]\s+/, '').slice(0, 80)}" ${c.why}.`);
        }
      }
    }
    return !hits.length || `Copilot sends both files and puts no order between them, so the model gets two answers. ${hits[0]}${hits.length > 1 ? ` (and ${hits.length - 1} more)` : ''}`;
  }, { milestone: 'M3' }),
  t.check('The docs rules say what to do instead: `import` in examples, the 1-10 scale', () => {
    const { body } = t.frontmatter(DOCS);
    if (!/\bimport\b/.test(body)) return 'Say how code examples look instead: ES modules, with `import`, like the code.';
    return /\b1\s*(-|–|to)\s*10\b/.test(body) || 'Say how grades are written instead: on the 1-10 scale, like AGENTS.md.';
  }, { milestone: 'M3' }),

  // M4 · Which rules apply where
  t.check('matches() understands **, *, ? and {a,b}', async () => {
    const { matches } = await t.import(WHICH);
    const wrong = GLOBS.filter(([g, p, want]) => matches(g, p) !== want);
    return !wrong.length || `matches() is off for ${wrong.length} case(s): ${wrong.slice(0, 3).map(([g, p, want]) => `\`matches("${g}", "${p}")\` should be ${want}`).join('; ')}.`;
  }, { milestone: 'M4' }),
  t.check('applicable() lists the always-on files and every match', async () => {
    const { applicable } = await t.import(WHICH);
    const sources = [
      { path: 'AGENTS.md', applyTo: null },
      { path: TESTS, applyTo: ['**/*.test.js'] },
      { path: DOCS, applyTo: ['README.md', 'docs/**/*.md'] },
      { path: 'packages/cli/AGENTS.md', applyTo: ['packages/cli/**'] },
    ];
    const cases = [
      ['grades.js', ['AGENTS.md']],
      ['grades.test.js', ['AGENTS.md', TESTS]],
      ['docs/grading.md', ['AGENTS.md', DOCS]],
      ['packages/cli/index.test.js', ['AGENTS.md', TESTS, 'packages/cli/AGENTS.md']],
    ];
    for (const [file, want] of cases) {
      const got = applicable(sources, file);
      if (JSON.stringify(got) !== JSON.stringify(want)) return `applicable(sources, "${file}") gives ${JSON.stringify(got)}; expected ${JSON.stringify(want)}.`;
    }
    return true;
  }, { milestone: 'M4' }),
  t.check('The script answers for real paths, nested AGENTS.md included', () => {
    const copy = t.copy(t.tmp());
    fs.mkdirSync(path.join(copy, 'packages', 'x'), { recursive: true });
    fs.writeFileSync(path.join(copy, 'packages', 'x', 'AGENTS.md'), '# Package x\n- A rule for package x.\n');
    const paths = ['grades.js', 'grades.test.js', 'README.md', 'docs/grading.md', 'packages/x/a.js'];
    const r = t.node([WHICH, '--json', ...paths], { cwd: copy });
    let rows;
    try { rows = JSON.parse(r.stdout); } catch { return `node ${WHICH} --json … did not print JSON. ${r.all.trim().slice(0, 200)}`; }
    const { applyToMatches } = t.globs;
    const scoped = t.find(SCOPED).map((f) => ({ path: f, applyTo: t.frontmatter(f).data.applyTo }));
    const always = ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', '.github/copilot-instructions.md'].filter((f) => t.exists(f));
    for (const p of paths) {
      const want = [...always, ...scoped.filter((s) => s.applyTo && applyToMatches(s.applyTo, p)).map((s) => s.path), ...(p.startsWith('packages/x/') ? ['packages/x/AGENTS.md'] : [])].sort();
      const got = [...((Array.isArray(rows) ? rows : []).find((x) => x.path === p)?.files ?? [])].sort();
      if (JSON.stringify(got) !== JSON.stringify(want)) return `For ${p} the script says ${JSON.stringify(got)}; the files that apply are ${JSON.stringify(want)}.`;
    }
    return true;
  }, { milestone: 'M4' }),
  t.check('Copilot agrees about the scoped files and their applyTo', async () => {
    const { instructionSources } = await t.import(WHICH);
    const mine = instructionSources(t.dir);
    const r = t.copilot(['instruction', 'list', '--json']);
    let list;
    try { list = JSON.parse(r.stdout); } catch { return `Could not read Copilot's list: ${r.all.trim().slice(0, 200)}`; }
    const scoped = list.map((s) => ({ ...s, rel: slash(s.sourcePath) })).filter((s) => /(^|\/)\.github\/instructions\/.+\.instructions\.md$/.test(s.rel) && !/^([a-z]:)?\//i.test(s.rel));
    const split = (xs) => (xs ?? []).flatMap((x) => String(x).split(',')).map((x) => x.trim()).filter(Boolean).sort().join(', ');
    for (const s of scoped) {
      const hit = mine.find((m) => s.rel === m.path || s.rel.endsWith(`/${m.path}`));
      if (!hit) return `Copilot loads ${s.rel}, but instructionSources() doesn't list it.`;
      if (split(s.applyTo) !== split(hit.applyTo)) return `${hit.path}: Copilot reads applyTo as [${split(s.applyTo)}], instructionSources() as [${split(hit.applyTo)}].`;
    }
    return scoped.length >= 2 || 'Copilot lists fewer than two scoped files here: one for tests and one for docs.';
  }, { needs: ['copilot'], env: true, milestone: 'M4' }),
];
