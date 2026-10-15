// Free checks for Lab 07 · hard.
import { readOnly, unrestrictedBash, WRITE_OUTPUTS, compileStrict } from './common.mjs';

const WF = '.github/workflows/pr-review.md';
const fm = (t) => t.frontmatter(WF, `Create \`${WF}\`.`).data;

export default (t) => [
  t.check('It triggers on pull requests', () => {
    const on = fm(t).on ?? {};
    const pr = on.pull_request ?? on.pull_request_target;
    if (on.pull_request_target) return 'Use pull_request, not pull_request_target (that one runs with write tokens on untrusted code).';
    if (pr === undefined) return 'Add an `on: pull_request:` trigger.';
    const types = pr?.types;
    return (!types || types.includes('opened')) || 'Include the "opened" type.';
  }),
  t.check('The agent is read-only and can read PRs', () => {
    const p = fm(t).permissions;
    if (!readOnly(p)) return 'Only read permissions for the agent.';
    if (typeof p === 'object' && (p['pull-requests'] !== 'read' || p.contents !== 'read')) return 'It needs `contents: read` and `pull-requests: read`.';
    return true;
  }),
  t.check('It has the GitHub tool for pull requests', () => {
    const gh = fm(t).tools?.github;
    if (!gh) return 'Add the GitHub tool: tools.github.toolsets.';
    const sets = gh.toolsets ?? ['default'];
    return (sets.includes('pull_requests') || sets.includes('default') || sets.includes('all')) || 'Include the pull_requests toolset.';
  }),
  t.check('Exactly one comment, nothing else', () => {
    const so = fm(t)['safe-outputs'] ?? {};
    const extra = Object.keys(so).filter((k) => WRITE_OUTPUTS.includes(k));
    if (extra.length) return `A reviewer must not: ${extra.join(', ')}.`;
    return so['add-comment']?.max === 1 || 'safe-outputs.add-comment.max must be 1.';
  }),
  t.check('Locked down: no shell, network, budget, timeout', () => {
    const d = fm(t);
    if (unrestrictedBash(d.tools)) return 'No unrestricted shell for a reviewer.';
    if (!d.network) return 'Add `network: defaults`.';
    const credits = Number(d['max-ai-credits']);
    if (!(credits > 0 && credits <= 200)) return 'Add `max-ai-credits` (200 or less).';
    const minutes = Number(d['timeout-minutes']);
    return (minutes > 0 && minutes <= 20) || 'Set `timeout-minutes` to 20 or less.';
  }),
  t.check('The instructions: PR number, AGENTS.md, a Severity table, a human decides', () => {
    const { body } = t.frontmatter(WF);
    const missing = [];
    if (!/github\.event\.pull_request\.number/.test(body)) missing.push('the PR number expression');
    if (!/AGENTS\.md/.test(body)) missing.push('follow AGENTS.md');
    if (!/\|[^\n]*severity/i.test(body)) missing.push('a table with a Severity column');
    if (!/\b(one|single|1)\b[\s*_]*comment/i.test(body)) missing.push('exactly one comment');
    if (!/(never|don.?t|do not)[^\n]*(approve|merge)/i.test(body)) missing.push('never approve or merge');
    return !missing.length || `The body is missing: ${missing.join('; ')}.`;
  }),
  t.check('gh aw compile --strict accepts it', () => compileStrict(t, 'pr-review'), { needs: ['gh-aw'], optional: true, env: true, timeout: 150000 }),
];
