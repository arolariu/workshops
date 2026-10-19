#!/usr/bin/env node
// 📚 StudyBuddy library: the course catalogue as an MCP server, written from the protocol up: no SDK, no helper
// plumbing. Follow MCP 2025-11-25 (https://modelcontextprotocol.io/specification/2025-11-25), the revision Copilot
// CLI negotiates.
//   node mcp/library-server.mjs                          stdio: one JSON-RPC message per line
//   node mcp/library-server.mjs --http [--port 8123]     Streamable HTTP on http://127.0.0.1:<port>/mcp (0 = any free port)
// Environment: LIBRARY_TOKEN (the HTTP bearer token, 16+ characters), LIBRARY_TIMEOUT_MS (each call's deadline,
// default 10000), LIBRARY_STEP_MS (plan_study_weeks: work per week, default 50).
//
// Given: the data, the tools' own logic, an argument checker, JSON-RPC message builders, and the raw transports (lines
// on stdin/stdout, an HTTP listener). The rest is the protocol: M1 … M6.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const COURSES = JSON.parse(fs.readFileSync(path.join(HERE, 'library-data.json'), 'utf8')).courses;
const SERVER_INFO = { name: 'studybuddy-library', title: 'StudyBuddy library', version: '2.0.0' };
const TIMEOUT_MS = Number(process.env.LIBRARY_TIMEOUT_MS) || 10_000;
const STEP_MS = Number(process.env.LIBRARY_STEP_MS) || 50;
const log = (...parts) => console.error('📚', ...parts); // stderr: stdout belongs to the protocol

// ---------- given: small helpers ----------
const sleep = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(signal.reason);
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
});
const findCourse = (code) => COURSES.find((c) => c.code === String(code ?? '').trim().toUpperCase());
const brief = ({ code, title, level, credits, summary }) => ({ code, title, level, credits, summary });
const search = (query, level) => COURSES
  .filter((c) => `${c.title} ${c.summary}`.toLowerCase().includes(String(query).trim().toLowerCase()) && (level === undefined || c.level === level))
  .map(brief);

/** The problems with `args` for a tool's inputSchema ([] when fine): types, required, enum, ranges, unknown keys. */
function checkArgs(schema, args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return ['The arguments must be a JSON object.'];
  const props = schema.properties ?? {};
  const problems = (schema.required ?? []).filter((k) => args[k] === undefined).map((k) => `"${k}" is required.`);
  for (const [key, value] of Object.entries(args)) {
    const p = props[key];
    if (!p) { problems.push(`Unknown argument "${key}". Accepted: ${Object.keys(props).join(', ')}.`); continue; }
    if (p.type === 'string' && (typeof value !== 'string' || value.trim().length < (p.minLength ?? 0))) problems.push(`${key} must be a string of at least ${p.minLength ?? 0} characters.`);
    if (p.type === 'integer' && (!Number.isInteger(value) || value < (p.minimum ?? -Infinity) || value > (p.maximum ?? Infinity))) problems.push(`${key} must be a whole number${p.minimum !== undefined ? ` from ${p.minimum} to ${p.maximum}` : ''}.`);
    if (p.enum && !p.enum.includes(value)) problems.push(`${key} must be one of ${p.enum.join(', ')}.`);
  }
  return problems;
}

// ---------- given: JSON-RPC message builders ----------
const CODE = { parse: -32700, invalidRequest: -32600, methodNotFound: -32601, invalidParams: -32602, internal: -32603, resourceNotFound: -32002 };
class RpcError extends Error {
  constructor(code, message, data) { super(message); this.code = code; this.data = data; }
}
const ok = (id, result) => ({ jsonrpc: '2.0', id, result });
const failure = (id, code, message, data) => ({ jsonrpc: '2.0', id, error: { code, message, ...(data === undefined ? {} : { data }) } });

// ---------- M1 · the handshake ----------
const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26']; // newest first
const CAPABILITIES = { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false }, prompts: { listChanged: false } };
function initialize(params, session) {
  const asked = params?.protocolVersion;
  session.version = VERSIONS.includes(asked) ? asked : VERSIONS[0];
  session.ready = true;
  return {
    protocolVersion: session.version,
    capabilities: CAPABILITIES,
    serverInfo: SERVER_INFO,
    instructions: 'The university course catalogue: search courses, read one as a resource, or plan study weeks.',
  };
}

