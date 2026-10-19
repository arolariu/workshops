import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STRETCH_CAP_MS, stretch, suggestedMinutes, timerText, shouldNudge, levelClock } from '../timer.mjs';

const MIN = 60_000;

test('a stretch counts the time between two actions, at most 45 minutes', () => {
  assert.equal(stretch(0, 5 * MIN), 5 * MIN);
  assert.equal(stretch(0, 3 * 3600_000), STRETCH_CAP_MS, 'an idle laptop adds at most the cap');
  assert.equal(stretch(10, 5), 0, 'clock skew never subtracts');
});

test('the suggested time is the lower bound of 🕐; the text and the nudge follow it', () => {
  assert.equal(suggestedMinutes({ minutesRange: [90, 120] }), 90);
  assert.equal(suggestedMinutes({ minutesRange: null }), null);
  assert.equal(timerText(12 * MIN + 59_000, 10), '⏱ 12 min here · suggested 10');
  assert.equal(timerText(20_000, 10), '⏱ under a minute here · suggested 10');
  assert.equal(timerText(90 * MIN, 90), '⏱ 1 h 30 min here · suggested 1 h 30 min');
  assert.equal(timerText(120 * MIN, null), '⏱ 2 h here');
  assert.equal(shouldNudge({ activeMs: 15 * MIN + 1, suggested: 10, hintsLeft: 1, nudged: false }), true);
  assert.equal(shouldNudge({ activeMs: 15 * MIN, suggested: 10, hintsLeft: 1, nudged: false }), false, 'past 1.5x, not at it');
  assert.equal(shouldNudge({ activeMs: 60 * MIN, suggested: 10, hintsLeft: 0, nudged: false }), false, 'no hints left');
  assert.equal(shouldNudge({ activeMs: 60 * MIN, suggested: 10, hintsLeft: 2, nudged: true }), false, 'one toast only');
  assert.equal(shouldNudge({ activeMs: 60 * MIN, suggested: null, hintsLeft: 2, nudged: false }), false, 'no suggestion, no nudge');
});

test('the clock credits each level its own time, including time away (capped)', () => {
  let t = 0;
  const clock = levelClock({ now: () => t });
  assert.deepEqual(clock.touch('lab-01/easy'), []);
  t = 4 * MIN;
  assert.deepEqual(clock.touch('lab-01/easy'), []);
  t = 5 * MIN;
  assert.equal(clock.pending('lab-01/easy'), 5 * MIN);
  assert.equal(clock.pending('lab-02/easy'), 0);
  t = 60 * MIN; // in Copilot for 55 minutes
  assert.deepEqual(clock.touch('lab-02/easy'), [{ key: 'lab-01/easy', ms: 4 * MIN + STRETCH_CAP_MS }]);
  t = 62 * MIN;
  assert.deepEqual(clock.take(), [{ key: 'lab-02/easy', ms: 2 * MIN }]);
  assert.equal(clock.pending('lab-02/easy'), 0);
  t = 63 * MIN;
  assert.deepEqual(clock.touch(null), [{ key: 'lab-02/easy', ms: MIN }], 'leaving the level closes its stretch');
  t = 99 * MIN;
  assert.deepEqual(clock.touch(null), [], 'nothing counts while not on a level');
  assert.deepEqual(clock.take(), []);
});
