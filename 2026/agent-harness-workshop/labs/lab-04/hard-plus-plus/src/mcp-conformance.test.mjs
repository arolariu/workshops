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

// ---------- your suite (M6) ----------
// The checks run this file against six broken servers, and it must fail on each one. A server is broken when it:
//   1. answers initialize with a version it doesn't support (it echoes "1999-01-01")
//   2. lets resources/list pages overlap (follow nextCursor: every course exactly once, 45 in all)
//   3. still answers a call after notifications/cancelled
//   4. serves HTTP without a valid bearer token
//   5. stops marking find_courses as deprecated in tools/list (_meta["dev.studybuddy/deprecated"].replacedBy)
//   6. serves tools/list before initialize (stdio)
// Run it over both transports: start each test's name with "stdio: " or "http: ". Test what the protocol (and
// todo.md) promises, not the wording of your messages: the checks also run this suite on the reference server.

test('stdio: ping answers {}', async () => {
  await withStdio(async (c) => {
    await c.init();
    assert.deepEqual((await c.request('ping')).result, {});
  });
});

// TODO(M6): turn each of these into a real test, then add your own (12 or more in all).
test.todo('stdio: initialize returns the version asked for, or one the server supports');
test.todo('stdio: before initialize, only ping works');
test.todo('stdio: resources/list pages lead through every course exactly once');
test.todo('stdio: a cancelled call gets no answer, and the server keeps serving');
test.todo('stdio: find_courses is deprecated and names search_courses');
test.todo('http: no token, or a wrong one, gets 401');