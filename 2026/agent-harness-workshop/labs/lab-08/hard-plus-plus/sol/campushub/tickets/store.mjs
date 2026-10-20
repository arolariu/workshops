// The fake ticket system: tickets/tickets.json, read and changed only through these functions.
// Everything is synchronous and takes the file last, so a tool (or a test) can point it at a copy.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TICKETS_FILE = fileURLToPath(new URL('./tickets.json', import.meta.url));
export const STATUSES = Object.freeze(['open', 'in-progress', 'blocked', 'done', 'closed']);
const EDITABLE = ['status', 'assignee', 'labels'];

/** A ticket problem with a stable `code`: bad-file, not-found, not-editable, bad-status, bad-assignee, bad-labels. */
export class TicketError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'TicketError';
    this.code = code;
  }
}

const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const number = (id) => Number(String(id).split('-')[1]);

function load(file) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new TicketError('bad-file', `Cannot read ${path.basename(file)}: ${e.message}`);
  }
  if (!Array.isArray(data?.tickets)) throw new TicketError('bad-file', `${path.basename(file)} has no "tickets" list.`);
  return data;
}

// Write next to the target, then rename over it: readers see the old file or the new one, never half of one.
function writeAtomic(file, text) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, file);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/** Every ticket, in file order: { id, title, status, assignee (null = nobody), labels, body }. */
export function readTickets(file = TICKETS_FILE) {
  return load(file).tickets;
}

/** The tickets that match every filter given: status, assignee (null = unassigned), label, text (title or body). */
export function listTickets({ status, assignee, label, text } = {}, file = TICKETS_FILE) {
  return readTickets(file)
    .filter((t) => !status || t.status === status)
    .filter((t) => assignee === undefined || (assignee === null ? t.assignee === null : same(t.assignee ?? '', assignee)))
    .filter((t) => !label || t.labels.some((l) => same(l, label)))
    .filter((t) => !text || `${t.title}\n${t.body}`.toLowerCase().includes(String(text).toLowerCase()))
    .sort((a, b) => number(a.id) - number(b.id));
}

/** One ticket by id (CH-108 or ch-108), or null. */
export function getTicket(id, file = TICKETS_FILE) {
  return readTickets(file).find((t) => same(t.id, id)) ?? null;
}

/** Changes a ticket's status, assignee or labels, saves the file and returns the new ticket. Nothing else changes. */
export function updateTicket(id, changes, file = TICKETS_FILE) {
  const keys = Object.keys(changes ?? {});
  const locked = keys.filter((k) => !EDITABLE.includes(k));
  if (!keys.length || locked.length) {
    throw new TicketError('not-editable', `Only ${EDITABLE.join(', ')} can change${locked.length ? `, not ${locked.join(', ')}` : ''}.`);
  }
  if ('status' in changes && !STATUSES.includes(changes.status)) {
    throw new TicketError('bad-status', `The status must be one of ${STATUSES.join(', ')}.`);
  }
  if ('assignee' in changes && changes.assignee !== null && !(typeof changes.assignee === 'string' && changes.assignee.trim())) {
    throw new TicketError('bad-assignee', 'The assignee is a user name, or null for nobody.');
  }
  if ('labels' in changes && !(Array.isArray(changes.labels) && changes.labels.every((l) => typeof l === 'string' && l.trim()))) {
    throw new TicketError('bad-labels', 'The labels are a list of words.');
  }
  const data = load(file);
  const ticket = data.tickets.find((t) => same(t.id, id));
  if (!ticket) throw new TicketError('not-found', `There is no ticket ${id}.`);
  Object.assign(ticket, changes);
  writeAtomic(file, `${JSON.stringify(data, null, 2)}\n`);
  return structuredClone(ticket);
}
