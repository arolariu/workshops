// Free checks for Lab 02 · hard: a skill with a script.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { MUTANTS, mutant } from './mutants.mjs';

const SKILL = '.github/skills/release-notes/SKILL.md';
const SCRIPT = '.github/skills/release-notes/scripts/changes.mjs';
const TESTS = '.github/skills/release-notes/scripts/changes.test.mjs';
const FIELDS = ['type', 'scope', 'subject', 'breaking', 'note', 'revertOf'];
const fixture = (t, name) => path.join(t.exDir, 'tests', 'fixtures', name);
const commits = (t) => JSON.parse(fs.readFileSync(fixture(t, 'commits.json'), 'utf8'));
const show = (v) => JSON.stringify(v);

const runScript = (t, args, cwd) => {
  const r = t.node([t.path(SCRIPT), ...args], { cwd: cwd ?? t.dir });
  if (r.code !== 0) t.fail(`The script failed: ${r.stderr.trim().split('\n').slice(-2).join(' ')}`);
  return r.stdout;
};
const runJson = (t, args, cwd) => {
  const out = runScript(t, args, cwd);
  try { return JSON.parse(out); } catch { return t.fail(`Without --format md the script must print JSON. It printed: ${out.trim().slice(0, 160)}`); }
};

/** A throwaway repository: fixed author and dates, commits made from steps ({ msg, body?, file?, tag?, revert? }).
 *  Your global git config can't interfere: no signing, no hooks (an empty hooks folder), and a time limit. */
function gitRepo(t, steps) {
  const dir = t.tmp();
  const hooks = t.tmp();
  const env = { ...process.env, GIT_AUTHOR_DATE: '2026-10-19T10:00:00Z', GIT_COMMITTER_DATE: '2026-10-19T10:00:00Z' };
  const config = ['-c', 'user.name=Check', '-c', 'user.email=check@example.com', '-c', 'commit.gpgSign=false', '-c', 'tag.gpgSign=false', '-c', `core.hooksPath=${hooks}`, '-c', 'core.autocrlf=false'];
  const git = (...a) => execFileSync('git', [...config, ...a], { cwd: dir, env, stdio: 'ignore', timeout: 20000 });
  git('init', '-q');
  for (const s of steps) {
    if (s.revert) git('revert', '--no-edit', 'HEAD');
    else if (s.file) {
      fs.writeFileSync(path.join(dir, s.file), `${s.msg}\n`);
      git('add', s.file);
      git('commit', '-q', '-m', s.msg, ...(s.body ? ['-m', s.body] : []));
    } else git('commit', '-q', '--allow-empty', '-m', s.msg, ...(s.body ? ['-m', s.body] : []));
    if (s.tag) git('tag', s.tag);
  }
  return dir;
}

