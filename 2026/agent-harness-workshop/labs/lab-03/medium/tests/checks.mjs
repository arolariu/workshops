// Free checks for Lab 03 · medium: a test-writer turns every finding of REVIEW.md into a red test that proves its bug.
// "Proves" is measured: your tests run against the buggy deadlines.js, against each fix REVIEW.md suggests (one at a
// time), and against all three fixes together. They run in UTC, so a time-zone test must pin its own zone.
import fs from 'node:fs';
import path from 'node:path';
import { applyFixes, FIX_NAMES, LOCATION } from '../../../_harness/fixtures/lab-03/deadlines-fixes.mjs';
import { ALIASES, capsOf, toolEntries } from '../../../_harness/fixtures/lab-03/aliases.mjs';
import { offline } from '../../../_harness/fixtures/lab-03/offline.mjs';

const AGENT = '.github/agents/test-writer.agent.md';
const FINDING = { done: 'the done items (deadlines.js:23)', utc: 'the UTC date (deadlines.js:7)', invalid: 'the invalid dates (deadlines.js:12)' };
const testNames = (src) => [...String(src ?? '').matchAll(/\btest\s*\(\s*(['"`])(.*?)\1/g)].map((m) => m[2]);
const originalNames = (t) => testNames(fs.readFileSync(path.join(t.exDir, 'tests', 'original-deadlines.test.js'), 'utf8'));
/** The tools list entries that grant `cap` (e.g. "Task" for agent). */
const entriesFor = (tools, cap) => (toolEntries(tools) ?? []).filter((e) => ALIASES[cap].includes(e.toLowerCase()));

/** Your tests against the buggy deadlines.js, each single fix, and all fixes: { buggy, all, done, utc, invalid }. */
let runs = null;
async function variants(t) {
  if (runs) return runs;
  const reference = t.sol('deadlines.js');
  const sources = { buggy: reference, all: applyFixes(reference), ...Object.fromEntries(FIX_NAMES.map((n) => [n, applyFixes(reference, [n])])) };
  const tz = process.env.TZ;
  process.env.TZ = 'UTC';
  try {
    const out = {};
    for (const [name, source] of Object.entries(sources)) {
      const copy = t.copy(t.tmp());
      fs.writeFileSync(path.join(copy, 'deadlines.js'), source);
      out[name] = await offline(t, () => t.unitTests({ cwd: copy }));
    }
    runs = out;
    return out;
  } finally {
    if (tz === undefined) delete process.env.TZ;
    else process.env.TZ = tz;
  }
}
async function red(t) {
  const r = (await variants(t)).buggy;
  if (r.fail > 0 && !r.failing.length) t.fail(`A test file crashed before its tests ran: ${r.output.split('\n').filter((l) => /Error/.test(l)).slice(0, 2).join(' | ').slice(0, 300)}`);
  return r.failing;
}
/** For each finding, the red tests that turn green when only its bug is fixed. */
async function proofs(t) {
  const failing = await red(t);
  const v = await variants(t);
  return Object.fromEntries(FIX_NAMES.map((n) => [n, failing.filter((name) => !v[n].failing.includes(name))]));
}
/** The `## ` sections of BUGS.md: [{ title, body }]. */
const reports = (t) => (t.read('BUGS.md') ?? '').split(/^##\s+/m).slice(1).map((s) => ({ title: s.split('\n')[0].trim(), body: s }));
/** The locations of the findings in REVIEW.md, e.g. ["deadlines.js:23", "deadlines.js:7", "deadlines.js:12"]. */
const findings = (t) => [...(t.read('REVIEW.md') ?? '').matchAll(/^\s*\|[^|\n]*\|\s*`?([\w./-]+\.js:\d+)`?\s*\|/gm)].map((m) => m[1]);
const names = (body, loc) => new RegExp(`${loc.replace(/[.]/g, '\\.')}(?!\\d)`).test(body);
/** The report about one finding: the section that names its location and no other finding's. */
const reportFor = (t, loc) => {
  const all = findings(t);
  return reports(t).find((r) => names(r.body, loc) && all.filter((l) => names(r.body, l)).length === 1);
};

export default (t) => [
  t.check('The test-writer has a description and the tools to write and run tests', () => {
    const { data } = t.frontmatter(AGENT, `Create \`${AGENT}\`.`);
    const description = String(data.description ?? '');
    if (description.length < 20 || /\bTODO\b/.test(description)) return 'Write a description: what it does and when to use it (the main agent reads it to decide when to delegate).';
    if (data.tools == null) return 'Add a `tools:` list: without one, the agent gets every tool.';
    const c = capsOf(data.tools);
    if (!c.all && !c.caps.size) return 'Add the tools it needs to the `tools:` list (an empty list means no tools at all).';
    const missing = ['read', 'edit', 'execute'].filter((cap) => !c.all && !c.caps.has(cap));
    return !missing.length || `To read code, write tests and run them it needs: ${missing.join(', ')}.`;
  }, { milestone: 'M1' }),
  t.check('Least privilege: no delegation, no web, no wildcard', () => {
    const { tools } = t.frontmatter(AGENT).data;
    if (capsOf(tools).all) return '`*` (or no tools line) gives it every tool. List only what it needs.';
    const deputy = entriesFor(tools, 'agent');
    if (deputy.length) return `\`${deputy[0]}\` lets it hand work to another agent, one that may edit deadlines.js: the boundary would leak. Remove it.`;
    const web = entriesFor(tools, 'web');
    return !web.length || `\`${web[0]}\` isn't needed to write tests. Remove it.`;
  }, { milestone: 'M1' }),
  t.check('Its instructions draw the boundary and start from REVIEW.md', () => {
    const { body } = t.frontmatter(AGENT);
    if (/\bTODO\b/.test(body)) return 'Replace the TODO in its instructions.';
    const missing = [];
    if (!/\.test\.js|test files/i.test(body)) missing.push('which files it may edit (test files, BUGS.md)');
    if (!/never|must not|do not|don.?t/i.test(body)) missing.push('what it must never do (change library code)');
    if (!/report|BUGS\.md/i.test(body)) missing.push('to report bugs in BUGS.md instead of fixing them');
    if (!/REVIEW\.md/.test(body)) missing.push('to start from the findings in REVIEW.md');
    return !missing.length || `Its instructions should say: ${missing.join('; ')}.`;
  }, { milestone: 'M1' }),
  t.check('deadlines.js and the original tests are unchanged', () => {
    if (!t.unchanged('deadlines.js')) return 'deadlines.js was changed. The test-writer proves bugs; it does not fix them. Undo it with `git checkout -- deadlines.js`.';
    const now = testNames(t.read('deadlines.test.js'));
    const gone = originalNames(t).filter((n) => !now.includes(n));
    return !gone.length || `Keep the existing tests (add new ones next to them): missing ${gone.map((n) => `"${n}"`).join(', ')}.`;
  }, { milestone: 'M2' }),
  t.check('One red test per finding: each turns green when its bug is fixed', async () => {
    const failing = await red(t);
    if (failing.length < FIX_NAMES.length) return `${failing.length} test(s) fail on the buggy code; expected at least one red test per finding in REVIEW.md (${FIX_NAMES.length}).${failing.length ? ` Red now: ${failing.map((n) => `"${n}"`).join(', ')}.` : ''}`;
    const proof = await proofs(t);
    const unproven = FIX_NAMES.filter((n) => !proof[n].length);
    if (!unproven.length) return true;
    const tz = unproven.includes('utc') ? ' The checks run in UTC, where the time-zone bug is invisible: pin a zone at the top of the test file (`process.env.TZ = \'Europe/Bucharest\'`) and pick a moment just after local midnight.' : '';
    return `No red test turns green when only this bug is fixed: ${unproven.map((n) => FINDING[n]).join(', ')}. Write a test that fails because of that bug.${tz}`;
  }, { milestone: 'M2', timeout: 120000 }),
  t.check('No test is red for another reason', async () => {
    const failing = await red(t);
    const broken = failing.filter((n) => originalNames(t).includes(n));
    if (broken.length) return `These existing tests fail now: ${broken.join(' | ')}. Only the new tests should be red.`;
    const still = (await variants(t)).all.failing;
    return !still.length || `These tests still fail when all three bugs are fixed the way REVIEW.md suggests, so they are red for another reason: ${still.map((n) => `"${n}"`).join(', ')}. Check what they expect.`;
  }, { milestone: 'M2', timeout: 120000 }),
  t.check('BUGS.md: one report per finding, with expected and actual', () => {
    const list = reports(t);
    const locations = findings(t);
    if (list.length < locations.length) return `BUGS.md has ${list.length} report(s) (## headings); REVIEW.md has ${locations.length} findings. Write one report per finding.`;
    for (const loc of locations) {
      const r = reportFor(t, loc);
      if (!r) return list.some((x) => names(x.body, loc)) ? `The finding at \`${loc}\` shares its report with another finding: give each finding its own ## report, naming only its own location.` : `No report names the finding at \`${loc}\` (copy its location from REVIEW.md).`;
      if (!/expected/i.test(r.body) || !/actual/i.test(r.body)) return `The report "${r.title}" needs an Expected and an Actual.`;
    }
    return true;
  }, { milestone: 'M3' }),
  t.check('Each report names the red test that proves its finding, and every red test is reported', async () => {
    const failing = await red(t);
    const proof = await proofs(t);
    for (const n of FIX_NAMES) {
      const r = reportFor(t, LOCATION[n]);
      if (!r) return `Write the report for ${FINDING[n]} first.`;
      if (!proof[n].some((name) => r.body.includes(name))) return `The report "${r.title}" should name, exactly, a red test that proves this finding (one that turns green when only this bug is fixed)${proof[n].length ? `: ${proof[n].map((x) => `"${x}"`).join(' or ')}` : ''}.`;
    }
    const text = t.read('BUGS.md') ?? '';
    const missing = failing.filter((n) => !text.includes(n));
    return !missing.length || `These red tests aren't in any report: ${missing.map((n) => `"${n}"`).join(', ')}.`;
  }, { milestone: 'M3', timeout: 120000 }),
];
