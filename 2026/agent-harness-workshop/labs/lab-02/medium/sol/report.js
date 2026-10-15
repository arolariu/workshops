// StudyBuddy report: one line per course.
import { weightedAverage } from './grades.js';

/**
 * One summary line per course, e.g. "SE201 Software Engineering: 8.5".
 * Courses without grades (missing or empty list) say "no grades yet".
 * @param {{ code: string, name: string, grades?: { grade: number, weight: number }[] }[]} courses
 * @returns {string[]}
 */
export function summary(courses) {
  return courses.map((course) => {
    const items = (course.grades ?? []).map((g) => ({ grade: g.grade, weight: g.weight }));
    if (items.length === 0) return `${course.code} ${course.name}: no grades yet`;
    return `${course.code} ${course.name}: ${weightedAverage(items)}`;
  });
}
