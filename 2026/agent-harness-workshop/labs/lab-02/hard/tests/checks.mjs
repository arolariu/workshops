// Free checks for Lab 02 · hard.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SKILL = '.github/skills/release-notes/SKILL.md';
const SCRIPT = '.github/skills/release-notes/scripts/changes.mjs';

const runScript = (t, args, cwd) => {
  const r = t.node([t.path(SCRIPT), ...args], { cwd: cwd ?? t.dir });
  if (r.code !== 0) t.fail(`The script failed: ${r.stderr.trim().split('\n').slice(-2).join(' ')}`);
  try { return JSON.parse(r.stdout); } catch { return t.fail(`The script must print JSON. It printed: ${r.stdout.trim().slice(0, 160)}`); }
};
const gitRepo = (t, commits, tagAfter) => {
  const dir = t.tmp();
  const git = (...a) => execFileSync('git', ['-c', 'user.name=Check', '-c', 'user.email=check@example.com', '-c', 'commit.gpgsign=false', ...a], { cwd: dir, stdio: 'ignore' });
  git('init', '-q');
  commits.forEach((msg, i) => {
    git('commit', '-q', '--allow-empty', '-m', msg);
    if (i === tagAfter) git('tag', 'v1.0.0');
  });
  return dir;
};

export default (t) => [
  t.check('The script groups a git log file (--from)', () => {
    if (!t.exists(SCRIPT)) return `Create \`${SCRIPT}\`.`;
    const out = runScript(t, ['--from', path.join(t.dir, 'fixtures', 'git-log.txt')]);
    const n = (k) => out.groups?.[k]?.length ?? 0;
    const want = { feat: 2, fix: 2, docs: 1, test: 1, chore: 1, other: 1 };
    const wrong = Object.entries(want).filter(([k, v]) => n(k) !== v).map(([k, v]) => `${k}: ${n(k)} (expected ${v})`);
    if (wrong.length) return `Group sizes are off: ${wrong.join(', ')}.`;
    return out.total === 8 || `total should be 8, got ${out.total}.`;
  }),
  t.check('Entries have hash, scope and a clean subject', () => {
    if (!t.exists(SCRIPT)) return 'No script yet.';
    const out = runScript(t, ['--from', path.join(t.dir, 'fixtures', 'git-log.txt')]);
    const gpa = (out.groups?.feat ?? []).find((e) => /gpa/.test(e.subject ?? ''));
    if (!gpa) return 'Could not find the gpa feature in groups.feat.';
    if (gpa.hash !== 'a1b2c3d' || gpa.scope !== 'grades' || gpa.subject !== 'add gpa() with credit weighting') return `Expected { hash: "a1b2c3d", scope: "grades", subject: "add gpa() with credit weighting" }, got ${JSON.stringify(gpa)}.`;
    const other = out.groups?.other?.[0];
    return (other?.subject === 'Update stuff' && other.scope === null) || `Non-conventional commits keep their whole subject with scope null, got ${JSON.stringify(other)}.`;
  }),
  t.check('Breaking changes are collected', () => {
    if (!t.exists(SCRIPT)) return 'No script yet.';
    const out = runScript(t, ['--from', path.join(t.dir, 'fixtures', 'git-log.txt')]);
    return (out.breaking?.length === 1 && /Node 18/.test(out.breaking[0].subject)) || `breaking should hold exactly the "drop support for Node 18" commit, got ${JSON.stringify(out.breaking)}.`;
  }),
  t.check('From git: only the commits since the last tag', () => {
    if (!t.exists(SCRIPT)) return 'No script yet.';
    const dir = gitRepo(t, ['chore: initial commit', 'feat: export to CSV', 'fix(ui): align the table', 'docs: typo'], 0);
    const out = runScript(t, [], dir);
    if (out.since !== 'v1.0.0') return `since should be "v1.0.0", got ${JSON.stringify(out.since)}.`;
    return (out.total === 3 && out.groups?.fix?.[0]?.scope === 'ui') || `Expected the 3 commits after v1.0.0, got total=${out.total}.`;
  }, { needs: ['git'] }),
  t.check('From git without tags: every commit, since = null', () => {
    if (!t.exists(SCRIPT)) return 'No script yet.';
    const dir = gitRepo(t, ['feat: one', 'fix: two'], -1);
    const out = runScript(t, [], dir);
    return (out.since === null && out.total === 2) || `Expected since=null and total=2, got since=${JSON.stringify(out.since)}, total=${out.total}.`;
  }, { needs: ['git'] }),
  t.check('SKILL.md: name, a what + when description', () => {
    const { data } = t.frontmatter(SKILL, `Create \`${SKILL}\`.`);
    if (data.name !== 'release-notes') return `name should be "release-notes", got "${data.name ?? ''}".`;
    const d = String(data.description ?? '');
    return (d.length >= 40 && /\bwhen\b/i.test(d)) || 'Say what the skill does and when to use it.';
  }),
  t.check('SKILL.md: run the script, use only its data, skip tests and chores', () => {
    const { body } = t.frontmatter(SKILL);
    const missing = [];
    if (!/changes\.mjs/.test(body)) missing.push('run scripts/changes.mjs');
    if (!/(only|never invent|don.?t invent|do not invent)/i.test(body)) missing.push('use only the script output (never invent)');
    if (!/test/i.test(body) || !/chore/i.test(body)) missing.push('leave out test and chore commits');
    if (!/CHANGELOG\.md/.test(body) || !/Unreleased/.test(body)) missing.push('add an "## [Unreleased]" section to CHANGELOG.md');
    return !missing.length || `The skill should say: ${missing.join('; ')}.`;
  }),
  t.check('Copilot lists the skill', () => {
    const r = t.copilot(['skill', 'list', '--json']);
    let list = [];
    try { list = JSON.parse(r.stdout); } catch { return `Could not read the skill list: ${r.all.trim().slice(0, 160)}`; }
    return list.some((s) => s.name === 'release-notes' && s.source === 'project') || 'Copilot does not list release-notes as a project skill.';
  }, { needs: ['copilot'] }),
];
