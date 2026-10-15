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
const DATA = JSON.parse(fs.readFileSync(path.join(HERE, 'portal-data.json'), 'utf8'));
const DAY = 24 * 60 * 60 * 1000;
const daysLeft = (date) => Math.round((Date.parse(date) - Date.parse(DATA.today)) / DAY);

// Assignments marked done through mark_done are remembered in a small JSON file.
const STATE_FILE = process.env.STUDYBUDDY_STATE || path.join(HERE, 'state.json');
const loadState = () => {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { done: [] }; }
};
const isDone = (a) => a.done || loadState().done.includes(a.id);

// Every tool has a name, a description the MODEL reads to decide when to use it, a JSON Schema for its input,
// annotations (hints for the client) and a handler that returns plain data or throws an Error.
const tools = [
  {
    name: 'get_deadlines',
    description: 'List the assignments that are not done yet and are due in the next N days (default 7), soonest first.',
    inputSchema: { type: 'object', properties: { days: { type: 'number', description: 'How many days ahead to look (default 7)' } } },
    annotations: { readOnlyHint: true },
    handler: ({ days = 7 } = {}) => DATA.assignments
      .filter((a) => !isDone(a))
      .map((a) => ({ ...a, done: false, daysLeft: daysLeft(a.due) }))
      .filter((a) => a.daysLeft >= 0 && a.daysLeft <= days)
      .sort((a, b) => a.daysLeft - b.daysLeft),
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
    description: 'All upcoming exams, soonest first: course code and name, exam date, days left until the exam, and how much the exam counts towards the final grade (examWeight, in percent). Use for questions about exams and study planning.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    handler: () => DATA.courses
      .map(({ code, name, examDate, examWeight }) => ({ course: code, name, examDate, daysLeft: daysLeft(examDate), examWeight }))
      .filter((e) => e.daysLeft >= 0)
      .sort((a, b) => a.daysLeft - b.daysLeft),
  },
  {
    name: 'mark_done',
    description: 'Mark one assignment as done, by its id (e.g. A2). The change is saved. Use only when the student says they finished an assignment.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Assignment id, e.g. A2' } }, required: ['id'] },
    annotations: { readOnlyHint: false, destructiveHint: false },
    handler: ({ id } = {}) => {
      const ids = DATA.assignments.map((a) => a.id);
      const wanted = String(id ?? '').trim().toUpperCase();
      const assignment = DATA.assignments.find((a) => a.id === wanted);
      if (!assignment) throw new Error(`Unknown assignment "${id ?? ''}". Valid ids: ${ids.join(', ')}`);
      if (isDone(assignment)) throw new Error(`${assignment.id} ("${assignment.title}") is already done.`);
      const state = loadState();
      state.done = [...new Set([...state.done, assignment.id])];
      fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
      fs.writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
      return { ok: true, id: assignment.id, title: assignment.title, message: `Marked ${assignment.id} as done. Well done! 🎉` };
    },
  },
];

// ---------- JSON-RPC plumbing ----------
const send = (msg) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`);

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
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
    try {
      const data = tool.handler(params.arguments ?? {});
      return send({ id, result: { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] } });
    } catch (e) {
      // Tool errors are results with isError: true, so the model can read them and recover.
      return send({ id, result: { content: [{ type: 'text', text: e.message }], isError: true } });
    }
  }
  return send({ id, error: { code: -32601, message: `Method not found: ${method}` } });
});
console.error('🎓 StudyBuddy portal MCP server is running (stdio).');
