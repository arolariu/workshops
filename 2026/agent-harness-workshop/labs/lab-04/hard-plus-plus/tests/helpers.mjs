// Raw clients for the Lab 04 hard++ checks. The kit's MCP client can only do the polite things (initialize, list,
// call); these can send anything (broken JSON, cursors, cancellations, HTTP without a token) and see what comes back.
// Every server they start is stopped in a finally, with timeouts, so nothing hangs.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

export const SERVER = 'mcp/library-server.mjs';
export const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];
/** A fresh bearer token for each run of the checks. */
export const TOKEN = `lib_${crypto.randomBytes(12).toString('hex')}`;

function start(t, args, env) {
  if (!t.exists(SERVER)) t.fail(`${SERVER} is missing.`);
  return spawn(process.execPath, [t.path(SERVER), ...args], { cwd: t.dir, env: { ...process.env, LIBRARY_TOKEN: '', ...env }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const gone = new Promise((resolve) => child.once('exit', resolve));
  child.kill();
  await Promise.race([gone, new Promise((resolve) => setTimeout(resolve, 2000))]);
}

/**
 * Start the server on stdio, run fn(client), always stop it. The client:
 *   send(objOrLine)                    write one line (an object is JSON-encoded)
 *   request(method, params, opts)      send a request and wait for the message with its id (null on timeout)
 *   notify(method, params)             send a notification
 *   init(version)                      initialize + notifications/initialized; returns the initialize message
 *   waitFor(pred, ms)                  the first message (seen or still to come) matching pred, or null
 *   messages, lines, stderr            everything the server wrote so far
 */
export async function withStdio(t, fn, { env = {} } = {}) {
  const child = start(t, [], env);
  const messages = [];
  const lines = [];
  const waiters = new Set();
  let stderr = '';
  let buf = '';
  let nextId = 1000;
  child.stderr.on('data', (d) => { stderr += d; });
  child.stdout.on('data', (d) => {
    buf += d;
    for (let n = buf.indexOf('\n'); n >= 0; n = buf.indexOf('\n')) {
      const line = buf.slice(0, n).replace(/\r$/, '');
      buf = buf.slice(n + 1);
      if (!line.trim()) continue;
      lines.push(line);
      let msg = null;
      try { msg = JSON.parse(line); } catch { continue; }
      messages.push(msg);
      for (const w of [...waiters]) if (w.pred(msg)) { waiters.delete(w); w.resolve(msg); }
    }
  });
  const waitFor = (pred, ms = 3000) => {
    const seen = messages.find(pred);
    if (seen) return Promise.resolve(seen);
    return new Promise((resolve) => {
      const w = { pred, resolve };
      waiters.add(w);
      setTimeout(() => { if (waiters.delete(w)) resolve(null); }, ms);
    });
  };
  const send = (m) => { try { child.stdin.write(`${typeof m === 'string' ? m : JSON.stringify(m)}\n`); } catch { /* it exited */ } };
  const client = {
    send,
    waitFor,
    notify: (method, params) => send({ jsonrpc: '2.0', method, ...(params ? { params } : {}) }),
    request(method, params = {}, { id = nextId++, ms = 3000 } = {}) {
      send({ jsonrpc: '2.0', id, method, params });
      return waitFor((m) => m.id === id && ('result' in m || 'error' in m), ms);
    },
    async init(protocolVersion = '2025-11-25') {
      const r = await client.request('initialize', { protocolVersion, capabilities: {}, clientInfo: { name: 'harness-check', version: '1.0.0' } }, { ms: 2000 });
      if (!r) t.fail(`initialize got no answer within 2 s: the server reads lines, but handle() doesn't answer yet (TODO(M1)).${stderr.trim() ? ` It said: ${stderr.trim().slice(-200)}` : ''}`);
      client.notify('notifications/initialized');
      return r;
    },
    get messages() { return messages; },
    get lines() { return lines; },
    get stderr() { return stderr; },
  };
  try { return await fn(client); } finally { await stop(child); }
}

/** fetch with a deadline; reads a JSON body, or the last JSON-RPC message of an SSE body. */
async function call(url, { method = 'POST', body, headers = {} } = {}) {
  const res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(4000) });
  const text = await res.text();
  let json = null;
  if (/text\/event-stream/.test(res.headers.get('content-type') ?? '')) {
    const data = text.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).filter(Boolean);
    try { json = JSON.parse(data.at(-1)); } catch { /* no message */ }
  } else {
    try { json = JSON.parse(text); } catch { /* not JSON */ }
  }
  return { status: res.status, headers: res.headers, text, json };
}

/**
 * Start the server with --http --port 0 (any free port on 127.0.0.1), run fn(h), always stop it. h:
 *   url, port, stderr
 *   post(message, { token, headers })  POST one message (an object, or a raw string) with the bearer token
 *   get(headers)                      GET the endpoint with the token
 *   raw(path, init)                   any request to another path
 */
export async function withHttp(t, fn, { token = TOKEN, env = {} } = {}) {
  const child = start(t, ['--http', '--port', '0'], { LIBRARY_TOKEN: token, ...env });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });
  try {
    const port = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 5000);
      const look = () => {
        const m = /https?:\/\/([\d.]+|localhost|\[[^\]]+\]):(\d+)\/mcp/.exec(stderr);
        if (m) { clearTimeout(timer); resolve({ host: m[1], port: Number(m[2]) }); }
      };
      child.stderr.on('data', look);
      child.once('exit', () => { clearTimeout(timer); resolve(null); });
    });
    if (!port) t.fail(`With --http --port 0 the server should listen and print "http://127.0.0.1:<port>/mcp" on stderr within 5 s (TODO(M5)). It said: ${stderr.trim().slice(-200) || 'nothing'}`);
    if (port.host !== '127.0.0.1') t.fail(`It listens on ${port.host}: bind to 127.0.0.1 only, so nothing outside this computer can reach it.`);
    const url = `http://127.0.0.1:${port.port}/mcp`;
    const auth = (token2) => (token2 === null ? {} : { authorization: `Bearer ${token2 ?? token}` });
    const h = {
      url,
      port: port.port,
      get stderr() { return stderr; },
      post: (message, { token: tk, headers = {} } = {}) => call(url, { body: typeof message === 'string' ? message : JSON.stringify(message), headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...auth(tk), ...headers } }),
      get: (headers = {}) => call(url, { method: 'GET', headers: { accept: 'text/event-stream', ...auth(), ...headers } }),
      raw: (p, init = {}) => call(`http://127.0.0.1:${port.port}${p}`, { ...init, headers: { ...auth(), ...(init.headers ?? {}) } }),
    };
    return await fn(h);
  } finally {
    await stop(child);
  }
}

/** Start the server with --http and wait for it to exit by itself (or 4 s); returns { code, stderr, running }. */
export async function httpWithoutToken(t) {
  const child = start(t, ['--http', '--port', '0'], { LIBRARY_TOKEN: '' });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });
  const code = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 4000);
    child.once('exit', (c) => { clearTimeout(timer); resolve(c); });
  });
  await stop(child);
  return { code, stderr, running: code === null };
}

export const rpc = (id, method, params = {}) => ({ jsonrpc: '2.0', id, method, params });
