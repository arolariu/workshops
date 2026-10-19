// The learning spine on screen: the takeaway, and the "Check yourself" question with its feedback. The point is
// learning, not grading: a wrong answer shows the explanation too, and only the first answer is recorded.
import { inline, width, wrap } from '../ui.mjs';

/** Record the first answer as quiz: 'right' | 'wrong'. Later answers get feedback but never change the record. */
export function answerQuiz(store, ex, choice) {
  const right = Number(choice) === ex.quiz?.answer;
  const first = !store.get(ex.key).quiz;
  if (first) store.set(ex.key, { quiz: right ? 'right' : 'wrong' });
  return { right, first };
}

/** Shown after the checks pass, or once the question was answered (so a later edit doesn't hide it again). */
export const quizUnlocked = (view, ex) => Boolean(ex.quiz || ex.takeaway) && (view.checks(ex) === 'pass' || Boolean(view.entry(ex).quiz));

const para = (text, W, indent, cont = indent) => wrap(inline(text), Math.max(16, W - width(indent))).map((l, i) => `${i ? cont : indent}${l}`);

export function takeawayLines(ex, { W, fmt }) {
  if (!ex.takeaway) return [];
  return ['', `  🧠 ${fmt.bold(fmt.white('TAKEAWAY'))}`, ...para(fmt.white(ex.takeaway), W, '   ')];
}

/** The question and its options; `chosen` (just answered) or `recorded` (answered before) adds the explanation. */
export function quizLines(ex, { W, fmt, recorded = null, chosen = null, prompt = null }) {
  const q = ex.quiz;
  if (!q) return [];
  const L = ['', `  ❓ ${fmt.bold(fmt.white('CHECK YOURSELF'))}`, ...para(q.question, W, '   ')];
  q.options.forEach((o, i) => {
    const n = i + 1;
    const mark = chosen === null ? '  ' : n === q.answer ? '✅' : n === chosen ? '❌' : '  ';
    L.push(...para(`${n}. ${o}`, W, `   ${mark} `, '        '));
  });
  const explain = () => L.push(...para(fmt.dim(q.why), W, '      '));
  if (chosen !== null) {
    L.push('', chosen === q.answer ? `   ✅ ${fmt.bright('Right.')}` : `   💡 ${fmt.yellow(`Not quite: the answer is ${q.answer}.`)}`);
    explain();
  } else if (recorded) {
    L.push('', `   ${recorded === 'right' ? '✅' : '💡'} ${fmt.dim(recorded === 'right' ? `You answered this one right. The answer is ${q.answer}:` : `The answer is ${q.answer}:`)}`);
    explain();
  }
  if (chosen === null && prompt) L.push('', `   ${fmt.dim(prompt)}`);
  return L;
}
