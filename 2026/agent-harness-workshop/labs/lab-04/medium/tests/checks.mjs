// Free checks for Lab 04 · medium: a read tool with a schema, filters, validation and helpful errors.
// Every check starts the server from your .mcp.json and talks to it through a real MCP client (initialize first).
import { connect } from './common.mjs';

const COURSES = ['SE201', 'AI210', 'DB220', 'MA110', 'WEB230'];
const withServer = async (t, fn) => {
  const c = await connect(t);
  try { return await fn(c); } finally { c.close(); }
};
const need = async (t, c) => {
  const tool = (await c.tools()).find((x) => x.name === 'get_exam_dates');
  if (!tool) t.fail('tools/list does not show get_exam_dates yet: add it to the tools list in mcp/studybuddy-server.mjs (look for 👉).');
  return tool;
};
const codes = (r) => (Array.isArray(r.data) ? r.data.map((e) => e.course).join(',') : null);
/** A bad call must come back as a tool result with isError (the model can read it), never as a JSON-RPC error. */
const toolError = (r, what) => {
  if (r.rpcError) return `${what} came back as a JSON-RPC error (${r.rpcError.code}: ${r.text}). Input problems are tool results: { content: [...], isError: true }, so the model can read them and try again.`;
  if (!r.isError) return `${what} should be an error (isError: true), got: ${r.text.slice(0, 120)}`;
  return null;
};

