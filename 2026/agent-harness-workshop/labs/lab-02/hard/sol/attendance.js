// StudyBuddy attendance: how often a student showed up.

/**
 * Percentage of sessions attended, rounded to 1 decimal.
 * @param {{ attended: boolean }[]} sessions - one entry per class session
 * @returns {number} a value between 0 and 100
 */
export function attendanceRate(sessions) {
  if (!Array.isArray(sessions) || sessions.length === 0) {
    throw new RangeError('sessions must be a non-empty array');
  }
  const attended = sessions.filter((s) => s.attended).length;
  return Math.round((attended / sessions.length) * 1000) / 10;
}
