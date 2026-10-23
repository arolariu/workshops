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

// ---------- the decisions: TODO(M5) ----------
// TODO(M5): HARNESS.md needs a "## Rollback runbook" too: numbered steps from the dry run to the patch release.

/** The files a rollback restores (POSIX paths, relative to this folder). */
export function isAgentFacing(p) {
  // TODO(M5): AGENTS.md (at any depth), instructions, skills, agents, hooks, the MCP config and server, and the APM
  // manifest and lock. Not the workflows, CODEOWNERS, scripts, evals, attacks, CHANGELOG.md or harness.json.
  return false;
}

/** What rolling back to `tag` changes: [{ path, action: 'restore' | 'remove' | 'bring back' }], sorted by path. */
export function plan(tag) {
  // TODO(M5): refuse (throw new Refused(…)) outside a git repository and when the tag doesn't exist (name it);
  // then ask git which files differ between the tag and the working tree (nameStatus() reads the -z output),
  // keep the agent-facing ones, and turn each status into an action (ACTIONS).
  throw new Refused(`TODO(M5): plan() can't tell what rolling back to ${tag} would change yet.`);
}

/** Restores `changes` from `tag` in the working tree; refuses while one of them has uncommitted changes. */
export function restore(tag, changes) {
  // TODO(M5): refuse when one of the files has uncommitted changes; then restore them all from the tag, in the
  // working tree only (git restore --source … --worktree -- …).
  throw new Refused('TODO(M5): restore() is not written yet.');
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
