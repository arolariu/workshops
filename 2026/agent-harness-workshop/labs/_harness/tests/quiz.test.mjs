import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseQuiz, quizProblems } from '../quiz.mjs';

const SPEC = `Why does a reviewer agent without \`edit\` stay read-only, even when the prompt says "fix it"?
1. The instructions tell it not to edit.
2. The edit tool is never offered to the model, so the model can't call it.
3. Copilot asks for permission before every edit.

<details><summary>Answer</summary>

**2.** The tool list decides which tool schemas reach the model at all. It's a guarantee, not a wish.

</details>`;

test('the spec example parses: question, options, answer and why', () => {
  const q = parseQuiz(SPEC);
  assert.match(q.question, /^Why does a reviewer agent/);
  assert.equal(q.options.length, 3);
  assert.equal(q.options[1], "The edit tool is never offered to the model, so the model can't call it.");
  assert.equal(q.answer, 2);
  assert.match(q.why, /^The tool list decides/);
  assert.deepEqual(quizProblems(q), []);
});

test('CRLF, wrapped options and "**2**." also parse', () => {
  const q = parseQuiz('Q?\r\n1. one\r\n   continued\r\n2. two\r\n<details><summary>Answer</summary>\r\n\r\n**2**. Because.\r\n</details>');
  assert.deepEqual(q.options, ['one continued', 'two']);
  assert.equal(q.answer, 2);
  assert.equal(q.why, 'Because.');
});

test('a question or an explanation wrapped over source lines reads as one paragraph (as Markdown renders it)', () => {
  const q = parseQuiz('The model insists it has a good reason\nto delete the folder.\n\nWhat holds?\n1. a\n2. b\n<details><summary>A</summary>\n\n**2.** The hook runs\noutside the model.\n\nAlways.\n</details>');
  assert.equal(q.question, 'The model insists it has a good reason to delete the folder.\n\nWhat holds?');
  assert.equal(q.why, 'The hook runs outside the model.\n\nAlways.');
});

test('a missing section is null; a broken one says what is wrong', () => {
  assert.equal(parseQuiz(''), null);
  assert.equal(parseQuiz('Just text, no options.'), null);
  assert.deepEqual(quizProblems(parseQuiz('Q?\n1. only one\n<details><summary>A</summary>\n\n**3.** x\n</details>')), [
    'it has 1 option (use 2 to 4)',
    'the answer **3.** is not one of the options',
  ]);
  assert.deepEqual(quizProblems(parseQuiz('Q?\n1. a\n2. b\n')), [
    'the answer is missing (start the <details> body with **N.**)',
    'the explanation is missing (write it after **N.**)',
  ]);
  assert.deepEqual(quizProblems(parseQuiz('Q?\n1. a\n3. b\n<details><summary>A</summary>\n\n**1.** x\n</details>')), ['the options are not numbered 1, 2, 3…']);
  assert.deepEqual(quizProblems(parseQuiz('1. a\n2. b\n<details><summary>A</summary>\n\n**1.** x\n</details>')), ['the question is missing (write it before the numbered options)']);
  assert.deepEqual(quizProblems(null), []);
});
