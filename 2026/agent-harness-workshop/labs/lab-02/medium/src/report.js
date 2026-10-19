// StudyBuddy report: one line per course.
import { weightedAverage } from './grades.js';
import { attendanceRate } from './attendance.js';

/**
 * One summary line per course, e.g. "SE201 Software Engineering: 8.5".
 * @param {{ code: string, name: string, grades: { grade: number, weight: number }[] }[]} courses
 * @returns {string[]}
 */
export function summary(courses) {
  return courses.map((course) => {
    const items = course.grades.map((g) => ({ grade: g.grade, weight: g.weight }));
    return `${course.code} ${course.name}: ${weightedAverage(items)}`;
  });
}

/**
 * One attendance line per course, e.g. "SE201 Software Engineering: 66.7% attendance".
 * @param {{ code: string, name: string, sessions: { attended: boolean }[] }[]} courses
 * @returns {string[]}
 */
export function attendanceLines(courses) {
  return courses.map((course) => `${course.code} ${course.name}: ${attendanceRate(course.sessions)}% attendance`);
}
