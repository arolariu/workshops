#!/usr/bin/env node
// Roll the harness back to a released version: restore the files the agent runs with from the tag v<version>.
//
//   node scripts/rollback.mjs --to <version> [--dry-run] [--json]
//
// --dry-run lists what it would restore, remove or bring back, and changes nothing. Without it, the files change in
// the working tree only (nothing is staged or committed): then run the checks, open a pull request, and release
// the rollback as a new patch version (HARNESS.md, "Rollback runbook").
//
// A rollback restores the agent-facing harness: AGENTS.md, instructions, skills, agents, hooks, the MCP config and
// server, and the APM manifest and lock. It never touches the change control (workflows, CODEOWNERS, the scripts,
// evals and attacks: the newest checks judge the old harness) or the history (CHANGELOG.md, harness.json).
//
// Exit codes: 0 listed or restored (also when nothing differs), 1 a restore failed, 2 refused (arguments, no such
// tag, not a git repository, uncommitted changes to a harness file).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export class Refused extends Error {}

// ---------- plumbing ----------
/** Runs git in this folder. Throws Refused when it fails, unless `allowFail`. */
export function git(args, { cwd = ROOT, allowFail = false } = {}) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  if (r.error?.code === 'ENOENT') throw new Refused('git is not installed (or not on PATH).');
  if (r.status !== 0 && !allowFail) throw new Refused(`git ${args.join(' ')} failed: ${`${r.stderr}${r.stdout}`.trim()}`);
  return { code: r.status, out: r.stdout ?? '', err: (r.stderr ?? '').trim() };
}
/** `git diff --name-status -z` output as [{ status, path }] (paths relative to this folder, POSIX). */
export function nameStatus(out) {
  const f = out.split('\0').filter(Boolean);
  const list = [];
  for (let i = 0; i + 1 < f.length; i += 2) list.push({ status: f[i][0], path: f[i + 1] });
  return list;
}
/** The tag for a version: '1.0.0' and 'v1.0.0' both give 'v1.0.0'. */
export const tagOf = (version) => `v${String(version).replace(/^v/, '')}`;
export const ACTIONS = { M: 'restore', A: 'remove', D: 'bring back' };

// ---------- the decisions ----------
/** The files a rollback restores (POSIX paths, relative to this folder). */
export function isAgentFacing(p) {
  return /(^|\/)AGENTS\.md$/.test(p)
    || /\.instructions\.md$/.test(p)
    || p === '.github/copilot-instructions.md'
    || /^\.github\/(agents|skills|hooks|instructions|prompts)\//.test(p)
    || p === '.mcp.json' || p === '.github/mcp.json'
    || /^mcp\//.test(p)
    || p === 'apm.yml' || p === 'apm.lock.yaml';
}

/** What rolling back to `tag` changes: [{ path, action: 'restore' | 'remove' | 'bring back' }], sorted by path. */
export function plan(tag) {
  if (git(['rev-parse', '--git-dir'], { allowFail: true }).code !== 0) throw new Refused('This folder is not in a git repository, so there are no tags to roll back to.');
  if (git(['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`], { allowFail: true }).code !== 0) {
    const tags = git(['tag', '--list', 'v*', '--sort=-v:refname']).out.split('\n').filter(Boolean);
    throw new Refused(`There is no tag ${tag}.${tags.length ? ` Released versions: ${tags.slice(0, 10).join(', ')}.` : ' No version has been released yet (scripts/release.mjs tags them).'}`);
  }
  const diff = git(['diff', '--name-status', '--no-renames', '--relative', '-z', tag]).out;
  return nameStatus(diff)
    .filter((c) => isAgentFacing(c.path) && ACTIONS[c.status])
    .map((c) => ({ path: c.path, action: ACTIONS[c.status] }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** Restores `changes` from `tag` in the working tree; refuses while one of them has uncommitted changes. */
export function restore(tag, changes) {
  if (!changes.length) return;
  const dirty = new Set(git(['diff', '--name-only', '--relative', '-z', 'HEAD']).out.split('\0').filter(Boolean));
  const touched = changes.filter((c) => dirty.has(c.path)).map((c) => c.path);
  if (touched.length) throw new Refused(`Commit or stash your changes to these harness files first, so the rollback doesn't overwrite them: ${touched.join(', ')}`);
  git(['restore', `--source=${tag}`, '--worktree', '--', ...changes.map((c) => `:(literal)${c.path}`)]);
}

// ---------- the command ----------
export function main(argv) {
  const dryRun = argv.includes('--dry-run');
  const asJson = argv.includes('--json');
  const i = argv.indexOf('--to');
  const version = i >= 0 ? argv[i + 1] : undefined;
  const unknown = argv.filter((a, j) => !['--dry-run', '--json', '--to'].includes(a) && j !== i + 1);
  if (unknown.length) throw new Refused(`Unknown argument: ${unknown.join(' ')}`);
  if (!version || version.startsWith('--') || !/^v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(version)) throw new Refused('Say which version to roll back to: node scripts/rollback.mjs --to <version> [--dry-run] [--json]');
  const tag = tagOf(version);
  const changes = plan(tag);
  if (!dryRun) restore(tag, changes);

  if (asJson) console.log(JSON.stringify({ to: tag, dryRun, changes }, null, 2));
  else {
    if (!changes.length) console.log(`The agent-facing harness is already the same as ${tag}: nothing to roll back.`);
    else {
      console.log(`${dryRun ? 'Would roll back' : 'Rolled back'} ${changes.length} harness file${changes.length === 1 ? '' : 's'} to ${tag}${dryRun ? ' (dry run: nothing changed)' : ' (in the working tree)'}:`);
      for (const c of changes) console.log(`  ${c.action.padEnd(10)} ${c.path}`);
    }
    console.log(dryRun
      ? `Next: node scripts/rollback.mjs --to ${version.replace(/^v/, '')}, then the checks, a pull request and a patch release.`
      : 'Next: run the checks (harness-check, attack.mjs, node --test, the eval self-test), open a pull request, and release it as a patch.');
  }
  return 0;
}

const sameFile = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
if (process.argv[1] && sameFile(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(e instanceof Refused ? e.message : e.stack);
    process.exitCode = e instanceof Refused ? 2 : 1;
  }
}
