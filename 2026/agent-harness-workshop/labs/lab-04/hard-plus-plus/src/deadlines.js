// StudyBuddy deadlines: what is due soon?

const DAY = 24 * 60 * 60 * 1000;

/** Today's date as YYYY-MM-DD. */
export function today(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from, to) {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY);
}

/**
 * Assignments due within `days` days of `from`, soonest first.
 * @param {{ id: string, title: string, due: string, done: boolean }[]} assignments
 * @param {string} from - YYYY-MM-DD
 * @param {number} [days=7]
 */
export function upcoming(assignments, from, days = 7) {
  return assignments
    .filter((a) => {
      const left = daysBetween(from, a.due);
      return left >= 0 && left <= days;
    })
    .sort((a, b) => a.due.localeCompare(b.due));
}
