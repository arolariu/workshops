// Free checks for Lab 02 · medium: a command you call by name.
const SKILL = '.github/skills/explain-error/SKILL.md';
const stepCount = (body) => body.split('\n').filter((l) => /^\s*\d+[.)]\s+\S/.test(l)).length;
// Only the fence lines go: an answer template is usually written inside a ```markdown block, and its headings count.
const prose = (body) => body.split('\n').filter((l) => !/^\s*(```|~~~)/.test(l)).join('\n');
const heading = (body, h) => prose(body).search(new RegExp(`^[ \\t>]*#{1,4}\\s*\\W*\\s*${h}\\b`, 'im'));

/** The comment that justifies `disable-model-invocation`: on its line, or the comment lines right above it. */
function justification(raw) {
  const lines = raw.split('\n');
  const i = lines.findIndex((l) => /^\s*disable-model-invocation\s*:/.test(l));
  if (i < 0) return '';
  const words = [];
  const same = lines[i].match(/\s#\s*(.*)$/);
  if (same) words.push(same[1]);
  for (let j = i - 1; j >= 0 && /^\s*#/.test(lines[j]); j--) words.unshift(lines[j].replace(/^\s*#\s*/, ''));
  return words.join(' ').trim();
}

export default (t) => [
  // M1 · Called by name
  t.check('Frontmatter: name, and a description that says what and when', () => {
    const { data } = t.frontmatter(SKILL, `Create \`${SKILL}\`.`);
    if (data.name !== 'explain-error') return `name should be "explain-error" (the folder name), got "${data.name ?? ''}".`;
    const d = String(data.description ?? '');
    return (d.length >= 40 && /\bwhen\b/i.test(d)) || 'Write a description that says what the skill does and when to use it ("… Use when the user pastes …").';
  }, { milestone: 'M1' }),
  t.check('An argument-hint that shows both ways to call it', () => {
    const { data } = t.frontmatter(SKILL);
    const hint = String(data['argument-hint'] ?? '').trim();
    if (!hint) return 'Add an `argument-hint`, the grey placeholder people see after typing /explain-error.';
    return (/file|path/i.test(hint) && /error|trace|message|crash/i.test(hint)) || `The hint "${hint}" should show both forms: an error message, or a file that contains one.`;
  }, { milestone: 'M1' }),
  t.check('Copilot lists the skill', () => {
    const r = t.copilot(['skill', 'list', '--json']);
    let list = [];
    try { list = JSON.parse(r.stdout); } catch { return `Could not read the skill list: ${r.all.trim().slice(0, 160)}`; }
    return list.some((s) => s.name === 'explain-error' && s.source === 'project') || 'Copilot does not list explain-error as a project skill.';
  }, { milestone: 'M1', needs: ['copilot'] }),

  // M2 · An output contract
  t.check('Numbered steps that open the file at the right line', () => {
    const { body } = t.frontmatter(SKILL);
    const n = stepCount(body);
    if (n < 3) return `Found ${n} numbered step(s); write at least 3.`;
    return (/line/i.test(body) && /(frame|stack)/i.test(body)) || 'Tell the agent how to pick the stack frame and open the file at that line.';
  }, { milestone: 'M2' }),
  t.check('The answer: Cause, Where and Fix, in this order, and only those', () => {
    const { body } = t.frontmatter(SKILL);
    const at = ['Cause', 'Where', 'Fix'].map((h) => [h, heading(body, h)]);
    const missing = at.filter(([, i]) => i < 0).map(([h]) => `### ${h}`);
    if (missing.length) return `Add these headings to the answer format: ${missing.join(', ')}.`;
    if (!(at[0][1] < at[1][1] && at[1][1] < at[2][1])) return 'Put the sections in this order: Cause, then Where, then Fix.';
    return /\bexactly\b|nothing else|\bonly\b/i.test(prose(body)) || 'Make it a contract: say the answer has exactly these sections, in this order.';
  }, { milestone: 'M2' }),
  t.check('Where is a file:line relative to the project', () => {
    const { body } = t.frontmatter(SKILL);
    if (!/<?\b(file|path)>?:<?line\b/i.test(body)) return 'Say what Where looks like: `<file>:<line>`.';
    return /relative|project root/i.test(body) || 'Say the path is relative to the project root (a stack trace prints file:///home/… paths that mean nothing on your machine).';
  }, { milestone: 'M2' }),
  t.check('A rule for each kind of crash', () => {
    const { body } = t.frontmatter(SKILL);
    const missing = [
      ['skip frames that aren\'t ours (node:internal, node_modules)', /node:internal|node_modules/i],
      ['an error our own code threw on purpose (validation): the bug is in the caller', /caller|calls? it|called it|next (project )?frame|one frame (up|down)/i],
      ['no project frame at all (a SyntaxError before anything runs): use the file:line on the first line', /no (project )?frame|first line|syntaxerror|before (the program|anything) runs/i],
    ].filter(([, re]) => !re.test(body)).map(([what]) => what);
    return !missing.length || `The steps don't say what to do when: ${missing.join('; ')}. Look at the three files in fixtures/.`;
  }, { milestone: 'M2' }),

  // M3 · Who may call it
  t.check('A decision: may the model call it on its own?', () => {
    const { data, raw } = t.frontmatter(SKILL);
    const v = data['disable-model-invocation'];
    if (typeof v !== 'boolean') return 'Decide, and write it down: `disable-model-invocation: true` (only people call it) or `false` (the model may too). Say it even when it is the default.';
    const why = justification(raw);
    const words = why.split(/\s+/).filter(Boolean).length;
    return words >= 6 || `Justify the choice in a YAML comment next to it (\`# …\` on that line or the line above), in a sentence: ${words ? `"${why}" is too short` : 'there is none yet'}.`;
  }, { milestone: 'M3' }),
  t.check('The description and the steps match the decision', () => {
    const { data, body } = t.frontmatter(SKILL);
    const v = data['disable-model-invocation'];
    if (typeof v !== 'boolean') return 'First decide (see the check above).';
    const d = String(data.description ?? '');
    if (v === false) return /stack trace|crash|exception|error message|traceback/i.test(d) || 'The model may call it on its own, so the description must name what triggers it: a stack trace, a crash, an error message.';
    return /\/explain-error\b/.test(`${d}\n${body}`) || 'Only people can call it now, so tell them how: mention `/explain-error` in the description or the steps.';
  }, { milestone: 'M3' }),

  // M4 · Three crashes, three fixes
  t.check('summary() handles courses without grades', async () => {
    const { summary } = await t.import('report.js');
    for (const course of [{ code: 'WEB230', name: 'Web Development' }, { code: 'WEB230', name: 'Web Development', grades: [] }]) {
      let lines;
      try { lines = summary([course]); } catch (e) { return `summary() still crashes: ${e.message} (fixtures/crash.txt).`; }
      if (!/no grades yet/i.test(lines?.[0] ?? '')) return `Expected "WEB230 Web Development: no grades yet", got "${lines?.[0]}".`;
    }
    return true;
  }, { milestone: 'M4' }),
  t.check('attendanceLines() handles courses without sessions, in the caller', async () => {
    const { attendanceLines } = await t.import('report.js');
    if (typeof attendanceLines !== 'function') return 'report.js should still export attendanceLines().';
    const sessions = [{ attended: true }, { attended: true }, { attended: false }];
    const ok = attendanceLines([{ code: 'SE201', name: 'Software Engineering', sessions }])?.[0];
    if (ok !== 'SE201 Software Engineering: 66.7% attendance') return `Expected "SE201 Software Engineering: 66.7% attendance", got "${ok}".`;
    for (const course of [{ code: 'WEB230', name: 'Web Development', sessions: [] }, { code: 'WEB230', name: 'Web Development' }]) {
      let lines;
      try { lines = attendanceLines([course]); } catch (e) { return `attendanceLines() still crashes: ${e.message} (fixtures/crash-attendance.txt).`; }
      if (!/no sessions yet/i.test(lines?.[0] ?? '')) return `Expected "WEB230 Web Development: no sessions yet", got "${lines?.[0]}".`;
    }
    const { attendanceRate } = await t.import('attendance.js');
    try { attendanceRate([]); } catch (e) { return e instanceof RangeError || `attendanceRate([]) threw ${e.name}; keep its RangeError.`; }
    return 'attendanceRate([]) no longer throws. The validation was right: fix the caller in report.js, and keep the RangeError.';
  }, { milestone: 'M4' }),
  t.check('node print-report.js prints the whole report', () => {
    const r = t.node(['print-report.js']);
    if (r.code !== 0) return `print-report.js crashed: ${(r.stderr.split('\n').find((l) => /Error/.test(l)) ?? r.stderr.trim().split('\n')[0] ?? '').trim()}. Run /explain-error on it.`;
    const want = ['SE201 Software Engineering: 8.5', 'WEB230 Web Development: no grades yet', 'SE201 Software Engineering: 66.7% attendance', 'WEB230 Web Development: no sessions yet', 'Due 2026-10-21: Sprint 2 demo'];
    const missing = want.filter((l) => !r.stdout.includes(l));
    return !missing.length || `The report misses: ${missing.join(' | ')}.`;
  }, { milestone: 'M4' }),
  t.check('report.test.js has a regression test for each crash in report.js', () => {
    const s = t.read('report.test.js') ?? '';
    const tests = (s.match(/\btest\s*\(/g) ?? []).length;
    const missing = [['a course without grades', /no grades/i], ['a course without sessions', /no sessions/i]].filter(([, re]) => !re.test(s)).map(([w]) => w);
    if (missing.length) return `Add a test to report.test.js for: ${missing.join(' and ')}.`;
    return tests >= 3 || `report.test.js has ${tests} test(s); keep the old one and add one per crash.`;
  }, { milestone: 'M4' }),
  t.check('npm test is green', () => {
    const r = t.unitTests();
    return (r.fail === 0 && r.pass > 0) || `${r.fail} failing: ${r.failing.slice(0, 2).join(' | ')}`;
  }, { milestone: 'M4' }),
];
