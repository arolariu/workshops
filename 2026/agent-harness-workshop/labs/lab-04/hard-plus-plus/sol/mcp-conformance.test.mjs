// 🧪 The library's conformance suite: the protocol's promises, tested with raw JSON-RPC over stdio and over HTTP.
// Run it: node --test mcp-conformance.test.mjs    (npm test runs it too)
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { test } from 'node:test';

const SERVER = path.join(import.meta.dirname, 'mcp', 'library-server.mjs');
const TOKEN = `test_${crypto.randomBytes(12).toString('hex')}`;

// ---------- plumbing: raw clients (you don't need to change them) ----------
const launch = (args, env) => spawn(process.execPath, [SERVER, ...args], { env: { ...process.env, LIBRARY_TOKEN: TOKEN, ...env }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const gone = new Promise((resolve) => child.once('exit', resolve));
  child.kill();
  await Promise.race([gone, new Promise((resolve) => setTimeout(resolve, 2000))]);
}

/**
 * Start the server on stdio, run fn(c), always stop it. c:
 *   send(objectOrLine)                     write one line
 *   request(method, params, { id, ms })    send a request; resolves to the message with that id, or null after ms
 *   notify(method, params)                 send a notification
 *   init(protocolVersion)                  initialize + notifications/initialized; resolves to the initialize message
 *   next(predicate, ms)                    the first message (already seen or still to come) that matches, or null
 *   messages                               every message the server sent so far
 */
async function withStdio(fn, env = {}) {
  const child = launch([], env);
  const messages = [];
  const waiters = new Set();
  let buf = '';
  let nextId = 1;
  child.stdout.on('data', (d) => {
    buf += d;
    for (let n = buf.indexOf('\n'); n >= 0; n = buf.indexOf('\n')) {
      const line = buf.slice(0, n).trim();
      buf = buf.slice(n + 1);
      let msg = null;
      try { msg = JSON.parse(line); } catch { continue; }
      messages.push(msg);
      for (const w of [...waiters]) if (w.pred(msg)) { waiters.delete(w); w.resolve(msg); }
    }
  });
  const next = (pred, ms = 3000) => messages.find(pred) ?? new Promise((resolve) => {
    const w = { pred, resolve };
    waiters.add(w);
    setTimeout(() => { if (waiters.delete(w)) resolve(null); }, ms);
  });
  const send = (m) => child.stdin.write(`${typeof m === 'string' ? m : JSON.stringify(m)}\n`);
  const c = {
    send,
    next,
    messages,
    notify: (method, params) => send({ jsonrpc: '2.0', method, ...(params ? { params } : {}) }),
    request(method, params = {}, { id = `r${nextId++}`, ms = 3000 } = {}) {
      send({ jsonrpc: '2.0', id, method, params });
      return next((m) => m.id === id, ms);
    },
    async init(protocolVersion = '2025-11-25') {
      const r = await c.request('initialize', { protocolVersion, capabilities: {}, clientInfo: { name: 'conformance', version: '1.0.0' } });
      c.notify('notifications/initialized');
      return r;
    },
  };
  try { return await fn(c); } finally { await stop(child); }
}

/**
 * Start the server with --http --port 0 (any free port on 127.0.0.1), run fn(h), always stop it. h:
 *   url
 *   post(message, { token, headers })   POST one message (an object or a raw string) with the bearer token
 *                                       (token: null sends none); resolves to { status, headers, text, json }
 *   get()                               GET the endpoint, with the token
 */
async function withHttp(fn, env = {}) {
  const child = launch(['--http', '--port', '0'], env);
  try {
    const port = await new Promise((resolve, reject) => {
      let err = '';
      const timer = setTimeout(() => reject(new Error(`the server did not print its URL within 5 s: ${err.slice(-200)}`)), 5000);
      child.stderr.on('data', (d) => {
        err += d;
        const m = /http:\/\/127\.0\.0\.1:(\d+)\/mcp/.exec(err);
        if (m) { clearTimeout(timer); resolve(Number(m[1])); }
      });
    });
    const url = `http://127.0.0.1:${port}/mcp`;
    const call = async (init) => {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(4000) });
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch { /* empty or not JSON */ }
      return { status: res.status, headers: res.headers, text, json };
    };
    const auth = (token) => (token === null ? {} : { authorization: `Bearer ${token ?? TOKEN}` });
    return await fn({
      url,
      post: (message, { token, headers = {} } = {}) => call({ method: 'POST', body: typeof message === 'string' ? message : JSON.stringify(message), headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...auth(token), ...headers } }),
      get: () => call({ method: 'GET', headers: { accept: 'text/event-stream', ...auth() } }),
    });
  } finally {
    await stop(child);
  }
}
const rpc = (id, method, params = {}) => ({ jsonrpc: '2.0', id, method, params });

