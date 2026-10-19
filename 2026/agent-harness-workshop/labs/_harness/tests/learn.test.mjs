import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answerQuiz, quizLines, takeawayLines, quizUnlocked } from '../screens/learn.mjs';
import { renderMarkdown, stripAnsi } from '../ui.mjs';
import { progressStore } from '../progress.mjs';
import { tmpdir } from './helpers.mjs';

const fmt = Object.fromEntries(['green', 'bright', 'dim', 'white', 'yellow', 'bold', 'cyan'].map((k) => [k, (s) => s]));
const ex = { key: 'lab-03/easy', takeaway: 'A tool list is a guarantee.', quiz: { question: 'Why?', options: ['Wish.', 'Guarantee.', 'Asks.'], answer: 2, why: 'Schemas never reach the model.' } };
const show = (lines) => stripAnsi(lines.join('\n'));
const opts = { W: 80, fmt, renderMarkdown };

test('the first answer is recorded; later answers only get feedback', () => {
  const store = progressStore(tmpdir());
  assert.deepEqual(answerQuiz(store, ex, 1), { right: false, first: true });
  assert.equal(store.get(ex.key).quiz, 'wrong');
  assert.deepEqual(answerQuiz(store, ex, 2), { right: true, first: false });
  assert.equal(store.get(ex.key).quiz, 'wrong', 'learning, not grading: the first answer stays');
});

test('the takeaway, then the question with options; no spoiler before an answer', () => {
  assert.match(show(takeawayLines(ex, opts)), /🧠 TAKEAWAY[\s\S]*A tool list is a guarantee/);
  const open = show(quizLines(ex, { ...opts, prompt: 'press 1-3 to answer' }));
  assert.match(open, /❓ CHECK YOURSELF[\s\S]*Why\?[\s\S]*1\. Wish\.[\s\S]*2\. Guarantee\.[\s\S]*3\. Asks\.[\s\S]*press 1-3 to answer/);
  assert.doesNotMatch(open, /Schemas never reach/);
});

test('a right answer gets ✅, a wrong one 💡 with the right answer; both explain', () => {
  const right = show(quizLines(ex, { ...opts, chosen: 2 }));
  assert.match(right, /✅ Right\./);
  assert.match(right, /Schemas never reach the model/);
  const wrong = show(quizLines(ex, { ...opts, chosen: 1 }));
  assert.match(wrong, /💡 Not quite: the answer is 2\./);
  assert.match(wrong, /❌ *1\. Wish\./, 'your choice is marked');
  assert.match(wrong, /✅ *2\. Guarantee\./, 'the right one is marked');
  assert.match(wrong, /Schemas never reach the model/);
});

test('an earlier answer is shown with the explanation; missing sections hide the feature', () => {
  assert.match(show(quizLines(ex, { ...opts, recorded: 'right' })), /You answered this one right[\s\S]*Schemas never reach/);
  assert.match(show(quizLines(ex, { ...opts, recorded: 'wrong' })), /answer is 2/);
  assert.deepEqual(quizLines({ ...ex, quiz: null }, opts), []);
  assert.deepEqual(takeawayLines({ ...ex, takeaway: '' }, opts), []);
});

test('the takeaway and the question unlock after a pass, or once answered', () => {
  const view = (checks, entry = {}) => ({ checks: () => checks, entry: () => entry });
  assert.equal(quizUnlocked(view('fail'), ex), false);
  assert.equal(quizUnlocked(view('pass'), ex), true);
  assert.equal(quizUnlocked(view('stale', { quiz: 'right' }), ex), true);
  assert.equal(quizUnlocked(view('pass'), { ...ex, quiz: null, takeaway: '' }), false, 'nothing to show');
});
