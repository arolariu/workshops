// Free checks for Lab 06 · medium. They load your extension with a stand-in for the Copilot SDK (no AI, no credits).
const EXT = '.github/extensions/studybuddy/extension.mjs';
const BAD = /undefined|NaN|TypeError|\[object Object\]/;

const load = (t) => t.loadExtension(EXT);
/** Run a command and return { out, levels }: the text it logged and the levels it used. */
async function run(ext, name, args) {
  const out = await ext.run(name, args);
  return { out, levels: ext.logs.map((l) => l.level) };
}
const isError = (r) => r.levels.includes('error');
const show = (s) => JSON.stringify(s.slice(0, 220));

export default (t) => [
  // M1 · /grades does the maths
  t.check('/grades is registered with a description', async () => {
    const cmd = (await load(t)).command('grades');
    if (!cmd) return 'No /grades command yet.';
    return String(cmd.description ?? '').length >= 10 || 'Give /grades a description (it shows in the command menu).';
  }, { milestone: 'M1' }),
  t.check('/grades SE201: to pass 5, for an 8: 7.25', async () => {
    const { out } = await run(await load(t), 'grades', 'SE201');
    if (!/Software Engineering/.test(out)) return `Show the course name. Got: ${show(out)}`;
    if (!/pass[^\n]*\b5\b/i.test(out)) return 'SE201: passing needs at least 5 on the exam (the exam rule). Show "To pass: at least 5 on the exam".';
    return /\b7\.25\b/.test(out) || `SE201: an 8 needs 7.25 on the exam. Got: ${show(out)}`;
  }, { milestone: 'M1' }),
  t.check('/grades AI210 and DB220: rounding is right', async () => {
    const ext = await load(t);
    const ai = (await run(ext, 'grades', 'AI210')).out;
    if (!/\b6\.8\b/.test(ai) || /6\.81/.test(ai)) return `AI210: an 8 needs exactly 6.8 (watch out for floating-point noise). Got: ${show(ai)}`;
    const db = (await run(ext, 'grades', 'DB220')).out;
    return /\b8\.4\b/.test(db) || `DB220: an 8 needs 8.4. Got: ${show(db)}`;
  }, { milestone: 'M1' }),
  t.check('/grades ma110: passing needs 5.67, an 8 is not reachable', async () => {
    const { out } = await run(await load(t), 'grades', 'ma110');
    if (!/5\.67/.test(out)) return `MA110 (course codes are case-insensitive): passing needs 5.67. Got: ${show(out)}`;
    return (/not reachable|out of reach|impossible/i.test(out) && /10\.67/.test(out)) || 'MA110: an 8 would need 10.67; say it is "not reachable" and show the number.';
  }, { milestone: 'M1' }),

  // M2 · Errors that help
  t.check('/grades without a course: a usage line with every course, logged as an error', async () => {
    const ext = await load(t);
    const r = await run(ext, 'grades', '');
    if (!/Usage: \/grades <course>/.test(r.out)) return `Show "Usage: /grades <course>". Got: ${show(r.out)}`;
    const missing = ['SE201', 'AI210', 'DB220', 'MA110', 'WEB230'].filter((c) => !r.out.includes(c));
    if (missing.length) return `List every course code in the usage message. Missing: ${missing.join(', ')}.`;
    if (!isError(r)) return 'Log problems with `session.log(text, { level: "error" })`, so the timeline shows them as errors.';
    const cmd = ext.command('grades');
    ext.logs.length = 0;
    try { await cmd.handler({ sessionId: 'harness-check', command: '/grades', commandName: 'grades' }); } catch (e) { return `/grades crashed when the CLI sent no "args" field: ${e.message}`; }
    const none = ext.logs.map((l) => l.msg).join('\n');
    return (/Usage/.test(none) && !BAD.test(none)) || `With no "args" field at all, show the usage line too. Got: ${show(none)}`;
  }, { milestone: 'M2' }),
  t.check('/grades XYZ999: names what was wrong and lists the courses', async () => {
    const r = await run(await load(t), 'grades', 'xyz999');
    if (!/XYZ999/i.test(r.out)) return `Say which course you didn't find ("XYZ999"). Got: ${show(r.out)}`;
    if (!/SE201/.test(r.out) || !/WEB230/.test(r.out)) return 'For an unknown course, list the course codes the student has.';
    if (BAD.test(r.out)) return `No internals in the message, please. Got: ${show(r.out)}`;
    return isError(r) || 'An unknown course is a problem: log it with level "error".';
  }, { milestone: 'M2' }),
  t.check('/grades SE21, se2011 and SE301: "Did you mean SE201?"', async () => {
    const ext = await load(t);
    for (const typo of ['SE21', 'se2011', 'SE301']) {
      const r = await run(ext, 'grades', typo);
      if (!/did you mean\W+SE201/i.test(r.out)) return `"${typo}" is one character away from SE201: suggest it ("Did you mean SE201?"). Got: ${show(r.out)}`;
    }
    const far = (await run(ext, 'grades', 'XYZ999')).out;
    return !/did you mean/i.test(far) || 'Only suggest a course when the code is one character away (XYZ999 is not close to anything).';
  }, { milestone: 'M2' }),
  t.check('/grades: one course at a time, and WEB230 has no grades yet', async () => {
    const ext = await load(t);
    const two = await run(ext, 'grades', 'SE201 AI210');
    if (!/Usage: \/grades <course>/.test(two.out) || !isError(two)) return `"/grades SE201 AI210": say it takes one course, show the usage line, and log it as an error. Got: ${show(two.out)}`;
    const web = await run(ext, 'grades', 'WEB230');
    if (!/no grades/i.test(web.out)) return `WEB230 has no grades yet; say so. Got: ${show(web.out)}`;
    return !isError(web) || 'No grades yet is not an error: log it as normal output (info).';
  }, { milestone: 'M2' }),

  // M3 · /due takes arguments
  t.check('/due still lists the next 7 days by default', async () => {
    const { out } = await run(await load(t), 'due', '');
    if (!/3NF/.test(out) || !/Sprint 2/.test(out)) return `/due (no arguments) should list the 3NF schema and the Sprint 2 demo. Got: ${show(out)}`;
    return !/Portfolio/.test(out) || 'The Portfolio page is 13 days away: not in the default 7 days.';
  }, { milestone: 'M3' }),
  t.check('/due 14, /due --course se201, /due 30 --course=SE201', async () => {
    const ext = await load(t);
    const d14 = (await run(ext, 'due', '14')).out;
    if (!/Portfolio/.test(d14) || /Code review/.test(d14)) return `/due 14: the Portfolio page (13 days) yes, the Code review exercise (19 days) no. Got: ${show(d14)}`;
    const se = (await run(ext, 'due', '--course se201')).out;
    if (!/Sprint 2/.test(se) || /3NF/.test(se)) return `/due --course se201: only SE201's items (case-insensitive). Got: ${show(se)}`;
    const both = (await run(ext, 'due', '30 --course=SE201')).out;
    const a = both.indexOf('Sprint 2');
    const b = both.indexOf('Code review');
    if (a < 0 || b < 0) return `/due 30 --course=SE201: both SE201 items (--course=CODE works too). Got: ${show(both)}`;
    if (a > b) return '/due: soonest first.';
    const none = await run(ext, 'due', '1');
    return (/nothing due/i.test(none.out) && /\b1 day\b/.test(none.out) && !/3NF/.test(none.out)) || `/due 1: nothing is due tomorrow; say "Nothing due in the next 1 day". Got: ${show(none.out)}`;
  }, { milestone: 'M3' }),
  t.check('/due rejects bad arguments with an error and the usage line', async () => {
    const ext = await load(t);
    for (const bad of ['abc', '0', '61', '2.5', '3 4', '--course', '--course XYZ999', '--soon', '-5']) {
      const r = await run(ext, 'due', bad);
      if (!/Usage: \/due \[days\] \[--course <code>\]/.test(r.out)) return `"/due ${bad}" should explain the problem and show "Usage: /due [days] [--course <code>]". Got: ${show(r.out)}`;
      if (!isError(r)) return `"/due ${bad}" is a problem: log it with level "error".`;
      if (BAD.test(r.out) || /Sprint 2|3NF/.test(r.out)) return `"/due ${bad}" should not list anything (or print internals). Got: ${show(r.out)}`;
    }
    const unknown = (await run(ext, 'due', '--course XYZ999')).out;
    return /SE201/.test(unknown) || 'For an unknown course, list the course codes.';
  }, { milestone: 'M3' }),
];