// ---------- the suite ----------
const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];
const INIT = { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'conformance', version: '1.0.0' } };
const text = (m) => (m?.result?.content ?? []).map((c) => c.text ?? '').join('\n');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('stdio: initialize returns the version asked for, or one the server supports', async () => {
  await withStdio(async (c) => {
    assert.equal((await c.init('2025-11-25')).result.protocolVersion, '2025-11-25');
    const old = await c.request('initialize', { ...INIT, protocolVersion: '2025-06-18' });
    assert.equal(old.result.protocolVersion, '2025-06-18');
    const future = await c.request('initialize', { ...INIT, protocolVersion: '1999-01-01' });
    assert.ok(VERSIONS.includes(future.result.protocolVersion), `not an echo: ${future.result.protocolVersion}`);
  });
});

test('stdio: capabilities declare tools, resources and prompts, and nothing else', async () => {
  await withStdio(async (c) => {
    const { capabilities, serverInfo } = (await c.init()).result;
    assert.deepEqual(Object.keys(capabilities).sort(), ['prompts', 'resources', 'tools']);
    assert.ok(serverInfo.name && serverInfo.version);
  });
});

test('stdio: before initialize, only ping works', async () => {
  await withStdio(async (c) => {
    const early = await c.request('tools/list');
    assert.ok(early.error, 'tools/list before initialize is an error');
    assert.match(early.error.message, /initiali[sz]e/i);
    assert.deepEqual((await c.request('ping')).result, {});
  });
});

test('stdio: notifications never get a response', async () => {
  await withStdio(async (c) => {
    await c.init();
    const before = c.messages.length;
    c.notify('notifications/whatever', { x: 1 });
    c.notify('notifications/cancelled', { requestId: 'nothing-running' });
    const pong = await c.request('ping');
    assert.deepEqual(c.messages.slice(before), [pong]);
  });
});

test('stdio: broken JSON is -32700 with id null; an unknown method is -32601', async () => {
  await withStdio(async (c) => {
    await c.init();
    c.send('{ this is not json');
    const parse = await c.next((m) => m.error?.code === -32700);
    assert.equal(parse?.id, null);
    assert.equal((await c.request('library/explode')).error?.code, -32601);
  });
});

test('stdio: tools/call puts input problems in results and unknown tools in errors', async () => {
  await withStdio(async (c) => {
    await c.init();
    const ok = await c.request('tools/call', { name: 'search_courses', arguments: { query: 'database' } });
    assert.equal(ok.result.isError, false);
    assert.ok(JSON.parse(text(ok)).courses.some((x) => x.code === 'DB220'));
    const bad = await c.request('tools/call', { name: 'search_courses', arguments: { query: 'x' } });
    assert.equal(bad.result.isError, true);
    assert.equal((await c.request('tools/call', { name: 'launch_rockets', arguments: {} })).error?.code, -32602);
  });
});

test('stdio: resources/list pages lead through every course exactly once', async () => {
  await withStdio(async (c) => {
    await c.init();
    const uris = [];
    let cursor;
    let pages = 0;
    do {
      const page = await c.request('resources/list', cursor ? { cursor } : {});
      uris.push(...page.result.resources.map((r) => r.uri));
      cursor = page.result.nextCursor;
      pages += 1;
    } while (cursor && pages < 20);
    assert.ok(pages >= 3, `${pages} page(s)`);
    assert.equal(uris.length, 45);
    assert.equal(new Set(uris).size, 45);
  });
});

test('stdio: a cursor the server did not make is -32602', async () => {
  await withStdio(async (c) => {
    await c.init();
    assert.equal((await c.request('resources/list', { cursor: 'garbage' })).error?.code, -32602);
    const real = (await c.request('resources/list')).result.nextCursor;
    assert.equal((await c.request('resources/list', { cursor: `${real}x` })).error?.code, -32602);
  });
});