// ---------- M2 · tools, resources and prompts ----------
const DEPRECATED = { replacedBy: 'search_courses', removeAfter: '2027-01-31', note: 'q is now query' };
const tools = [
  {
    name: 'search_courses',
    title: 'Search the catalogue',
    description: 'Search the course catalogue by words in a course title or summary. Returns matching courses (code, title, level, credits, summary), by code. Use it to find courses about a topic.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 2, description: 'Words to look for, e.g. "database"' },
        level: { type: 'integer', enum: [100, 200, 300, 400], description: 'Only courses at this level' },
        limit: { type: 'integer', minimum: 1, maximum: 20, description: 'At most this many courses (default 10)' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    _meta: { 'dev.studybuddy/schema-version': 2 },
    run: ({ query, level, limit = 10 }) => ({ courses: search(query, level).slice(0, limit) }),
  },
  {
    name: 'get_course',
    title: 'One course',
    description: 'One course from the catalogue by its code (e.g. DB220): title, level, credits, summary and prerequisites.',
    inputSchema: { type: 'object', properties: { code: { type: 'string', minLength: 2, description: 'Course code, e.g. DB220' } }, required: ['code'], additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
    _meta: { 'dev.studybuddy/schema-version': 1 },
    run: ({ code }) => {
      const course = findCourse(code);
      if (!course) throw new Error(`Unknown course "${code}". Find codes with search_courses.`);
      return { course };
    },
  },
  {
    name: 'plan_study_weeks',
    title: 'Plan study weeks',
    description: 'A week-by-week study plan for one course. It takes a moment per week, so ask for the weeks you need.',
    inputSchema: {
      type: 'object',
      properties: {
        course: { type: 'string', minLength: 2, description: 'Course code, e.g. DB220' },
        weeks: { type: 'integer', minimum: 1, maximum: 52, description: 'How many weeks (1-52)' },
      },
      required: ['course', 'weeks'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    _meta: { 'dev.studybuddy/schema-version': 1 },
    run: async ({ course, weeks }, { signal } = {}) => {
      const c = findCourse(course);
      if (!c) throw new Error(`Unknown course "${course}". Find codes with search_courses.`);
      const plan = [];
      for (let week = 1; week <= weeks; week++) {
        await sleep(STEP_MS, signal); // the slow part: it stops as soon as the call is cancelled or runs out of time
        plan.push({ week, focus: week === weeks ? 'Revision and a practice exam' : `${c.title}, part ${week}` });
      }
      return { course: c.code, title: c.title, weeks: plan };
    },
  },
  {
    name: 'find_courses',
    title: 'Search the catalogue (deprecated)',
    description: `Deprecated: use search_courses instead (q is now query). find_courses keeps working until ${DEPRECATED.removeAfter}.`,
    inputSchema: { type: 'object', properties: { q: { type: 'string', minLength: 2, description: 'Words to look for' } }, required: ['q'], additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
    _meta: { 'dev.studybuddy/schema-version': 1, 'dev.studybuddy/deprecated': DEPRECATED },
    deprecation: `find_courses is deprecated: use search_courses with "query". It stops working after ${DEPRECATED.removeAfter}.`,
    run: ({ q }) => ({ courses: search(q).slice(0, 10) }),
  },
];
const listedTool = ({ run, deprecation, ...tool }) => tool;

async function callTool(params, signal) {
  const tool = tools.find((t) => t.name === params?.name);
  if (!tool) throw new RpcError(CODE.invalidParams, `Unknown tool: ${params?.name}`);
  const args = params.arguments ?? {};
  const problems = checkArgs(tool.inputSchema, args);
  if (problems.length) return { content: [{ type: 'text', text: `Invalid arguments for ${tool.name}: ${problems.join(' ')}` }], isError: true };
  // M4 · every call has a deadline; a cancellation from the client stops it too.
  const deadline = AbortSignal.timeout(TIMEOUT_MS);
  try {
    let data = await tool.run(args, { signal: AbortSignal.any([signal, deadline]) });
    const meta = tool.deprecation ? { 'dev.studybuddy/deprecated': tool.deprecation } : undefined;
    if (tool.deprecation) data = { ...data, deprecated: tool.deprecation };
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data, isError: false, ...(meta ? { _meta: meta } : {}) };
  } catch (e) {
    if (signal.aborted) throw e; // cancelled: nobody is waiting for an answer
    const text = deadline.aborted ? `${tool.name} timed out after ${TIMEOUT_MS} ms. Ask for less (fewer weeks).` : e.message;
    return { content: [{ type: 'text', text }], isError: true };
  }
}

const uriOf = (c) => `library://courses/${c.code}`;
const resourceOf = (c) => ({ uri: uriOf(c), name: c.code, title: `${c.code} · ${c.title}`, description: c.summary, mimeType: 'application/json' });
function readResource(params) {
  const code = /^library:\/\/courses\/([A-Z]+\d+)$/.exec(String(params?.uri ?? ''))?.[1];
  const course = code && findCourse(code);
  if (!course) throw new RpcError(CODE.resourceNotFound, 'Resource not found', { uri: params?.uri });
  return { contents: [{ uri: uriOf(course), mimeType: 'application/json', text: JSON.stringify(course, null, 2) }] };
}
const TEMPLATES = [{ uriTemplate: 'library://courses/{code}', name: 'course', title: 'A course in the catalogue', description: 'One course by its code, as JSON.', mimeType: 'application/json' }];

const PROMPTS = [{
  name: 'study_plan',
  title: 'A study plan for a course',
  description: 'Ask for a week-by-week study plan for one course, built from its summary and prerequisites.',
  arguments: [{ name: 'course', description: 'Course code, e.g. DB220', required: true }, { name: 'weeks', description: 'How many weeks (default 6)', required: false }],
}];
function getPrompt(params) {
  if (params?.name !== 'study_plan') throw new RpcError(CODE.invalidParams, `Unknown prompt: ${params?.name}`);
  const args = params.arguments ?? {};
  if (args.course === undefined) throw new RpcError(CODE.invalidParams, 'Missing required argument: course');
  const course = findCourse(args.course);
  if (!course) throw new RpcError(CODE.invalidParams, `Unknown course: ${args.course}`);
  const weeks = args.weeks === undefined ? 6 : Number(args.weeks);
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52) throw new RpcError(CODE.invalidParams, 'weeks must be a whole number from 1 to 52');
  const before = course.prerequisites.length ? ` It builds on ${course.prerequisites.join(', ')}.` : '';
  return {
    description: `A ${weeks}-week study plan for ${course.code}`,
    messages: [{ role: 'user', content: { type: 'text', text: `Make a ${weeks}-week study plan for ${course.code} · ${course.title}: ${course.summary}${before} One line per week, and end with a revision week.` } }],
  };
}

// ---------- M3 · pages: opaque cursors, signed so a changed one is refused ----------
const PAGE_SIZE = 10;
const CURSOR_KEY = crypto.randomBytes(16);
const sign = (body) => crypto.createHmac('sha256', CURSOR_KEY).update(body).digest('base64url').slice(0, 16);
const cursorFor = (offset) => { const body = Buffer.from(JSON.stringify({ o: offset })).toString('base64url'); return `${body}.${sign(body)}`; };
function offsetOf(cursor, total) {
  if (cursor === undefined) return 0;
  const [body, mac] = String(cursor).split('.');
  let offset = null;
  try { if (body && mac === sign(body)) offset = JSON.parse(Buffer.from(body, 'base64url').toString()).o; } catch { /* below */ }
  if (!Number.isInteger(offset) || offset < 0 || offset >= total) throw new RpcError(CODE.invalidParams, 'Invalid cursor');
  return offset;
}
function page(items, params) {
  const offset = offsetOf(params?.cursor, items.length);
  const next = offset + PAGE_SIZE;
  return { items: items.slice(offset, next), ...(next < items.length ? { nextCursor: cursorFor(next) } : {}) };
}

// ---------- dispatch ----------
const inflight = new Map(); // request id → AbortController, so notifications/cancelled can stop it
const METHODS = {
  ping: () => ({}),
  initialize: (params, session) => initialize(params, session),
  'tools/list': (params) => { offsetOf(params?.cursor, 0); return { tools: tools.map(listedTool) }; },
  'tools/call': (params, session, signal) => callTool(params, signal),
  'resources/list': (params) => { const p = page(COURSES.map(resourceOf), params); return { resources: p.items, ...(p.nextCursor ? { nextCursor: p.nextCursor } : {}) }; },
  'resources/templates/list': () => ({ resourceTemplates: TEMPLATES }),
  'resources/read': (params) => readResource(params),
  'prompts/list': () => ({ prompts: PROMPTS }),
  'prompts/get': (params) => getPrompt(params),
};

/** One incoming message → the response to send, or null (notifications, responses, cancelled requests). */
async function handle(msg, session) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return failure(null, CODE.invalidRequest, 'Invalid Request: send one JSON-RPC object');
  const { id, method, params } = msg;
  if (method === undefined && ('result' in msg || 'error' in msg)) return null; // a response to us: we never ask anything
  if (typeof method !== 'string' || msg.jsonrpc !== '2.0') return id === undefined ? null : failure(typeof id === 'string' || typeof id === 'number' ? id : null, CODE.invalidRequest, 'Invalid Request: needs "jsonrpc": "2.0" and a method');
  if (id === undefined) { // a notification: never answered
    if (method === 'notifications/cancelled') inflight.get(params?.requestId)?.abort(params?.reason ?? 'cancelled');
    return null;
  }
  if (typeof id !== 'string' && typeof id !== 'number') return failure(null, CODE.invalidRequest, 'Invalid Request: the id must be a string or a number');
  if (!session.ready && method !== 'initialize' && method !== 'ping') return failure(id, CODE.invalidRequest, 'Not initialized: send initialize first');
  const run = METHODS[method];
  if (!run) return failure(id, CODE.methodNotFound, `Method not found: ${method}`);
  const controller = new AbortController();
  inflight.set(id, controller);
  try {
    const result = await run(params, session, controller.signal);
    return controller.signal.aborted ? null : ok(id, result);
  } catch (e) {
    if (controller.signal.aborted) return null;
    if (e instanceof RpcError) return failure(id, e.code, e.message, e.data);
    log('internal error:', e?.stack ?? e);
    return failure(id, CODE.internal, 'Internal error');
  } finally {
    inflight.delete(id);
  }
}

// ---------- transports ----------
function serveStdio() {
  const session = { ready: false };
  const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', async (line) => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch { return send(failure(null, CODE.parse, 'Parse error')); }
    const response = await handle(msg, session); // each line runs on its own: a slow call never blocks the next one
    if (response) send(response);
  });
  log('library MCP server on stdio');
}

