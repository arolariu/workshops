// Free checks for Lab 04 · medium.
import { connect } from './common.mjs';

const withServer = async (t, fn) => {
  const c = await connect(t);
  try { return await fn(c); } finally { c.close(); }
};

export default (t) => [
  t.check('get_exam_dates is listed with a helpful description', () => withServer(t, async (c) => {
    const tool = (await c.tools()).find((x) => x.name === 'get_exam_dates');
    if (!tool) return 'tools/list does not show get_exam_dates yet.';
    if (String(tool.description ?? '').length < 40) return 'Write a longer description: what it returns and when to use it.';
    if (tool.inputSchema?.type !== 'object') return 'inputSchema should be an object schema: { type: "object", properties: {} }.';
    return tool.annotations?.readOnlyHint === true || 'Mark it read-only: annotations: { readOnlyHint: true }.';
  })),
  t.check('It returns every exam with the right fields', () => withServer(t, async (c) => {
    const r = await c.call('get_exam_dates', {});
    if (r.isError) return `The tool returned an error: ${r.text}`;
    if (!Array.isArray(r.data)) return 'Return a JSON array (the server turns your data into JSON text).';
    if (r.data.length !== 5) return `Expected 5 exams, got ${r.data.length}.`;
    const missing = ['course', 'name', 'examDate', 'daysLeft', 'examWeight'].filter((k) => !(k in r.data[0]));
    return !missing.length || `Each exam needs: ${missing.join(', ')}.`;
  })),
  t.check('Soonest first, with the right numbers', () => withServer(t, async (c) => {
    const { data } = await c.call('get_exam_dates', {});
    const order = (data ?? []).map((e) => e.course).join(',');
    if (order !== 'DB220,AI210,SE201,MA110,WEB230') return `Expected DB220,AI210,SE201,MA110,WEB230, got ${order}.`;
    const first = data[0];
    return (first.daysLeft === 18 && first.examWeight === 50 && first.examDate === '2026-11-02') || `DB220 should be 18 days away and count 50%, got ${JSON.stringify(first)}.`;
  })),
  t.check('The existing tools still work', () => withServer(t, async (c) => {
    const r = await c.call('get_deadlines', {});
    const ids = (r.data ?? []).map((a) => a.id).join(',');
    return ids === 'A2,A1' || `get_deadlines should still return A2,A1, got ${ids || r.text}.`;
  })),
];
