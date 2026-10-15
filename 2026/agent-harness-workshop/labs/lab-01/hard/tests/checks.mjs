// Free checks for Lab 01 · hard.
import fs from 'node:fs';
import path from 'node:path';

const load = async (t) => t.import('scripts/ab.mjs');
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
const fixture = (t) => JSON.parse(fs.readFileSync(path.join(t.exDir, 'tests', 'results.json'), 'utf8'));

export default (t) => [
  t.check('buildArgs("with") is a read-only, budget-capped prompt run', async () => {
    const { buildArgs } = await load(t);
    const a = buildArgs('with', 'Q?');
    if (!Array.isArray(a) || !a.length) return 'buildArgs() returns an empty list.';
    if (flag(a, '-p') !== 'Q?' && flag(a, '--prompt') !== 'Q?') return 'Pass the prompt with -p.';
    if (!a.includes('-s') && !a.includes('--silent')) return 'Add -s so you only get the answer (no stats).';
    const cap = Number(flag(a, '--max-ai-credits'));
    if (!(cap >= 30 && cap <= 50)) return 'Cap the budget: --max-ai-credits between 30 and 50.';
    if (!norm(a).some((x) => /^--deny-tool=.*write/.test(x))) return 'Make it read-only: deny file writes.';
    if (a.some((x) => /^--(allow-all|yolo|allow-all-tools)/.test(x))) return 'No --allow-all in an experiment!';
    if (a.includes('--no-custom-instructions')) return 'The "with" variant must keep the instructions on.';
    return true;
  }),
  t.check('buildArgs("without") also switches instructions off', async () => {
    const { buildArgs } = await load(t);
    const a = buildArgs('without', 'Q?');
    return (a.includes('--no-custom-instructions') && flag(a, '-p') === 'Q?') || 'The "without" variant needs the flag that disables custom instructions (see `copilot help`).';
  }),
  t.check('score() spots the canary, the test command and the exam rule', async () => {
    const { score } = await load(t);
    const all = score('Run npm test. You need at least 5 on the exam.\nHarness check: AGENTS.md loaded');
    const none = score('Read the README and follow the style.');
    const fuzzy = score('use NODE --TEST; the EXAM needs FIVE or more. harness CHECK');
    const ok = all.canary && all.tests && all.examRule && !none.canary && !none.tests && !none.examRule && fuzzy.canary && fuzzy.tests && fuzzy.examRule;
    return ok || `score() is off. Got ${JSON.stringify({ all, none, fuzzy })}`;
  }),
  t.check('score() does not count an exam without the 5', async () => {
    const { score } = await load(t);
    return score('The exam is hard.').examRule === false || 'An answer that mentions the exam but not 5/five should not count.';
  }),
  t.check('summarize() counts runs and hits per variant', async () => {
    const { summarize } = await load(t);
    const s = summarize(fixture(t));
    const want = { with: { runs: 2, canary: 2, tests: 2, examRule: 1 }, without: { runs: 2, canary: 0, tests: 1, examRule: 1 } };
    return JSON.stringify(s) === JSON.stringify(want) || `Expected ${JSON.stringify(want)}, got ${JSON.stringify(s)}. (Unknown variants are ignored.)`;
  }),
  t.check('summarize() handles an empty list', async () => {
    const { summarize } = await load(t);
    const s = summarize([]);
    return (s.with?.runs === 0 && s.without?.runs === 0) || 'summarize([]) should return zero runs for both variants.';
  }),
  t.check('The dry run shows both variants', () => {
    const r = t.node(['scripts/ab.mjs', '--dry-run', '--runs', '2']);
    const lines = r.stdout.split('\n').filter((l) => /^\s*copilot /.test(l));
    const off = lines.filter((l) => l.includes('--no-custom-instructions')).length;
    return (lines.length === 4 && off === 2) || `Expected 4 commands (2 without instructions), got ${lines.length} (${off} without). ${r.stderr.trim().slice(0, 160)}`;
  }),
];
