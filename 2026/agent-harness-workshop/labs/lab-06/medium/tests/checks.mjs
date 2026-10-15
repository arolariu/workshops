// Free checks for Lab 06 · medium. The checks load your extension with a stand-in for the Copilot SDK.
const EXT = '.github/extensions/studybuddy/extension.mjs';

export default (t) => [
  t.check('The extension loads and joins the session', async () => {
    const ext = await t.loadExtension(EXT);
    return ext.commands.length > 0 || 'joinSession() was called without commands.';
  }),
  t.check('/due still works', async () => {
    const out = await (await t.loadExtension(EXT)).run('due');
    return (/3NF/.test(out) && /Sprint 2/.test(out)) || `Unexpected /due output: ${out.slice(0, 160)}`;
  }),
  t.check('/grades is registered with a description', async () => {
    const cmd = (await t.loadExtension(EXT)).command('grades');
    if (!cmd) return 'No /grades command yet.';
    return String(cmd.description ?? '').length >= 10 || 'Give /grades a description (it shows in the command menu).';
  }),
  t.check('/grades SE201: to pass 5, for an 8: 7.25', async () => {
    const out = await (await t.loadExtension(EXT)).run('grades', 'SE201');
    if (!/Software Engineering/.test(out)) return `Show the course name. Got: ${out.slice(0, 160)}`;
    if (!/pass[^\n]*\b5\b/i.test(out)) return 'SE201: passing needs at least 5 on the exam (the exam rule). Show "To pass: at least 5 on the exam".';
    return /\b7\.25\b/.test(out) || `SE201: an 8 needs 7.25 on the exam. Got: ${out.slice(0, 200)}`;
  }),
  t.check('/grades AI210 and DB220: rounding is right', async () => {
    const ext = await t.loadExtension(EXT);
    const ai = await ext.run('grades', 'AI210');
    if (!/\b6\.8\b/.test(ai) || /6\.81/.test(ai)) return `AI210: an 8 needs exactly 6.8 (watch out for floating-point noise). Got: ${ai.slice(0, 200)}`;
    const db = await ext.run('grades', 'DB220');
    return /\b8\.4\b/.test(db) || `DB220: an 8 needs 8.4. Got: ${db.slice(0, 200)}`;
  }),
  t.check('/grades MA110: passing needs 5.67, an 8 is not reachable', async () => {
    const out = await (await t.loadExtension(EXT)).run('grades', 'ma110');
    if (!/5\.67/.test(out)) return `MA110 (case-insensitive!): passing needs 5.67. Got: ${out.slice(0, 200)}`;
    return (/not reachable|out of reach|impossible/i.test(out) && /10\.67/.test(out)) || 'MA110: an 8 would need 10.67; say it is "not reachable".';
  }),
  t.check('/grades handles no grades, no argument and unknown courses', async () => {
    const ext = await t.loadExtension(EXT);
    const web = await ext.run('grades', 'WEB230');
    if (!/no grades/i.test(web)) return `WEB230 has no grades yet; say so. Got: ${web.slice(0, 160)}`;
    const none = await ext.run('grades', '');
    if (!/SE201/.test(none) || !/WEB230/.test(none)) return 'Without an argument, show a usage line with the course codes.';
    const bad = await ext.run('grades', 'XYZ999');
    return (/SE201/.test(bad) && !/undefined|TypeError/i.test(bad)) || 'For an unknown course, say so and list the courses.';
  }),
];