export default (t) => [
  // M1 · The tool and its schema
  t.check('get_exam_dates is listed, read-only, with a description that says what and when', () => withServer(t, async (c) => {
    const tool = await need(t, c);
    const d = String(tool.description ?? '');
    if (d.length < 60) return `The description has ${d.length} characters. Say what comes back (exam date, days left, weight) and when to use it, in 60–500 characters.`;
    if (d.length > 500) return `The description has ${d.length} characters: it is sent to the model on every turn. Keep it under 500.`;
    const missing = [[/exam/i, 'exams'], [/date|day/i, 'the date or days left'], [/weight|count|percent|%/i, 'how much the exam counts'], [/\b(use|when|for)\b/i, 'when to use it']].filter(([re]) => !re.test(d)).map(([, w]) => w);
    if (missing.length) return `The description doesn't mention: ${missing.join(', ')}.`;
    return tool.annotations?.readOnlyHint === true || 'Mark it read-only: annotations: { readOnlyHint: true }.';
  }), { milestone: 'M1' }),
  t.check('Its input schema: two optional, typed, described inputs, and nothing else', () => withServer(t, async (c) => {
    const s = (await need(t, c)).inputSchema ?? {};
    if (s.type !== 'object') return 'inputSchema should be an object schema: { type: "object", properties: { … } }.';
    const course = s.properties?.course;
    const within = s.properties?.withinDays;
    if (course?.type !== 'string') return 'Add a "course" input: { type: "string", description: … }.';
    if (within?.type !== 'integer') return 'Add a "withinDays" input of type "integer" (whole days; "number" would allow 2.5).';
    if (within.minimum !== 1 || within.maximum !== 365) return `withinDays needs "minimum": 1 and "maximum": 365 (got ${within.minimum ?? '-'} and ${within.maximum ?? '-'}).`;
    const bare = Object.entries(s.properties).filter(([, p]) => String(p?.description ?? '').length < 10).map(([k]) => k);
    if (bare.length) return `Describe every input (the model reads these too): ${bare.join(', ')}.`;
    if ((s.required ?? []).length) return `Both inputs are optional: remove "required" (${s.required.join(', ')}).`;
    return s.additionalProperties === false || 'Add "additionalProperties": false, so an input the tool doesn\'t know is an error, not silently ignored.';
  }), { milestone: 'M1' }),

  // M2 · The right exams
  t.check('Every exam, soonest first, with the right fields and numbers', () => withServer(t, async (c) => {
    await need(t, c);
    const r = await c.call('get_exam_dates', {});
    if (r.isError) return `The tool returned an error: ${r.text}`;
    if (!Array.isArray(r.data)) return 'Return a JSON array of exams (the server turns your data into JSON text).';
    const missing = ['course', 'name', 'examDate', 'daysLeft', 'examWeight'].filter((k) => !(k in (r.data[0] ?? {})));
    if (missing.length) return `Each exam needs: ${missing.join(', ')}.`;
    if (codes(r) !== 'DB220,AI210,SE201,MA110,WEB230') return `Expected DB220,AI210,SE201,MA110,WEB230 (soonest first), got ${codes(r)}.`;
    const first = r.data[0];
    return (first.daysLeft === 18 && first.examWeight === 50 && first.examDate === '2026-11-02') || `DB220 is on 2026-11-02, 18 days away, and counts 50%. Got ${JSON.stringify(first)}.`;
  }), { milestone: 'M2' }),
  t.check('Filters: one course (in any case), the next N days, or both', () => withServer(t, async (c) => {
    await need(t, c);
    const cases = [
      [{ course: 'db220' }, 'DB220', 'course "db220" (codes are case-insensitive)'],
      [{ withinDays: 30 }, 'DB220,AI210', 'withinDays 30'],
      [{ withinDays: 18 }, 'DB220', 'withinDays 18 (an exam exactly 18 days away counts)'],
      [{ course: 'SE201', withinDays: 30 }, '', 'SE201 within 30 days (no exam: an empty list, not an error)'],
    ];
    for (const [args, want, label] of cases) {
      const r = await c.call('get_exam_dates', args);
      if (r.isError) return `${label}: the tool returned an error: ${r.text.slice(0, 120)}`;
      if (codes(r) !== want) return `${label}: expected [${want}], got [${codes(r) ?? r.text.slice(0, 80)}].`;
    }
    return true;
  }), { milestone: 'M2' }),
  t.check('The existing tools still work', () => withServer(t, async (c) => {
    const r = await c.call('get_deadlines', {});
    const ids = (r.data ?? []).map((a) => a.id).join(',');
    return ids === 'A2,A1' || `get_deadlines should still return A2,A1, got ${ids || r.text}.`;
  }), { milestone: 'M2' }),

  // M3 · Helpful errors
  t.check('An unknown course is an error that lists the real ones', () => withServer(t, async (c) => {
    await need(t, c);
    const r = await c.call('get_exam_dates', { course: 'XX999' });
    const bad = toolError(r, 'course "XX999"');
    if (bad) return bad;
    if (!r.text.includes('XX999')) return `Repeat what was wrong ("XX999"), so the model sees its mistake. Got: ${r.text.slice(0, 120)}`;
    const unlisted = COURSES.filter((code) => !r.text.includes(code));
    return !unlisted.length || `List the courses that do exist, so the model can retry: missing ${unlisted.join(', ')}.`;
  }), { milestone: 'M3' }),
  t.check('withinDays must be a whole number from 1 to 365, and the error says so', () => withServer(t, async (c) => {
    await need(t, c);
    for (const value of [0, -3, 2.5, 'soon', 400]) {
      const r = await c.call('get_exam_dates', { withinDays: value });
      const bad = toolError(r, `withinDays ${JSON.stringify(value)}`);
      if (bad) return bad;
      if (!/withinDays/.test(r.text) || !/\b1\b/.test(r.text) || !/365/.test(r.text)) return `withinDays ${JSON.stringify(value)}: name the input and the allowed range (1 to 365). Got: ${r.text.slice(0, 120)}`;
    }
    return true;
  }), { milestone: 'M3' }),
  t.check('An input the tool does not know is an error that names it, and the server keeps going', () => withServer(t, async (c) => {
    await need(t, c);
    const r = await c.call('get_exam_dates', { when: 'soon' });
    const bad = toolError(r, '{ "when": "soon" }');
    if (bad) return bad;
    if (!/\bwhen\b/.test(r.text) || !/course/.test(r.text) || !/withinDays/.test(r.text)) return `Name the unknown input ("when") and the ones the tool accepts (course, withinDays). Got: ${r.text.slice(0, 140)}`;
    const ok = await c.call('get_exam_dates', { course: 'AI210' });
    return (!ok.isError && codes(ok) === 'AI210') || `After the bad calls, a good one should still work: course "AI210" gave ${ok.text.slice(0, 100)}`;
  }), { milestone: 'M3' }),
];
