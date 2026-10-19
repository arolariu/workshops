// 📜 The portal's contract, tested through a real MCP client: JSON-RPC over stdio, `initialize` first, like Copilot.
// Run it: node --test mcp-contract.test.mjs    (npm test runs it too)
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

const SERVER = path.join(import.meta.dirname, 'mcp', 'studybuddy-server.mjs');

// ---------- plumbing: a tiny MCP client (you don't need to change it) ----------
const temps = [];
after(() => { for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true }); });

/** A path for a state file that doesn't exist yet, in a fresh temp folder. */
function freshState() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-'));
  temps.push(dir);
  return path.join(dir, 'state.json');
}

/** Start the server with STUDYBUDDY_STATE=stateFile, do the handshake, run fn(client), and always stop the server. */
async function withServer(stateFile, fn) {
  const child = spawn(process.execPath, [SERVER], { env: { ...process.env, STUDYBUDDY_STATE: stateFile }, stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map();
  let nextId = 1;
  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d;
    for (let n = buf.indexOf('\n'); n >= 0; n = buf.indexOf('\n')) {
      const line = buf.slice(0, n).trim();
      buf = buf.slice(n + 1);
      let msg = null;
      try { msg = JSON.parse(line); } catch { continue; }
      pending.get(msg.id)?.(msg);
      pending.delete(msg.id);
    }
  });
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`no answer to ${method} within 5 s`)); }, 5000);
    pending.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
  const client = {
    /** The tools from tools/list. */
    tools: async () => (await request('tools/list', {})).result.tools,
    /** { isError, text, data (the parsed JSON, or null), rpcError (a JSON-RPC error object, or null) } */
    async call(name, args = {}) {
      const msg = await request('tools/call', { name, arguments: args });
      if (msg.error) return { isError: true, text: msg.error.message, data: null, rpcError: msg.error };
      const text = (msg.result.content ?? []).map((c) => c.text ?? '').join('\n');
      let data = null;
      try { data = JSON.parse(text); } catch { /* plain text */ }
      return { isError: Boolean(msg.result.isError), text, data, rpcError: null };
    },
  };
  try {
    await request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'contract-tests', version: '1.0.0' } });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    return await fn(client);
  } finally {
    child.kill();
  }
}

// ---------- your contract (M5) ----------
// One test per promise the portal makes. The checks run this file against six broken servers, and it must fail on
// each one. A server is broken when it:
//   1. "marks" an id that doesn't exist, instead of an isError result that lists the valid ids
//   2. answers a repeat with an error, instead of changed: false
//   3. forgets what was done after a restart (the same STUDYBUDDY_STATE, a new server process)
//   4. still lists a done assignment in get_deadlines
//   5. says mark_done is read-only (annotations.readOnlyHint)
//   6. reports bad input as a JSON-RPC error (rpcError), instead of a result with isError
// Test what todo.md promises (ids, isError, changed), not the exact wording of your messages.

const ids = async (c) => ((await c.call('get_deadlines', { days: 60 })).data ?? []).map((a) => a.id);
const doneIn = (file) => JSON.parse(fs.readFileSync(file, 'utf8')).done;

test('mark_done is a write tool: a required id, not read-only, safe to repeat', async () => {
  await withServer(freshState(), async (c) => {
    const tool = (await c.tools()).find((t) => t.name === 'mark_done');
    assert.ok(tool, 'tools/list has mark_done');
    assert.deepEqual(tool.inputSchema.required, ['id']);
    assert.equal(tool.annotations?.readOnlyHint, false);
    assert.equal(tool.annotations?.idempotentHint, true);
  });
});

test('marking A2 works, and get_deadlines stops listing it', async () => {
  await withServer(freshState(), async (c) => {
    assert.ok((await ids(c)).includes('A2'));
    const r = await c.call('mark_done', { id: 'A2' });
    assert.equal(r.isError, false, r.text);
    assert.equal(r.data.changed, true);
    assert.ok(!(await ids(c)).includes('A2'));
  });
});

test('an unknown id is an isError result that lists the valid ids, and writes nothing', async () => {
  const state = freshState();
  await withServer(state, async (c) => {
    const r = await c.call('mark_done', { id: 'A9' });
    assert.equal(r.rpcError, null, 'a tool result, not a JSON-RPC error');
    assert.equal(r.isError, true, r.text);
    assert.match(r.text, /A1/);
  });
  assert.equal(fs.existsSync(state), false);
});

test('bad input is an isError result, not a JSON-RPC error', async () => {
  await withServer(freshState(), async (c) => {
    for (const args of [{}, { id: 42 }, { id: '' }, { id: 'A2', force: true }]) {
      const r = await c.call('mark_done', args);
      assert.equal(r.rpcError, null, `${JSON.stringify(args)}: a tool result, not a JSON-RPC error`);
      assert.equal(r.isError, true, `${JSON.stringify(args)}: isError`);
    }
  });
});

test('an unknown tool is a JSON-RPC error', async () => {
  await withServer(freshState(), async (c) => {
    const r = await c.call('mark_all_done', {});
    assert.equal(r.rpcError?.code, -32602);
  });
});

test('marking twice is safe: changed true, then changed false, listed once', async () => {
  const state = freshState();
  await withServer(state, async (c) => {
    assert.equal((await c.call('mark_done', { id: 'A2' })).data?.changed, true);
    const again = await c.call('mark_done', { id: 'a2 ' });
    assert.equal(again.isError, false, again.text);
    assert.equal(again.data?.changed, false);
  });
  assert.deepEqual(doneIn(state), ['A2']);
});

test('done ids survive a restart with the same state file', async () => {
  const state = freshState();
  await withServer(state, (c) => c.call('mark_done', { id: 'A1' }));
  await withServer(state, async (c) => assert.ok(!(await ids(c)).includes('A1'), 'A1 is still done after a restart'));
});

test('a corrupt state file is left alone', async () => {
  const state = freshState();
  fs.writeFileSync(state, '{ "done": [');
  await withServer(state, async (c) => {
    const r = await c.call('mark_done', { id: 'A2' });
    assert.equal(r.isError, true);
    assert.equal((await c.call('get_deadlines', {})).isError, false);
  });
  assert.equal(fs.readFileSync(state, 'utf8'), '{ "done": [');
});