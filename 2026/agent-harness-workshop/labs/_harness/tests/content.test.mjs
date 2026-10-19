// The real labs: every level's todo.md can be read, and its milestones and hints line up.
// (verify checks the other direction: every milestone a check names exists, and every milestone has a check.)
import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { loadCatalog } from '../catalog.mjs';

const labsDir = path.resolve(import.meta.dirname, '..', '..');
const catalog = loadCatalog(labsDir);
const levels = catalog.flatMap((lab) => lab.levels);

test('every todo.md has a title, a mission and a time', () => {
  assert.ok(levels.length >= 24);
  for (const ex of levels) {
    assert.ok(ex.title, `${ex.key}: title`);
    assert.ok(ex.mission, `${ex.key}: mission`);
    assert.ok(ex.minutes, `${ex.key}: 🕐 time in the meta line`);
  }
});

test('milestones are unique, and every hint milestone exists', () => {
  for (const ex of levels) {
    const ids = ex.milestones.map((m) => m.id);
    assert.equal(new Set(ids).size, ids.length, `${ex.key}: duplicate milestone`);
    for (const m of ex.milestones) assert.ok(m.title, `${ex.key}: ${m.id} needs a title`);
    for (const h of ex.hints) if (h.milestone) assert.ok(ids.includes(h.milestone), `${ex.key}: hint "${h.title}" belongs to ${h.milestone}, which is not a milestone`);
    for (const id of ids) assert.ok(ex.hints.filter((h) => h.milestone === id).length <= 3, `${ex.key}: at most three hints per milestone`);
  }
});

test('levels with milestones say what done means per milestone, not in a separate Done-when list', () => {
  for (const ex of levels.filter((e) => e.milestones.length)) {
    assert.equal(ex.done, '', `${ex.key}: move "Done when" into the milestones`);
    for (const m of ex.milestones) assert.ok(m.body, `${ex.key}: ${m.id} needs at least one "done" bullet`);
  }
});
