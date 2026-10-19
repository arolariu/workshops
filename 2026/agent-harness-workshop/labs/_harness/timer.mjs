// The level timer: how long you have been on a level, against the suggested time (the lower bound of 🕐). Time counts
// while the level is the current one, including time spent in Copilot, as stretches between two actions; each stretch
// counts at most 45 minutes, so an idle laptop can't inflate it. Past 1.5x the suggestion, one toast offers a hint.
export const STRETCH_CAP_MS = 45 * 60_000;
export const NUDGE_FACTOR = 1.5;

/** The time between two actions that counts: never negative, never more than the cap. */
export const stretch = (from, to, cap = STRETCH_CAP_MS) => Math.max(0, Math.min(cap, to - from));
/** Minutes suggested for a level: the lower bound of its 🕐, or null when it doesn't say. */
export const suggestedMinutes = (ex) => ex?.minutesRange?.[0] ?? null;

const human = (min) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}` : `${min} min`);
/** "⏱ 12 min here · suggested 10" */
export function timerText(activeMs, suggested) {
  const min = Math.floor(activeMs / 60_000);
  const s = suggested ? ` · suggested ${suggested >= 60 ? human(suggested) : suggested}` : '';
  return `⏱ ${min < 1 ? 'under a minute' : human(min)} here${s}`;
}

/** One nudge toward a hint, once you are past 1.5x the suggested time and hints are left. */
export const shouldNudge = ({ activeMs, suggested, hintsLeft, nudged }) => !nudged && hintsLeft > 0 && suggested > 0 && activeMs > suggested * 60_000 * NUDGE_FACTOR;

/**
 * Tracks the current level's time in memory. touch(key) notes an action (key: the level, or null when not on one) and
 * returns the time to credit when the level changes; take() returns the time so far and starts again; pending(key)
 * is the time not credited yet. Credit the returned [{ key, ms }] to progress whenever it suits you.
 */
export function levelClock({ now = Date.now, cap = STRETCH_CAP_MS } = {}) {
  let cur = null;
  const advance = () => { if (cur) { const t = now(); cur.pending += stretch(cur.last, t, cap); cur.last = t; } };
  const out = (c) => (c && c.pending ? [{ key: c.key, ms: c.pending }] : []);
  return {
    touch(key) {
      advance();
      if ((cur?.key ?? null) === (key ?? null)) return [];
      const done = cur;
      cur = key ? { key, last: now(), pending: 0 } : null;
      return out(done);
    },
    take() {
      advance();
      const r = out(cur);
      if (cur) cur.pending = 0;
      return r;
    },
    pending(key) { return cur?.key === key ? cur.pending + stretch(cur.last, now(), cap) : 0; },
  };
}
