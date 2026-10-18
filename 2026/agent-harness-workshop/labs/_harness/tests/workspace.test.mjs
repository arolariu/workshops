import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { loadCatalog } from '../catalog.mjs';
import {
  ensureStarter, restoreStarter, createCheckpoint, restoreSnapshot, listRecovery, resetToCommit,
  buildStarterManifest, compareTrees, unifiedDiff, recoveryDir,
} from '../workspace.mjs';
import { tmpdir, writeTree } from './helpers.mjs';

function fixture() {
  const root = tmpdir();
  const labsDir = path.join(root, 'labs');
  writeTree(labsDir, {
    'lab-01/readme.md': '# Lab 01 · 📜 Instructions\n',
    'lab-01/easy/todo.md': '# 🟢 Easy · Fixture\n',
    'lab-01/easy/src/main.js': 'starter\n',
    'lab-01/easy/src/lib/util.js': 'export const u = 1;\n',
    'lab-01/easy/sol/main.js': 'solved\n',
  });
  const ex = loadCatalog(labsDir)[0].levels[0];
  return { root, labsDir, ex };
}
const read = (f) => fs.readFileSync(f, 'utf8');
const git = (cwd, ...args) => {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
};
const hasGit = spawnSync('git', ['--version']).status === 0;

test('ZIP users without git can restore the starter and keep their attempt in a backup', () => {
  const { labsDir, ex } = fixture();
  const starter = ensureStarter(labsDir, ex);
  assert.equal(starter.created, true);
  fs.writeFileSync(path.join(ex.src, 'main.js'), 'learner attempt\n');
  fs.writeFileSync(path.join(ex.src, 'extra.js'), 'new file\n');
  const result = restoreStarter(labsDir, ex, { gitBin: 'definitely-missing-git' });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.source, 'first-use');
  assert.match(result.note, /first time/i);
  const restoredFile = path.join(ex.src, 'main.js');
  const backupFile = path.join(result.backup.dir, 'files', 'main.js');
  assert.equal(fs.readFileSync(restoredFile, 'utf8'), 'starter\n');
  assert.equal(fs.readFileSync(backupFile, 'utf8'), 'learner attempt\n');
  assert.equal(fs.existsSync(path.join(ex.src, 'extra.js')), false);
  assert.equal(read(path.join(result.backup.dir, 'files', 'extra.js')), 'new file\n');
  assert.equal(ensureStarter(labsDir, ex).created, false, 'the first-use starter is never replaced');
});

test('the published starter wins over committed learner mistakes', { skip: !hasGit }, () => {
  const { root, labsDir, ex } = fixture();
  git(root, 'init', '-q');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'workshop');
  const manifest = buildStarterManifest(labsDir, loadCatalog(labsDir));
  fs.writeFileSync(path.join(labsDir, '_harness-starters.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(ex.src, 'main.js'), 'committed mistake\n');
  git(root, 'commit', '-qam', 'oops');
  ensureStarter(labsDir, ex, { manifestFile: path.join(labsDir, '_harness-starters.json') });
  const latest = resetToCommit(labsDir, ex);
  assert.equal(latest.ok, false, 'nothing to discard since the latest commit');
  const result = restoreStarter(labsDir, ex, { manifestFile: path.join(labsDir, '_harness-starters.json') });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.source, 'published');
  assert.equal(read(path.join(ex.src, 'main.js')).replace(/\r\n/g, '\n'), 'starter\n', 'checked out like git would (line endings follow your git settings)');
  assert.equal(read(path.join(result.backup.dir, 'files', 'main.js')), 'committed mistake\n');
});

test('latest-commit reset is separate, backs up first, and needs git', { skip: !hasGit }, () => {
  const { root, labsDir, ex } = fixture();
  git(root, 'init', '-q');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'workshop');
  fs.writeFileSync(path.join(ex.src, 'main.js'), 'uncommitted\n');
  fs.writeFileSync(path.join(ex.src, 'new.js'), 'new\n');
  const result = resetToCommit(labsDir, ex);
  assert.equal(result.ok, true, result.reason);
  assert.equal(read(path.join(ex.src, 'main.js')).replace(/\r\n/g, '\n'), 'starter\n');
  assert.equal(fs.existsSync(path.join(ex.src, 'new.js')), false);
  assert.equal(read(path.join(result.backup.dir, 'files', 'main.js')), 'uncommitted\n');
  assert.equal(resetToCommit(labsDir, ex, { gitBin: 'definitely-missing-git' }).ok, false);
});

