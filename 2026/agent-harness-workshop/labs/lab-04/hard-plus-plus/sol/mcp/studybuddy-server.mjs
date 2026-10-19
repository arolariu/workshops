#!/usr/bin/env node
// 🎓 StudyBuddy portal: a tiny MCP server (stdio + JSON-RPC 2.0, zero dependencies).
// It pretends to be your university portal so the agent can answer "what's due this week?".
//
// The protocol in one breath: the client (Copilot) starts this process, sends one JSON message per line on
// stdin, and we answer one JSON message per line on stdout. Logs go to stderr, never to stdout.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// The study board lives in its own module. If it can't be loaded (say, the server was copied without it), the portal
// still starts, and every other tool works.
const boardTool = await import('./board.mjs').then((m) => m.boardTool ?? null, (e) => {
  console.error(`🎓 The study board is off: ./board.mjs could not be loaded (${String(e?.message ?? e).split('\n')[0]}).`);
  return null;
});
const DATA = JSON.parse(fs.readFileSync(path.join(HERE, 'portal-data.json'), 'utf8'));
const DAY = 24 * 60 * 60 * 1000;
const daysLeft = (date) => Math.round((Date.parse(date) - Date.parse(DATA.today)) / DAY);

// Assignments marked done through mark_done are remembered in a small JSON file: { "done": ["A2"] }.
const STATE_FILE = path.resolve(process.env.STUDYBUDDY_STATE || path.join(HERE, 'state.json'));
/** { ok: true, done } (no file yet = nothing done), or { ok: false, why } when the file can't be trusted. */
function readState() {
  let text;
  try { text = fs.readFileSync(STATE_FILE, 'utf8'); } catch (e) {
    return e.code === 'ENOENT' ? { ok: true, done: [] } : { ok: false, why: e.code ?? e.message };
  }
  try {
    const state = JSON.parse(text);
    if (!Array.isArray(state?.done) || !state.done.every((id) => typeof id === 'string')) return { ok: false, why: 'it has no "done" list of ids' };
    return { ok: true, done: state.done };
  } catch {
    return { ok: false, why: 'it is not valid JSON' };
  }
}
/** Write the whole file at once: a temp file next to it, then a rename (atomic on one file system). */
function writeState(state) {
  const dir = path.dirname(STATE_FILE);
  fs.mkdirSync(dir, { recursive: true });
  removeStaleTemps(dir);
  const temp = `${STATE_FILE}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`);
    fs.renameSync(temp, STATE_FILE);
  } finally {
    fs.rmSync(temp, { force: true }); // gone after the rename; still there only if a step failed
  }
}
/** Temp files a crashed server left behind: older than a minute, so never another server's write in progress. */
function removeStaleTemps(dir) {
  const prefix = `${path.basename(STATE_FILE)}.`;
  for (const name of fs.readdirSync(dir)) {
    if (!name.startsWith(prefix) || !name.endsWith('.tmp')) continue;
    try {
      if (Date.now() - fs.statSync(path.join(dir, name)).mtimeMs > 60_000) fs.rmSync(path.join(dir, name), { force: true });
    } catch { /* already gone */ }
  }
}
const isDone = (a, state = readState()) => a.done || (state.ok && state.done.includes(a.id));

