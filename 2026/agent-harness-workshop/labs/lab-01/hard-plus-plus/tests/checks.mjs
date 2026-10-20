// Free checks for Lab 01 · hard++: instructions as code. Every gate check runs your gate in a temp copy of your folder
// with one problem planted in it, and reads its --json output.
import fs from 'node:fs';
import path from 'node:path';

const GATE = 'scripts/check-instructions.mjs';
const RUNNER = 'scripts/canaries.mjs';
const SUITE = 'evals/canaries.json';
const PKGS = ['cli', 'portal', 'planner'];
const TEAM = { cli: '@studybuddy/cli-team', portal: '@studybuddy/portal-team', planner: '@studybuddy/planner-team' };
const PLATFORM = '@studybuddy/platform';
const ROOT_CANARY = 'Harness check: AGENTS.md loaded';
const canary = (p) => `Harness check: ${p} rules loaded`;
const fxPath = (t, n) => path.join(t.exDir, 'tests', 'fixtures', n);
const fx = (t, n) => fs.readFileSync(fxPath(t, n), 'utf8');
const slash = (p) => String(p ?? '').replace(/\\/g, '/');
const noComments = (s) => String(s ?? '').replace(/<!--[\s\S]*?-->/g, '');
const bullets = (s) => noComments(s).split('\n').filter((l) => /^\s*([-*+]|\d+[.)])\s+\S/.test(l)).map((l) => l.replace(/^\s*([-*+]|\d+[.)])\s+/, '').trim());

