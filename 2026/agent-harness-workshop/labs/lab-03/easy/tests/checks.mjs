const READ_ONLY = ['read', 'search', 'view', 'glob', 'grep', 'rg'];
const toolList = (data) => (Array.isArray(data.tools) ? data.tools : String(data.tools ?? '').split(',')).map((x) => String(x).trim().toLowerCase()).filter(Boolean);

const AGENT = '.github/agents/reviewer.agent.md';

export default (t) => [
  t.check('The reviewer agent file exists', () => t.exists(AGENT) || `Create \`${AGENT}\`.`),
  t.check('It has a description and an explicit tools list', () => {
    const { data } = t.frontmatter(AGENT);
    if (String(data.description ?? '').length < 20) return 'Write a description: what the agent is for (the main agent reads it to decide when to delegate).';
    return toolList(data).length > 0 || 'Add a `tools:` list. Without it, the agent gets every tool!';
  }),
  t.check('Its tools are read-only', () => {
    const tools = toolList(t.frontmatter(AGENT).data);
    const extra = tools.filter((x) => !READ_ONLY.includes(x));
    if (extra.length) return `These tools let it change things: ${extra.join(', ')}. A reviewer only needs to read and search.`;
    return tools.includes('read') || tools.includes('view') || 'It needs to read files: add `read`.';
  }),
  t.check('Its instructions define what to look for and a table', () => {
    const { body } = t.frontmatter(AGENT);
    const bullets = body.split('\n').filter((l) => /^\s*([-*]|\d+[.)])\s+\S/.test(l)).length;
    if (bullets < 3) return 'List at least 3 things the reviewer should look for.';
    const header = body.split('\n').find((l) => /^\s*\|.*severity.*\|/i.test(l)) ?? '';
    return /location|file|line/i.test(header) || 'Define the output as a table with Severity and Location (file:line) columns.';
  }),
  t.check('REVIEW.md holds the findings for deadlines.js', () => {
    const s = t.need('REVIEW.md', 'Save the reviewer\'s table to `REVIEW.md` (the reviewer can\'t, so who can?).');
    const rows = s.split('\n').filter((l) => /^\s*\|/.test(l) && !/^\s*\|\s*-/.test(l)).length - 1;
    if (rows < 2) return `REVIEW.md has ${Math.max(rows, 0)} finding row(s). Expected a table with at least 2 findings.`;
    const found = [/done/i, /utc|time ?zone|toISOString|local/i, /invalid|nan|validat/i].filter((re) => re.test(s)).length;
    return found >= 2 || 'The review misses the real problems. Hint: look at "done" items and at time zones.';
  }),
];
