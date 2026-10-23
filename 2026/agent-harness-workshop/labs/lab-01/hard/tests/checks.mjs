// Free checks for Lab 01 · hard: prove it with data. Copilot never runs here: the statistics, the report and the
// ablation table are checked on recorded results (tests/fixtures/).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const AB = 'scripts/ab.mjs';
const load = (t) => t.import(AB);
const fixturePath = (t, name) => path.join(t.exDir, 'tests', 'fixtures', name);
const fixture = (t, name) => JSON.parse(fs.readFileSync(fixturePath(t, name), 'utf8'));
// The checks' own copy of the rules (independent of the RULES in your script).
const RULES = [
  { id: 'canary', signal: 'canary', line: /Harness check/i },
  { id: 'test-command', signal: 'tests', line: /npm test/i },
  { id: 'exam-rule', signal: 'examRule', line: /exam grade/i },
  { id: 'dependencies', signal: 'deps', line: /dependenc/i },
];

// Accept both "--flag=value" and "--flag", "value" (two array items).
const VALUE_FLAGS = new Set(['-p', '--prompt', '--agent', '--allow-tool', '--deny-tool', '--max-ai-credits', '--output-format', '--model', '--plugin-dir']);
const norm = (args) => {
  const out = [];
  const list = Array.isArray(args) ? args.map(String) : [];
  for (let i = 0; i < list.length; i++) {
    if (VALUE_FLAGS.has(list[i]) && i + 1 < list.length) out.push(`${list[i]}=${list[++i]}`);
    else out.push(list[i]);
  }
  return out;
};
const flag = (args, name) => {
  const hit = norm(args).find((a) => a.startsWith(`${name}=`));
  return hit === undefined ? undefined : hit.slice(name.length + 1);
};
const same = (got, want) => {
  try { assert.deepStrictEqual(got, want); return true; } catch { return false; }
};
/** The Markdown table rows of a report, as arrays of trimmed cells. */
const rows = (md) => String(md ?? '').replace(/\r/g, '').split('\n').filter((l) => /^\s*\|/.test(l) && !/^\s*\|\s*-/.test(l))
  .map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim().replace(/\s+/g, ' ')));
function expectRows(md, want, what) {
  const have = rows(md);
  for (const w of want) {
    const r = have.find((x) => x[0] === w[0]);
    if (!r) return `${what} has no row for "${w[0]}".`;
    if (!same(r, w)) return `${what}, row "${w[0]}": expected | ${w.join(' | ')} |, got | ${r.join(' | ')} |.`;
  }
  return true;
}

const WITH_FIXTURE = {
  with: { runs: 5, hits: { canary: 5, tests: 5, examRule: 4, deps: 3 }, rate: { canary: 1, tests: 1, examRule: 0.8, deps: 0.6 }, score: { n: 5, mean: 3.4, sd: 0.55 } },
  without: { runs: 5, hits: { canary: 0, tests: 3, examRule: 1, deps: 0 }, rate: { canary: 0, tests: 0.6, examRule: 0.2, deps: 0 }, score: { n: 5, mean: 0.8, sd: 0.84 } },
};
const REPORT_ROWS = [
  ['Signal', 'With', 'Without', 'Δ'],
  ['canary', '5/5 (100%)', '0/5 (0%)', '+100 pts'],
  ['test command', '5/5 (100%)', '3/5 (60%)', '+40 pts'],
  ['exam rule', '4/5 (80%)', '1/5 (20%)', '+60 pts'],
  ['no dependencies', '3/5 (60%)', '0/5 (0%)', '+60 pts'],
  ['score (0–4)', '3.40 ± 0.55', '0.80 ± 0.84', '+2.60'],
];
const ABLATION_ROWS = [
  ['Rule removed', 'canary', 'test command', 'exam rule', 'no dependencies', 'Biggest drop'],
  ['(none)', '100%', '100%', '100%', '67%', ''],
  ['canary', '0%', '100%', '100%', '67%', 'canary (-100 pts)'],
  ['test-command', '100%', '67%', '100%', '67%', 'test command (-33 pts)'],
  ['exam-rule', '100%', '100%', '33%', '67%', 'exam rule (-67 pts)'],
  ['dependencies', '100%', '100%', '100%', '0%', 'no dependencies (-67 pts)'],
];
const ABLATION_VARIANTS = ['with', ...RULES.map((r) => `no-${r.id}`)];

const INSTRUCTION_PATHS = [
  ['AGENTS.md', true], ['docs/AGENTS.md', true], ['CLAUDE.md', true], ['.claude/CLAUDE.md', true], ['GEMINI.md', true],
  ['.github/copilot-instructions.md', true], ['.github/instructions/tests.instructions.md', true], ['.github/instructions/sub/x.instructions.md', true],
  ['README.md', false], ['docs/grading.md', false], ['grades.js', false], ['AGENTS.md.bak', false], ['MY-AGENTS.md', false], ['.github/hooks/guard.json', false],
];

