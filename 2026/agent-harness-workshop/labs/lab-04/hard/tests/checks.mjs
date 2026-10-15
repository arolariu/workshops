// Free checks for Lab 04 · hard. Every check uses its own temporary state file.
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './common.mjs';

const session = async (t, stateFile, fn) => {
  const c = await connect(t, { STUDYBUDDY_STATE: stateFile });
  try { return await fn(c); } finally { c.close(); }
};
const fresh = (t) => path.join(t.tmp(), 'state.json');

export default (t) => [
  t.check('mark_done is listed as a write tool with a required id', () => session(t, fresh(t), async (c) => {
    const tool = (await c.tools()).find((x) => x.name === 'mark_done');
    if (!tool) return 'tools/list does not show mark_done yet.';
    if (!(tool.inputSchema?.required ?? []).includes('id')) return 'Make id required: inputSchema.required = ["id"].';
    if (tool.inputSchema?.properties?.id?.type !== 'string') return 'id should be a string property.';
    return tool.annotations?.readOnlyHint === false || 'Annotate it as a write tool: readOnlyHint: false.';
  })),
  t.check('The read tools are marked read-only', () => session(t, fresh(t), async (c) => {
    const tools = await c.tools();
    const bad = tools.filter((x) => x.name.startsWith('get_') && x.annotations?.readOnlyHint !== true).map((x) => x.name);
    return !bad.length || `Mark these as read-only: ${bad.join(', ')}.`;
  })),
  t.check('Marking A2 works and get_deadlines forgets it', () => session(t, fresh(t), async (c) => {
    const r = await c.call('mark_done', { id: 'A2' });
    if (r.isError) return `mark_done("A2") failed: ${r.text}`;
    const ids = ((await c.call('get_deadlines', {})).data ?? []).map((a) => a.id);
    return !ids.includes('A2') || `get_deadlines still lists A2: ${ids.join(',')}`;
  })),
  t.check('Bad requests come back as isError results', () => session(t, fresh(t), async (c) => {
    await c.call('mark_done', { id: 'A2' });
    const again = await c.call('mark_done', { id: 'A2' });
    if (!again.isError || !/already/i.test(again.text)) return 'Marking A2 twice should return isError with "already done".';
    const unknown = await c.call('mark_done', { id: 'A9' });
    if (!unknown.isError || !/A1/.test(unknown.text)) return 'An unknown id should return isError and list the valid ids.';
    const missing = await c.call('mark_done', {});
    return missing.isError || 'A call without an id should return isError.';
  })),
  t.check('Done ids survive a restart (STUDYBUDDY_STATE)', async () => {
    const file = fresh(t);
    await session(t, file, (c) => c.call('mark_done', { id: 'A1' }));
    if (!fs.existsSync(file)) return 'Nothing was written to the file in STUDYBUDDY_STATE.';
    const saved = fs.readFileSync(file, 'utf8');
    if (!/A1/.test(saved)) return `The state file does not mention A1: ${saved.slice(0, 120)}`;
    return session(t, file, async (c) => {
      const ids = ((await c.call('get_deadlines', {})).data ?? []).map((a) => a.id);
      return !ids.includes('A1') || 'After a restart, get_deadlines lists A1 again. Read the state file on start.';
    });
  }),
];
