#!/usr/bin/env node
// release-notes: the commits since the last tag, grouped by Conventional Commit type, and the release-notes section
// built from them. Deterministic: the same history always gives the same notes, so the model never writes an entry.
//   node .github/skills/release-notes/scripts/changes.mjs                 JSON, from git (since the last tag)
//   node .github/skills/release-notes/scripts/changes.mjs --format md     the Markdown section for CHANGELOG.md
//   --from FILE       read a file, not git: a .json list [{ "hash", "message" }], or "<hash><TAB><subject>" lines
//   --version 1.2.0   the section's version (default: Unreleased) · --date 2026-10-19   its date
//
// Your work: parseCommit (M1), group (M2) and render (M4); the exact rules are in todo.md. Reading git and files,
// and the command line, are done for you at the bottom.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/** One commit: { hash, type, scope, subject, breaking, note, revertOf }. */
export function parseCommit(hash, message) {
  // TODO(M1): type(scope)!: subject; Revert "…"; BREAKING CHANGE: footers; the hash a revert names.
  const header = String(message ?? '').split('\n')[0].trim();
  return { hash, type: 'other', scope: null, subject: header, breaking: false, note: null, revertOf: null };
}

/** Group commits ([{ hash, message }], newest first) by type. A revert whose target is in the list cancels both. */
export function group(commits) {
  // TODO(M2): groups by type, the breaking list, and revert pairs moved to `reverted`.
  const parsed = commits.map((c) => parseCommit(c.hash, c.message));
  return { total: parsed.length, groups: {}, breaking: [], reverted: [] };
}

/** The release-notes section for CHANGELOG.md, from group()'s result. */
export function render(data, { version = 'Unreleased', date = null } = {}) {
  // TODO(M4): the exact format in todo.md.
  return '## [Unreleased]\n\nTODO\n';
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
