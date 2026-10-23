// Unit tests for changes.mjs. Run them: node --test .github/skills/release-notes/scripts/changes.test.mjs
// (npm test skips dot folders, so these only run when you name the file.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommit, group, render } from './changes.mjs';

test('parseCommit reads the type, the scope and the subject', () => {
  const c = parseCommit('a1b2c3d', 'feat(grades): add gpa()');
  assert.equal(c.type, 'feat');
  assert.equal(c.scope, 'grades');
  assert.equal(c.subject, 'add gpa()');
  assert.equal(c.breaking, false);
});

test('parseCommit lower-cases the type and keeps a subject without a scope', () => {
  const c = parseCommit('b2c3d4e', 'FIX: use local dates');
  assert.deepEqual([c.type, c.scope, c.subject], ['fix', null, 'use local dates']);
});

test('a subject that is not a Conventional Commit is type "other", kept whole', () => {
  const c = parseCommit('c3d4e5f', 'Update stuff');
  assert.deepEqual([c.type, c.scope, c.subject], ['other', null, 'Update stuff']);
});

test('"!" before the colon marks a breaking change', () => {
  const c = parseCommit('d4e5f6a', 'feat!: drop support for Node 18');
  assert.equal(c.breaking, true);
  assert.equal(c.note, null);
  assert.equal(c.subject, 'drop support for Node 18');
});

test('a BREAKING CHANGE footer marks a breaking change and gives its note', () => {
  const c = parseCommit('e5f6a7b', 'refactor(grades): remove average()\n\nBREAKING CHANGE: use weightedAverage() instead.');
  assert.equal(c.breaking, true);
  assert.equal(c.note, 'use weightedAverage() instead.');
  assert.equal(parseCommit('f6a7b8c', 'feat: csv\n\nBREAKING-CHANGE: new columns.').note, 'new columns.');
});

test('"BREAKING CHANGE:" in the middle of a line is not a footer', () => {
  const c = parseCommit('0a1b2c3', 'fix: dates\n\nThe docs mention BREAKING CHANGE: in passing.');
  assert.equal(c.breaking, false);
  assert.equal(c.note, null);
});

test('a git revert names the commit it reverts', () => {
  const c = parseCommit('1b2c3d4', 'Revert "feat(ui): add dark mode"\n\nThis reverts commit 9f8e7d6c5b4a39281706f5e4d3c2b1a098765432.');
  assert.deepEqual([c.type, c.subject, c.revertOf], ['revert', 'feat(ui): add dark mode', '9f8e7d6c5b4a39281706f5e4d3c2b1a098765432']);
  assert.equal(parseCommit('2c3d4e5', 'revert: fix: x\n\nRefs: 1234abc').revertOf, '1234abc');
});

test('group cancels a revert and the commit it reverts', () => {
  const data = group([
    { hash: '1b2c3d4', message: 'Revert "feat(ui): add dark mode"\n\nThis reverts commit 9f8e7d6c5b4a39281706f5e4d3c2b1a098765432.' },
    { hash: '9f8e7d6', message: 'feat(ui): add dark mode' },
    { hash: '3d4e5f6', message: 'fix: align the table' },
  ]);
  assert.equal(data.total, 3);
  assert.deepEqual(data.groups, { fix: [{ hash: '3d4e5f6', scope: null, subject: 'align the table' }] });
  assert.deepEqual(data.reverted, [{ hash: '9f8e7d6', scope: 'ui', subject: 'add dark mode', by: '1b2c3d4' }]);
});

test('group keeps a revert whose target is older than the range', () => {
  const data = group([{ hash: '4e5f6a7', message: 'revert: fix(deadlines): round days up\n\nRefs: 1234abc' }]);
  assert.deepEqual(data.groups.revert, [{ hash: '4e5f6a7', scope: null, subject: 'fix(deadlines): round days up' }]);
  assert.deepEqual(data.reverted, []);
});

test('group collects the breaking changes', () => {
  const data = group([{ hash: 'a1', message: 'feat!: one' }, { hash: 'a2', message: 'fix: two' }, { hash: 'a3', message: 'chore: x\n\nBREAKING CHANGE: three' }]);
  assert.deepEqual(data.breaking.map((e) => [e.hash, e.note]), [['a1', null], ['a3', 'three']]);
});

test('render prints each entry once, in the right section', () => {
  const data = group([
    { hash: 'a1', message: 'feat!: drop Node 18' },
    { hash: 'a2', message: 'feat(grades): add gpa()' },
    { hash: 'a3', message: 'fix(deadlines): skip done ones' },
    { hash: 'a4', message: 'test: more tests' },
  ]);
  assert.equal(render(data, { version: '2.0.0', date: '2026-10-19' }), [
    '## [2.0.0] - 2026-10-19',
    '',
    '### 💥 Breaking changes',
    '- drop Node 18 (a1)',
    '',
    '### ✨ Features',
    '- **grades:** add gpa() (a2)',
    '',
    '### 🐛 Fixes',
    '- **deadlines:** skip done ones (a3)',
    '',
  ].join('\n'));
});

test('render without user-facing changes says so, under Unreleased', () => {
  assert.equal(render(group([{ hash: 'b1', message: 'docs: typo' }])), '## [Unreleased]\n\nNo user-facing changes.\n');
});
