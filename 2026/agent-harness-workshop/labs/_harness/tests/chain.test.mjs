import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { loadCatalog } from '../catalog.mjs';
import { loadCourse } from '../course.mjs';
import { blobId, courseOrder, predecessorOf, computeChain, writeChain, loadManifest, chainIssues } from '../chain.mjs';
import { chainCourse } from './helpers.mjs';

const run = (labsDir, opts = {}) => computeChain({ catalog: loadCatalog(labsDir), course: loadCourse(labsDir), manifest: loadManifest(labsDir), ...opts });
const read = (labsDir, rel) => fs.readFileSync(path.join(labsDir, rel), 'utf8');
const level = (r, key) => r.levels.find((l) => l.key === key);
const quiet = (r) => r.levels.every((l) => !l.src.write.length && !l.src.remove.length && !l.sol.write.length && !l.sol.remove.length);
const BASE = {
  'lab-00/easy': { src: { 'app.js': 'v1\n' }, sol: { 'app.js': 'v1\n', 'FINDINGS.md': 'found\n' } },
  'lab-00/medium': { src: { 'app.js': 'v1 medium\n' }, sol: { 'app.js': 'v1 medium\n', 'PLAN.md': 'plan\n' } },
  'lab-01/easy': { src: { 'app.js': 'v1\n' }, sol: { 'app.js': 'v1\n', 'AGENTS.md': 'rules\n' } },
  'lab-01/hard': { src: { 'app.js': 'v1\n', 'AGENTS.md': 'rules\n' }, sol: { 'app.js': 'v1\n', 'AGENTS.md': 'rules\n', 'ab.mjs': 'ab\n' } },
};
const OVERRIDE = { 'lab-00/medium': { overrides: ['app.js'] } };

test('blob IDs match git and ignore CRLF', () => {
  const git = crypto.createHash('sha1').update('blob 4\0a\nb\n').digest('hex');
  assert.equal(blobId(Buffer.from('a\nb\n')), git);
  assert.equal(blobId(Buffer.from('a\r\nb\n')), git);
  assert.notEqual(blobId(Buffer.from([0, 13, 10])), blobId(Buffer.from([0, 10])), 'binary content is hashed as is');
});

test('course order and predecessors: down the easy column, along each row', () => {
  const order = courseOrder(loadCatalog(chainCourse(BASE)));
  assert.deepEqual(order.map((n) => n.key), ['lab-00/easy', 'lab-00/medium', 'lab-01/easy', 'lab-01/hard']);
  const pred = (k) => predecessorOf(order, k)?.key ?? null;
  assert.equal(pred('lab-00/easy'), null);
  assert.equal(pred('lab-00/medium'), 'lab-00/easy');
  assert.equal(pred('lab-01/easy'), 'lab-00/easy');
  assert.equal(pred('lab-01/hard'), 'lab-01/easy', 'a missing tier is skipped');
  assert.equal(pred('lab-09/easy'), null);
});

test('bootstrap: inherits the predecessor result and records overrides', () => {
  const r = run(chainCourse(BASE), { bootstrap: true });
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.overridesFound, { 'lab-00/medium': ['app.js'] });
  const med = level(r, 'lab-00/medium');
  assert.deepEqual(med.src.write, ['FINDINGS.md']);
  assert.deepEqual(med.sol.write, ['FINDINGS.md']);
  assert.deepEqual(med.starter, ['app.js']);
  assert.deepEqual(level(r, 'lab-01/easy').src.write, ['FINDINGS.md'], 'Lab 01 easy starts from Lab 00 easy');
  assert.deepEqual(level(r, 'lab-01/hard').src.write, ['FINDINGS.md'], 'and Lab 01 hard from Lab 01 easy');
  assert.deepEqual(r.manifest.chain['lab-01/easy'], { from: 'lab-00/easy', starter: [] });
  assert.deepEqual(r.manifest.chain['lab-00/easy'], { from: null, starter: ['app.js'] });
  assert.equal(r.manifest.exercises['lab-01/easy']['app.js'], blobId(Buffer.from('v1\n')));
  assert.equal(r.manifest.format, 2);
});

test('without bootstrap a differing file is a problem until it is an override', () => {
  assert.deepEqual(run(chainCourse(BASE)).problems.map((p) => [p.key, p.file, p.kind]), [['lab-00/medium', 'app.js', 'shadow']]);
  assert.deepEqual(run(chainCourse(BASE, OVERRIDE)).problems, []);
});

test('writeChain writes, backs up what it replaces, and is idempotent', () => {
  const labsDir = chainCourse(BASE, OVERRIDE);
  fs.writeFileSync(path.join(labsDir, 'lab-01/hard/src/stray.txt'), 'not in the chain\n');
  const w = writeChain({ labsDir, result: run(labsDir) });
  assert.ok(w.written >= 6, `wrote ${w.written}`);
  assert.equal(read(labsDir, 'lab-01/hard/src/FINDINGS.md'), 'found\n');
  assert.equal(read(labsDir, 'lab-01/hard/sol/ab.mjs'), 'ab\n');
  assert.equal(read(labsDir, 'lab-01/hard/src/stray.txt'), 'not in the chain\n', 'a new file in src/ is a starter file');
  assert.equal(loadManifest(labsDir).format, 2);
  const again = run(labsDir);
  assert.deepEqual(again.problems, []);
  assert.ok(quiet(again));
  assert.ok(chainIssues({ result: again, manifest: loadManifest(labsDir) }).every((x) => !x.issues.length));
});

