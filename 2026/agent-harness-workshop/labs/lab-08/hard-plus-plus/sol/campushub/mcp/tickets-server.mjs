#!/usr/bin/env node
// 🎫 CampusHub's tickets: an MCP server (stdio + JSON-RPC 2.0, zero dependencies) over tickets/store.mjs.
// Two read tools the agent may use freely, and one write tool behind a human's approval:
//   list_tickets({ status?, assignee?, label?, text? })   read-only
//   get_ticket({ id })                                     read-only
//   close_ticket({ id })                                   needs .approvals/<ID>.json from tickets/approve.mjs
// The approval is a one-time grant: close_ticket checks the ticket, the action and the time, closes the ticket and
// deletes the file. Every close_ticket call is logged to .agent-logs/tickets.jsonl. Logs go to stderr, never stdout.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { getTicket, listTickets, updateTicket, STATUSES } from '../tickets/store.mjs';
import { approvalPath } from '../tickets/approve.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOG = path.join(HERE, '..', '.agent-logs', 'tickets.jsonl');
const HOW = (id) => `Closing ${id} needs a release approver's OK: ask one to run \`node tickets/approve.mjs ${id} --as <their user name>\`, then call close_ticket again. Don't edit tickets/tickets.json or .approvals/ yourself.`;

function log(entry) {
  try {
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    fs.appendFileSync(LOG, `${JSON.stringify({ at: new Date().toISOString(), tool: 'close_ticket', ...entry })}\n`);
  } catch { /* logging must never break the tool */ }
}

/** The approval for `id`, or why there is none that can be used: { approval } | { why, message }. */
export function checkApproval(id, now = new Date()) {
  let approval;
  try {
    approval = JSON.parse(fs.readFileSync(approvalPath(id), 'utf8'));
  } catch (e) {
    return { why: e.code === 'ENOENT' ? 'no-approval' : 'bad-approval', message: `There is no usable approval for ${id}.` };
  }
  if (String(approval?.ticket ?? '').toUpperCase() !== id) return { why: 'wrong-ticket', message: `The approval in .approvals/ is for ${approval?.ticket}, not ${id}.` };
  if (approval.action !== 'close') return { why: 'wrong-action', message: `The approval for ${id} is not for closing it.` };
  if (typeof approval.by !== 'string' || !approval.by.trim()) return { why: 'bad-approval', message: `The approval for ${id} doesn't name who approved it.` };
  if (!(Date.parse(approval.expires) > now.getTime())) return { why: 'expired', message: `The approval for ${id} expired at ${approval.expires}.` };
  return { approval };
}

class ToolError extends Error {}

export const tools = [
  {
    name: 'list_tickets',
    description: 'List CampusHub tickets (id, title, status, assignee, labels), filtered by status, assignee, label or a text in the title or body. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: STATUSES, description: 'Only tickets with this status' },
        assignee: { type: 'string', description: 'Only tickets assigned to this user name' },
        label: { type: 'string', description: 'Only tickets with this label, e.g. release' },
        text: { type: 'string', description: 'Only tickets whose title or body contains this text' },
      },
    },
    annotations: { title: 'List tickets', readOnlyHint: true, openWorldHint: false },
    handler: ({ status, assignee, label, text } = {}) => listTickets({ status, assignee, label, text }).map(({ body, ...t }) => t),
  },
  {
    name: 'get_ticket',
    description: 'One CampusHub ticket by id (CH-108), with its body: a release ticket\'s body starts with its scope ("Scope: CH-104 and CH-105."). Read-only.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'The ticket id, e.g. CH-108' } }, required: ['id'] },
    annotations: { title: 'Get a ticket', readOnlyHint: true, openWorldHint: false },
    handler: ({ id } = {}) => {
      const t = getTicket(String(id ?? ''));
      if (!t) throw new ToolError(`There is no ticket ${id}.`);
      return t;
    },
  },
  {
    name: 'close_ticket',
    description: 'Close a CampusHub ticket. Needs a release approver\'s one-time approval (tickets/approve.mjs): without it the ticket stays as it is and the answer says how to get one.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'The ticket id, e.g. CH-112' } }, required: ['id'] },
    annotations: { title: 'Close a ticket (needs approval)', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: ({ id } = {}) => {
      const ticket = getTicket(String(id ?? ''));
      if (!ticket) {
        log({ ticket: String(id ?? ''), outcome: 'refused', why: 'unknown-ticket' });
        throw new ToolError(`There is no ticket ${id}.`);
      }
      if (ticket.status === 'closed') return { id: ticket.id, status: 'closed', note: `${ticket.id} was closed already.` };
      const { approval, why, message } = checkApproval(ticket.id);
      if (!approval) {
        log({ ticket: ticket.id, outcome: 'refused', why });
        throw new ToolError(`${message} ${HOW(ticket.id)}`);
      }
      fs.rmSync(approvalPath(ticket.id), { force: true }); // used once, even if the write below fails
      const closed = updateTicket(ticket.id, { status: 'closed' });
      log({ ticket: ticket.id, outcome: 'closed', by: approval.by });
      return { id: closed.id, status: closed.status, approvedBy: approval.by };
    },
  },
];

// ---------- JSON-RPC plumbing: you don't need to change anything below this line ----------
const send = (msg) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`);
const sameFile = (a, b) => { try { return fs.realpathSync.native(a) === fs.realpathSync.native(b); } catch { return false; } };
if (process.argv[1] && sameFile(process.argv[1], fileURLToPath(import.meta.url))) {
  readline.createInterface({ input: process.stdin }).on('line', (line) => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch { return send({ id: null, error: { code: -32700, message: 'Parse error' } }); }
    const { id, method, params } = msg;
    if (id === undefined || id === null) return; // a notification: nothing to answer
    if (method === 'initialize') return send({ id, result: { protocolVersion: params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'campushub-tickets', version: '1.0.0' } } });
    if (method === 'ping') return send({ id, result: {} });
    if (method === 'tools/list') return send({ id, result: { tools: tools.map(({ handler, ...tool }) => tool) } });
    if (method === 'tools/call') {
      const tool = tools.find((t) => t.name === params?.name);
      if (!tool) return send({ id, error: { code: -32602, message: `Unknown tool: ${params?.name}` } });
      try {
        return send({ id, result: { content: [{ type: 'text', text: JSON.stringify(tool.handler(params.arguments ?? {}), null, 2) }] } });
      } catch (e) {
        // Tool errors are results with isError: true, so the model can read them and recover.
        return send({ id, result: { content: [{ type: 'text', text: e instanceof ToolError ? e.message : `${tool.name} failed: ${e.message}` }], isError: true } });
      }
    }
    return send({ id, error: { code: -32601, message: `Method not found: ${method}` } });
  });
  console.error('🎫 CampusHub tickets MCP server is running (stdio).');
}
