// Free checks for Lab 00 · medium: think first. The slash commands (/plan, /diff, /rewind, /usage) are interactive,
// so the checks judge what they leave behind: the GPA feature, its tests, and PLAN.md.
const expectError = (fn, type, label) => {
  try { fn(); } catch (e) { return e instanceof type ? null : `${label} threw ${e.name}, expected ${type.name}.`; }
  return `${label} did not throw (expected ${type.name}).`;
};

/** The body of a "## Title" section of PLAN.md (up to the next "## "), without HTML comments; null when missing. */
function section(text, title) {
  const parts = text.split(/^##\s+/m).slice(1);
  const hit = parts.find((p) => p.split('\n')[0].trim().toLowerCase().startsWith(title.toLowerCase()));
  return hit == null ? null : hit.split('\n').slice(1).join('\n').replace(/<!--[\s\S]*?-->/g, '').trim();
}
const plan = (t) => t.need('PLAN.md', 'PLAN.md is missing: it ships with the level (start over with x if you deleted it).');
const need = (t, title) => {
  const body = section(plan(t), title);
  if (body == null) t.fail(`PLAN.md has no "## ${title}" section. Keep the four headings of the starter: Plan, Review, Rewind, Usage.`);
  return body;
};

// "4.1", "1,234", "45.3k", "1.2M" → a number; anything else → NaN.
const number = (cell) => {
  const m = String(cell).trim().replace(/,/g, '').match(/^~?\s*(\d+(?:\.\d+)?)\s*([kKmM]?)$/);
  if (!m) return NaN;
  return Number(m[1]) * ({ k: 1e3, m: 1e6 }[m[2].toLowerCase()] ?? 1);
};
/** The usage table: header cells and { run → cells } for its rows. */
function usageTable(body) {
  const rows = body.split('\n').filter((l) => /^\s*\|/.test(l)).map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
  if (rows.length < 2) return null;
  const [head, ...rest] = rows;
  return { head: head.map((h) => h.toLowerCase()), rows: rest.filter((r) => !r.every((c) => /^:?-+:?$/.test(c))) };
}

export function liveStepClaimed(live, step) {
  const escaped = step.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const line = live.split('\n').find((l) => new RegExp(escaped, 'i').test(l));
  return Boolean(line && /^\s*-\s*\[[xX]\]/.test(line));
}
export function validateUsageEvidence(live, usageBody) {
  if (!liveStepClaimed(live, '/usage')) {
    const hasUnclaimed = /\b(?:N\/A|not performed|unclaimed|live evidence not claimed)\b/i.test(live)
      || /\b(?:N\/A|not performed|unclaimed)\b/i.test(usageBody);
    return hasUnclaimed || 'Mark /usage unclaimed and use N/A until an actual live run supplies both rows.';
  }
  const table = usageTable(usageBody);
  if (!table) return 'Claimed live /usage evidence needs the usage table.';
  const col = (re) => table.head.findIndex((h) => re.test(h));
  const cols = { credits: col(/credit|premium/), input: col(/input/), output: col(/output/) };
  if (Object.values(cols).some((i) => i < 0)) return 'Keep the columns: Run, AI credits (or Premium requests), Input tokens, Output tokens.';
  for (const run of ['plan-first', 'direct']) {
    const row = table.rows.find((r) => r[0]?.toLowerCase().replace(/[`*]/g, '') === run);
    if (!row) return `The claimed live table has no "${run}" row.`;
    for (const [name, i] of Object.entries(cols)) {
      if (!(number(row[i]) > 0)) return `${run}'s ${name} value must be numeric when /usage is claimed live.`;
    }
  }
  return true;
}

export default (t) => [
  t.check('PLAN.md separates automated checks from actual live-step evidence', () => {
    const body = plan(t);
    if (!/## Live steps/i.test(body)) return 'Add a "## Live steps" section listing /plan, /diff, /rewind and /usage. Leave it unchecked/not performed until each action happened.';
    if (!/## Automated checks/i.test(body)) return 'Add a "## Automated checks" section so free checks are not claimed as live interaction evidence.';
    const review = need(t, 'Review');
    const live = section(body, 'Live steps') ?? '';
    for (const step of ['/plan', '/diff', '/rewind', '/usage']) {
      const line = live.split('\n').find((l) => new RegExp(step.replace('/', '\\/'), 'i').test(l));
      if (liveStepClaimed(line ?? '', step) && /\b(?:not performed|unperformed|not run|not recorded yet)\b/i.test(line ?? '')) {
        return `Do not mark ${step} complete while that same checklist line says it was not performed.`;
      }
      if (!liveStepClaimed(line ?? '', step) && /\b(?:completed live|recorded live)\b/i.test(line ?? '') && !/\b(?:not performed|unperformed)\b/i.test(line ?? '')) {
        return `${step} needs an explicit [x] only after the live action happened.`;
      }
    }
    return typeof review === 'string';
  }, { milestone: 'M3' }),
  t.check('PLAN.md holds the plan: 3+ numbered steps', () => {
    const body = need(t, 'Plan');
    const steps = body.split('\n').filter((l) => /^\s*\d+[.)]\s+\S/.test(l)).length;
    return steps >= 3 || `PLAN.md's Plan section has ${steps} numbered step(s) (it needs 3+): paste the plan /plan wrote, or write it with Copilot.`;
  }, { milestone: 'M1' }),
  t.check('The plan names the function, its error handling and its tests', () => {
    const body = need(t, 'Plan');
    const missing = [[/\bgpa\b/i, 'the function (gpa)'], [/TypeError|RangeError|\berror|\bthrow|invalid/i, 'how bad input is handled'], [/\btests?\b/i, 'the tests']]
      .filter(([re]) => !re.test(body)).map(([, what]) => what);
    return !missing.length || `The plan doesn't mention ${missing.join(', ')}. A plan you can review says what, how it fails, and how you'll know it works.`;
  }, { milestone: 'M1' }),

  t.check('grades.js exports gpa()', async () => {
    const m = await t.import('grades.js');
    return typeof m.gpa === 'function' || '`grades.js` has no exported `gpa` function yet.';
  }, { milestone: 'M2' }),
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
  }, { milestone: 'M2' }),
  t.check('gpa() rejects bad input with the right error types', async () => {
    const { gpa } = await t.import('grades.js');
    if (typeof gpa !== 'function') return 'No gpa() yet.';
    return expectError(() => gpa('nope'), TypeError, 'gpa("nope")')
      ?? expectError(() => gpa([]), RangeError, 'gpa([])')
      ?? expectError(() => gpa([{ credits: 5, finalGrade: 11 }]), RangeError, 'A final grade of 11')
      ?? expectError(() => gpa([{ credits: 5, finalGrade: 0 }]), RangeError, 'A final grade of 0')
      ?? expectError(() => gpa([{ credits: 0, finalGrade: 8 }]), RangeError, '0 credits')
      ?? expectError(() => gpa([{ credits: 2.5, finalGrade: 8 }]), RangeError, '2.5 credits')
      ?? true;
  }, { milestone: 'M2' }),
  t.check('grades.test.js tests gpa(): the normal case and the errors', () => {
    const s = t.read('grades.test.js') ?? '';
    if (!/\bgpa\s*\(/.test(s)) return 'Add tests for gpa() in grades.test.js.';
    return /assert\.throws\(\s*(?:\(\)\s*=>|function\s*\(\))\s*\{?\s*gpa\s*\(/.test(s) || 'Test the errors too: assert.throws(() => gpa(...), RangeError).';
  }, { milestone: 'M2' }),
  t.check('npm test is green', () => {
    const r = t.unitTests();
    return (r.fail === 0 && r.pass > 0) || `${r.fail} test(s) fail: ${r.failing.slice(0, 3).join(' | ')}`;
  }, { milestone: 'M2' }),

  t.check('PLAN.md has your review: 2+ findings from /diff', () => {
    const body = need(t, 'Review');
    const findings = body.split('\n').filter((l) => /^\s*([-*]|\d+[.)])\s+\S.{10,}/.test(l));
    if (findings.length < 2) return `The Review section has ${findings.length} finding(s): after /diff, write at least 2 (one bullet each: what you saw, and what you did about it).`;
    return findings.some((l) => /grades(\.test)?\.js/.test(l)) || 'Name the file in at least one finding (grades.js or grades.test.js), so a reader can find what you mean.';
  }, { milestone: 'M3' }),
  t.check('PLAN.md says which turn you undid with /rewind', () => {
    const body = need(t, 'Rewind');
    if (body.replace(/\s+/g, ' ').length < 40) return 'The Rewind section is empty: which request did you undo, and what did /rewind bring back?';
    return /\/rewind/.test(body) || 'Say that /rewind undid it (and what came back).';
  }, { milestone: 'M3' }),

  t.check('PLAN.md compares /usage: plan-first versus direct', () => {
    const body = need(t, 'Usage');
    const table = usageTable(body);
    if (!table) return 'The Usage section needs the table from the starter: | Run | AI credits | Input tokens | Output tokens |';
    const live = section(plan(t), 'Live steps') ?? '';
    const usageValidation = validateUsageEvidence(live, body);
    if (usageValidation !== true) return usageValidation;
    const col = (re) => table.head.findIndex((h) => re.test(h));
    const cols = { credits: col(/credit|premium/), input: col(/input/), output: col(/output/) };
    if (Object.values(cols).some((i) => i < 0)) return 'Keep the table\'s columns: Run, AI credits (or Premium requests), Input tokens, Output tokens.';
    return true;
  }, { milestone: 'M4' }),
  t.check('…and says which one cost more, and why', () => {
    const body = need(t, 'Usage');
    const prose = body.split('\n').filter((l) => !/^\s*\|/.test(l)).join(' ');
    const live = section(plan(t), 'Live steps') ?? '';
    if (!liveStepClaimed(live, '/usage')) {
      return /no live|no authentic|not performed|not fabricated/i.test(prose) || /N\/A/i.test(prose)
        ? true
        : 'Without live usage evidence, say the comparison is not claimed and do not invent numbers.';
    }
    return (/plan-first|direct/i.test(prose) && /\b(more|less|fewer|cheaper|same|twice|half)\b/i.test(prose))
      || 'Below the table, one or two sentences: which run cost more, and why (more turns? more context?).';
  }, { milestone: 'M4' }),
];
