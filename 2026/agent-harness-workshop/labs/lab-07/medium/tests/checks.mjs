// Free checks for Lab 07 · medium.
import { readOnly, compileStrict } from './common.mjs';

const WF = '.github/workflows/issue-triage.md';

export default (t) => [
  t.check('The instructions ask bug reporters for OS and Node.js version', () => {
    const { body } = t.frontmatter(WF);
    if (!/bug/i.test(body)) return 'Mention bug reports in the instructions.';
    if (!/operating system|\bOS\b/i.test(body)) return 'Ask for the operating system (OS).';
    return /node(\.js)?\b[^\n]*version|version[^\n]*node/i.test(body) || 'Ask for the Node.js version.';
  }),
  t.check('"good first issue" is an allowed label', () => {
    const allowed = t.frontmatter(WF).data['safe-outputs']?.['add-labels']?.allowed ?? [];
    return (Array.isArray(allowed) && allowed.includes('good first issue')) || 'Add "good first issue" to safe-outputs.add-labels.allowed (quote it in YAML).';
  }),
  t.check('The workflow is still safe', () => {
    const d = t.frontmatter(WF).data;
    if (!readOnly(d.permissions)) return 'The agent must stay read-only.';
    if (d['safe-outputs']?.['add-labels']?.max !== 1) return 'Keep add-labels.max at 1.';
    return d['safe-outputs']?.['add-comment']?.max === 1 || 'Keep add-comment.max at 1.';
  }),
  t.check('NOTES.md explains which change needs a recompile', () => {
    const s = t.need('NOTES.md', 'Create NOTES.md with your explanation.');
    if (!/frontmatter/i.test(s) || !/body|instructions/i.test(s)) return 'Talk about both parts: the frontmatter and the body.';
    return /compile/i.test(s) || 'Say which change needs `gh aw compile`.';
  }),
  t.check('gh aw compile --strict accepts it', () => compileStrict(t, 'issue-triage'), { needs: ['gh-aw'], optional: true, env: true, timeout: 150000 }),
];
