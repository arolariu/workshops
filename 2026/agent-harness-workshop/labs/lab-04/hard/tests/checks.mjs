// Free checks for Lab 04 · hard: a write tool you can trust. Every check uses its own temporary state file
// (STUDYBUDDY_STATE), so your real mcp/state.json is never touched.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { connect, serverConfig, suiteRun } from './common.mjs';
import { MUTANTS, mutant } from './mutants.mjs';

const SERVER = 'mcp/studybuddy-server.mjs';
const SUITE = 'mcp-contract.test.mjs';
const fresh = (t) => path.join(t.tmp(), 'state.json');
const session = async (t, stateFile, fn) => {
  const c = await connect(t, { STUDYBUDDY_STATE: stateFile });
  try { return await fn(c); } finally { c.close(); }
};
const markDone = async (t, c) => {
  const tool = (await c.tools()).find((x) => x.name === 'mark_done');
  if (!tool) t.fail('tools/list does not show mark_done yet. Add it to the tools in mcp/studybuddy-server.mjs (look for 👉).');
  return tool;
};
const doneIn = (file) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')).done ?? []; } catch { return null; }
};
/** A bad call must be a tool result with isError (the model reads it), not a JSON-RPC error. */
const toolError = (r, what) => {
  if (r.rpcError) return `${what} came back as a JSON-RPC error (${r.rpcError.code}). Input problems are results with isError: true.`;
  return r.isError ? null : `${what} should be an isError result, got: ${r.text.slice(0, 120)}`;
};
const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

