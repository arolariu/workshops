#!/usr/bin/env node
// Collect the commits since the last tag and group them by Conventional Commit type. Prints JSON.
//   node .github/skills/release-notes/scripts/changes.mjs              read from git
//   node .github/skills/release-notes/scripts/changes.mjs --from FILE  read "<hash>\t<subject>" lines from a file
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

/** Group "<hash>\t<subject>" lines by type. */
export function group(lines) {
  const groups = {};
  const breaking = [];
  let total = 0;
  for (const raw of lines) {
    const line = String(raw).trim();
    if (!line) continue;
    const [hash, ...rest] = line.split('\t');
    const message = rest.join('\t').trim();
    total++;
    const m = message.match(/^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/);
    const entry = { hash, scope: m?.[2] ?? null, subject: m ? m[4] : message };
    const type = m ? m[1].toLowerCase() : 'other';
    (groups[type] ??= []).push(entry);
    if (m?.[3]) breaking.push(entry);
  }
  return { total, groups, breaking };
}

function fromGit() {
  let since = null;
  try { since = git('describe', '--tags', '--abbrev=0'); } catch { since = null; }
  let log = '';
  try { log = git('log', '--pretty=format:%h%x09%s', ...(since ? [`${since}..HEAD`] : [])); } catch { log = ''; }
  return { since, lines: log ? log.split('\n') : [] };
}

const args = process.argv.slice(2);
const i = args.indexOf('--from');
const input = i >= 0 ? { since: null, lines: fs.readFileSync(args[i + 1], 'utf8').split(/\r?\n/) } : fromGit();
console.log(JSON.stringify({ since: input.since, ...group(input.lines) }, null, 2));
