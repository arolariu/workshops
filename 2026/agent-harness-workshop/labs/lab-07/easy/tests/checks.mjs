// Free checks for Lab 07 · easy.
import { readOnly, unrestrictedBash, WRITE_OUTPUTS, compileStrict } from './common.mjs';

const WF = '.github/workflows/issue-triage.md';
const fm = (t) => t.frontmatter(WF).data;

export default (t) => [
  t.check('It still triggers on new issues', () => {
    const types = fm(t).on?.issues?.types ?? [];
    return (Array.isArray(types) && types.includes('opened')) || 'Keep the trigger: on.issues.types must include "opened".';
  }),
  t.check('The agent is read-only', () => readOnly(fm(t).permissions) || 'No write permissions for the agent: every permission should be "read". Writes go through safe outputs.'),
  t.check('No unrestricted shell', () => !unrestrictedBash(fm(t).tools) || 'tools.bash allows every command. A triage bot needs no shell: remove it.'),
  t.check('Network locked down', () => Boolean(fm(t).network) || 'Add `network: defaults` so the agent cannot reach arbitrary websites.'),
  t.check('Only the outputs it needs', () => {
    const so = fm(t)['safe-outputs'] ?? {};
    const extra = Object.keys(so).filter((k) => WRITE_OUTPUTS.includes(k));
    if (extra.length) return `Remove these safe outputs, a triage bot doesn't need them: ${extra.join(', ')}.`;
    return ('add-labels' in so && 'add-comment' in so) || 'Keep add-labels and add-comment: the workflow must still do its job.';
  }),
  t.check('Labels: an allow-list and max 1', () => {
    const al = fm(t)['safe-outputs']?.['add-labels'] ?? {};
    if (!Array.isArray(al?.allowed) || !al.allowed.length) return 'Add `allowed: [...]` with the labels it may use.';
    if (al.allowed.length > 6) return 'Keep the allow-list short.';
    return al.max === 1 || 'Set add-labels.max to 1.';
  }),
  t.check('Comments: max 1', () => (fm(t)['safe-outputs']?.['add-comment']?.max === 1) || 'Set add-comment.max to 1.'),
  t.check('A budget and a time limit', () => {
    const d = fm(t);
    const credits = Number(d['max-ai-credits']);
    if (!(credits > 0 && credits <= 100)) return 'Add `max-ai-credits` (100 or less).';
    const minutes = Number(d['timeout-minutes']);
    return (minutes > 0 && minutes <= 15) || 'Set `timeout-minutes` to 15 or less.';
  }),
  t.check('The instructions still point at the issue', () => /github\.event\.issue\.number/.test(t.frontmatter(WF).body) || 'The body should still reference ${{ github.event.issue.number }}.'),
  t.check('gh aw compile --strict accepts it', () => compileStrict(t, 'issue-triage'), { needs: ['gh-aw'], optional: true, env: true, timeout: 150000 }),
];
