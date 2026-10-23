// Free checks for Lab 07 · hard: a reviewer in CI.
import fs from 'node:fs';
import path from 'node:path';
import { readOnly, unrestrictedBash, compileStrict, GLOBAL_SAFE_OUTPUT_KEYS, pathsTrigger, refEstimate, front, noGitHubEnv } from './common.mjs';

const WF = '.github/workflows/pr-review.md';
const PLAN = 'scripts/review-plan.mjs';
const REVIEWER = '.github/agents/reviewer.agent.md';
const fm = (t) => front(t, WF, `Create \`${WF}\`.`).data;
const prOf = (t) => fm(t).on?.pull_request;

const MUST_REVIEW = ['grades.js', 'src/util/dates.js', 'package.json', 'AGENTS.md', '.github/hooks/scripts/guard.mjs'];
const MUST_SKIP = ['README.md', 'docs/guide.md', '.github/ISSUE_TEMPLATE/bug.md'];

/** The imports of a workflow, as paths from the repository root. */
function importsOf(d) {
  return (Array.isArray(d.imports) ? d.imports : d.imports ? [d.imports] : []).map((i) => String(typeof i === 'string' ? i : i?.uses ?? i?.path ?? ''))
    .map((p) => p.replace(/[?]$/, '').replace(/^\/+/, ''))
    .map((p) => (p.startsWith('.github/') ? path.posix.normalize(p) : path.posix.normalize(`.github/workflows/${p}`)));
}

// GitHub's filter pattern cheat sheet: `?` and `+` apply to the character before them; `[…]` is one character.
const GLOBS = [
  ['**/*.js', 'grades.js', true], ['**/*.js', 'src/util/dates.js', true], ['*.js', 'grades.js', true], ['*.js', 'src/util/dates.js', false],
  ['src/*.js', 'src/a.js', true], ['src/*.js', 'src/a/b.js', false], ['docs/**', 'docs/a/b.md', true], ['docs/**', 'README.md', false],
  ['**/*.test.js', 'x/y.test.js', true], ['*.md', 'docs/a.md', false], ['.github/**', '.github/workflows/x.md', true], ['package.json', 'package.json', true],
  ['package.json', 'packageXjson', false], ['grades.m?js', 'grades.js', true], ['grades.m?js', 'grades.mjs', true], ['grades.m?js', 'grades.cjs', false],
  ['v[0-9].md', 'v2.md', true], ['v[0-9].md', 'vx.md', false], ['lo+g.txt', 'looog.txt', true], ['lo+g.txt', 'lg.txt', false],
];
const PRS = [
  { number: 1, files: ['grades.js'], pushes: 2 },
  { number: 2, files: ['README.md'], pushes: 1 },
  { number: 3, files: ['docs/a.md', 'lib/x.js'], pushes: 0, reopens: 1 },
  { number: 4, files: ['docs/guide.md'], pushes: 3 },
];
const TRIGGERS = [
  { types: ['opened', 'synchronize'], paths: ['**/*.js'] },
  { types: ['opened'] },
  { 'paths-ignore': ['docs/**', '*.md'] },
  { types: ['opened', 'synchronize', 'reopened'], paths: ['**/*.js', '!lib/**'] },
  null,
];

