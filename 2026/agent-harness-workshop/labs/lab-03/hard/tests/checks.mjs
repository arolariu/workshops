// Free checks for Lab 03 · hard.
const AGENT = '.github/agents/fixer.agent.md';
const toolList = (data) => (Array.isArray(data.tools) ? data.tools : String(data.tools ?? '').split(',')).map((x) => String(x).trim().toLowerCase()).filter(Boolean);
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
const load = (t) => t.import('scripts/review-loop.mjs');
const capOk = (a) => { const c = Number(flag(a, '--max-ai-credits')); return c >= 30 && c <= 100; };

export default (t) => [
  t.check('The fixer agent can read, edit and run', () => {
    const { data } = t.frontmatter(AGENT, `Create \`${AGENT}\`.`);
    if (String(data.description ?? '').length < 20) return 'Write a description: what it does and when to use it.';
    const tools = toolList(data);
    const missing = [['read', ['read', 'view']], ['edit', ['edit']], ['execute', ['execute', 'shell', 'bash', 'powershell']]].filter(([, alts]) => !alts.some((a) => tools.includes(a))).map(([k]) => k);
    return !missing.length || `Add these tools: ${missing.join(', ')}.`;
  }),
  t.check('The fixer sticks to the findings, tests every fix, never pushes', () => {
    const { body } = t.frontmatter(AGENT);
    const missing = [];
    if (!/only/i.test(body) || !/finding|review/i.test(body)) missing.push('fix only the review findings');
    if (!/test/i.test(body)) missing.push('add a test per fix');
    if (!/npm test/.test(body)) missing.push('run npm test');
    if (!/push/i.test(body)) missing.push('never git push');
    return !missing.length || `Its instructions should say: ${missing.join('; ')}.`;
  }),
  t.check('verdict() reads the last verdict line', async () => {
    const { verdict } = await load(t);
    const cases = [
      ['| a | b |\nVERDICT: CLEAN', 'CLEAN'],
      ['Found things.\nVERDICT: ISSUES\n', 'ISSUES'],
      ['verdict: clean', 'CLEAN'],
      ['If it were fine I would say "VERDICT: CLEAN".\nVERDICT: ISSUES', 'ISSUES'],
      ['No verdict here.', 'UNKNOWN'],
      ['', 'UNKNOWN'],
    ];
    for (const [text, want] of cases) {
      const got = verdict(text);
      if (got !== want) return `verdict(${JSON.stringify(text)}) returned ${got}, expected ${want}.`;
    }
    return true;
  }),
  t.check('reviewerArgs(): the reviewer, read-only, capped', async () => {
    const { reviewerArgs } = await load(t);
    const a = reviewerArgs('deadlines.js');
    if (!a.length) return 'reviewerArgs() returns nothing yet.';
    if (flag(a, '--agent') !== 'reviewer') return 'Run the reviewer agent (--agent reviewer).';
    if (!/deadlines\.js/.test(flag(a, '-p') ?? '')) return 'The -p prompt should name the file to review.';
    if (norm(a).some((x) => /^--allow-tool=.*write/.test(x)) || a.some((x) => /^--(allow-all|yolo)/.test(x))) return 'The reviewer must not get write permission.';
    if (!a.includes('-s')) return 'Add -s: the loop parses the answer, not the stats.';
    return capOk(a) || 'Add a credit cap (--max-ai-credits, 30-100).';
  }),
  t.check('fixerArgs(): the fixer, may write and npm, never push', async () => {
    const { fixerArgs } = await load(t);
    const a = fixerArgs('deadlines.js', '.agent-logs/review-1.md');
    if (!a.length) return 'fixerArgs() returns nothing yet.';
    if (flag(a, '--agent') !== 'fixer') return 'Run the fixer agent (--agent fixer).';
    if (!(flag(a, '-p') ?? '').includes('.agent-logs/review-1.md')) return 'Put the review path in the -p prompt so the fixer can read it.';
    const n = norm(a);
    if (!n.includes('--allow-tool=write')) return 'The fixer needs --allow-tool=write.';
    if (!n.some((x) => /^--allow-tool=shell\(npm/.test(x))) return 'Allow npm: --allow-tool=shell(npm:*).';
    if (!n.includes('--deny-tool=shell(git push)')) return 'Deny pushing: --deny-tool=shell(git push).';
    if (a.some((x) => /^--(allow-all|yolo|allow-all-tools)/.test(x))) return 'No --allow-all in a loop!';
    return capOk(a) || 'Add a credit cap (--max-ai-credits, 30-100).';
  }),
  t.check('The dry run shows both agents', () => {
    const r = t.node(['scripts/review-loop.mjs', 'deadlines.js', '--dry-run']);
    return (/--agent reviewer/.test(r.stdout) && /--agent fixer/.test(r.stdout)) || `The dry run should print both commands. ${r.stderr.trim().slice(0, 200)}`;
  }),
];