test('stdio: resources/read reads a course, and -32002 for one that does not exist', async () => {
  await withStdio(async (c) => {
    await c.init();
    const r = await c.request('resources/read', { uri: 'library://courses/DB220' });
    assert.equal(JSON.parse(r.result.contents[0].text).code, 'DB220');
    assert.equal((await c.request('resources/read', { uri: 'library://courses/ZZ999' })).error?.code, -32002);
  });
});

test('stdio: prompts/get builds the prompt, and -32602 for a missing argument', async () => {
  await withStdio(async (c) => {
    await c.init();
    const p = await c.request('prompts/get', { name: 'study_plan', arguments: { course: 'DB220' } });
    assert.equal(p.result.messages[0].role, 'user');
    assert.match(p.result.messages[0].content.text, /DB220/);
    assert.equal((await c.request('prompts/get', { name: 'study_plan', arguments: {} })).error?.code, -32602);
  });
});

test('stdio: a cancelled call gets no answer, and the server keeps serving', async () => {
  await withStdio(async (c) => {
    await c.init();
    c.send(rpc('slow', 'tools/call', { name: 'plan_study_weeks', arguments: { course: 'DB220', weeks: 10 } }));
    await sleep(150);
    c.notify('notifications/cancelled', { requestId: 'slow', reason: 'test' });
    assert.equal(await c.next((m) => m.id === 'slow', 1500), null);
    assert.deepEqual((await c.request('ping')).result, {});
  }, { LIBRARY_STEP_MS: '100' });
});

test('stdio: a call past its deadline ends with a tool error', async () => {
  await withStdio(async (c) => {
    await c.init();
    const r = await c.request('tools/call', { name: 'plan_study_weeks', arguments: { course: 'DB220', weeks: 20 } });
    assert.equal(r.result.isError, true);
    assert.match(text(r), /timed out/i);
  }, { LIBRARY_STEP_MS: '100', LIBRARY_TIMEOUT_MS: '250' });
});

test('stdio: find_courses is deprecated, names search_courses, and still works', async () => {
  await withStdio(async (c) => {
    await c.init();
    const tools = (await c.request('tools/list')).result.tools;
    assert.equal(tools.find((x) => x.name === 'search_courses')._meta['dev.studybuddy/schema-version'], 2);
    const old = tools.find((x) => x.name === 'find_courses');
    assert.match(old.description, /^Deprecated/);
    assert.equal(old._meta?.['dev.studybuddy/deprecated']?.replacedBy, 'search_courses');
    const r = await c.request('tools/call', { name: 'find_courses', arguments: { q: 'database' } });
    assert.equal(r.result.isError, false);
    assert.match(text(r), /deprecated/i);
  });
});

test('http: no token, or a wrong one, gets 401 with a Bearer challenge', async () => {
  await withHttp(async (h) => {
    const none = await h.post(rpc(1, 'ping'), { token: null });
    assert.equal(none.status, 401);
    assert.match(none.headers.get('www-authenticate') ?? '', /Bearer/i);
    assert.equal((await h.post(rpc(2, 'ping'), { token: 'wrong-token-1234567' })).status, 401);
  });
});

test('http: a foreign Origin gets 403; GET gets 405', async () => {
  await withHttp(async (h) => {
    assert.equal((await h.post(rpc(1, 'ping'), { headers: { origin: 'https://evil.example.invalid' } })).status, 403);
    assert.equal((await h.get()).status, 405);
  });
});

test('http: initialize and a tool call work with the token; a notification gets 202', async () => {
  await withHttp(async (h) => {
    const init = await h.post(rpc(1, 'initialize', INIT));
    assert.equal(init.status, 200);
    assert.equal(init.json.result.protocolVersion, '2025-11-25');
    assert.equal((await h.post({ jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
    const call = await h.post(rpc(2, 'tools/call', { name: 'get_course', arguments: { code: 'DB220' } }), { headers: { 'mcp-protocol-version': '2025-11-25' } });
    assert.equal(call.json.result.structuredContent.course.code, 'DB220');
  });
});

test('http: an unsupported MCP-Protocol-Version gets 400, broken JSON gets -32700', async () => {
  await withHttp(async (h) => {
    assert.equal((await h.post(rpc(1, 'ping'), { headers: { 'mcp-protocol-version': '1999-01-01' } })).status, 400);
    const broken = await h.post('{ nope');
    assert.equal(broken.status, 400);
    assert.equal(broken.json.error.code, -32700);
  });
});