#!/usr/bin/env node
// 📦 The scope of a CampusHub release ticket: every ticket it ships, with its status.
//   node .github/skills/campushub-release/scope.mjs CH-108
// Exit codes: 0 every ticket in scope is done · 1 some aren't (they block the release) · 2 not a release ticket.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getTicket } from '../../../tickets/store.mjs';

/** The ids on a release ticket's `Scope:` line ("Scope: CH-104 and CH-105."), in order. */
export const scopeOf = (body) => [...((String(body ?? '').match(/^Scope:([^\n]*)/m) ?? [])[1] ?? '').matchAll(/\bCH-\d+\b/gi)].map((m) => m[0].toUpperCase());

/** { release, tickets: [{ id, status, title }], blockers: [ids] }; throws when `id` isn't a release ticket. */
export function scope(id, file) {
  const release = getTicket(id, file);
  if (!release) throw new Error(`There is no ticket ${id}.`);
  if (!release.labels.includes('release')) throw new Error(`${release.id} is not a release ticket (no "release" label).`);
  const tickets = scopeOf(release.body).map((t) => getTicket(t, file) ?? { id: t, status: 'missing', title: '(no such ticket)' });
  if (!tickets.length) throw new Error(`${release.id} has no "Scope:" line naming its tickets.`);
  return { release, tickets: tickets.map(({ id: tid, status, title }) => ({ id: tid, status, title })), blockers: tickets.filter((t) => t.status !== 'done').map((t) => t.id) };
}

const sameFile = (a, b) => { try { return fs.realpathSync.native(a) === fs.realpathSync.native(b); } catch { return false; } };
if (process.argv[1] && sameFile(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    const s = scope(process.argv[2] ?? '');
    console.log(`${s.release.id} ${s.release.title}: ${s.tickets.length} ticket(s) in scope`);
    for (const t of s.tickets) console.log(`${t.status === 'done' ? '✅' : '⛔'} ${t.id} ${t.status}: ${t.title}`);
    console.log(s.blockers.length ? `Blocked by ${s.blockers.join(', ')}: they must be done before the release.` : 'Every ticket in scope is done: go on with the release.');
    process.exitCode = s.blockers.length ? 1 : 0;
  } catch (e) {
    console.error(`✗ ${e.message} Usage: node .github/skills/campushub-release/scope.mjs CH-108`);
    process.exitCode = 2;
  }
}