// Every tool has a name, a description the MODEL reads to decide when to use it, a JSON Schema for its input,
// annotations (hints for the client) and a handler that returns plain data or throws an Error.
const tools = [
  {
    name: 'get_deadlines',
    description: 'List the assignments that are not done yet and are due in the next N days (default 7), soonest first.',
    inputSchema: { type: 'object', properties: { days: { type: 'number', description: 'How many days ahead to look (default 7)' } } },
    annotations: { readOnlyHint: true },
    handler: ({ days = 7 } = {}) => {
      const state = readState();
      return DATA.assignments
        .filter((a) => !isDone(a, state))
        .map((a) => ({ ...a, done: false, daysLeft: daysLeft(a.due) }))
        .filter((a) => a.daysLeft >= 0 && a.daysLeft <= days)
        .sort((a, b) => a.daysLeft - b.daysLeft);
    },
  },
  {
    name: 'get_grades',
    description: 'The grades so far in one course (by course code, e.g. SE201) or in all courses, with the weight of each item and of the exam.',
    inputSchema: { type: 'object', properties: { course: { type: 'string', description: 'Course code, e.g. SE201. Leave out for all courses.' } } },
    annotations: { readOnlyHint: true },
    handler: ({ course } = {}) => {
      const list = course ? DATA.courses.filter((c) => c.code.toLowerCase() === String(course).toLowerCase()) : DATA.courses;
      if (course && !list.length) throw new Error(`Unknown course "${course}". Known courses: ${DATA.courses.map((c) => c.code).join(', ')}`);
      return list.map(({ code, name, grades, examWeight }) => ({ code, name, grades, examWeight }));
    },
  },
  {
    name: 'get_courses',
    description: 'List the courses the student is enrolled in (code and name).',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    handler: () => DATA.courses.map(({ code, name }) => ({ code, name })),
  },
  {
    name: 'get_exam_dates',
    description: 'Upcoming exams, soonest first: course code and name, exam date (YYYY-MM-DD), days left, and how much the exam counts towards the final grade (examWeight, in percent). Use it for questions about exams, revision and study planning. Optionally filter by course code or by how many days ahead to look.',
    inputSchema: {
      type: 'object',
      properties: {
        course: { type: 'string', description: 'Only this course, by code (e.g. DB220). Leave out for every course.' },
        withinDays: { type: 'integer', minimum: 1, maximum: 365, description: 'Only exams in the next N days (1-365). Leave out for all upcoming exams.' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: ({ course, withinDays } = {}) => {
      const wanted = course === undefined ? null : String(course).trim().toUpperCase();
      if (wanted !== null && !DATA.courses.some((c) => c.code === wanted)) {
        throw new Error(`Unknown course "${course}". Known courses: ${DATA.courses.map((c) => c.code).join(', ')}.`);
      }
      return DATA.courses
        .filter((c) => wanted === null || c.code === wanted)
        .map(({ code, name, examDate, examWeight }) => ({ course: code, name, examDate, daysLeft: daysLeft(examDate), examWeight }))
        .filter((e) => e.daysLeft >= 0 && (withinDays === undefined || e.daysLeft <= withinDays))
        .sort((a, b) => a.daysLeft - b.daysLeft);
    },
  },
  {
    name: 'mark_done',
    description: 'Mark one assignment as done, by its id (e.g. A2, from get_deadlines). The change is saved in the portal. Use it only when the student says they finished an assignment. Marking one that is already done changes nothing.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', minLength: 1, description: 'Assignment id, e.g. A2 (get_deadlines lists them)' } },
      required: ['id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: ({ id }) => {
      const wanted = id.trim().toUpperCase();
      const assignment = DATA.assignments.find((a) => a.id === wanted);
      if (!assignment) throw new Error(`Unknown assignment "${id}". Valid ids: ${DATA.assignments.map((a) => a.id).join(', ')}.`);
      const state = readState();
      if (!state.ok) throw new Error(`The state file (${STATE_FILE}) can't be read: ${state.why}. Nothing was changed. Ask the human to fix or delete it.`);
      const { title } = assignment;
      if (isDone(assignment, state)) return { ok: true, id: wanted, title, changed: false, message: `${wanted} ("${title}") was already done; nothing changed.` };
      writeState({ done: [...state.done, wanted] });
      return { ok: true, id: wanted, title, changed: true, message: `Marked ${wanted} ("${title}") as done. Well done! 🎉` };
    },
  },
  ...(boardTool ? [boardTool] : []), // the study board: posts written by other students (mcp/board.mjs)
];

// ---------- argument checks: every call is checked against its tool's inputSchema before the handler runs ----------
const TYPES = {
  string: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number' && Number.isFinite(v),
  integer: (v) => Number.isInteger(v),
  boolean: (v) => typeof v === 'boolean',
};
const NOUN = { string: 'a string', number: 'a number', integer: 'a whole number', boolean: 'true or false' };
/** The problems with `args` for this schema, as sentences the model can act on ([] when the call is fine). */
function checkArgs(schema = {}, args = {}) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return ['The arguments must be a JSON object.'];
  const props = schema.properties ?? {};
  const problems = [];
  for (const key of schema.required ?? []) if (args[key] === undefined) problems.push(`"${key}" is required.`);
  for (const [key, value] of Object.entries(args)) {
    const p = props[key];
    if (!p) {
      if (schema.additionalProperties === false) problems.push(`Unknown argument "${key}". This tool accepts: ${Object.keys(props).join(', ') || 'no arguments'}.`);
      continue;
    }
    const range = p.minimum !== undefined && p.maximum !== undefined ? ` between ${p.minimum} and ${p.maximum}` : '';
    if (p.type && TYPES[p.type] && !TYPES[p.type](value)) problems.push(`${key} must be ${NOUN[p.type]}${range} (got ${JSON.stringify(value)}).`);
    else if ((p.minimum !== undefined && value < p.minimum) || (p.maximum !== undefined && value > p.maximum)) problems.push(`${key} must be${range || ` at least ${p.minimum ?? '-'} and at most ${p.maximum ?? '-'}`} (got ${value}).`);
    else if (p.minLength !== undefined && String(value).trim().length < p.minLength) problems.push(`${key} must not be empty.`);
    else if (p.enum && !p.enum.includes(value)) problems.push(`${key} must be one of ${p.enum.join(', ')} (got ${JSON.stringify(value)}).`);
  }
  return problems;
}

// ---------- JSON-RPC plumbing ----------
const send = (msg) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`);
const toolError = (text) => ({ content: [{ type: 'text', text }], isError: true });

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', async (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return send({ id: null, error: { code: -32700, message: 'Parse error' } }); }
  const { id, method, params } = msg;
  if (id === undefined || id === null) return; // a notification: nothing to answer
  if (method === 'initialize') {
    return send({ id, result: { protocolVersion: params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'studybuddy-portal', version: '1.0.0' } } });
  }
  if (method === 'ping') return send({ id, result: {} });
  if (method === 'tools/list') return send({ id, result: { tools: tools.map(({ handler, ...tool }) => tool) } });
  if (method === 'tools/call') {
    const tool = tools.find((t) => t.name === params?.name);
    if (!tool) return send({ id, error: { code: -32602, message: `Unknown tool: ${params?.name}` } });
    const args = params.arguments ?? {};
    const problems = checkArgs(tool.inputSchema, args);
    // Tool errors are results with isError: true, so the model can read them and recover.
    if (problems.length) return send({ id, result: toolError(`Invalid arguments for ${tool.name}: ${problems.join(' ')}`) });
    try {
      const data = await tool.handler(args);
      return send({ id, result: { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] } });
    } catch (e) {
      return send({ id, result: toolError(e.message) });
    }
  }
  return send({ id, error: { code: -32601, message: `Method not found: ${method}` } });
});
console.error('🎓 StudyBuddy portal MCP server is running (stdio).');
