#!/usr/bin/env node
// release-notes: the commits since the last tag, grouped by Conventional Commit type, and the release-notes section
// built from them. Deterministic: the same history always gives the same notes, so the model never writes an entry.
//   node .github/skills/release-notes/scripts/changes.mjs                 JSON, from git (since the last tag)
//   node .github/skills/release-notes/scripts/changes.mjs --format md     the Markdown section for CHANGELOG.md
//   --from FILE       read a file, not git: a .json list [{ "hash", "message" }], or "<hash><TAB><subject>" lines
//   --version 1.2.0   the section's version (default: Unreleased) · --date 2026-10-19   its date
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HEADER = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/;
const QUOTED_REVERT = /^Revert "(.+)"$/;
const FOOTER = /^BREAKING[ -]CHANGE:\s*(.+)$/m;
const REVERTED_HASH = /This reverts commit ([0-9a-f]{7,40})|^Refs?:\s*([0-9a-f]{7,40})/m;

/** One commit: { hash, type, scope, subject, breaking, note, revertOf }. */
export function parseCommit(hash, message) {
  const [first = '', ...rest] = String(message ?? '').replace(/\r\n/g, '\n').trim().split('\n');
  const header = first.trim();
  const body = rest.join('\n');
  const quoted = header.match(QUOTED_REVERT);
  const m = quoted ? null : header.match(HEADER);
  const type = quoted ? 'revert' : m ? m[1].toLowerCase() : 'other';
  const scope = m?.[2] ?? null;
  const subject = quoted ? quoted[1] : m ? m[4].trim() : header;
  const bang = Boolean(m?.[3]);
  const note = body.match(FOOTER)?.[1].trim() ?? null;
  const reverted = type === 'revert' ? body.match(REVERTED_HASH) : null;
  return { hash, type, scope, subject, breaking: bang || note !== null, note, revertOf: reverted ? reverted[1] ?? reverted[2] : null };
}

/** Short and full hashes name the same commit when one starts with the other. */
const sameCommit = (a, b) => Boolean(a && b) && (a.startsWith(b) || b.startsWith(a));

/** Group commits ([{ hash, message }], newest first) by type. A revert whose target is in the list cancels both. */
export function group(commits) {
  const parsed = commits.map((c) => parseCommit(c.hash, c.message));
  const cancelledBy = new Map();
  for (const c of parsed) {
    if (c.type !== 'revert' || !c.revertOf) continue;
    const target = parsed.find((x) => x !== c && sameCommit(x.hash, c.revertOf));
    if (target) {
      cancelledBy.set(target.hash, c.hash);
      cancelledBy.set(c.hash, null);
    }
  }
  const groups = {};
  const breaking = [];
  const reverted = [];
  for (const c of parsed) {
    if (cancelledBy.has(c.hash)) {
      const by = cancelledBy.get(c.hash);
      if (by) reverted.push({ hash: c.hash, scope: c.scope, subject: c.subject, by });
      continue;
    }
    (groups[c.type] ??= []).push({ hash: c.hash, scope: c.scope, subject: c.subject });
    if (c.breaking) breaking.push({ hash: c.hash, type: c.type, scope: c.scope, subject: c.subject, note: c.note });
  }
  return { total: parsed.length, groups, breaking, reverted };
}

const SECTIONS = [['feat', '### ✨ Features'], ['fix', '### 🐛 Fixes']];
const entry = (e) => `- ${e.scope ? `**${e.scope}:** ` : ''}${e.subject} (${e.hash})`;

/** The release-notes section for CHANGELOG.md, from group()'s result. */
export function render(data, { version = 'Unreleased', date = null } = {}) {
  const title = !version || version === 'Unreleased' ? '## [Unreleased]' : `## [${version}]${date ? ` - ${date}` : ''}`;
  const breakingHashes = new Set(data.breaking.map((e) => e.hash));
  const parts = [title];
  if (data.breaking.length) parts.push(['### 💥 Breaking changes', ...data.breaking.map((e) => (e.note ? `${entry(e)}\n  ${e.note}` : entry(e)))].join('\n'));
  for (const [type, heading] of SECTIONS) {
    const listed = (data.groups[type] ?? []).filter((e) => !breakingHashes.has(e.hash));
    if (listed.length) parts.push([heading, ...listed.map(entry)].join('\n'));
  }
  const reverts = data.groups.revert ?? [];
  if (reverts.length) parts.push(['### ⏪ Reverted', ...reverts.map(entry)].join('\n'));
  if (parts.length === 1) parts.push('No user-facing changes.');
  return `${parts.join('\n\n')}\n`;
}

// ---------- reading the history (given) ----------

/** The commits since the last tag (every commit when there is no tag), newest first, with their full messages. */
export function readGit({ cwd = process.cwd() } = {}) {
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  let since = null;
  try { since = git('describe', '--tags', '--abbrev=0').trim() || null; } catch { since = null; }
  let log = '';
  try { log = git('log', '--format=%h%x1f%B%x1e', ...(since ? [`${since}..HEAD`] : [])); } catch { log = ''; }
  const commits = log.split('\x1e').map((r) => r.trim()).filter(Boolean).map((r) => {
    const [hash, ...message] = r.split('\x1f');
    return { hash: hash.trim(), message: message.join('\x1f').trim() };
  });
  return { since, commits };
}

/** A file instead of git: a .json list [{ hash, message }], or "<hash><TAB><subject>" lines. */
export function readFrom(file) {
  const text = fs.readFileSync(file, 'utf8');
  if (/\.json$/i.test(file)) return { since: null, commits: JSON.parse(text).map((c) => ({ hash: c.hash, message: c.message })) };
  const commits = text.split(/\r?\n/).filter((l) => l.trim()).map((l) => {
    const [hash, ...rest] = l.split('\t');
    return { hash: hash.trim(), message: rest.join('\t').trim() };
  });
  return { since: null, commits };
}

function main(argv) {
  const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const input = opt('--from') ? readFrom(opt('--from')) : readGit();
  const data = group(input.commits);
  if (opt('--format') === 'md') process.stdout.write(render(data, { version: opt('--version') ?? 'Unreleased', date: opt('--date') ?? null }));
  else console.log(JSON.stringify({ since: input.since, ...data }, null, 2));
}

const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } };
if (isMain()) main(process.argv.slice(2));
