// Free checks for Lab 02 · medium.
const SKILL = '.github/skills/explain-error/SKILL.md';

export default (t) => [
  t.check('SKILL.md exists in .github/skills/explain-error/', () => t.exists(SKILL) || `Create \`${SKILL}\`.`),
  t.check('Frontmatter: name, a what + when description, an argument-hint', () => {
    const { data } = t.frontmatter(SKILL);
    if (data.name !== 'explain-error') return `name should be "explain-error", got "${data.name ?? ''}".`;
    const d = String(data.description ?? '');
    if (d.length < 40 || !/\bwhen\b/i.test(d)) return 'Write a description that says what the skill does and when to use it ("Use when ...").';
    return Boolean(String(data['argument-hint'] ?? '').trim()) || 'Add an `argument-hint:` so users know what to pass.';
  }),
  t.check('Numbered steps that find the right frame and line', () => {
    const { body } = t.frontmatter(SKILL);
    const steps = body.split('\n').filter((l) => /^\s*\d+[.)]\s+\S/.test(l)).length;
    if (steps < 3) return `Found ${steps} numbered step(s); write at least 3.`;
    return (/line/i.test(body) && /(frame|stack)/i.test(body)) || 'Tell the agent how to pick the stack frame and open the file at that line.';
  }),
  t.check('The answer format has Cause, Where and Fix', () => {
    const { body } = t.frontmatter(SKILL);
    const missing = ['Cause', 'Where', 'Fix'].filter((h) => !new RegExp(`^#{1,4}\\s*\\W*\\s*${h}\\b`, 'im').test(body));
    return !missing.length || `Add these headings to the answer format: ${missing.map((h) => `### ${h}`).join(', ')}.`;
  }),
  t.check('Copilot lists the skill', () => {
    const r = t.copilot(['skill', 'list', '--json']);
    let list = [];
    try { list = JSON.parse(r.stdout); } catch { return `Could not read the skill list: ${r.all.trim().slice(0, 160)}`; }
    return list.some((s) => s.name === 'explain-error' && s.source === 'project') || 'Copilot does not list explain-error as a project skill.';
  }, { needs: ['copilot'] }),
  t.check('summary() handles courses without grades', async () => {
    const { summary } = await t.import('report.js');
    for (const course of [{ code: 'WEB230', name: 'Web Development' }, { code: 'WEB230', name: 'Web Development', grades: [] }]) {
      let lines;
      try { lines = summary([course]); } catch (e) { return `summary() still crashes: ${e.message}`; }
      if (!/no grades yet/i.test(lines?.[0] ?? '')) return `Expected "WEB230 Web Development: no grades yet", got "${lines?.[0]}".`;
    }
    return true;
  }),
  t.check('report.test.js has a regression test', () => {
    const s = t.read('report.test.js') ?? '';
    const tests = (s.match(/\btest\s*\(/g) ?? []).length;
    return (tests >= 2 && /no grades/i.test(s)) || 'Add a test for a course without grades to report.test.js.';
  }),
  t.check('npm test is green', () => {
    const r = t.unitTests();
    return (r.fail === 0 && r.pass > 0) || `${r.fail} failing: ${r.failing.slice(0, 2).join(' | ')}`;
  }),
];