test('named checkpoints are saved, listed and restored; bad names are refused', () => {
  const { labsDir, ex } = fixture();
  fs.writeFileSync(path.join(ex.src, 'main.js'), 'good progress\n');
  const cp = createCheckpoint(labsDir, ex, 'before-refactor');
  assert.equal(cp.ok, true, cp.reason);
  assert.equal(createCheckpoint(labsDir, ex, 'before-refactor').ok, false, 'names are unique');
  for (const bad of ['', '../x', 'a/b', 'a\\b', '.hidden', 'x'.repeat(65), 'con']) assert.equal(createCheckpoint(labsDir, ex, bad).ok, false, `refuses "${bad}"`);
  fs.writeFileSync(path.join(ex.src, 'main.js'), 'broken refactor\n');
  const list = listRecovery(labsDir, ex);
  assert.deepEqual(list.checkpoints.map((c) => c.name), ['before-refactor']);
  const result = restoreSnapshot(labsDir, ex, 'checkpoint:before-refactor');
  assert.equal(result.ok, true, result.reason);
  assert.equal(read(path.join(ex.src, 'main.js')), 'good progress\n');
  assert.equal(listRecovery(labsDir, ex).backups.length, 1);
});

test('a backup failure leaves the work untouched and says why', () => {
  const { labsDir, ex } = fixture();
  ensureStarter(labsDir, ex);
  fs.writeFileSync(path.join(ex.src, 'main.js'), 'precious\n');
  const backups = path.join(recoveryDir(labsDir, ex), 'backups');
  fs.writeFileSync(backups, 'not a folder');
  const result = restoreStarter(labsDir, ex, { gitBin: 'definitely-missing-git' });
  assert.equal(result.ok, false);
  assert.match(result.reason, /backup/i);
  assert.equal(read(path.join(ex.src, 'main.js')), 'precious\n');
});

test('malformed, unfinished and tampered snapshots are shown as incomplete and cannot be restored', () => {
  const { labsDir, ex } = fixture();
  assert.equal(createCheckpoint(labsDir, ex, 'good').ok, true);
  assert.equal(createCheckpoint(labsDir, ex, 'tampered').ok, true);
  const cps = path.join(recoveryDir(labsDir, ex), 'checkpoints');
  writeTree(cps, { 'broken/meta.json': '{ nope', 'broken/files/main.js': 'x', '.tmp-123/files/main.js': 'half' });
  fs.writeFileSync(path.join(cps, 'tampered', 'files', 'main.js'), 'changed after saving\n');
  const list = listRecovery(labsDir, ex);
  assert.deepEqual(list.checkpoints.map((c) => c.name), ['good']);
  assert.deepEqual(list.incomplete.map((c) => c.name).sort(), ['.tmp-123', 'broken', 'tampered']);
  assert.ok(list.incomplete.every((c) => c.problem));
  fs.writeFileSync(path.join(ex.src, 'main.js'), 'mine\n');
  assert.equal(restoreSnapshot(labsDir, ex, 'checkpoint:tampered').ok, false);
  assert.equal(restoreSnapshot(labsDir, ex, 'checkpoint:broken').ok, false);
  assert.equal(read(path.join(ex.src, 'main.js')), 'mine\n');
});

test('snapshot paths cannot escape the exercise', () => {
  const { root, labsDir, ex } = fixture();
  assert.equal(createCheckpoint(labsDir, ex, 'evil').ok, true);
  const dir = path.join(recoveryDir(labsDir, ex), 'checkpoints', 'evil');
  const meta = JSON.parse(read(path.join(dir, 'meta.json')));
  meta.files.push({ path: '../../../../escaped.txt', size: 1, sha256: '0'.repeat(64) });
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta));
  assert.equal(restoreSnapshot(labsDir, ex, 'checkpoint:evil').ok, false);
  assert.equal(restoreSnapshot(labsDir, ex, 'checkpoint:../evil').ok, false);
  assert.equal(restoreSnapshot(labsDir, ex, 'backup:..').ok, false);
  assert.equal(fs.existsSync(path.join(root, 'escaped.txt')), false);
});

