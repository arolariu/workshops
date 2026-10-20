#!/usr/bin/env node
// ✅ The human side of closing a ticket: a one-time approval that the tickets MCP server's close_ticket needs.
//   node tickets/approve.mjs <ticket> --as <your user name> [--minutes 15]
// It writes .approvals/<ID>.json: { "ticket", "action": "close", "by", "expires" }. close_ticket checks it, closes
// the ticket and deletes the file, so one approval closes one ticket once. The agent never runs this script and
// never writes .approvals/ (CampusHub's policy denies both): an approval is a person's decision.
// Exit codes: 0 approved · 2 refused (arguments, an unknown ticket, a ticket that is closed already).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getTicket } from './store.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const APPROVALS_DIR = path.join(HERE, '..', '.approvals');
export const approvalPath = (id) => path.join(APPROVALS_DIR, `${String(id).toUpperCase()}.json`);

class Refused extends Error {}

export function approve(argv, { now = new Date(), file } = {}) {
  const id = argv.find((a, i) => !a.startsWith('--') && !['--as', '--minutes'].includes(argv[i - 1]));
  const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const by = opt('--as');
  const minutes = Number(opt('--minutes') ?? 15);
  if (!id || !/^CH-\d+$/i.test(id)) throw new Refused('Say which ticket: node tickets/approve.mjs CH-107 --as <your user name>');
  if (!by || !/^[\w.-]+$/.test(by)) throw new Refused('Say who approves: --as <your user name> (the approval names you).');
  if (!(Number.isInteger(minutes) && minutes >= 1 && minutes <= 60)) throw new Refused('--minutes is a whole number from 1 to 60.');
  const ticket = getTicket(id, file);
  if (!ticket) throw new Refused(`There is no ticket ${id}.`);
  if (ticket.status === 'closed') throw new Refused(`${ticket.id} is closed already.`);
  const approval = { ticket: ticket.id, action: 'close', by, expires: new Date(now.getTime() + minutes * 60000).toISOString() };
  fs.mkdirSync(APPROVALS_DIR, { recursive: true });
  fs.writeFileSync(approvalPath(ticket.id), `${JSON.stringify(approval, null, 2)}\n`);
  return approval;
}

const sameFile = (a, b) => { try { return fs.realpathSync.native(a) === fs.realpathSync.native(b); } catch { return false; } };
if (process.argv[1] && sameFile(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    const a = approve(process.argv.slice(2));
    console.log(`✅ ${a.by} approved closing ${a.ticket} until ${a.expires.slice(11, 16)} UTC. Tell the agent to go ahead.`);
  } catch (e) {
    if (!(e instanceof Refused)) throw e;
    console.error(`✗ ${e.message}`);
    process.exitCode = 2;
  }
}
