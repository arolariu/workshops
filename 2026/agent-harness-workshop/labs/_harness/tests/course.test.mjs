import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { loadCourse, levelRules, matchPath, isHarnessPath, saveCourse, formatJson } from '../course.mjs';
import { tmpdir, writeTree } from './helpers.mjs';

test('defaults when there is no course.json', () => {
  const c = loadCourse(tmpdir());
  assert.equal(c.capstone, 'lab-08');
  assert.ok(c.harnessPaths.includes('.github/**'));
  assert.deepEqual(levelRules(c, 'lab-01/easy'), { local: [], keep: [], overrides: [], drop: [] });
});

test('a broken course.json is reported, not ignored', () => {
  const labsDir = tmpdir();
  writeTree(labsDir, { '_harness/course.json': '{ nope' });
  assert.throws(() => loadCourse(labsDir), /not valid JSON/);
});

test('gitignore-style matching', () => {
  assert.ok(matchPath('AGENTS.md', 'AGENTS.md'));
  assert.ok(matchPath('AGENTS.md', 'api/AGENTS.md'));
  assert.ok(matchPath('*.instructions.md', '.github/instructions/tests.instructions.md'));
  assert.ok(matchPath('.github/**', '.github/hooks/scripts/guard.mjs'));
  assert.ok(!matchPath('.github/**', 'docs/.github/x'));
  assert.ok(matchPath('mcp/**', 'mcp/server.mjs'));
  assert.ok(!matchPath('mcp/**', 'tools/mcp/server.mjs'));
  assert.ok(matchPath('/grades.js', 'grades.js'));
  assert.ok(!matchPath('/grades.js', 'lib/grades.js'));
  assert.ok(matchPath('node_modules/', 'a/node_modules/x.js'));
  assert.ok(!matchPath('apm.yml', 'apm.yml.bak'));
  assert.ok(matchPath('.github/workflows/issue-triage.md', '.github/workflows/issue-triage.md'));
  assert.ok(matchPath('AGENTS.md', 'AGENTS.md'.replace('/', '\\')));
});

test('harness paths and per-level rules come from course.json', () => {
  const labsDir = tmpdir();
  writeTree(labsDir, { '_harness/course.json': JSON.stringify({ harnessPaths: ['AGENTS.md'], levels: { 'lab-06/easy': { local: ['SOLUTION-NOTES.md'] } } }) });
  const c = loadCourse(labsDir);
  assert.ok(isHarnessPath(c, 'AGENTS.md'));
  assert.ok(!isHarnessPath(c, 'grades.js'));
  assert.deepEqual(levelRules(c, 'lab-06/easy').local, ['SOLUTION-NOTES.md']);
});

test('saveCourse writes stable, readable JSON', () => {
  const labsDir = tmpdir();
  saveCourse(labsDir, { capstone: 'lab-08', levels: { 'lab-00/medium': { overrides: ['grades.js'] } }, file: 'ignored' });
  const text = fs.readFileSync(path.join(labsDir, '_harness', 'course.json'), 'utf8');
  assert.match(text, /"overrides": \["grades\.js"\]/);
  assert.doesNotMatch(text, /ignored/);
  assert.deepEqual(JSON.parse(text).levels, { 'lab-00/medium': { overrides: ['grades.js'] } });
  assert.equal(formatJson({ a: [] }), '{ "a": [] }');
});

test('the real course.json is valid and uses the spec harness paths', () => {
  const labsDir = path.resolve(import.meta.dirname, '..', '..');
  const c = loadCourse(labsDir);
  assert.equal(c.capstone, 'lab-08');
  for (const p of ['AGENTS.md', '.github/**', 'HARNESS.md']) assert.ok(c.harnessPaths.includes(p), p);
});