export default (t) => [
  // M1 · A write tool with an honest contract
  t.check('mark_done is a write tool with an honest contract', () => session(t, fresh(t), async (c) => {
    const tool = await markDone(t, c);
    const s = tool.inputSchema ?? {};
    if (!(s.required ?? []).includes('id') || s.properties?.id?.type !== 'string') return 'mark_done takes one required string input: { id: { type: "string", … } }, required: ["id"].';
    if (s.additionalProperties !== false) return 'Refuse inputs it does not know: "additionalProperties": false.';
    const a = tool.annotations ?? {};
    const wrong = [['readOnlyHint', false], ['destructiveHint', false], ['idempotentHint', true]].filter(([k, v]) => a[k] !== v).map(([k, v]) => `${k}: ${v}`);
    if (wrong.length) return `Annotate what it really does (it writes, it only adds, a repeat changes nothing): ${wrong.join(', ')}. destructiveHint defaults to true, so say false.`;
    const d = String(tool.description ?? '');
    return (d.length >= 40 && /done/i.test(d) && /(save|stor|persist|record|remember|writ|chang)/i.test(d)) || 'Describe it in 40+ characters: it marks an assignment as done, the change is saved, and when to use it.';
  }), { milestone: 'M1' }),
  t.check('The read tools are marked read-only', () => session(t, fresh(t), async (c) => {
    const bad = (await c.tools()).filter((x) => x.name.startsWith('get_') && x.annotations?.readOnlyHint !== true).map((x) => x.name);
    return !bad.length || `Mark these as read-only: ${bad.join(', ')}.`;
  }), { milestone: 'M1' }),

  // M2 · Validation and isError
  t.check('Marking A2 works and get_deadlines forgets it', () => session(t, fresh(t), async (c) => {
    await markDone(t, c);
    const r = await c.call('mark_done', { id: 'A2' });
    if (r.isError) return `mark_done("A2") failed: ${r.text}`;
    const ids = ((await c.call('get_deadlines', {})).data ?? []).map((a) => a.id);
    return !ids.includes('A2') || `get_deadlines still lists A2: ${ids.join(',')}`;
  }), { milestone: 'M2' }),
  t.check('Bad input comes back as isError results that say what to do, and writes nothing', () => {
    const file = fresh(t);
    const snapshot = () => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null);
    return session(t, file, async (c) => {
      await markDone(t, c);
      const before = snapshot(); // a server may create an empty state file when it starts: that's fine
      const unknown = await c.call('mark_done', { id: 'A9' });
      const bad = toolError(unknown, 'id "A9"');
      if (bad) return bad;
      if (!/A1/.test(unknown.text) || !/A5/.test(unknown.text)) return `An unknown id should list the valid ones (A1 … A5). Got: ${unknown.text.slice(0, 120)}`;
      for (const [args, what, mention] of [[{}, 'A call without an id', /\bid\b/], [{ id: 42 }, '{ id: 42 }', /\bid\b/], [{ id: '' }, '{ id: "" }', /\bid\b/], [{ id: 'A2', force: true }, '{ id: "A2", force: true }', /force/]]) {
        const r = await c.call('mark_done', args);
        const problem = toolError(r, what);
        if (problem) return problem;
        if (!mention.test(r.text)) return `${what}: say which input is wrong (${mention.source.replace(/\\b/g, '')}). Got: ${r.text.slice(0, 120)}`;
      }
      const after = snapshot();
      return after === before || `A bad call changed the state file (before: ${before === null ? 'none' : before.slice(0, 60)}; after: ${String(after).slice(0, 60)}). Refuse first, write only for a valid id.`;
    });
  }, { milestone: 'M2' }),
  t.check('An unknown tool is a protocol error, not a tool result', () => session(t, fresh(t), async (c) => {
    const r = await c.call('mark_all_done', {});
    if (!r.rpcError) return `tools/call for a tool that doesn't exist should be a JSON-RPC error (-32602), got a result: ${r.text.slice(0, 100)}`;
    return r.rpcError.code === -32602 || `Use -32602 (Invalid params) for an unknown tool, got ${r.rpcError.code}.`;
  }), { milestone: 'M2' }),

  // M3 · Safe to repeat
  t.check('Marking twice is safe: no error the second time, and nothing changes', () => {
    const file = fresh(t);
    return session(t, file, async (c) => {
      await markDone(t, c);
      const first = await c.call('mark_done', { id: 'A2' });
      if (first.isError) return `mark_done("A2") failed: ${first.text}`;
      if (first.data?.changed !== true) return `The first call changed something: return { …, changed: true }. Got: ${first.text.slice(0, 120)}`;
      const again = await c.call('mark_done', { id: 'A2' });
      if (again.isError) return `A repeat is an error: ${again.text.slice(0, 120)}. A retry (the model or the client trying again) must be safe: succeed and say nothing changed.`;
      if (again.data?.changed !== false || !/already/i.test(again.text)) return `The second call should return { …, changed: false } and say it was already done. Got: ${again.text.slice(0, 120)}`;
      const done = doneIn(file);
      return (done && done.filter((id) => id === 'A2').length === 1) || `The state file should list A2 once, got ${JSON.stringify(done)}.`;
    });
  }, { milestone: 'M3' }),
  t.check('Ids are normalised, and assignments done in the portal are already done', () => {
    const file = fresh(t);
    return session(t, file, async (c) => {
      await markDone(t, c);
      const r = await c.call('mark_done', { id: ' a4 ' });
      if (r.isError || r.data?.id !== 'A4') return `" a4 " is A4 (trim and upper-case it). Got: ${r.text.slice(0, 120)}`;
      const a3 = await c.call('mark_done', { id: 'A3' });
      if (a3.isError || a3.data?.changed !== false) return `A3 is already done in the portal: changed: false, no error. Got: ${a3.text.slice(0, 120)}`;
      const done = doneIn(file) ?? [];
      return !done.includes('A3') || 'A3 was already done: a call that changes nothing writes nothing.';
    });
  }, { milestone: 'M3' }),

  // M4 · Persistent and atomic
  t.check('Done ids survive a restart (STUDYBUDDY_STATE)', async () => {
    const file = fresh(t);
    await session(t, file, async (c) => { await markDone(t, c); return c.call('mark_done', { id: 'A1' }); });
    if (!fs.existsSync(file)) return 'Nothing was written to the file in STUDYBUDDY_STATE.';
    if (!(doneIn(file) ?? []).includes('A1')) return `The state file should be { "done": ["A1"] }, got: ${fs.readFileSync(file, 'utf8').slice(0, 120)}`;
    return session(t, file, async (c) => {
      const ids = ((await c.call('get_deadlines', {})).data ?? []).map((a) => a.id);
      return !ids.includes('A1') || 'After a restart, get_deadlines lists A1 again. Read the state file on every call.';
    });
  }, { milestone: 'M4' }),
  t.check('state.json is replaced in one step: write a temp file, then rename it', async () => {
    const dir = t.tmp();
    const file = path.join(dir, 'state.json');
    const spyLog = path.join(t.tmp(), 'fs.jsonl');
    const { server } = serverConfig(t);
    const spy = pathToFileURL(path.join(t.exDir, 'tests', 'fs-spy.mjs')).href;
    const c = await t.mcp({ command: 'node', args: ['--import', spy, ...(server.args ?? [])], env: { ...(server.env ?? {}), STUDYBUDDY_STATE: file, FS_SPY_LOG: spyLog } });
    try {
      await markDone(t, c);
      for (const id of ['A1', 'A2']) {
        const r = await c.call('mark_done', { id });
        if (r.isError) return `mark_done("${id}") failed: ${r.text}`;
      }
    } finally { c.close(); }
    const ops = fs.existsSync(spyLog) ? fs.readFileSync(spyLog, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
    const direct = ops.filter((o) => !/rename|copy|cp/.test(o.op) && same(o.paths[0], file));
    if (direct.length) return `The server writes straight into state.json (${direct[0].op}). If it stops halfway (a crash, a full disk, a second process reading), the file is half-written. Write a temp file next to it, then rename it over state.json.`;
    const copies = ops.filter((o) => /copy|cp/.test(o.op) && same(o.paths[1], file));
    if (copies.length) return `${copies[0].op} into state.json writes it bit by bit, like a direct write. Rename the temp file instead.`;
    const renames = ops.filter((o) => /rename/.test(o.op) && same(o.paths[1], file));
    if (renames.length < 2) return `Expected a rename onto state.json for each of the 2 changes, saw ${renames.length}. ${ops.length ? '' : '(No file writes at all: does the server save to STUDYBUDDY_STATE?)'}`;
    const far = renames.find((o) => !same(path.dirname(o.paths[0]), dir));
    return !far || `The temp file ${far.paths[0]} is in another folder: a rename is only atomic within one file system. Put it next to state.json.`;
  }, { milestone: 'M4' }),
  t.check('A corrupt state file is never overwritten', () => {
    const file = fresh(t);
    const broken = '{ "done": ["A1"';
    fs.writeFileSync(file, broken);
    return session(t, file, async (c) => {
      await markDone(t, c);
      const r = await c.call('mark_done', { id: 'A2' });
      const bad = toolError(r, 'mark_done with a corrupt state file');
      if (bad) return `${bad} (Writing now would replace the file, and lose A1.)`;
      if (!/state/i.test(r.text)) return `Say that the state file can't be read, so the human can fix it. Got: ${r.text.slice(0, 120)}`;
      if (fs.readFileSync(file, 'utf8') !== broken) return 'The corrupt state file was changed. Leave it exactly as it is: it may be the only copy of someone\'s progress.';
      const d = await c.call('get_deadlines', {});
      return !d.isError || `Reading still works with a broken state file: get_deadlines failed with ${d.text.slice(0, 100)}`;
    });
  }, { milestone: 'M4' }),

  // M5 · A contract suite
  t.check('Your contract suite passes on your server', async () => {
    if (!t.exists(SUITE)) return `${SUITE} is missing.`;
    const r = await suiteRun(t, t.dir, SUITE);
    if (r.fail) return `node --test ${SUITE}: ${r.fail} of ${r.total} failing: ${r.failing.slice(0, 2).join(' | ')}`;
    return r.pass >= 6 || `node --test ${SUITE} has ${r.pass} passing test(s); write at least 6 (the example counts, todos don't). See todo.md, M5.`;
  }, { milestone: 'M5', timeout: 150000 }),
  t.check('Your suite passes on the reference server and catches all 6 broken ones', async () => {
    if (!t.exists(SUITE)) return `${SUITE} is missing.`;
    const reference = t.sol(SERVER);
    if (!reference) return 'The reference server is missing (labs/lab-04/hard/sol). Restore the workshop files.';
    const run = (source) => {
      const copy = t.copy(t.tmp());
      fs.writeFileSync(path.join(copy, SERVER), source);
      return suiteRun(t, copy, SUITE);
    };
    // All seven at once: the reference (the control) and the six broken servers.
    const [control, ...broken] = await Promise.all([run(reference), ...MUTANTS.map((name) => run(mutant(name, reference)))]);
    if (control.fail || !control.pass) return `On the reference server your suite has ${control.fail} failing test(s): ${control.failing.slice(0, 2).join(' | ')}. Test the contract in todo.md, not your own wording.`;
    const survived = MUTANTS.filter((name, i) => broken[i].fail === 0);
    return !survived.length || `Your suite passes on broken servers: ${survived.join(', ')}. Add a test for each (todo.md, M5 lists what each one breaks).`;
  }, { milestone: 'M5', timeout: 150000 }),
];
