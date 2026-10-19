// @studybuddy/planner: a study plan from the deadlines.
import { upcoming, daysBetween } from '../../deadlines.js';

/** A YYYY-MM-DD date moved by `n` days. */
export function shift(date, n) {
  return new Date(Date.parse(date) + n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * When to start each open assignment due in the next `days` days: 2 days before it is due, or today if that is
 * sooner. Soonest first.
 * @param {{ id: string, title: string, due: string, done: boolean }[]} assignments
 * @param {string} today - YYYY-MM-DD
 * @param {number} [days=7]
 * @returns {{ id: string, start: string, due: string }[]}
 */
export function studyPlan(assignments, today, days = 7) {
  return upcoming(assignments.filter((a) => !a.done), today, days).map((a) => ({
    id: a.id,
    start: daysBetween(today, a.due) <= 2 ? today : shift(a.due, -2),
    due: a.due,
  }));
}
