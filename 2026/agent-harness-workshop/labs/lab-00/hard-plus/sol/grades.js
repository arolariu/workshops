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
 * Did the student pass the course? Both the final grade and the exam grade must be at least 5.
 * @param {{ finalGrade: number, examGrade: number }} result
 * @returns {boolean}
 */
export function hasPassed({ finalGrade, examGrade }) {
  return finalGrade >= 5 && examGrade >= 5;
}

/**
 * Grade point average weighted by credits, rounded to 2 decimals.
 * @param {{ credits: number, finalGrade: number }[]} courses
 * @returns {number}
 */
export function gpa(courses) {
  if (!Array.isArray(courses)) throw new TypeError('courses must be an array');
  if (courses.length === 0) throw new RangeError('courses must not be empty');
  for (const { credits, finalGrade } of courses) {
    if (!Number.isInteger(credits) || credits <= 0) {
      throw new RangeError(`credits must be a positive whole number, got ${credits}`);
    }
    if (typeof finalGrade !== 'number' || finalGrade < 1 || finalGrade > 10) {
      throw new RangeError(`finalGrade must be between 1 and 10, got ${finalGrade}`);
    }
  }
  const credits = courses.reduce((sum, c) => sum + c.credits, 0);
  const points = courses.reduce((sum, c) => sum + c.finalGrade * c.credits, 0);
  return Math.round((points / credits) * 100) / 100;
}
