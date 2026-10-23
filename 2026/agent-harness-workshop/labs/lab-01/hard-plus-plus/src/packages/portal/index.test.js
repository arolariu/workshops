import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, resultPage } from './index.js';

test('escapeHtml turns markup into text', () => {
  assert.equal(escapeHtml('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
});

test('the result page escapes the course and the student', () => {
  const page = resultPage({ student: 'Ana <b>', course: 'Maths & co', finalGrade: 7, examGrade: 6 });
  assert.match(page, /<h1>Maths &amp; co<\/h1>/);
  assert.doesNotMatch(page, /<b>/);
});

test('a failed exam shows "Not passed", even with a good final grade', () => {
  assert.match(resultPage({ student: 'Ana', course: 'Maths', finalGrade: 7.5, examGrade: 4 }), /Not passed/);
});
