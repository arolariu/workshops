// @studybuddy/portal: the HTML pages students see.
import { hasPassed } from '../../grades.js';

/** Escape text for HTML. Every value from a course page or a student goes through here. */
export function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(text).replace(/[&<>"']/g, (c) => map[c]);
}

/**
 * The result page of one course.
 * @param {{ student: string, course: string, finalGrade: number, examGrade: number }} r
 * @returns {string}
 */
export function resultPage(r) {
  const passed = hasPassed(r);
  return [
    `<h1>${escapeHtml(r.course)}</h1>`,
    `<p>${escapeHtml(r.student)}: final grade ${r.finalGrade.toFixed(2)}, exam ${r.examGrade.toFixed(2)}</p>`,
    `<p class="${passed ? 'passed' : 'failed'}">${passed ? 'Passed' : 'Not passed'}</p>`,
  ].join('\n');
}
