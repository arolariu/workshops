// Free checks for Lab 00 · medium.
const expectError = (fn, type, label) => {
  try { fn(); } catch (e) { return e instanceof type ? null : `${label} threw ${e.name}, expected ${type.name}.`; }
  return `${label} did not throw (expected ${type.name}).`;
};

export default (t) => [
  t.check('PLAN.md holds a real plan (3+ steps)', () => {
    const s = t.need('PLAN.md', 'Save the plan to `PLAN.md` (ask Copilot: "save this plan to PLAN.md").');
    const steps = s.split('\n').filter((l) => /^\s*(\d+[.)]|[-*])\s+\S/.test(l)).length;
    return steps >= 3 || `PLAN.md has ${steps} step(s). A plan needs at least 3 numbered or bulleted steps.`;
  }),
  t.check('grades.js exports gpa()', async () => {
    const m = await t.import('grades.js');
    return typeof m.gpa === 'function' || '`grades.js` has no exported `gpa` function yet.';
  }),
  t.check('gpa() weights by credits and rounds to 2 decimals', async () => {
    const { gpa } = await t.import('grades.js');
    if (typeof gpa !== 'function') return 'No gpa() yet.';
    const cases = [
      [[{ credits: 6, finalGrade: 9 }, { credits: 4, finalGrade: 7 }], 8.2],
      [[{ credits: 5, finalGrade: 8 }, { credits: 5, finalGrade: 7 }, { credits: 5, finalGrade: 7 }], 7.33],
      [[{ credits: 3, finalGrade: 10 }], 10],
    ];
    for (const [input, want] of cases) {
      let got;
      try { got = gpa(input); } catch (e) { return `gpa(${JSON.stringify(input)}) threw ${e.name}: ${e.message}`; }
      if (got !== want) return `gpa(${JSON.stringify(input)}) returned ${got}, expected ${want}.`;
    }
    return true;
  }),
  t.check('gpa() rejects bad input with the right error types', async () => {
    const { gpa } = await t.import('grades.js');
    if (typeof gpa !== 'function') return 'No gpa() yet.';
    return expectError(() => gpa('nope'), TypeError, 'gpa("nope")')
      ?? expectError(() => gpa([]), RangeError, 'gpa([])')
      ?? expectError(() => gpa([{ credits: 5, finalGrade: 11 }]), RangeError, 'A final grade of 11')
      ?? expectError(() => gpa([{ credits: 0, finalGrade: 8 }]), RangeError, '0 credits')
      ?? expectError(() => gpa([{ credits: 2.5, finalGrade: 8 }]), RangeError, '2.5 credits')
      ?? true;
  }),
  t.check('grades.test.js has tests for gpa()', () =>
    /gpa\s*\(/.test(t.read('grades.test.js') ?? '') || 'Add at least one test for gpa() in grades.test.js.'),
  t.check('npm test is green', () => {
    const r = t.unitTests();
    return (r.fail === 0 && r.pass > 0) || `${r.fail} test(s) fail: ${r.failing.slice(0, 3).join(' | ')}`;
  }),
];
