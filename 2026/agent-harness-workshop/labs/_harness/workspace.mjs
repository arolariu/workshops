// Git helpers for one level's src/ folder: what changed, and how to start over.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const git = (cwd, args) => spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 10000 });

/** Files changed in `dir` compared to the last commit: [{ file, status: 'new' | 'changed' | 'deleted' }], or null without git. */
export function changes(dir) {
  const prefix = git(dir, ['rev-parse', '--show-prefix']);
  if (prefix.error || prefix.status !== 0) return null;
  const head = git(dir, ['rev-parse', '--verify', '-q', 'HEAD']);
  if (head.status !== 0) return null;
  const r = git(dir, ['status', '--porcelain', '--untracked-files=all', '--', '.']);
  if (r.status !== 0) return null;
  const pre = prefix.stdout.trim();
  return r.stdout.split('\n').filter(Boolean).map((line) => {
    const code = line.slice(0, 2);
    let file = line.slice(3).trim();
    if (file.includes(' -> ')) file = file.split(' -> ').pop();
    file = file.replace(/^"|"$/g, '');
    if (pre && file.startsWith(pre)) file = file.slice(pre.length);
    const status = code.includes('?') || code.includes('A') ? 'new' : code.includes('D') ? 'deleted' : 'changed';
    return { file, status };
  });
}

/**
 * Put `src` back to its last committed version. The current folder is copied to `backupDir` first.
 * Returns { ok, reason, backup }.
 */
export function resetToCommit(src, backupDir) {
  const prefix = git(src, ['rev-parse', '--show-prefix']);
  if (prefix.error) return { ok: false, reason: 'git is not installed.' };
  if (prefix.status !== 0) return { ok: false, reason: 'this folder is not inside a git repository (did you download the zip instead of cloning?).' };
  if (git(src, ['rev-parse', '--verify', '-q', 'HEAD']).status !== 0) return { ok: false, reason: 'the repository has no commit yet to go back to.' };
  const changed = changes(src) ?? [];
  if (!changed.length) return { ok: false, reason: 'nothing to reset: this folder already matches your last commit.', clean: true };
  fs.mkdirSync(path.dirname(backupDir), { recursive: true });
  fs.cpSync(src, backupDir, { recursive: true, filter: (p) => !/[\\/](node_modules|\.git)([\\/]|$)/.test(p) });
  const co = git(src, ['checkout', 'HEAD', '--', '.']);
  const cl = git(src, ['clean', '-fdxq', '--', '.']);
  if (co.status !== 0 && !/did not match/.test(co.stderr)) return { ok: false, reason: co.stderr.trim() || 'git checkout failed.', backup: backupDir };
  if (cl.status !== 0) return { ok: false, reason: cl.stderr.trim() || 'git clean failed.', backup: backupDir };
  return { ok: true, backup: backupDir, count: changed.length };
}