test('links inside the work folder are refused before anything is deleted', () => {
  const { root, labsDir, ex } = fixture();
  ensureStarter(labsDir, ex);
  const outside = path.join(root, 'outside');
  writeTree(outside, { 'keep.txt': 'do not touch\n' });
  fs.symlinkSync(outside, path.join(ex.src, 'linked'), 'junction');
  fs.writeFileSync(path.join(ex.src, 'main.js'), 'mine\n');
  const result = restoreStarter(labsDir, ex, { gitBin: 'definitely-missing-git' });
  assert.equal(result.ok, false);
  assert.match(result.reason, /link/i);
  assert.equal(read(path.join(ex.src, 'main.js')), 'mine\n');
  assert.equal(read(path.join(outside, 'keep.txt')), 'do not touch\n');
});

test('dependencies and git metadata are kept, and not copied into backups', () => {
  const { labsDir, ex } = fixture();
  ensureStarter(labsDir, ex);
  writeTree(ex.src, { 'node_modules/dep/index.js': 'dep\n', '.agent-logs/a.log': 'log\n' });
  fs.writeFileSync(path.join(ex.src, 'main.js'), 'mine\n');
  const result = restoreStarter(labsDir, ex, { gitBin: 'definitely-missing-git' });
  assert.equal(result.ok, true, result.reason);
  assert.equal(read(path.join(ex.src, 'node_modules', 'dep', 'index.js')), 'dep\n');
  assert.equal(fs.existsSync(path.join(result.backup.dir, 'files', 'node_modules')), false);
});

test('the reference comparison covers changed, missing, extra, empty, newline-only and binary files', () => {
  const root = tmpdir();
  const mine = path.join(root, 'mine');
  const ref = path.join(root, 'ref');
  writeTree(mine, { 'same.js': 'a\n', 'changed.js': 'a\nb\nc\n', 'extra.js': 'only mine\n', 'empty.txt': '', 'eol.js': 'x\ny', 'crlf.js': 'a\r\nb\r\n', 'img.bin': Buffer.from([0, 1, 2, 3]) });
  writeTree(ref, { 'same.js': 'a\n', 'changed.js': 'a\nB\nc\n', 'missing.js': 'only reference\n', 'empty.txt': 'now has text\n', 'eol.js': 'x\ny\n', 'crlf.js': 'a\nb\n', 'img.bin': Buffer.from([0, 1, 9, 3]) });
  const { files, summary } = compareTrees(mine, ref);
  const by = Object.fromEntries(files.map((f) => [f.path, f]));
  assert.equal(by['same.js'], undefined, 'identical files are not listed');
  assert.equal(by['changed.js'].status, 'changed');
  assert.match(by['changed.js'].diff, /^--- yours\/changed\.js\n\+\+\+ reference\/changed\.js\n@@ -1,3 \+1,3 @@\n a\n-b\n\+B\n c\n$/);
  assert.equal(by['missing.js'].status, 'missing');
  assert.match(by['missing.js'].diff, /\+only reference/);
  assert.equal(by['extra.js'].status, 'extra');
  assert.match(by['extra.js'].diff, /-only mine/);
  assert.match(by['empty.txt'].diff, /@@ -0,0 \+1 @@\n\+now has text/);
  assert.match(by['eol.js'].diff, /-y\n\\ No newline at end of file\n\+y\n/);
  assert.equal(by['crlf.js'].note, 'Only line endings differ (CRLF vs LF).');
  assert.equal(by['img.bin'].binary, true);
  assert.match(by['img.bin'].diff, /^Binary files yours\/img\.bin and reference\/img\.bin differ/);
  assert.deepEqual(summary, { changed: 5, missing: 1, extra: 1, same: 1 });
});

test('unifiedDiff keeps hunks small with context', () => {
  const a = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
  const b = a.replace('line 5\n', 'line five\n').replace('line 25\n', 'line twenty-five\n');
  const d = unifiedDiff(a, b, { from: 'a', to: 'b' });
  assert.equal((d.match(/^@@/gm) ?? []).length, 2);
  assert.match(d, /@@ -2,7 \+2,7 @@/);
});