export default (t) => [
  // M1 · When it runs
  t.check('It triggers on pull requests, never pull_request_target', () => {
    const on = fm(t).on ?? {};
    if (on.pull_request_target !== undefined) return 'Use pull_request, not pull_request_target (that one runs with write tokens on untrusted code).';
    if (on.pull_request === undefined) return 'Add an `on: pull_request:` trigger.';
    const types = on.pull_request?.types;
    if (types && !types.includes('opened')) return 'Include the "opened" type.';
    return (!types || types.includes('synchronize')) || 'Include "synchronize" too: a review of the first push only misses every fix that comes after it.';
  }, { milestone: 'M1' }),
  t.check('Path filters: code changes start a review, docs-only changes don\'t', () => {
    const pr = prOf(t) ?? {};
    if (pr.paths == null && pr['paths-ignore'] == null) return 'Add path filters (`paths:` or `paths-ignore:`): a typo fix in README.md shouldn\'t spend AI credits on a review.';
    if (pathsTrigger(pr, ['x']) === null) return 'Use `paths` or `paths-ignore`, not both: GitHub Actions rejects a workflow that has both for the same event.';
    const missed = MUST_REVIEW.filter((f) => !pathsTrigger(pr, [f]));
    if (missed.length) return `These changes would get no review: ${missed.join(', ')}. AGENTS.md holds the rules the reviewer enforces, and the guard is code too.`;
    const wasted = MUST_SKIP.filter((f) => pathsTrigger(pr, [f]));
    return !wasted.length || `These docs-only changes would still start a review: ${wasted.join(', ')}.`;
  }, { milestone: 'M1' }),

  // M2 · Your reviewer, in CI
  t.check('It imports your Lab 03 reviewer', () => {
    const imports = importsOf(fm(t));
    if (!imports.includes(REVIEWER)) return `Import your reviewer: \`imports: [${REVIEWER}]\`. Its instructions (the checklist and the table) become part of the prompt.`;
    const agent = front(t, REVIEWER, `\`${REVIEWER}\` is missing: it comes from Lab 03.`).data;
    const tools = (Array.isArray(agent.tools) ? agent.tools : String(agent.tools ?? '').split(',')).map((x) => String(x).trim().toLowerCase());
    const writes = tools.filter((x) => /^(edit|write|create|execute|shell|bash|powershell)$/.test(x));
    return !writes.length || `The reviewer you import should stay read-only, but its tools include: ${writes.join(', ')}.`;
  }, { milestone: 'M2' }),
  t.check('The instructions: PR number, AGENTS.md, a Severity table, one comment, a human decides', () => {
    const { body } = front(t, WF);
    const missing = [];
    if (!/github\.event\.pull_request\.number/.test(body)) missing.push('the PR number expression');
    if (!/AGENTS\.md/.test(body)) missing.push('follow AGENTS.md');
    if (!/\|[^\n]*severity/i.test(body)) missing.push('a table with a Severity column');
    if (!/\b(one|single|1)\b[\s*_]*(\w+[\s*_]+)?comments?\b/i.test(body)) missing.push('exactly one comment');
    if (!/(never|don.?t|do not)[^\n]*(approve|merge)/i.test(body)) missing.push('never approve or merge');
    return !missing.length || `The body is missing: ${missing.join('; ')}.`;
  }, { milestone: 'M2' }),

  // M3 · One comment, nothing else
  t.check('The agent is read-only and can read PRs and files', () => {
    const d = fm(t);
    const p = d.permissions;
    if (!readOnly(p)) return 'Only read permissions for the agent.';
    if (typeof p === 'object' && (p['pull-requests'] !== 'read' || p.contents !== 'read')) return 'It needs `contents: read` and `pull-requests: read`.';
    const tools = d.tools && typeof d.tools === 'object' ? d.tools : {};
    if (!('github' in tools) || tools.github === false) return 'Add the GitHub tool: tools.github.toolsets.';
    const sets = tools.github?.toolsets ?? ['default'];
    if (sets.includes('default') || sets.includes('all')) return true;
    if (!sets.includes('pull_requests')) return 'Include the pull_requests toolset: it reads the PR and its diff.';
    return sets.includes('repos') || 'Include the repos toolset too: the reviewer reads AGENTS.md and the files around the change.';
  }, { milestone: 'M3' }),
  t.check('Exactly one comment, nothing else', () => {
    const so = fm(t)['safe-outputs'] ?? {};
    const extra = Object.keys(so).filter((k) => k !== 'add-comment' && !GLOBAL_SAFE_OUTPUT_KEYS.includes(k));
    if (extra.length) return `A reviewer posts one comment and nothing else. Remove: ${extra.join(', ')}.`;
    return so['add-comment']?.max === 1 || 'safe-outputs.add-comment.max must be 1.';
  }, { milestone: 'M3' }),
  t.check('One review on the PR, even after new pushes', () => {
    const d = fm(t);
    const types = d.on?.pull_request?.types;
    if (Array.isArray(types) && !types.includes('synchronize')) return true;
    return d['safe-outputs']?.['add-comment']?.['hide-older-comments'] === true || '`max: 1` counts per run, and every push starts a new run. Set `hide-older-comments: true` under add-comment, so the latest review is the only one shown.';
  }, { milestone: 'M3' }),

  // M4 · Limits
  t.check('Locked down: no shell, network, budget, timeout', () => {
    const d = fm(t);
    if (unrestrictedBash(d.tools)) return 'No unrestricted shell for a reviewer.';
    if (!d.network) return 'Add `network: defaults`.';
    const credits = Number(d['max-ai-credits']);
    if (!(credits > 0 && credits <= 200)) return 'Add `max-ai-credits` (200 or less).';
    const minutes = Number(d['timeout-minutes']);
    return (minutes > 0 && minutes <= 20) || 'Set `timeout-minutes` to 20 or less.';
  }, { milestone: 'M4' }),

  // M5 · Measure it before it runs
  t.check('globToRegExp() follows GitHub\'s filter pattern rules', async () => {
    const { globToRegExp } = await t.import(PLAN);
    const wrong = GLOBS.filter(([g, f, want]) => {
      try { return globToRegExp(g).test(f) !== want; } catch { return true; }
    });
    return !wrong.length || `Not like Actions yet: ${wrong.slice(0, 4).map(([g, f, want]) => `\`${g}\` ${want ? 'should' : 'should not'} match \`${f}\``).join(' · ')}`;
  }, { milestone: 'M5' }),
  t.check('estimate() counts review runs like Actions would', async () => {
    const { estimate } = await t.import(PLAN);
    for (const trig of TRIGGERS) {
      const want = refEstimate(PRS, trig, 100);
      let got;
      try { got = estimate(PRS, trig, 100); } catch (e) { return `estimate() crashed for the trigger \`${JSON.stringify(trig)}\`: ${e.message}`; }
      const diff = Object.keys(want).filter((k) => got?.[k] !== want[k]);
      if (diff.length) return t.fail(`estimate() is off for the trigger \`${JSON.stringify(trig)}\` (${diff.join(', ')}).`, { expected: want, actual: got });
    }
    return true;
  }, { milestone: 'M5' }),
  t.check('The CLI measures your own workflow on a month of PRs', () => {
    const file = path.join(t.dir, 'fixtures', 'prs.json');
    if (!fs.existsSync(file)) return '`fixtures/prs.json` is missing: it comes with the starter.';
    const r = t.node([PLAN, 'fixtures/prs.json'], { env: noGitHubEnv(t) });
    if (r.code !== 0) return `\`node ${PLAN} fixtures/prs.json\` exited with ${r.code}: ${r.all.trim().split('\n').slice(-2).join(' ')}`;
    const d = fm(t);
    const want = refEstimate(JSON.parse(fs.readFileSync(file, 'utf8')).prs, d.on?.pull_request, d['max-ai-credits']);
    const num = (k) => Number((r.stdout.replace(/,/g, '').match(new RegExp(`${k}:\\s*(\\d+)`, 'i')) ?? [])[1]);
    const got = { reviewed: num('reviewed'), skipped: num('skipped'), runs: num('runs'), worstCase: num('worst case') };
    const diff = Object.keys(got).filter((k) => got[k] !== want[k]);
    if (diff.length) return t.fail(`The report doesn't match your workflow's triggers (${diff.join(', ')}).`, { expected: want, actual: got });
    const missing = t.node([PLAN, 'fixtures/no-such-file.json'], { env: noGitHubEnv(t) });
    return (missing.code === 1 && /not found|no such|missing|doesn.t exist|cannot/i.test(missing.all)) || 'With a file that doesn\'t exist, the CLI should say so and exit 1.';
  }, { milestone: 'M5' }),

  t.check('gh aw compile --strict accepts it', () => compileStrict(t, 'pr-review'), { needs: ['gh-aw'], optional: true, env: true, timeout: 150000 }),
];
