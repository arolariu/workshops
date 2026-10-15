// StudyBuddy grades: weighted averages and pass rules (grades use the 1-10 scale).

/**
 * Weighted average of graded items, rounded to 2 decimals.
 * @param {{ grade: number, weight: number }[]} items - weights are percentages or relative weights
 * @returns {number}
 */
export function weightedAverage(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new RangeError('items must be a non-empty array');
  }
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) {
    throw new RangeError('the total weight must be positive');
  }
  const total = items.reduce((sum, item) => sum + item.grade * item.weight, 0);
  return Math.round((total / totalWeight) * 100) / 100;
}

/**
 * Did the student pass the course?
 * @param {{ finalGrade: number, examGrade: number }} result
 * @returns {boolean}
 */
export function hasPassed({ finalGrade, examGrade }) {
  return finalGrade >= 5;
}
