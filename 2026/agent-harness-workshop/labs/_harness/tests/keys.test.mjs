import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KEYMAP, GLOBAL, RESERVED, OTHER, binding, collisions, keysOf } from '../keys.mjs';

test('no screen gives one key two meanings (global and reserved keys included)', () => {
  assert.deepEqual(collisions(), []);
});

test('a collision is found when there is one', () => {
  KEYMAP.exercise.push({ keys: ['t'], id: 'twice', does: 'x' });
  try {
    assert.deepEqual(collisions(), [{ screen: 'exercise', key: 't', ids: ['checks', 'twice'] }]);
  } finally {
    KEYMAP.exercise.pop();
  }
});

test('PR #1 keeps d and m; u is reserved for Phase 3 on the mission and home screens', () => {
  assert.equal(binding('exercise', 'd', 'd').id, 'doctor');
  assert.equal(binding('exercise', 'm', 'm').id, 'more');
  assert.deepEqual(RESERVED.exercise.map((r) => r.key), ['u']);
  assert.deepEqual(RESERVED.home.map((r) => r.key), ['u']);
  assert.equal(binding('exercise', 'u', 'u'), null, 'reserved means unbound for now');
  assert.equal(binding('home', 'u', 'u'), null);
});

test('letters are case-sensitive only where the upper case has its own meaning', () => {
  assert.equal(binding('exercise', 'h', 'H').id, 'history');
  assert.equal(binding('exercise', 'h', 'h').id, 'hint');
  assert.equal(binding('exercise', 't', 'T').id, 'checks', 'caps lock still works');
  assert.equal(binding('bring', 'y', 'Y'), null, 'never confirms with a capital');
  assert.equal(binding('bring', 'y', 'y').id, 'yes');
  assert.equal(binding('exercise', 'return', '\r'), null, '⏎ means nothing on the mission screen');
  assert.equal(binding('home', 'return', '\r').id, 'open');
  assert.equal(binding('home', '7', '7').id, 'jump');
});

test('"any other key" screens fall back to their OTHER binding', () => {
  assert.equal(binding('confirmSolution', 'y', 'y').id, 'show');
  assert.equal(binding('confirmSolution', 'z', 'z').id, 'back');
  assert.equal(binding('recoveryConfirm', 'n', 'n').id, 'keep');
  assert.equal(binding('recoveryConfirm', 'y', 'Y').id, 'keep', 'only a lower-case y restores');
});

test('every binding has words for the help screen', () => {
  for (const [screen, list] of Object.entries({ ...KEYMAP, global: GLOBAL })) {
    for (const x of list) {
      assert.ok(x.does, `${screen}.${x.id}`);
      assert.ok(x.keys.length, `${screen}.${x.id}`);
      assert.ok(!x.keys.includes(OTHER) || x.keys.length === 1, `${screen}.${x.id}: OTHER stands alone`);
    }
  }
  assert.deepEqual(keysOf('exercise', 'guide'), ['g', 'r']);
  assert.deepEqual(keysOf('exercise', 'nope'), []);
});

test('v views your changes on the mission screen, and the more menu offers it too', () => {
  assert.equal(binding('exercise', 'v', 'v').id, 'changes');
  assert.equal(binding('changes', 'right', '').id, 'nextFile');
  assert.equal(binding('changes', 'b', 'b').id, 'back');
});
test('l opens the takeaway and question; 1-4 answer on the checks and learn screens', () => {
  assert.equal(binding('exercise', 'l', 'l').id, 'learn');
  assert.equal(binding('checks', '3', '3').id, 'answer');
  assert.equal(binding('learn', '1', '1').id, 'answer');
  assert.equal(binding('learn', 'return', '\r').id, 'back');
});