// ---- the checks' own helpers (independent of your scripts) ----
const STOPWORDS = new Set(['a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'and', 'or', 'for', 'with', 'is', 'are', 'be', 'it', 'its', 'this', 'that', 'these', 'those', 'by', 'as', 'from', 'you', 'your', 'we', 'our', 'us', 'any', 'all', 'please', 'always', 'just', 'so', 'if', 'then', 'than', 'do', 'does', 'will', 'can', 'should', 'must']);
const words = (s) => new Set(String(s).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !STOPWORDS.has(w)));
const jaccard = (a, b) => { const x = words(a); const y = words(b); let n = 0; for (const w of x) if (y.has(w)) n++; return n / (x.size + y.size - n || 1); };
const TOPICS = [
  ['indent', /\b(\d+)[- ]space/gi, (m) => m[1]],
  ['quotes', /\b(single|double)[- ]quot/gi, (m) => m[1].toLowerCase()],
  ['decimals', /\b(\d+|one|two|three)\s+decimals?\b/gi, (m) => ({ one: '1', two: '2', three: '3' })[m[1].toLowerCase()] ?? m[1]],
  ['runner', /\b(node:test|jest|mocha|vitest)\b/gi, (m) => m[1].toLowerCase()],
];
const NEGATED = /\b(?:never|not|no|don'?t|instead of|avoid|rather than)\b[^.;:,]{0,15}$/i;
/** The value a rule gives a topic: its first mention that isn't negated ("No Jest: use node:test" is node:test), or null. */
const valueOf = (re, value, text) => {
  for (const m of String(text).matchAll(re)) if (!NEGATED.test(String(text).slice(0, m.index))) return value(m);
  return null;
};
function owners(text, file) {
  const glob = (g) => new RegExp(`^${g.split(/(\*\*\/|\*\*|\*|\?)/).map((p) => ({ '**/': '(?:.*/)?', '**': '.*', '*': '[^/]*', '?': '[^/]' })[p] ?? p.replace(/[.+^$()|[\]\\{}]/g, '\\$&')).join('')}$`);
  let out = [];
  for (const raw of String(text).replace(/\r/g, '').split('\n')) {
    const line = raw.replace(/(^|\s)#.*$/, '').trim();
    if (!line) continue;
    const [pattern, ...who] = line.split(/\s+/);
    let p = pattern.replace(/^\//, '').replace(/\/$/, '');
    if (!pattern.startsWith('/') && !p.includes('/')) p = `**/${p}`;
    const hit = pattern.endsWith('/') ? glob(`${p}/**`).test(file) : glob(p).test(file) || (!/[*?]/.test(p.split('/').pop()) && glob(`${p}/**`).test(file));
    if (hit) out = who;
  }
  return out;
}

/** Run the gate (--json) in a temp copy of your folder changed by `edit`: { code, out, all, copy }. */
function gate(t, edit = () => {}, args = []) {
  const copy = t.copy(t.tmp());
  edit(copy);
  const r = t.node([GATE, '--json', ...args], { cwd: copy, timeout: 60000 });
  let out = null;
  try { out = JSON.parse(r.stdout); } catch { /* reported by the caller */ }
  return { ...r, out, copy };
}
const append = (rel, text) => (copy) => fs.appendFileSync(path.join(copy, rel), `\n${text}\n`);
const findings = (g) => (Array.isArray(g.out?.findings) ? g.out.findings : []);
const noJson = (g) => `node ${GATE} --json did not print JSON (exit ${g.code}). ${g.all.trim().slice(0, 200)}`;
function expectFinding(g, want, what) {
  if (!g.out) return noJson(g);
  const hit = findings(g).find((f) => f.check === want.check && slash(f.file) === want.file);
  if (!hit) return `${what}: expected a "${want.check}" finding for ${want.file}; the gate found ${findings(g).length ? findings(g).map((f) => `${f.check} ${f.file}`).slice(0, 3).join(', ') : 'nothing'}.`;
  if (want.severity && hit.severity !== want.severity) return `${what}: a ${want.check} finding is ${want.severity === 'error' ? 'an error' : 'a warning'} (SEVERITY), not ${hit.severity}.`;
  if (want.code !== undefined && g.code !== want.code) return `${what}: the gate should exit ${want.code}, not ${g.code}.`;
  return true;
}

export default (t) => [
  // M1 · Nested rules on a shared baseline
  t.check('Each package has its own AGENTS.md: commands that work there, rules, its canary', () => {
    for (const p of PKGS) {
      const file = `packages/${p}/AGENTS.md`;
      const text = noComments(t.read(file) ?? '');
      if (!text.includes(canary(p))) return `${file} has no canary yet: add a rule that ends every answer with the line \`${canary(p)}\`, on top of the baseline's.`;
      const lines = text.replace(/\n+$/, '').split('\n').length;
      if (lines > 30) return `${file} has ${lines} lines; a package file adds to the baseline, so keep it under 30.`;
      const cmds = text.split(/^#+\s/m).find((s) => /^commands\b/i.test(s));
      if (!cmds) return `${file} needs a "## Commands" section.`;
      const scripts = JSON.parse(t.read(`packages/${p}/package.json`) ?? '{}').scripts ?? {};
      const spans = [...cmds.matchAll(/`((?:npm|node) [^`]+)`/g)].map((m) => m[1].trim());
      if (!spans.length) return `${file}: the Commands section should name a command, like \`npm test\` or \`node --test\`.`;
      for (const c of spans.filter((x) => x.startsWith('npm '))) {
        const [, sub, name] = c.split(/\s+/);
        const script = ['test', 't'].includes(sub) ? 'test' : ['run', 'run-script'].includes(sub) ? name : null;
        if (script && !(script in scripts)) return `${file}: \`${c}\` doesn't work in packages/${p}: its package.json has no "${script}" script.`;
      }
      const rules = bullets(text).filter((b) => !b.includes('Harness check') && !/`(npm|node) /.test(b));
      if (rules.length < 3) return `${file} has ${rules.length} rule(s) of its own; write at least 3 from the team's notes.`;
    }
    return true;
  }, { milestone: 'M1' }),
  t.check('The package rules say what is special about each package', () => {
    const want = {
      cli: [[/process\.exit/, 'run() never calls process.exit'], [/\bcode\b/, 'the { code, out } contract and its exit codes']],
      portal: [[/escape/i, 'escaping every value (escapeHtml())'], [/<h1>|\bh1\b/i, 'one <h1> per page']],
      planner: [[/\bdone\b/i, 'plans skip assignments that are done'], [/\b(2|two) days\b/i, 'starting 2 days before the due date']],
    };
    for (const p of PKGS) {
      const text = noComments(t.read(`packages/${p}/AGENTS.md`) ?? '');
      const missing = want[p].filter(([re]) => !re.test(text)).map(([, w]) => w);
      if (missing.length) return `packages/${p}/AGENTS.md doesn't say: ${missing.join('; ')} (see the team's notes).`;
    }
    return true;
  }, { milestone: 'M1' }),
  t.check('The packages build on the baseline: no rule repeated, none contradicted', () => {
    const root = bullets(t.need('AGENTS.md')).filter((b) => !b.includes('Harness check'));
    if (!t.read('AGENTS.md').includes(ROOT_CANARY)) return `The root AGENTS.md lost its canary (\`${ROOT_CANARY}\`).`;
    for (const p of PKGS) {
      const file = `packages/${p}/AGENTS.md`;
      for (const rule of bullets(t.read(file) ?? '').filter((b) => !b.includes('Harness check'))) {
        const twin = root.find((r) => jaccard(r, rule) >= 0.6);
        if (twin) return `${file} repeats the baseline: "${rule.slice(0, 60)}" (the root says "${twin.slice(0, 60)}"). It applies in the package already.`;
        for (const [id, re, value] of TOPICS) {
          const mine = valueOf(re, value, rule);
          const other = mine != null && root.map((r) => valueOf(re, value, r)).find((v) => v != null && v !== mine);
          if (other) return `${file} says ${id} = ${mine}, the baseline says ${other}: "${rule.slice(0, 60)}". Both load in this package, and Copilot puts no order between them.`;
        }
      }
    }
    return true;
  }, { milestone: 'M1' }),
  t.check('Copilot loads a package\'s rules on top of the baseline', () => {
    const r = t.copilot(['instruction', 'list', '--json'], { cwd: t.path('packages/cli') });
    let list;
    try { list = JSON.parse(r.stdout); } catch { return `Could not read the list: ${r.all.trim().slice(0, 200)}`; }
    const paths = list.map((s) => slash(s.sourcePath));
    if (!paths.some((p) => /(^|\/)packages\/cli\/AGENTS\.md$/.test(p))) return 'Started in packages/cli, Copilot does not list packages/cli/AGENTS.md.';
    return paths.some((p) => /(^|\/)AGENTS\.md$/.test(p) && !/packages\/cli\/AGENTS\.md$/.test(p)) || 'Started in packages/cli, Copilot does not list the root AGENTS.md as well.';
  }, { needs: ['copilot'], env: true, milestone: 'M1' }),

  // M2 · The gate
  t.check('A vague package rule is a warning; with --strict it fails the gate', () => {
    const edit = append('packages/cli/AGENTS.md', '- Keep the output nice.');
    const ok = expectFinding(gate(t, edit), { check: 'vague', file: 'packages/cli/AGENTS.md', severity: 'warning' }, '"Keep the output nice." in packages/cli');
    if (ok !== true) return ok;
    const strict = gate(t, edit, ['--strict']);
    return strict.code === 1 || `With --strict, warnings fail the gate: exit 1, not ${strict.code}.`;
  }, { milestone: 'M2' }),
  t.check('A rule the baseline already has is a duplicate (a warning)', () =>
    expectFinding(gate(t, append('packages/portal/AGENTS.md', '- Never add dependencies (no `npm install <package>`).')), { check: 'duplicate', file: 'packages/portal/AGENTS.md', severity: 'warning' }, 'The root\'s dependency rule repeated in packages/portal'), { milestone: 'M2' }),
  t.check('A package that contradicts the baseline fails the gate (exit 1)', () => {
    const g = gate(t, append('packages/portal/AGENTS.md', '- Round averages to one decimal.'));
    if (!g.out) return noJson(g);
    const hit = findings(g).find((f) => f.check === 'contradiction' && /packages\/portal\/AGENTS\.md/.test(`${slash(f.file)} ${f.message}`));
    if (!hit) return `"Round averages to one decimal." in packages/portal contradicts the baseline's 2 decimals: expected a "contradiction" finding that names packages/portal/AGENTS.md; the gate found ${findings(g).map((f) => `${f.check} ${f.file}`).slice(0, 3).join(', ') || 'nothing'}.`;
    if (hit.severity !== 'error') return `A contradiction is an error (SEVERITY), not ${hit.severity}.`;
    return g.code === 1 || `A contradiction fails the gate: exit 1, not ${g.code}.`;
  }, { milestone: 'M2' }),
  t.check('A command the package can\'t run fails the gate, even when the root can run it', () =>
    expectFinding(gate(t, append('packages/cli/AGENTS.md', '- Check the rules with `npm run check:instructions`.')), { check: 'command', severity: 'error', code: 1, file: 'packages/cli/AGENTS.md' }, '`npm run check:instructions` in packages/cli (only the root package.json has it)'), { milestone: 'M2' }),
  t.check('Exit codes for CI: 2 when the gate can\'t run; --json gives { ok, code, findings }', () => {
    const bad = t.node([GATE, '--nope']);
    if (bad.code !== 2) return `An unknown option means the gate can't do its job: exit 2, not ${bad.code}.`;
    const g = gate(t, append('packages/cli/AGENTS.md', '- Keep the output nice.'));
    if (!g.out) return noJson(g);
    if (typeof g.out.ok !== 'boolean' || typeof g.out.code !== 'number' || !Array.isArray(g.out.findings)) return '--json prints { ok, code, findings }.';
    const f = findings(g)[0];
    if (!f) return 'The gate reported nothing for a vague rule: lintAll() first.';
    return ['check', 'severity', 'file', 'line', 'message'].every((k) => k in f) || 'Every finding has check, severity, file, line and message.';
  }, { milestone: 'M2' }),
  t.check('Blowing the token budget is a warning (it fails only with --strict)', () => {
    const prose = `# Notes for Copilot\n\n${'This paragraph is history nobody reads, sent on every turn anyway. '.repeat(45)}\n`;
    const edit = (copy) => fs.writeFileSync(path.join(copy, '.github/copilot-instructions.md'), prose);
    const g = gate(t, edit);
    if (!g.out) return noJson(g);
    const hit = findings(g).find((f) => f.check === 'budget');
    if (!hit) return `A 3,000-character .github/copilot-instructions.md puts every turn over budget: expected a "budget" finding; the gate found ${findings(g).map((f) => `${f.check} ${f.file}`).slice(0, 3).join(', ') || 'nothing'}.`;
    if (hit.severity !== 'warning') return `A blown budget is a warning (SEVERITY), not ${hit.severity}.`;
    if (g.code !== 0) return `Warnings alone don't fail the gate: exit 0, not ${g.code}.`;
    return gate(t, edit, ['--strict']).code === 1 || 'With --strict, the budget warning fails the gate (exit 1).';
  }, { milestone: 'M2' }),
  t.check('npm run check:instructions runs the gate', () => {
    const scripts = JSON.parse(t.read('package.json') ?? '{}').scripts ?? {};
    return /check-instructions\.mjs/.test(scripts['check:instructions'] ?? '') || 'Add a "check:instructions" script to the root package.json that runs node scripts/check-instructions.mjs (CI calls it).';
  }, { milestone: 'M2' }),

  // M3 · Drift and coverage
  t.check('A file the instructions name that doesn\'t exist is drift', () => {
    const g = gate(t, append('packages/cli/AGENTS.md', '- The argument parser lives in `packages/cli/args.js`.\n- `index.test.js` calls `run()` directly.'));
    const ok = expectFinding(g, { check: 'drift', severity: 'error', code: 1, file: 'packages/cli/AGENTS.md' }, '`packages/cli/args.js` (missing) in packages/cli/AGENTS.md');
    if (ok !== true) return ok;
    const wrong = findings(g).filter((f) => f.check === 'drift' && /index\.test\.js/.test(f.message));
    return !wrong.length || '`index.test.js` in packages/cli/AGENTS.md is packages/cli/index.test.js, which exists (there is none at the root): look next to the instruction file too.';
  }, { milestone: 'M3' }),
  t.check('A scoped file that matches nothing is drift', () => {
    const edit = (copy) => fs.writeFileSync(path.join(copy, '.github/instructions/lib.instructions.md'), '---\napplyTo: "lib/**"\ndescription: Rules for lib\n---\n- Every function in lib has a test.\n');
    return expectFinding(gate(t, edit), { check: 'drift', severity: 'error', file: '.github/instructions/lib.instructions.md' }, 'A scoped file for lib/** (there is no lib/)');
  }, { milestone: 'M3' }),
  t.check('A canary that names another package is drift', () => {
    const edit = (copy) => { const f = path.join(copy, 'packages/planner/AGENTS.md'); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(canary('planner'), canary('cli'))); };
    return expectFinding(gate(t, edit), { check: 'drift', severity: 'error', file: 'packages/planner/AGENTS.md' }, 'packages/planner/AGENTS.md copied the cli canary');
  }, { milestone: 'M3' }),
  t.check('A suite case that expects a canary nobody says is drift', () => {
    const edit = (copy) => {
      const f = path.join(copy, SUITE);
      const suite = JSON.parse(fs.readFileSync(f, 'utf8'));
      const c = (suite.cases ?? []).find((x) => x.cwd === 'packages/cli');
      if (c) c.expect = [ROOT_CANARY, 'Harness check: cli rules are loaded'];
      fs.writeFileSync(f, JSON.stringify(suite));
    };
    return expectFinding(gate(t, edit), { check: 'drift', severity: 'error', code: 1, file: SUITE }, 'The cli case expects "Harness check: cli rules are loaded", which no AGENTS.md on its path says');
  }, { milestone: 'M3' }),
  t.check('Every package is covered: an AGENTS.md and a canary case', () => {
    const g = gate(t, (copy) => fs.rmSync(path.join(copy, 'packages/portal/AGENTS.md')));
    if (!g.out) return noJson(g);
    if (!findings(g).some((f) => f.check === 'coverage' && /packages\/portal/.test(`${f.file} ${f.message}`))) return 'With packages/portal/AGENTS.md deleted, the gate should report a coverage finding for packages/portal.';
    const h = gate(t, (copy) => {
      const f = path.join(copy, SUITE);
      const suite = JSON.parse(fs.readFileSync(f, 'utf8'));
      suite.cases = (suite.cases ?? []).filter((c) => c.cwd !== 'packages/planner');
      fs.writeFileSync(f, JSON.stringify(suite));
    });
    return findings(h).some((f) => f.check === 'coverage' && /packages\/planner/.test(`${f.file} ${f.message}`)) || 'With no canary case for packages/planner, the gate should report a coverage finding for it.';
  }, { milestone: 'M3' }),
  t.check('In a folder without packages, the gate skips the package checks (it travels to later labs)', () => {
    const copy = t.copy(t.tmp());
    fs.rmSync(path.join(copy, 'packages'), { recursive: true, force: true });
    fs.rmSync(path.join(copy, 'evals'), { recursive: true, force: true });
    fs.rmSync(path.join(copy, '.github/CODEOWNERS'), { force: true });
    const r = t.node([GATE], { cwd: copy });
    if (r.code !== 0) return `Without packages/, evals/ or CODEOWNERS (a later lab), the gate should pass: exit 0, not ${r.code}. Owners are that level's business, and there is nothing to cover. ${r.stdout.split('\n').filter((l) => /error|warning/.test(l)).slice(0, 2).join(' | ').trim().slice(0, 200)}`;
    return /skip/i.test(r.stdout) || 'Say that the package checks were skipped (no packages here).';
  }, { milestone: 'M3' }),

  // M4 · Owners
  t.check('ownersOf(): the last matching line wins', async () => {
    const { ownersOf } = await t.import(GATE);
    const text = fx(t, 'codeowners.sample');
    const cases = [
      ['README.md', ['@studybuddy/docs']],
      ['AGENTS.md', [PLATFORM]],
      ['grades.js', ['@studybuddy/everyone']],
      ['packages/cli/AGENTS.md', ['@studybuddy/cli-team']],
      ['packages/portal/AGENTS.md', ['@studybuddy/portal-team', '@studybuddy/docs']],
      ['packages/portal/index.js', ['@studybuddy/portal-team']],
      ['.github/instructions/tests.instructions.md', [PLATFORM]],
      ['scripts/check-instructions.mjs', [PLATFORM]],
      ['scripts/ab.mjs', ['@studybuddy/everyone']],
      ['packages/planner/vendor/x.js', []],
      ['docs/grading.md', ['@studybuddy/writers']],
      ['docs/guides/setup.md', ['@studybuddy/docs']],
    ];
    const wrong = cases.filter(([f, want]) => JSON.stringify(ownersOf(text, f) ?? null) !== JSON.stringify(want));
    return !wrong.length || `ownersOf() is off for ${wrong.length} path(s): ${wrong.slice(0, 2).map(([f, want]) => `${f} should be ${JSON.stringify(want)}, got ${JSON.stringify(ownersOf(text, f))}`).join('; ')}.`;
  }, { milestone: 'M4' }),
  t.check('CODEOWNERS: platform owns the baseline, each team its package, both a package\'s rules', () => {
    const text = t.read('.github/CODEOWNERS');
    if (text == null) return 'Add .github/CODEOWNERS.';
    const need = [
      ...['AGENTS.md', '.github/instructions/tests.instructions.md', '.github/CODEOWNERS', '.agents/skills/grade-appeal/SKILL.md', 'scripts/check-instructions.mjs', SUITE].map((f) => [f, [PLATFORM]]),
      ...PKGS.map((p) => [`packages/${p}/index.js`, [TEAM[p]]]),
      ...PKGS.map((p) => [`packages/${p}/AGENTS.md`, [TEAM[p], PLATFORM]]),
    ];
    const wrong = need.filter(([f, want]) => !want.every((o) => owners(text, f).includes(o)));
    return !wrong.length || `${wrong.length} path(s) lack an owner: ${wrong.slice(0, 2).map(([f, want]) => `${f} needs ${want.join(' and ')} (has ${JSON.stringify(owners(text, f))})`).join('; ')}. The last matching line wins.`;
  }, { milestone: 'M4' }),
  t.check('The gate reports instruction files nobody owns', () => {
    const g = gate(t, (copy) => fs.writeFileSync(path.join(copy, '.github/CODEOWNERS'), '/packages/cli/ @studybuddy/cli-team\n'));
    const ok = expectFinding(g, { check: 'owner', severity: 'error', code: 1, file: 'AGENTS.md' }, 'With a CODEOWNERS that only covers packages/cli/');
    if (ok !== true) return ok;
    for (const f of ['.github/instructions/tests.instructions.md', ...t.find(/^\.agents\/skills\/[^/]+\/SKILL\.md$/)]) {
      if (!findings(g).some((x) => x.check === 'owner' && slash(x.file) === f)) return `With a CODEOWNERS that only covers packages/cli/, ${f} has no owner either: report every instruction file and skill, not just AGENTS.md.`;
    }
    if (findings(g).some((f) => f.check === 'owner' && slash(f.file) === 'packages/cli/AGENTS.md')) return 'packages/cli/AGENTS.md has an owner there (/packages/cli/): no owner finding for it.';
    const none = gate(t, (copy) => fs.rmSync(path.join(copy, '.github/CODEOWNERS')));
    return findings(none).some((f) => f.check === 'owner') || 'Without any CODEOWNERS, nobody has to review an instruction change: report it.';
  }, { milestone: 'M4' }),

  // M5 · A canary regression suite
  t.check('score() finds missing and leaked canaries', async () => {
    const { score } = await t.import(RUNNER);
    const suite = JSON.parse(fx(t, 'canary-suite.json'));
    const answers = JSON.parse(fx(t, 'canary-answers.json'));
    const got = Object.fromEntries(suite.cases.map((c) => [c.id, score(c, answers[c.id])]));
    if (!got.root?.pass || !got.cli?.pass) return 'root and cli have every canary (case doesn\'t matter: "HARNESS CHECK") and no other package\'s: they pass.';
    if (got.portal?.pass || JSON.stringify(got.portal?.missing) !== JSON.stringify([canary('portal')])) return `portal's answer lacks its own canary: { pass: false, missing: ["${canary('portal')}"] }; got ${JSON.stringify(got.portal)}.`;
    return (!got.planner?.pass && JSON.stringify(got.planner?.leaked) === JSON.stringify(['cli rules loaded'])) || `planner's answer carries the cli canary: { pass: false, leaked: ["cli rules loaded"] }; got ${JSON.stringify(got.planner)}.`;
  }, { milestone: 'M5' }),
  t.check('--from scores recorded answers: exit 1 when a case fails, 0 when all pass', () => {
    const copy = t.copy(t.tmp());
    fs.mkdirSync(path.join(copy, 'evals'), { recursive: true });
    fs.copyFileSync(fxPath(t, 'canary-suite.json'), path.join(copy, SUITE));
    fs.copyFileSync(fxPath(t, 'canary-answers.json'), path.join(copy, 'answers.json'));
    const r = t.node([RUNNER, '--from', 'answers.json'], { cwd: copy });
    if (r.code !== 1) return `Two of the four recorded answers fail, so the suite exits 1; it exited ${r.code}. ${r.stderr.trim().slice(0, 160)}`;
    const good = Object.fromEntries(['root', 'cli', 'portal', 'planner'].map((id) => [id, `${ROOT_CANARY}${id === 'root' ? '' : `\n${canary(id)}`}`]));
    fs.writeFileSync(path.join(copy, 'answers.json'), JSON.stringify(good));
    const ok = t.node([RUNNER, '--from', 'answers.json'], { cwd: copy });
    return ok.code === 0 || `When every answer has its canaries, the suite exits 0; it exited ${ok.code}.`;
  }, { milestone: 'M5' }),
  t.check('Your suite covers the root and every package', () => {
    const suite = t.json(SUITE);
    const cases = Array.isArray(suite.cases) ? suite.cases : [];
    const root = cases.find((c) => c.cwd === '.');
    if (!root || !(root.expect ?? []).includes(ROOT_CANARY)) return `Add a case that runs in "." and expects "${ROOT_CANARY}".`;
    for (const p of PKGS) {
      const c = cases.find((x) => x.cwd === `packages/${p}`);
      if (!c) return `Add a case that runs in "packages/${p}".`;
      if (!(c.expect ?? []).includes(ROOT_CANARY) || !(c.expect ?? []).includes(canary(p))) return `The ${p} case expects both canaries: the baseline's ("${ROOT_CANARY}") and its own ("${canary(p)}").`;
      const others = PKGS.filter((q) => q !== p).filter((q) => !(c.forbid ?? []).some((f) => String(f).includes(`${q} rules loaded`)));
      if (others.length) return `The ${p} case should forbid the other packages' canaries: ${others.map((q) => `"${q} rules loaded"`).join(', ')}.`;
    }
    return true;
  }, { milestone: 'M5' }),
  t.check('--dry-run shows one command per case, in its folder', () => {
    const r = t.node([RUNNER, '--dry-run']);
    const n = r.stdout.split('\n').filter((l) => /^\s*copilot /.test(l)).length;
    const cases = t.json(SUITE).cases ?? [];
    if (r.code !== 0 || n !== cases.length || n < 4) return `Expected ${Math.max(4, cases.length)} commands (one per case), got ${n} (exit ${r.code}). ${r.stderr.trim().slice(0, 120)}`;
    return cases.every((c) => r.stdout.includes(c.cwd)) || 'Show the folder each case runs in.';
  }, { milestone: 'M5' }),
  t.check('The gate passes your workspace, also with --strict', () => {
    const g = gate(t);
    if (!g.out) return noJson(g);
    if (g.code !== 0) return `The gate fails your own workspace (exit ${g.code}): ${findings(g).slice(0, 2).map((f) => `${f.check} ${f.file}:${f.line} ${f.message}`).join(' | ').slice(0, 300)}`;
    const s = gate(t, () => {}, ['--strict']);
    return s.code === 0 || `With --strict, the gate fails your workspace: ${findings(s).slice(0, 2).map((f) => `${f.check} ${f.file}:${f.line} ${f.message}`).join(' | ').slice(0, 300)}`;
  }, { milestone: 'M5' }),
];
