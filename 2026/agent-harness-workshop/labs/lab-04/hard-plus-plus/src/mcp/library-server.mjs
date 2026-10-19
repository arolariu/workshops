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
// on stdin/stdout, an HTTP listener). Yours: everything the protocol says (TODO(M1) … TODO(M6)).
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
// TODO(M1): the versions you speak (newest first: 2025-11-25, 2025-06-18, 2025-03-26), your capabilities (only what
// you implement), and initialize(params, session): the client's version if you support it, else your newest; mark the
// session ready; return { protocolVersion, capabilities, serverInfo: SERVER_INFO }.

// ---------- M2 · tools, resources and prompts ----------
// The tools' logic is given. TODO(M2): list them (tools/list, without `run`) and call them (tools/call): unknown tool →
// RpcError -32602; checkArgs() problems → a result with isError: true; the data → { content: [{ type: "text",
// text: JSON }], structuredContent: data }; an Error from run → a result with isError: true.
// Then resources (library://courses/{code}: list, templates/list, read; not found → -32002) and the prompt study_plan
// (prompts/list, prompts/get; a missing or wrong argument → -32602).
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
    run: ({ query, level, limit = 10 }) => ({ courses: search(query, level).slice(0, limit) }),
  },
  {
    name: 'get_course',
    title: 'One course',
    description: 'One course from the catalogue by its code (e.g. DB220): title, level, credits, summary and prerequisites.',
    inputSchema: { type: 'object', properties: { code: { type: 'string', minLength: 2, description: 'Course code, e.g. DB220' } }, required: ['code'], additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
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
    run: async ({ course, weeks }, { signal } = {}) => {
      const c = findCourse(course);
      if (!c) throw new Error(`Unknown course "${course}". Find codes with search_courses.`);
      const plan = [];
      for (let week = 1; week <= weeks; week++) {
        await sleep(STEP_MS, signal); // the slow part: it stops as soon as `signal` aborts
        plan.push({ week, focus: week === weeks ? 'Revision and a practice exam' : `${c.title}, part ${week}` });
      }
      return { course: c.code, title: c.title, weeks: plan };
    },
  },
  // TODO(M6): version the schemas: _meta: { "dev.studybuddy/schema-version": 2 } on search_courses (1 on the others).
  // Add find_courses({ q }), the v1 search: listed as deprecated (description starts "Deprecated: use search_courses";
  // _meta["dev.studybuddy/deprecated"] = { replacedBy: "search_courses", removeAfter: "2027-01-31" }), still working,
  // and every result says it is deprecated.
];

// ---------- M3 · pages ----------
// TODO(M3): resources/list serves at most 10 courses per page, with an opaque nextCursor until the last page (sign it,
// e.g. with crypto.createHmac, so a changed cursor is refused). A cursor you didn't make → RpcError -32602.

// ---------- M4 · cancel and time out ----------
// TODO(M4): keep an AbortController per running request (a Map by id). notifications/cancelled aborts it, and the
// cancelled request gets no response at all. Give every tools/call a deadline (AbortSignal.timeout(TIMEOUT_MS)); pass
// AbortSignal.any([cancelled, deadline]) to run(); a call that runs out of time → a result with isError: true.

/** One incoming message → the response to send, or null (notifications, responses, cancelled requests). */
async function handle(msg, session) {
  // TODO(M1): tell requests (id and method), notifications (method, no id) and anything else apart; notifications never
  // get an answer. Answer ping ({}) and initialize at any time; refuse other requests until initialize. A message
  // without "jsonrpc": "2.0" or a method → -32600; an unknown method → -32601; your RpcErrors → their code.
  return null;
}

// ---------- given: the stdio transport ----------
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

// ---------- M5 · Streamable HTTP with a bearer token ----------
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
function serveHttp(port) {
  // TODO(M5): no LIBRARY_TOKEN (16+ characters) → say so on stderr and exit 1: never serve HTTP without a token.
  const session = { ready: true }; // no session to remember a handshake in: each HTTP request stands alone
  const server = http.createServer(async (req, res) => {
    const reply = (status, body, headers = {}) => {
      res.writeHead(status, { ...(body ? { 'content-type': 'application/json' } : {}), ...headers });
      res.end(body ? JSON.stringify(body) : undefined);
    };
    // TODO(M5), in this order: a path other than /mcp → 404; an Origin header that isn't local (localhost, 127.0.0.1)
    // → 403; no or a wrong "Authorization: Bearer <token>" → 401 with WWW-Authenticate: Bearer (compare with
    // crypto.timingSafeEqual, never echo the token); not POST → 405; an unsupported MCP-Protocol-Version header →
    // 400; a body over MAX_BODY → 413; JSON that doesn't parse → 400 with -32700. Then handle(): a response → 200
    // JSON, null → 202 with no body.
    reply(501, failure(null, CODE.internal, 'HTTP is not implemented yet'));
  });
  server.listen(port, '127.0.0.1', () => log(`library MCP server on http://127.0.0.1:${server.address().port}/mcp`));
}

const argv = process.argv.slice(2);
if (argv.includes('--http')) serveHttp(Number(argv[argv.indexOf('--port') + 1] ?? 0) || 0);
else serveStdio();