export default (t) => [
  // M1 · Read one commit
  t.check('parseCommit() reads type, scope, subject, breaking changes and reverts', async () => {
    const { parseCommit } = await t.import(SCRIPT);
    if (typeof parseCommit !== 'function') return `${SCRIPT} should export parseCommit(hash, message).`;
    for (const c of commits(t)) {
      const got = parseCommit(c.hash, c.message) ?? {};
      const wrong = FIELDS.filter((k) => show(got[k] ?? null) !== show(c.expect[k]));
      if (wrong.length) {
        return t.fail(`parseCommit('${c.hash}', ${show(c.message.split('\n')[0])}${c.message.includes('\n') ? ' + body' : ''}) is wrong for: ${wrong.join(', ')}.`, {
          expected: Object.fromEntries(wrong.map((k) => [k, c.expect[k]])),
          actual: Object.fromEntries(wrong.map((k) => [k, got[k] ?? null])),
        });
      }
      if (got.hash !== c.hash) return `parseCommit() should return the hash it was given ("${c.hash}").`;
    }
    return true;
  }, { milestone: 'M1' }),

  // M2 · Group the history
  t.check('The script groups a subject list (--from fixtures/git-log.txt)', () => {
    if (!t.exists(SCRIPT)) return `Create \`${SCRIPT}\`.`;
    const out = runJson(t, ['--from', t.path('fixtures/git-log.txt')]);
    const n = (k) => out.groups?.[k]?.length ?? 0;
    const want = { feat: 2, fix: 2, docs: 1, test: 1, chore: 1, other: 1 };
    const wrong = Object.entries(want).filter(([k, v]) => n(k) !== v).map(([k, v]) => `${k}: ${n(k)} (expected ${v})`);
    if (wrong.length) return `Group sizes are off: ${wrong.join(', ')}.`;
    if (out.total !== 8) return `total should be 8, got ${out.total}.`;
    const gpa = (out.groups.feat ?? []).find((e) => /gpa/.test(e.subject ?? ''));
    if (gpa?.hash !== 'a1b2c3d' || gpa.scope !== 'grades' || gpa.subject !== 'add gpa() with credit weighting') return `Expected the entry { hash: "a1b2c3d", scope: "grades", subject: "add gpa() with credit weighting" }, got ${show(gpa)}.`;
    const other = out.groups.other?.[0];
    if (other?.subject !== 'Update stuff' || other.scope !== null) return `Non-conventional commits keep their whole subject, with scope null; got ${show(other)}.`;
    return (out.breaking?.length === 1 && /Node 18/.test(out.breaking[0].subject)) || `breaking should hold exactly the "drop support for Node 18" commit, got ${show(out.breaking)}.`;
  }, { milestone: 'M2' }),
  t.check('group() cancels a revert pair, keeps an older revert, and lists the breaking changes', async () => {
    const { group } = await t.import(SCRIPT);
    const data = group(commits(t).map(({ hash, message }) => ({ hash, message })));
    if (data?.total !== 13) return `total should count every commit (13), got ${data?.total}.`;
    const inGroups = Object.values(data.groups ?? {}).flat().map((e) => e.hash);
    if (inGroups.includes('0a1b2c3') || inGroups.includes('f1e2d3c')) return 'The dark-mode feature (0a1b2c3) and its revert (f1e2d3c) cancel out: neither belongs in groups.';
    const r = data.reverted ?? [];
    if (r.length !== 1 || r[0].hash !== '0a1b2c3' || r[0].by !== 'f1e2d3c' || r[0].subject !== 'add dark mode') return `reverted should be [{ hash: "0a1b2c3", scope: "ui", subject: "add dark mode", by: "f1e2d3c" }], got ${show(r)}.`;
    if ((data.groups.revert ?? []).map((e) => e.hash).join() !== '7d6c5b4') return `A revert of a commit from before the range (7d6c5b4) stays in groups.revert, got ${show(data.groups.revert)}.`;
    const sizes = { feat: 3, fix: 2, refactor: 1, test: 1, docs: 1, chore: 1, other: 1 };
    const wrong = Object.entries(sizes).filter(([k, v]) => (data.groups[k]?.length ?? 0) !== v).map(([k, v]) => `${k}: ${data.groups[k]?.length ?? 0} (expected ${v})`);
    if (wrong.length) return `Group sizes are off: ${wrong.join(', ')}.`;
    const b = (data.breaking ?? []).map((e) => e.hash).join(', ');
    return b === 'e5f6a7b, c3d4e5f, b7c8d9e' || `breaking should be e5f6a7b, c3d4e5f, b7c8d9e (the "!" one and both footers, in log order), got ${b || 'nothing'}.`;
  }, { milestone: 'M2' }),
  t.check('From git: only the commits since the last tag', () => {
    if (!t.exists(SCRIPT)) return 'No script yet.';
    const dir = gitRepo(t, [{ msg: 'chore: initial commit', tag: 'v1.0.0' }, { msg: 'feat: export to CSV' }, { msg: 'fix(ui): align the table' }, { msg: 'docs: typo' }]);
    const out = runJson(t, [], dir);
    if (out.since !== 'v1.0.0') return `since should be "v1.0.0", got ${show(out.since)}.`;
    if (out.total !== 3) return `Expected the 3 commits after v1.0.0, got total=${out.total}.`;
    return out.groups?.fix?.[0]?.scope === 'ui' || `"fix(ui): align the table" should be in groups.fix with scope "ui", got ${show(out.groups?.fix)}.`;
  }, { milestone: 'M2', needs: ['git'] }),
  t.check('From git: full messages, and a real git revert', () => {
    if (!t.exists(SCRIPT)) return 'No script yet.';
    const dir = gitRepo(t, [
      { msg: 'chore: start', tag: 'v1.0.0' },
      { msg: 'feat(ui): add dark mode', file: 'theme.txt' },
      { revert: true },
      { msg: 'refactor(grades): remove average()', body: 'BREAKING CHANGE: use weightedAverage() instead.' },
    ]);
    const out = runJson(t, [], dir);
    if (out.total !== 3) return `Expected 3 commits since v1.0.0, got ${out.total}.`;
    if ((out.reverted ?? []).length !== 1 || out.reverted[0].subject !== 'add dark mode') return `git revert wrote "This reverts commit <full hash>." in the body: the dark-mode pair should cancel. reverted: ${show(out.reverted)}.`;
    const b = out.breaking ?? [];
    return (b.length === 1 && b[0].note === 'use weightedAverage() instead.') || `The BREAKING CHANGE footer is in the body, which git log gives you with %B. breaking: ${show(b)}.`;
  }, { milestone: 'M2', needs: ['git'] }),
  t.check('From git without tags: every commit, since = null', () => {
    if (!t.exists(SCRIPT)) return 'No script yet.';
    const dir = gitRepo(t, [{ msg: 'feat: one' }, { msg: 'fix: two' }]);
    const out = runJson(t, [], dir);
    return (out.since === null && out.total === 2) || `Expected since=null and total=2, got since=${show(out.since)}, total=${out.total}.`;
  }, { milestone: 'M2', needs: ['git'] }),

  // M3 · Tests that catch mistakes
  t.check('Your unit tests pass (6 or more)', () => {
    const s = t.read(TESTS);
    if (s == null) return `Create \`${TESTS}\`.`;
    const n = (s.match(/\btest\s*\(/g) ?? []).length;
    if (n < 6) return `Found ${n} test(s) in ${TESTS}; write at least 6, one per rule.`;
    const r = t.unitTests({ files: [TESTS] });
    return (r.fail === 0 && r.pass > 0) || `${r.fail} failing: ${r.failing.slice(0, 2).join(' | ')}`;
  }, { milestone: 'M3' }),
  t.check('Your tests catch five broken versions of the script', () => {
    if (!t.exists(TESTS)) return `Create \`${TESTS}\`.`;
    const reference = t.sol(SCRIPT);
    if (!reference) return 'The reference script is missing from sol/, so the mutants cannot be built.';
    const copy = t.copy(t.tmp());
    const run = (code) => {
      fs.writeFileSync(path.join(copy, SCRIPT), code);
      return t.unitTests({ cwd: copy, files: [TESTS] });
    };
    const control = run(reference);
    if (control.fail > 0 || control.pass === 0) return `Your tests fail on the reference script, so they test something besides the rules: ${control.failing.slice(0, 2).join(' | ') || 'no test ran'}. Use only parseCommit, group and render.`;
    const survived = MUTANTS.filter((m) => run(mutant(m, reference)).fail === 0).map((m) => m.name);
    return !survived.length || `These broken versions pass all your tests: ${survived.join('; ')}. Add a test that each of them would fail.`;
  }, { milestone: 'M3', timeout: 120000 }),

  // M4 · Notes nobody invented
  t.check('--format md prints exactly the golden release notes', () => {
    if (!t.exists(SCRIPT)) return 'No script yet.';
    const norm = (s) => s.replace(/\r\n/g, '\n').split('\n').map((l) => l.trimEnd()).join('\n').trimEnd();
    const got = norm(runScript(t, ['--from', fixture(t, 'commits.json'), '--format', 'md', '--version', '2.0.0', '--date', '2026-10-19']));
    const want = norm(fs.readFileSync(fixture(t, 'release-notes.golden.md'), 'utf8'));
    if (got !== want) {
      const g = got.split('\n');
      const w = want.split('\n');
      const i = w.findIndex((l, k) => l !== g[k]);
      const at = i < 0 ? w.length : i;
      return t.fail(`The notes differ from tests/fixtures/release-notes.golden.md at line ${at + 1}.`, { expected: w[at] ?? '(end of the notes)', actual: g[at] ?? '(end of the output)' });
    }
    const plain = norm(runScript(t, ['--from', fixture(t, 'commits.json'), '--format', 'md'])).split('\n')[0];
    return plain === '## [Unreleased]' || `Without --version the section starts with "## [Unreleased]", got "${plain}".`;
  }, { milestone: 'M4' }),
  t.check('SKILL.md: name, and a description that says what and when', () => {
    const { data } = t.frontmatter(SKILL, `Create \`${SKILL}\`.`);
    if (data.name !== 'release-notes') return `name should be "release-notes", got "${data.name ?? ''}".`;
    const d = String(data.description ?? '');
    return (d.length >= 40 && /\bwhen\b/i.test(d)) || 'Say what the skill does and when to use it ("… Use when the user asks for release notes …").';
  }, { milestone: 'M4' }),
  t.check('SKILL.md: the script writes the entries, the model never does', () => {
    const { body } = t.frontmatter(SKILL);
    const missing = [];
    if (!/changes\.mjs/.test(body) || !/--format md/.test(body)) missing.push('run scripts/changes.mjs with --format md');
    if (!/verbatim|as it is|as is|unchanged|exactly/i.test(body)) missing.push('put its output in as it is (verbatim)');
    if (!/never (add|invent|write)|(don.?t|do not) (add|invent|write)/i.test(body)) missing.push('never add, drop or reword an entry');
    if (!/CHANGELOG\.md/.test(body) || !/Unreleased/.test(body)) missing.push('where it goes: CHANGELOG.md, under "## [Unreleased]" unless a version is given');
    return !missing.length || `The skill should say: ${missing.join('; ')}.`;
  }, { milestone: 'M4' }),
  t.check('Copilot lists the skill', () => {
    const r = t.copilot(['skill', 'list', '--json']);
    let list = [];
    try { list = JSON.parse(r.stdout); } catch { return `Could not read the skill list: ${r.all.trim().slice(0, 160)}`; }
    return list.some((s) => s.name === 'release-notes' && s.source === 'project') || 'Copilot does not list release-notes as a project skill.';
  }, { milestone: 'M4', needs: ['copilot'] }),
];