// M5 · Streamable HTTP, without sessions: every POST carries one message; the bearer token guards the door.
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
const MAX_BODY = 1_000_000;
/** The request body as text, or null when it is larger than MAX_BODY. */
async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
const digest = (text) => crypto.createHash('sha256').update(String(text)).digest();
function serveHttp(port) {
  const token = process.env.LIBRARY_TOKEN ?? '';
  if (token.length < 16) {
    log('LIBRARY_TOKEN is not set (16+ characters): no HTTP server without a token.');
    process.exit(1);
  }
  const authorized = (header) => {
    const given = /^Bearer\s+(.+)$/i.exec(String(header ?? ''))?.[1]?.trim() ?? '';
    return crypto.timingSafeEqual(digest(given), digest(token)); // same length, no early exit: no timing hints
  };
  const session = { ready: true }; // no session to remember a handshake in: HTTP requests stand alone
  const server = http.createServer(async (req, res) => {
    const reply = (status, body, headers = {}) => {
      res.writeHead(status, { ...(body ? { 'content-type': 'application/json' } : {}), ...headers });
      res.end(body ? JSON.stringify(body) : undefined);
    };
    if (new URL(req.url, 'http://127.0.0.1').pathname !== '/mcp') return reply(404, failure(null, CODE.invalidRequest, 'Not found: the MCP endpoint is /mcp'));
    if (req.headers.origin && !LOCAL_ORIGIN.test(req.headers.origin)) return reply(403, failure(null, CODE.invalidRequest, 'Forbidden: this server only accepts local origins'));
    if (!authorized(req.headers.authorization)) return reply(401, failure(null, CODE.invalidRequest, 'Unauthorized: send Authorization: Bearer <token>'), { 'www-authenticate': 'Bearer realm="studybuddy-library"' });
    if (req.method !== 'POST') return reply(405, null, { allow: 'POST' });
    const version = req.headers['mcp-protocol-version'];
    if (version && !VERSIONS.includes(version)) return reply(400, failure(null, CODE.invalidRequest, `Unsupported MCP-Protocol-Version: ${version}. Supported: ${VERSIONS.join(', ')}`));
    const body = await readBody(req);
    if (body === null) return reply(413, failure(null, CODE.invalidRequest, 'Request body too large'), { connection: 'close' });
    let msg;
    try { msg = JSON.parse(body); } catch { return reply(400, failure(null, CODE.parse, 'Parse error')); }
    const response = await handle(msg, session);
    return response ? reply(200, response) : reply(202);
  });
  server.listen(port, '127.0.0.1', () => log(`library MCP server on http://127.0.0.1:${server.address().port}/mcp`));
}

const argv = process.argv.slice(2);
if (argv.includes('--http')) serveHttp(Number(argv[argv.indexOf('--port') + 1] ?? 0) || 0);
else serveStdio();
