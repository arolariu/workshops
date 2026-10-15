// Shared helpers for the Lab 07 checks.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const WRITE_OUTPUTS = ['create-pull-request', 'push-to-pull-request-branch', 'update-issue', 'close-issue', 'close-pull-request', 'merge-pull-request', 'create-discussion', 'create-issue'];

export function readOnly(perms) {
  if (perms === 'read-all' || perms === 'read') return true;
  if (!perms || typeof perms !== 'object') return false;
  return Object.values(perms).every((v) => v === 'read' || v === 'none');
}

export function unrestrictedBash(tools) {
  const bash = tools?.bash;
  if (bash === undefined || bash === null || bash === false) return false;
  if (bash === true) return true;
  const list = Array.isArray(bash) ? bash : [bash];
  return list.some((x) => /^:?\*$|^\*/.test(String(x)));
}

// Optional: compile with the real gh-aw CLI in a throwaway git repo.
export function compileStrict(t, name) {
  const dir = t.copy(t.tmp());
  execFileSync('git', ['init', '-q'], { cwd: dir });
  try {
    execFileSync('gh', ['aw', 'compile', name, '--strict'], { cwd: dir, encoding: 'utf8', stdio: 'pipe', timeout: 120000 });
  } catch (e) {
    return `gh aw compile --strict failed: ${String(e.stderr || e.stdout || e.message).trim().split('\n').slice(-3).join(' ')}`;
  }
  return fs.existsSync(path.join(dir, '.github', 'workflows', `${name}.lock.yml`)) || 'gh aw compile did not produce a .lock.yml.';
}