test('a change upstream ripples down; drift is reported until synced', () => {
  const labsDir = chainCourse(BASE, OVERRIDE);
  writeChain({ labsDir, result: run(labsDir) });
  fs.writeFileSync(path.join(labsDir, 'lab-00/easy/sol/FINDINGS.md'), 'found more\n');
  const r = run(labsDir);
  assert.deepEqual(r.problems, []);
  for (const k of ['lab-00/medium', 'lab-01/easy', 'lab-01/hard']) assert.deepEqual(level(r, k).src.write, ['FINDINGS.md'], k);
  const issues = chainIssues({ result: r, manifest: loadManifest(labsDir) }).filter((x) => x.issues.length);
  assert.deepEqual(issues.map((x) => x.key), ['lab-00/medium', 'lab-01/easy', 'lab-01/hard']);
  assert.match(issues[0].issues.join(' '), /src\/ out of date: FINDINGS\.md/);
  const w = writeChain({ labsDir, result: r });
  assert.equal(read(labsDir, 'lab-01/hard/sol/FINDINGS.md'), 'found more\n');
  assert.equal(fs.readFileSync(path.join(w.backupDir, 'lab-01-hard', 'src', 'FINDINGS.md'), 'utf8'), 'found\n', 'the old version is backed up');
});

test('an edited or deleted inherited file is caught; overrides, local and drop are honoured', () => {
  const labsDir = chainCourse(BASE, OVERRIDE);
  writeChain({ labsDir, result: run(labsDir) });
  fs.writeFileSync(path.join(labsDir, 'lab-01/easy/src/FINDINGS.md'), 'oops\n');
  assert.deepEqual(run(labsDir).problems.map((p) => [p.key, p.kind]), [['lab-01/easy', 'edited']]);
  fs.rmSync(path.join(labsDir, 'lab-01/easy/src/FINDINGS.md'));
  assert.deepEqual(run(labsDir).problems.map((p) => [p.key, p.kind]), [['lab-01/easy', 'deleted']]);
  const local = chainCourse(BASE, { ...OVERRIDE, 'lab-00/easy': { local: ['FINDINGS.md'] } });
  assert.ok(!level(run(local), 'lab-01/easy').newSrc.has('FINDINGS.md'));
  const drop = run(chainCourse(BASE, { ...OVERRIDE, 'lab-01/easy': { drop: ['FINDINGS.md'] } }));
  assert.ok(!level(drop, 'lab-01/easy').newSrc.has('FINDINGS.md'));
  assert.ok(!level(drop, 'lab-01/hard').newSrc.has('FINDINGS.md'), 'a dropped file stays dropped along the row');
});

test('an override is kept, and an upstream copy of it does not count as an edit', () => {
  const labsDir = chainCourse(BASE, OVERRIDE);
  writeChain({ labsDir, result: run(labsDir) });
  fs.writeFileSync(path.join(labsDir, 'lab-00/easy/sol/app.js'), 'v2\n');
  const r = run(labsDir);
  assert.deepEqual(r.problems, []);
  assert.ok(!level(r, 'lab-00/medium').src.write.includes('app.js'), 'the override is not replaced');
  assert.deepEqual(level(r, 'lab-01/easy').src.write, ['app.js'], 'an inherited copy is');
});

test('a solution change on a file that also changed upstream is a conflict', () => {
  const levels = structuredClone(BASE);
  levels['lab-00/medium'].sol['FINDINGS.md'] = 'found, then planned\n';
  assert.deepEqual(run(chainCourse(levels, OVERRIDE)).problems.map((p) => [p.key, p.file, p.kind]), [['lab-00/medium', 'FINDINGS.md', 'conflict']]);
});

test('a solution file that upstream now provides as is, is absorbed rather than a conflict', () => {
  const levels = structuredClone(BASE);
  levels['lab-00/medium'].sol['FINDINGS.md'] = 'found\n';
  const r = run(chainCourse(levels, OVERRIDE));
  assert.deepEqual(r.problems, []);
  assert.equal(level(r, 'lab-00/medium').newSrc.get('FINDINGS.md').id, blobId(Buffer.from('found\n')));
});

test('CRLF copies of an inherited file count as the same file', () => {
  const levels = structuredClone(BASE);
  levels['lab-01/easy'].src['FINDINGS.md'] = 'found\r\n';
  const r = run(chainCourse(levels, OVERRIDE));
  assert.deepEqual(r.problems, []);
  assert.deepEqual(level(r, 'lab-01/easy').src.write, []);
});

test('writeChain refuses folders outside the labs folder', () => {
  const labsDir = chainCourse(BASE, OVERRIDE);
  const r = run(labsDir);
  level(r, 'lab-01/easy').node.ex.src = path.join(path.dirname(labsDir), 'elsewhere');
  assert.throws(() => writeChain({ labsDir, result: r }), /outside the labs folder/);
});
