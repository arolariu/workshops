// Free checks for Lab 02 · easy.
const SKILL = '.github/skills/new-module/SKILL.md';

export default (t) => [
  t.check('SKILL.md exists in the new-module folder', () => t.exists(SKILL) || `Create \`${SKILL}\` (the templates are already in that folder).`),
  t.check('Frontmatter: name matches the folder', () => {
    const { data } = t.frontmatter(SKILL);
    return data.name === 'new-module' || `The name should be "new-module" (the folder name), got "${data.name ?? ''}".`;
  }),
  t.check('The description says what AND when', () => {
    const { data } = t.frontmatter(SKILL);
    const d = String(data.description ?? '');
    if (d.length < 40) return 'The description is too short. Say what the skill does and when to use it.';
    return /\bwhen\b/i.test(d) || 'Add the trigger: "... Use when the user asks for ..."';
  }),
  t.check('The steps use both templates', () => {
    const { body } = t.frontmatter(SKILL);
    const steps = body.split('\n').filter((l) => /^\s*\d+[.)]\s+\S/.test(l)).length;
    if (steps < 4) return `Found ${steps} numbered step(s). Write the recipe as numbered steps.`;
    const both = /module\.template\.js/.test(body) && /module\.test\.template\.js/.test(body);
    return both || 'Point to both templates by path (module.template.js and module.test.template.js).';
  }),
  t.check('The recipe covers index.js, README.md and npm test', () => {
    const { body } = t.frontmatter(SKILL);
    const missing = [['index.js', /index\.js/], ['README.md', /README/], ['npm test', /npm test/]].filter(([, re]) => !re.test(body)).map(([k]) => k);
    return !missing.length || `The recipe forgets: ${missing.join(', ')}.`;
  }),
  t.check('Copilot lists the skill', () => {
    const r = t.copilot(['skill', 'list', '--json']);
    let list = [];
    try { list = JSON.parse(r.stdout); } catch { return `Could not read the skill list: ${r.all.trim().slice(0, 160)}`; }
    return list.some((s) => s.name === 'new-module' && s.source === 'project') || 'Copilot does not list new-module as a project skill.';
  }, { needs: ['copilot'] }),
  t.check('attendanceRate() works', async () => {
    const m = await t.import('attendance.js');
    if (typeof m.attendanceRate !== 'function') return 'attendance.js should export attendanceRate().';
    const got = m.attendanceRate([{ attended: true }, { attended: false }, { attended: true }]);
    if (got !== 66.7) return `attendanceRate(2 of 3) returned ${got}, expected 66.7.`;
    try { m.attendanceRate([]); } catch (e) { return e instanceof RangeError || `An empty list threw ${e.name}, expected RangeError.`; }
    return 'An empty list should throw a RangeError.';
  }),
  t.check('It was built the recipe way', () => {
    const missing = [];
    if (!/^\/\/ StudyBuddy attendance/m.test(t.read('attendance.js') ?? '')) missing.push('the "// StudyBuddy attendance:" header from the template');
    if (!t.exists('attendance.test.js')) missing.push('attendance.test.js');
    if (!/attendance\.js/.test(t.read('index.js') ?? '')) missing.push('the export in index.js');
    if (!/attendance/i.test(t.read('README.md') ?? '')) missing.push('a line in README.md');
    return !missing.length || `Missing: ${missing.join('; ')}. Is the recipe in your skill complete?`;
  }),
  t.check('npm test is green', () => {
    const r = t.unitTests();
    return (r.fail === 0 && r.pass > 0) || `${r.fail} failing: ${r.failing.slice(0, 2).join(' | ')}`;
  }),
];
