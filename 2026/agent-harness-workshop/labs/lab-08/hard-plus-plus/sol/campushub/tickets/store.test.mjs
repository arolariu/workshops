import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATUSES, TICKETS_FILE, TicketError, getTicket, listTickets, readTickets, updateTicket } from './store.mjs';

// Every test works on a scratch copy inside tickets/, never on tickets.json itself (and never in a temp folder).
const HERE = path.dirname(fileURLToPath(import.meta.url));
let dir;
let n = 0;
before(() => { dir = fs.mkdtempSync(path.join(HERE, '.scratch-')); });
after(() => fs.rmSync(dir, { recursive: true, force: true }));
const scratch = (text = fs.readFileSync(TICKETS_FILE, 'utf8')) => {
  const file = path.join(dir, `tickets-${++n}.json`);
  fs.writeFileSync(file, text);
  return file;
};
const failsWith = (fn, code) => assert.throws(fn, (e) => e instanceof TicketError && e.code === code);

test('the shipped file holds a dozen valid tickets', () => {
  const tickets = readTickets();
  assert.equal(tickets.length, 12);
  assert.equal(new Set(tickets.map((t) => t.id)).size, 12);
  for (const t of tickets) {
    assert.match(t.id, /^CH-\d+$/);
    assert.ok(STATUSES.includes(t.status), `${t.id} has status ${t.status}`);
    assert.ok(t.assignee === null || typeof t.assignee === 'string');
    assert.ok(Array.isArray(t.labels) && t.title && t.body);
  }
});

test('list filters by status, assignee, label and text, in id order', () => {
  const file = scratch();
  assert.equal(listTickets({}, file).length, 12);
  assert.deepEqual(listTickets({ status: 'open' }, file).map((t) => t.id), ['CH-105', 'CH-106', 'CH-108', 'CH-109']);
  assert.deepEqual(listTickets({ assignee: 'radu.matei' }, file).map((t) => t.id), ['CH-104', 'CH-107']);
  assert.deepEqual(listTickets({ label: 'WEB', status: 'closed' }, file).map((t) => t.id), ['CH-111']);
  assert.deepEqual(listTickets({ text: 'digest' }, file).map((t) => t.id), ['CH-104', 'CH-107']);
  assert.deepEqual(listTickets({ assignee: null }, file).map((t) => t.id), ['CH-105']);
});

test('get finds a ticket whatever the case, or returns null', () => {
  const file = scratch();
  assert.equal(getTicket('ch-108', file).title, 'Release 1.4.0');
  assert.equal(getTicket('CH-999', file), null);
});

test('update changes the editable fields and keeps everything else', () => {
  const file = scratch();
  const before = JSON.parse(fs.readFileSync(file, 'utf8'));
  const t = updateTicket('CH-105', { status: 'in-progress', assignee: 'ioana.dobre', labels: ['web', 'accessibility', 'ux'] }, file);
  assert.deepEqual([t.status, t.assignee, t.labels], ['in-progress', 'ioana.dobre', ['web', 'accessibility', 'ux']]);
  const after = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(after.tickets.find((x) => x.id === 'CH-105'), t);
  assert.deepEqual({ ...after, tickets: after.tickets.filter((x) => x.id !== 'CH-105') }, { ...before, tickets: before.tickets.filter((x) => x.id !== 'CH-105') });
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp')), []);
  assert.equal(updateTicket('ch-106', { assignee: null }, file).assignee, null);
});

test('a bad update throws and leaves the file as it was', () => {
  const file = scratch();
  const text = fs.readFileSync(file, 'utf8');
  failsWith(() => updateTicket('CH-999', { status: 'done' }, file), 'not-found');
  failsWith(() => updateTicket('CH-101', { title: 'Renamed' }, file), 'not-editable');
  failsWith(() => updateTicket('CH-101', { id: 'CH-1' }, file), 'not-editable');
  failsWith(() => updateTicket('CH-101', { status: 'finished' }, file), 'bad-status');
  failsWith(() => updateTicket('CH-101', { assignee: 42 }, file), 'bad-assignee');
  failsWith(() => updateTicket('CH-101', { labels: 'api' }, file), 'bad-labels');
  failsWith(() => updateTicket('CH-101', { labels: ['api', ''] }, file), 'bad-labels');
  failsWith(() => updateTicket('CH-101', {}, file), 'not-editable');
  assert.equal(fs.readFileSync(file, 'utf8'), text);
});

test('a file without a tickets list is reported, not guessed at', () => {
  failsWith(() => readTickets(scratch('{"project": "CampusHub"}')), 'bad-file');
  failsWith(() => readTickets(scratch('not json')), 'bad-file');
});