/** Run the CLI with --from on a copy of a fixture, in a temp copy of your folder. */
function fromFixture(t, name) {
  const copy = t.copy(t.tmp());
  const file = path.join(copy, 'saved.json');
  fs.copyFileSync(fixturePath(t, name), file);
  return { copy, r: t.node([AB, '--from', 'saved.json'], { cwd: copy }) };
}

export default (t) => [
  // M1 · An honest experiment
  t.check('buildArgs("with") is a read-only, budget-capped prompt run', async () => {
    const { buildArgs } = await load(t);
    const a = buildArgs('with', 'Q?');
    if (!Array.isArray(a) || !a.length) return 'buildArgs() returns an empty list.';
    if (flag(a, '-p') !== 'Q?' && flag(a, '--prompt') !== 'Q?') return 'Pass the prompt with -p.';
    if (!a.includes('-s') && !a.includes('--silent')) return 'Add -s so you only get the answer (no stats).';
    if (!a.includes('--no-ask-user')) return 'Add --no-ask-user: a scripted run has nobody to answer its questions.';
    const cap = Number(flag(a, '--max-ai-credits'));
    if (!(cap >= 30 && cap <= 50)) return 'Cap the budget: --max-ai-credits between 30 and 50.';
    if (!norm(a).some((x) => /^--deny-tool=.*write/.test(x))) return 'Make it read-only: deny file writes.';
    if (!norm(a).some((x) => /^--deny-tool=.*shell/.test(x))) return 'Make it read-only: deny the shell too (a shell can write files).';
    if (a.some((x) => /^--(allow-all|yolo|allow-all-tools)/.test(x))) return 'No --allow-all in an experiment!';
    if (a.includes('--no-custom-instructions')) return 'The "with" variant must keep the instructions on.';
    return true;
  }, { milestone: 'M1' }),
  t.check('"without" switches instructions off; an ablation variant keeps them on', async () => {
    const { buildArgs } = await load(t);
    const a = buildArgs('without', 'Q?');
    if (!a.includes('--no-custom-instructions') || flag(a, '-p') !== 'Q?') return 'The "without" variant needs the flag that disables custom instructions (see `copilot help`).';
    return !buildArgs('no-canary', 'Q?').includes('--no-custom-instructions') || 'An ablation variant ("no-canary") runs with instructions on: only one rule is missing from its AGENTS.md.';
  }, { milestone: 'M1' }),
  t.check('isInstructionFile() knows every file Copilot reads as instructions', async () => {
    const { isInstructionFile } = await load(t);
    const wrong = INSTRUCTION_PATHS.filter(([p, want]) => Boolean(isInstructionFile(p)) !== want);
    return !wrong.length || `isInstructionFile() is off for: ${wrong.slice(0, 4).map(([p, want]) => `${p} (${want ? 'it is one' : 'not one'})`).join(', ')}.`;
  }, { milestone: 'M1' }),
  t.check('The "without" copy has no instruction file and nothing that quotes the canary, and all the code', async () => {
    const { prepare, release } = await load(t);
    const copy = t.copy(t.tmp());
    const extra = ['CLAUDE.md', 'GEMINI.md', '.github/copilot-instructions.md', '.claude/CLAUDE.md', 'docs/AGENTS.md', '.github/instructions/sub/x.instructions.md', 'evals/canaries.json'];
    for (const f of extra) {
      fs.mkdirSync(path.dirname(path.join(copy, f)), { recursive: true });
      fs.writeFileSync(path.join(copy, f), '- A rule. End with: Harness check: AGENTS.md loaded\n');
    }
    const { dir, instructions, canary } = prepare('without', copy);
    try {
      const left = [...new Set(['AGENTS.md', ...extra, ...t.find(/^\.github\/instructions\//)])].filter((f) => fs.existsSync(path.join(dir, f)));
      if (left.length) return `The "without" copy still has: ${left.join(', ')}. The agent could read them with its view tool (isInstructionFile() decides what goes).`;
      if (canary?.length) return `In the "without" copy, these files still quote the canary: ${canary.join(', ')}.`;
      const gone = ['grades.js', 'package.json', 'docs/grading.md'].filter((f) => !fs.existsSync(path.join(dir, f)));
      if (gone.length) return `The "without" copy lost ${gone.join(', ')}: only instruction files go.`;
      return (Array.isArray(instructions) && !instructions.length) || 'prepare() should report the instruction files left in the copy: none.';
    } finally {
      release(dir);
    }
  }, { milestone: 'M1' }),
  t.check('The dry run shows both variants, and where "without" runs', () => {
    const r = t.node([AB, '--dry-run', '--runs', '2']);
    const lines = r.stdout.split('\n').filter((l) => /^\s*copilot /.test(l));
    const off = lines.filter((l) => l.includes('--no-custom-instructions')).length;
    if (lines.length !== 4 || off !== 2) return `Expected 4 commands (2 without instructions), got ${lines.length} (${off} without). ${r.stderr.trim().slice(0, 160)}`;
    return /no instruction files/i.test(r.stdout) || 'The dry run should say that "without" runs in a copy with no instruction files.';
  }, { milestone: 'M1' }),

  // M2 · Score every rule
  t.check('score() spots the canary, the test command and the exam rule', async () => {
    const { score } = await load(t);
    const all = score('Run npm test. You need at least 5 on the exam.\nHarness check: AGENTS.md loaded');
    const none = score('Read the README and follow the style.');
    const fuzzy = score('use NODE --TEST; the EXAM needs FIVE or more. harness CHECK');
    const ok = all.canary && all.tests && all.examRule && !none.canary && !none.tests && !none.examRule && fuzzy.canary && fuzzy.tests && fuzzy.examRule;
    if (!ok) return `score() is off. Got ${JSON.stringify({ all, none, fuzzy })}`;
    return score('The exam is hard.').examRule === false || 'An answer that mentions the exam but not 5/five should not count.';
  }, { milestone: 'M2' }),
  t.check('score() spots the dependency rule, not just the word', async () => {
    const { score } = await load(t);
    const yes = ['No new dependencies.', 'Never add dependencies.', 'Keep it dependency-free.', 'Plain Node, zero dependencies.'];
    const no = ['Install the dependencies with npm install.', 'Dependencies live in package.json.', 'Read the README.'];
    const missed = yes.filter((a) => !score(a).deps);
    const wrong = no.filter((a) => score(a).deps);
    if (missed.length) return `deps should be true for: ${missed.join(' · ')}`;
    return !wrong.length || `deps should be false for: ${wrong.join(' · ')} (that's not the rule, just the word).`;
  }, { milestone: 'M2' }),

  // M3 · N runs and the spread
  t.check('stats() gives the mean and the sample standard deviation', async () => {
    const { stats } = await load(t);
    const cases = [[[2, 4, 4, 4, 5, 5, 7, 9], { n: 8, mean: 5, sd: 2.14 }], [[], { n: 0, mean: 0, sd: 0 }], [[3], { n: 1, mean: 3, sd: 0 }], [[1, 0, 1], { n: 3, mean: 0.67, sd: 0.58 }]];
    for (const [xs, want] of cases) {
      const got = stats(xs);
      if (!same(got, want)) return `stats(${JSON.stringify(xs)}) gives ${JSON.stringify(got)}; expected ${JSON.stringify(want)} (sample sd: divide by n − 1; round to 2 decimals).`;
    }
    return true;
  }, { milestone: 'M3' }),
  t.check('summarize() gives hits, hit rates and the score spread per variant', async () => {
    const { summarize } = await load(t);
    const got = summarize(fixture(t, 'results.json').results);
    return same(got, WITH_FIXTURE) || `On tests/fixtures/results.json, expected ${JSON.stringify(WITH_FIXTURE.with)} for "with", got ${JSON.stringify(got?.with)}. (Unknown variants are ignored.)`;
  }, { milestone: 'M3' }),
  t.check('summarize() handles an empty list and any list of variants', async () => {
    const { summarize } = await load(t);
    const empty = summarize([]);
    if (empty?.with?.runs !== 0 || empty?.without?.runs !== 0 || empty.with.rate?.canary !== 0) return 'summarize([]) should give zero runs and zero rates for both variants.';
    const s = summarize(fixture(t, 'ablation.json').results, ABLATION_VARIANTS);
    if (!same(Object.keys(s ?? {}).sort(), [...ABLATION_VARIANTS].sort())) return `summarize(results, variants) should have one entry per variant you ask for: ${ABLATION_VARIANTS.join(', ')}.`;
    return (s['no-canary'].hits.canary === 0 && s['no-canary'].runs === 3) || 'summarize(results, variants): "no-canary" should have 3 runs and no canary.';
  }, { milestone: 'M3' }),

  // M4 · The report
  t.check('report() turns a summary into a Markdown table', async () => {
    const { report } = await load(t);
    const md = report(WITH_FIXTURE, { prompt: 'Q?', runs: 5 });
    return expectRows(md, REPORT_ROWS, 'The report');
  }, { milestone: 'M4' }),
  t.check('report() works from the hits, not rounded rates, and says n/a for a spread of one run', async () => {
    const { report } = await load(t);
    const z = { canary: 0, tests: 0, examRule: 0, deps: 0 };
    const three = { with: { runs: 3, hits: { ...z, canary: 2 }, rate: { ...z, canary: 0.67 }, score: { n: 3, mean: 0.67, sd: 0.58 } }, without: { runs: 3, hits: { ...z, canary: 1 }, rate: { ...z, canary: 0.33 }, score: { n: 3, mean: 0.33, sd: 0.58 } } };
    const a = expectRows(report(three, { prompt: 'Q?', runs: 3 }), [['canary', '2/3 (67%)', '1/3 (33%)', '+33 pts']], 'With 2/3 against 1/3, the report');
    if (a !== true) return `${a} (Δ comes from the hits: 2/3 − 1/3 is 33 points; the rounded rates 0.67 − 0.33 would say 34.)`;
    const one = { with: { runs: 1, hits: { ...z, canary: 1 }, rate: { ...z, canary: 1 }, score: { n: 1, mean: 1, sd: 0 } }, without: { runs: 1, hits: z, rate: z, score: { n: 1, mean: 0, sd: 0 } } };
    const b = expectRows(report(one, { prompt: 'Q?', runs: 1 }), [['score (0–4)', '1.00 ± n/a', '0.00 ± n/a', '+1.00']], 'With a single run, the report');
    return b === true || `${b} (one run has no spread to measure: print n/a, not ± 0.00.)`;
  }, { milestone: 'M4' }),
  t.check('node scripts/ab.mjs --from saves the report without spending a credit', () => {
    const { copy, r } = fromFixture(t, 'results.json');
    if (r.code !== 0) return `node scripts/ab.mjs --from saved.json exited with ${r.code}. ${r.all.trim().slice(0, 200)}`;
    const ok = expectRows(r.stdout, REPORT_ROWS.slice(0, 2), 'The printed report');
    if (ok !== true) return ok;
    const file = path.join(copy, 'runs', 'ab-report.md');
    return (fs.existsSync(file) && expectRows(fs.readFileSync(file, 'utf8'), REPORT_ROWS, 'runs/ab-report.md')) || 'Write the report to runs/ab-report.md too.';
  }, { milestone: 'M4' }),

  // M5 · Take one rule away
  t.check('removeRule() drops exactly the lines of one rule', async () => {
    const { removeRule } = await load(t);
    const text = fs.readFileSync(fixturePath(t, 'agents-sample.md'), 'utf8').replace(/\r/g, '');
    const lines = text.split('\n');
    for (const rule of RULES) {
      const want = lines.filter((l) => rule.line.test(l)).length;
      const got = removeRule(text, rule);
      const left = String(got?.text ?? '').split(/\r?\n/);
      if (got?.removed !== want) return `removeRule(AGENTS.md, ${rule.id}) should remove ${want} line(s); it says ${got?.removed}.`;
      if (left.some((l) => rule.line.test(l))) return `After removeRule(…, ${rule.id}), a line still matches ${rule.line}.`;
      if (left.length !== lines.length - want) return `removeRule(…, ${rule.id}) changed other lines too: ${lines.length} lines became ${left.length}.`;
    }
    try {
      removeRule(text, { id: 'missing', signal: 'canary', line: /no such rule anywhere/ });
    } catch {
      return true;
    }
    return 'removeRule() should throw when no line matches: an ablation that removes nothing measures nothing.';
  }, { milestone: 'M5' }),
  t.check('biggestDrop() names the signal that fell the most', async () => {
    const { biggestDrop } = await load(t);
    const base = { rate: { canary: 1, tests: 1, examRule: 0.8, deps: 0.6 } };
    const a = biggestDrop(base, { rate: { canary: 1, tests: 0.6, examRule: 0.2, deps: 0.6 } });
    if (!same(a, { signal: 'examRule', drop: 60 })) return `biggestDrop() should give { signal: "examRule", drop: 60 } (the drop in percentage points); got ${JSON.stringify(a)}.`;
    return biggestDrop(base, base) === null || 'When nothing drops, biggestDrop() returns null.';
  }, { milestone: 'M5' }),
  t.check('ablationTable() shows which signal drops when each rule goes', async () => {
    const { summarize, ablationTable } = await load(t);
    const md = ablationTable(summarize(fixture(t, 'ablation.json').results, ABLATION_VARIANTS), { runs: 3 });
    return expectRows(md, ABLATION_ROWS, 'The ablation table');
  }, { milestone: 'M5' }),
  t.check('--from on ablation results prints the ablation table', () => {
    const { copy, r } = fromFixture(t, 'ablation.json');
    if (r.code !== 0) return `node scripts/ab.mjs --from (ablation) exited with ${r.code}. ${r.all.trim().slice(0, 200)}`;
    const ok = expectRows(r.stdout, ABLATION_ROWS.slice(2, 3), 'The printed ablation table');
    if (ok !== true) return ok;
    return fs.existsSync(path.join(copy, 'runs', 'ablation-report.md')) || 'Write the ablation table to runs/ablation-report.md too.';
  }, { milestone: 'M5' }),
];
