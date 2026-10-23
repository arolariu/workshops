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
});

// TODO(M3): a test for every rule in todo.md: "!", the BREAKING CHANGE footer (and a mention that is not one),
// reverts (parsed, cancelled in group, kept when the target is older), the breaking list, and render's exact output.
// Use only parseCommit, group and render: the checks run these tests against other versions of the script.
void group;
void render;
