// Free checks for Lab 01 · hard+: the context diet.
// M1–M3 run your linter on fixed inputs (tests/fixtures/: the legacy file as it was shipped, and copies of the hard
// level's instruction files), so the answers never depend on how far your refactor got. M4–M5 look at your folder.
import fs from 'node:fs';
import path from 'node:path';

const LINT = 'scripts/lint-instructions.mjs';
const LEGACY = '.github/copilot-instructions.md';
const INVENTORY = 'RULES-INVENTORY.md';
// Copilot reads project skills from .github/skills/, .agents/skills/ and .claude/skills/ (`copilot skill --help`).
const SKILL = /^\.(github|agents|claude)\/skills\/[^/]+\/SKILL\.md$/;
const BUDGET = { always: 600, path: 900 };
const fx = (t, name) => fs.readFileSync(path.join(t.exDir, 'tests', 'fixtures', name), 'utf8');
const expected = (t) => JSON.parse(fx(t, 'legacy-expected.json'));
const key = (r) => `${r?.file}:${r?.line}`;
const pair = (a, b) => [key(a), key(b)].sort().join(' ~ ');
const list = (xs, n = 3) => `${xs.slice(0, n).join('; ')}${xs.length > n ? ` (and ${xs.length - n} more)` : ''}`;

/** The checks' own reading of rules (the same as parseRules() in your script). */
function parseRules(text, file = '') {
  const rules = [];
  const lines = String(text).replace(/\r/g, '').split('\n');
  let i = 0;
  if (lines[0] === '---') i = lines.indexOf('---', 1) + 1 || lines.length;
  let fence = false;
  for (; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) { fence = !fence; continue; }
    if (fence || /^#{1,6}\s/.test(lines[i])) continue;
    const m = lines[i].match(/^\s*(?:[-*+]|\d+[.)])\s+(.*\S)\s*$/);
    if (m) rules.push({ file, line: i + 1, text: m[1] });
  }
  return rules;
}
/** The rules of the hard level's instruction files plus the legacy file, as Copilot would load them. */
function fixtureRules(t) {
  return [
    ...parseRules(fx(t, 'agents.sample.md'), 'AGENTS.md'),
    ...parseRules(fx(t, 'legacy-instructions.md'), LEGACY),
    ...parseRules(fx(t, 'tests-instructions.sample.md'), '.github/instructions/tests.instructions.md'),
    ...parseRules(fx(t, 'docs-instructions.sample.md'), '.github/instructions/docs.instructions.md'),
  ];
}
function sameSet(got, want, what) {
  const g = new Set(got);
  const w = new Set(want);
  const missed = [...w].filter((x) => !g.has(x));
  const extra = [...g].filter((x) => !w.has(x));
  if (missed.length) return `${what}: missed ${missed.length}, first ${list(missed, 2)}.`;
  return !extra.length || `${what}: ${extra.length} too many, first ${list(extra, 2)}.`;
}

// ---- the checks' own view of a folder: sources, ≈tokens, topics, commands ----
const ALWAYS = ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', LEGACY, '.claude/CLAUDE.md'];
const tok = (s) => Math.ceil(String(s ?? '').length / 4);
function sourcesOf(t) {
  const out = ALWAYS.filter((f) => t.exists(f)).map((f) => ({ path: f, applyTo: null }));
  for (const f of t.find(/^\.github\/instructions\/.+\.instructions\.md$/)) {
    const a = t.frontmatter(f).data.applyTo;
    out.push({ path: f, applyTo: !a || a === '**' || a === '**/*' ? (a ? null : []) : a });
  }
  for (const f of t.find(/\/AGENTS\.md$/)) out.push({ path: f, applyTo: `${path.posix.dirname(f)}/**` });
  return out;
}
const applies = (t, s, file) => s.applyTo === null || (Array.isArray(s.applyTo) ? s.applyTo.some((g) => t.globs.applyToMatches(g, file)) : t.globs.applyToMatches(s.applyTo, file));
const TOPICS = [
  ['indent', /\b(\d+)[- ]space/i, (m) => m[1]],
  ['quotes', /\b(single|double)[- ]quot/i, (m) => m[1].toLowerCase()],
  ['decimals', /\b(\d+|one|two|three)\s+decimals?\b/i, (m) => ({ one: '1', two: '2', three: '3' })[m[1].toLowerCase()] ?? m[1]],
  ['runner', /\b(node:test|jest|mocha|vitest)\b/i, (m) => m[1].toLowerCase()],
];
const norm = (s) => String(s ?? '').toLowerCase().replace(/[`*_]/g, '').replace(/\s+/g, ' ').trim().replace(/[.;:]$/, '');

/** The inventory table: [{ id, legacy, status, where, now }]. */
function inventoryRows(text) {
  return String(text ?? '').replace(/\r/g, '').split('\n')
    .filter((l) => /^\s*\|\s*L\d+\s*\|/.test(l))
    .map((l) => {
      const cells = l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
      return { id: cells[0], legacy: cells[1] ?? '', status: (cells[2] ?? '').toLowerCase().replace(/[`*]/g, ''), where: (cells[3] ?? '').replace(/[`*]/g, '').trim(), now: cells[4] ?? '' };
    });
}
const STATUSES = ['kept', 'moved', 'rewritten', 'fixed', 'resolved', 'merged'];

export default (t) => [
  // M1 · Find the noise
  t.check('findVague() finds the 8 vague rules, and not the concrete ones', async () => {
    const { findVague } = await t.import(LINT);
    const want = expected(t).vague;
    const got = (findVague(fixtureRules(t)) ?? []).map(key);
    if (!got.length) return `findVague() found 0 of the ${want.length} vague rules (the first one: line ${want[0].split(':')[1]} of the legacy file, "Write clean code.").`;
    const set = sameSet(got, want, 'findVague() on the legacy file');
    if (set !== true) return set;
    const extra = findVague([
      { file: 'x.md', line: 1, text: 'Write elegant, robust code.' },
      { file: 'x.md', line: 2, text: 'Keep `README.md` up to date.' },
      { file: 'x.md', line: 3, text: 'Good test names say what should happen when `weightedAverage([])` is called.' },
      { file: 'x.md', line: 4, text: 'Keep each file small: under 200 lines.' },
    ]).map((v) => v.line);
    return sameSet(extra, [1], 'findVague() on four more rules (only "Write elegant, robust code." is vague)');
  }, { milestone: 'M1' }),
  t.check('findDuplicates() finds the rules that say the same thing, across files', async () => {
    const { findDuplicates } = await t.import(LINT);
    const got = (findDuplicates(fixtureRules(t)) ?? []).map((d) => pair(d.a, d.b));
    const want = expected(t).duplicates.map(([a, b]) => [a, b].sort().join(' ~ '));
    const set = sameSet(got, want, 'findDuplicates()');
    if (set !== true) return `${set} (Jaccard of words() ≥ 0.6, and only rules that can be in the context together.)`;
    const sibling = findDuplicates([
      { file: 'packages/a/AGENTS.md', line: 1, text: 'Never add dependencies.' },
      { file: 'packages/b/AGENTS.md', line: 1, text: 'Never add dependencies.' },
    ]);
    return !sibling.length || 'Two scoped files that never load together can repeat each other: only compare rules from the same file, or where one side is always on (inContextTogether()).';
  }, { milestone: 'M1' }),

  // M2 · Conflicts and wrong commands
  t.check('findContradictions() finds the four topics where rules disagree', async () => {
    const { findContradictions } = await t.import(LINT);
    const want = expected(t).contradictions;
    const got = findContradictions(fixtureRules(t)) ?? [];
    const topics = got.map((c) => c.topic);
    const set = sameSet(topics, Object.keys(want), 'findContradictions() topics');
    if (set !== true) return set;
    for (const c of got) {
      if (JSON.stringify(c.values) !== JSON.stringify(want[c.topic].values)) return `${c.topic}: expected the values ${JSON.stringify(want[c.topic].values)} (sorted), got ${JSON.stringify(c.values)}.`;
      if (!Array.isArray(c.rules) || !c.rules.length) return `${c.topic}: list the rules that clash in "rules".`;
    }
    return true;
  }, { milestone: 'M2' }),
  t.check('findBadCommands() flags the commands package.json can\'t run', async () => {
    const { findBadCommands } = await t.import(LINT);
    const scripts = { test: 'node --test' };
    const got = (findBadCommands(fixtureRules(t), () => scripts) ?? []).map((b) => `${key(b)} ${b.command}`);
    const set = sameSet(got, expected(t).commands, 'findBadCommands() on the legacy file');
    if (set !== true) return set;
    const fine = findBadCommands([{ file: 'x.md', line: 1, text: 'Run `npm run lint`, `npm test`, `npm install`, `npm ci` and `node --test x.test.js`.' }], () => ({ test: 'x', lint: 'y' }));
    return !fine.length || `With a "lint" script, none of these is wrong: ${fine.map((b) => b.command).join(', ')}.`;
  }, { milestone: 'M2' }),

  // M3 · Count the cost
  t.check('tokensPerPath() adds up what each path costs', async () => {
    const copy = t.copy(t.tmp());
    for (const f of ['AGENTS.md', LEGACY, ...t.find(/^\.github\/instructions\//), ...t.find(/\/AGENTS\.md$/)]) fs.rmSync(path.join(copy, f), { force: true });
    const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(copy, rel)), { recursive: true }); fs.writeFileSync(path.join(copy, rel), text); };
    put('AGENTS.md', 'x'.repeat(40));
    put(LEGACY, 'y'.repeat(101));
    put('.github/instructions/t.instructions.md', `---\napplyTo: "**/*.test.js"\n---\n${'z'.repeat(50)}\n`);
    put('packages/x/AGENTS.md', 'w'.repeat(12));
    const { tokensPerPath } = await t.import(LINT);
    const got = tokensPerPath(copy, ['a.js', 'a.test.js', 'packages/x/b.test.js']);
    const want = [
      { path: 'a.js', files: ['AGENTS.md', LEGACY], tokens: 10 + 26 },
      { path: 'a.test.js', files: ['AGENTS.md', LEGACY, '.github/instructions/t.instructions.md'], tokens: 10 + 26 + 21 },
      { path: 'packages/x/b.test.js', files: ['AGENTS.md', LEGACY, '.github/instructions/t.instructions.md', 'packages/x/AGENTS.md'], tokens: 10 + 26 + 21 + 3 },
    ];
    for (const w of want) {
      const g = (got ?? []).find((x) => x.path === w.path);
      if (!g || JSON.stringify([...g.files].sort()) !== JSON.stringify([...w.files].sort()) || g.tokens !== w.tokens) return `For ${w.path}, expected ${JSON.stringify({ files: w.files, tokens: w.tokens })}, got ${JSON.stringify(g ?? null)} (≈tokens = characters ÷ 4, rounded up, per file).`;
    }
    return true;
  }, { milestone: 'M3' }),
  t.check('The CLI blows the budget on the legacy file, and says so (exit 1)', () => {
    const copy = t.copy(t.tmp());
    fs.mkdirSync(path.join(copy, '.github'), { recursive: true });
    fs.writeFileSync(path.join(copy, LEGACY), fx(t, 'legacy-instructions.md'));
    const r = t.node([LINT, '--json'], { cwd: copy });
    let out;
    try { out = JSON.parse(r.stdout); } catch { return `node ${LINT} --json did not print JSON. ${r.all.trim().slice(0, 200)}`; }
    if (r.code !== 1) return `With the legacy file back in place, the linter should exit 1 (findings, over budget); it exited ${r.code}.`;
    if (!(out.always > BUDGET.always)) return `"always" should be the ≈tokens of every always-on file together (well over ${BUDGET.always} here); got ${out.always}.`;
    const worst = Math.max(0, ...(out.paths ?? []).map((p) => p.tokens));
    return (worst > BUDGET.path && out.findings?.length > 0) || `Expected findings and a path over ${BUDGET.path} tokens; got ${out.findings?.length ?? 0} finding(s) and a worst path of ${worst}.`;
  }, { milestone: 'M3' }),

  // M4 · The diet
  t.check('The legacy file is gone, and every turn costs at most 600 tokens', () => {
    if (t.exists(LEGACY)) return `${LEGACY} still loads on every turn (≈${tok(t.read(LEGACY))} tokens). Move its rules out, then delete it.`;
    const always = sourcesOf(t).filter((s) => s.applyTo === null).reduce((n, s) => n + tok(t.read(s.path)), 0);
    return always <= BUDGET.always || `The always-on files cost ≈${always} tokens on every turn; the budget is ${BUDGET.always}. Move rules that only matter for some files into scoped files, or into the skill.`;
  }, { milestone: 'M4' }),
  t.check('No path costs more than 900 tokens', () => {
    const sources = sourcesOf(t);
    const cost = new Map(sources.map((s) => [s.path, tok(t.read(s.path))]));
    const over = t.files().map((f) => ({ f, n: sources.filter((s) => applies(t, s, f)).reduce((n, s) => n + cost.get(s.path), 0) })).filter((x) => x.n > BUDGET.path);
    return !over.length || `Over ${BUDGET.path} tokens: ${list(over.map((x) => `${x.f} (≈${x.n})`))}.`;
  }, { milestone: 'M4' }),
  t.check('AGENTS.md is lean and still has the rules the team relies on', () => {
    const s = t.need('AGENTS.md');
    const lines = s.replace(/\n+$/, '').split('\n').length;
    if (lines >= 100) return `AGENTS.md has ${lines} lines; keep it under 100.`;
    const missing = [
      [/Harness check/i, 'the canary (`Harness check: AGENTS.md loaded`)'],
      [/npm test/, 'the test command (`npm test`)'],
      [s.split('\n').some((l) => /exam/i.test(l) && /\b5\b|\bfive\b/i.test(l)), 'the exam rule (the exam and 5 on one line)'],
      [/depend/i, 'the no-dependencies boundary'],
      [/\.env/, 'the `.env` boundary'],
      [/^#+.*command/im, 'a Commands section'],
      [/^#+.*(boundar|never)/im, 'a Boundaries section'],
      [/^#+.*done/im, 'a Definition of done section'],
    ].filter(([ok]) => !(typeof ok === 'boolean' ? ok : ok.test(s))).map(([, what]) => what);
    return !missing.length || `AGENTS.md lost: ${missing.join(', ')}. Later labs and the canary depend on them.`;
  }, { milestone: 'M4' }),
  t.check('Scoped files carry the rest, and each one matches real files', () => {
    const scoped = sourcesOf(t).filter((s) => s.applyTo !== null && s.path.startsWith('.github/instructions/'));
    if (scoped.length < 3) return `${scoped.length} scoped file(s): tests and docs were there already; give the rules that only matter for some code (grades, deadlines) a scoped file too.`;
    const files = t.files();
    const dead = scoped.filter((s) => !files.some((f) => applies(t, s, f))).map((s) => s.path);
    return !dead.length || `These files match no file in the project, so they never load: ${dead.join(', ')}.`;
  }, { milestone: 'M4' }),
  t.check('One skill holds the grade-appeal procedure', () => {
    const skills = t.find(SKILL).filter((f) => /appeal/i.test(t.read(f) ?? ''));
    if (!skills.length) return 'Move the grade-appeal procedure into a skill: `.agents/skills/<name>/SKILL.md`. It is long and needed twice a term, so it should load only when someone appeals.';
    const f = skills[0];
    const { data, body } = t.frontmatter(f);
    const folder = f.split('/')[2];
    if (data.name !== folder) return `${f}: "name" must match the folder ("${folder}").`;
    const d = String(data.description ?? '');
    if (d.length < 40 || !/\buse (it |this )?when\b/i.test(d)) return `${f}: the description is what Copilot sees on every turn; say what the skill does and when to use it ("Use when …"), in 40+ characters.`;
    const steps = body.split('\n').filter((l) => /^\s*\d+[.)]\s+\S/.test(l)).length;
    return steps >= 10 || `${f} has ${steps} numbered step(s); the procedure has 10.`;
  }, { milestone: 'M4' }),
  t.check('The new files agree with each other, and every command works', () => {
    const sources = sourcesOf(t);
    const rules = sources.flatMap((s) => parseRules(t.read(s.path), s.path));
    for (const [id, re, value] of TOPICS) {
      const vals = new Set(rules.map((r) => r.text.match(re)).filter(Boolean).map(value));
      if (vals.size > 1) return `Your instruction files still disagree on ${id}: ${[...vals].join(' vs ')}. Decide, and keep one.`;
    }
    const scripts = JSON.parse(t.read('package.json') ?? '{}').scripts ?? {};
    for (const r of rules) {
      for (const [, span] of r.text.matchAll(/`([^`]+)`/g)) {
        const [tool, sub, name] = span.trim().split(/\s+/);
        const script = tool === 'npm' ? (['test', 't'].includes(sub) ? 'test' : ['run', 'run-script'].includes(sub) ? name : null) : null;
        if (tool === 'yarn' || tool === 'pnpm' || (script && !(script in scripts))) return `${r.file}:${r.line} still tells the agent to run \`${span}\`, which doesn't work here.`;
      }
    }
    return true;
  }, { milestone: 'M4' }),
  t.check('Your linter is happy with your folder (exit 0)', () => {
    const r = t.node([LINT, '--json']);
    if (r.code === 0) return true;
    let out = {};
    try { out = JSON.parse(r.stdout); } catch { return `node ${LINT} exits ${r.code}. ${r.all.trim().slice(0, 200)}`; }
    const f = out.findings ?? [];
    return `node ${LINT} exits ${r.code}: ${f.length} finding(s)${f.length ? ` (first: ${f[0].check} ${f[0].file}:${f[0].line})` : ''}${out.over?.length ? `; over budget: ${out.over[0]}` : ''}.`;
  }, { milestone: 'M4' }),

  // M5 · Nothing lost
  t.check('RULES-INVENTORY.md has one row per legacy rule', () => {
    const legacy = parseRules(fx(t, 'legacy-instructions.md'), LEGACY);
    const rows = inventoryRows(t.need(INVENTORY));
    const id = (i) => `L${String(i + 1).padStart(2, '0')}`;
    const missing = legacy.filter((r, i) => !rows.some((row) => row.id === id(i) && norm(row.legacy) === norm(r.text))).map((r, i) => `${id(legacy.indexOf(r))} "${r.text.slice(0, 50)}"`);
    if (missing.length === legacy.length) return `${INVENTORY} has no rows yet. Generate the table with node ${LINT} --inventory (before you delete ${LEGACY}, or on the copy: --inventory ../tests/fixtures/legacy-instructions.md).`;
    return !missing.length || `${missing.length} legacy rule(s) have no row (ID and text as --inventory prints them): ${list(missing)}.`;
  }, { milestone: 'M5' }),
  t.check('Every row says where its rule lives now, and it really is there', () => {
    const legacy = parseRules(fx(t, 'legacy-instructions.md'), LEGACY);
    const rows = inventoryRows(t.need(INVENTORY));
    const byId = new Map(rows.map((r) => [r.id, r]));
    if (!rows.length) return `${INVENTORY} has no rows yet (see the check above).`;
    const homes = new Set([...sourcesOf(t).map((s) => s.path), ...t.find(SKILL)]);
    const problems = [];
    for (let i = 0; i < legacy.length; i++) {
      const row = byId.get(`L${String(i + 1).padStart(2, '0')}`);
      if (!row) continue;
      if (!STATUSES.includes(row.status)) { problems.push(`${row.id}: status "${row.status}" (use ${STATUSES.join(', ')})`); continue; }
      if (!homes.has(row.where)) { problems.push(`${row.id}: "${row.where}" is not an instruction file or skill of this folder`); continue; }
      const home = norm(t.read(row.where));
      if (['kept', 'moved'].includes(row.status)) {
        if (!home.includes(norm(legacy[i].text))) problems.push(`${row.id} is "${row.status}", but ${row.where} doesn't say "${legacy[i].text.slice(0, 50)}" (if you changed the words, it is "rewritten")`);
      } else if (row.status === 'merged' && /^L\d+$/.test(row.now.trim())) {
        const other = byId.get(row.now.trim());
        if (!other || other.status === 'merged') problems.push(`${row.id} is merged into ${row.now.trim()}, which must be a row that survived (not merged itself)`);
      } else if (!row.now.trim()) problems.push(`${row.id} is "${row.status}": put the rule as it reads now in "Now reads" (or, for merged, the row it joined: L07)`);
      else if (!home.includes(norm(row.now))) problems.push(`${row.id}: ${row.where} doesn't say "${row.now.slice(0, 50)}"`);
    }
    return !problems.length || `${problems.length} row(s) don't check out: ${list(problems, 2)}.`;
  }, { milestone: 'M5' }),
  t.check('The noise is fixed, not moved: vague rules, wrong commands, contradictions', () => {
    const legacy = parseRules(fx(t, 'legacy-instructions.md'), LEGACY);
    const rows = new Map(inventoryRows(t.need(INVENTORY)).map((r) => [r.id, r]));
    if (!rows.size) return `${INVENTORY} has no rows yet (see the first M5 check).`;
    const idOf = (k) => `L${String(legacy.findIndex((r) => key(r) === k) + 1).padStart(2, '0')}`;
    const exp = expected(t);
    const status = (k) => rows.get(idOf(k))?.status;
    const vagueKept = exp.vague.filter((k) => ['kept', 'moved'].includes(status(k))).map(idOf);
    if (vagueKept.length) return `Vague rules moved as they were are still vague: ${vagueKept.join(', ')}. Rewrite them into something checkable, or merge them into a concrete rule.`;
    const cmd = exp.commands.map((c) => c.split(' ')[0]).filter((k) => !['fixed', 'merged'].includes(status(k))).map(idOf);
    if (cmd.length) return `Rules with a command that doesn't work must be "fixed" (or merged into a working one): ${cmd.join(', ')}.`;
    for (const [topic, c] of Object.entries(exp.contradictions)) {
      const own = c.rules.filter((k) => k.startsWith(`${LEGACY}:`));
      if (!own.some((k) => status(k) === 'resolved')) return `${topic}: the legacy file disagrees with itself or with AGENTS.md (${own.map(idOf).join(', ')}). Mark the side you dropped as "resolved", with the rule that won in "Now reads".`;
    }
    return true;
  }, { milestone: 'M5' }),
];
