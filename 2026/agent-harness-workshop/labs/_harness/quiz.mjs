// The "❓ Check yourself" section of a todo.md: a question, 2-4 numbered options, and the answer as **N.** at the start of
// a <details> body (the rest of that body explains it). Inside <details>, GitHub does not give the answer away.
const OPTION = /^\s*(\d+)\.\s+(.*)$/;
// Markdown joins the lines of a paragraph; only a blank line starts a new one.
const unwrap = (s) => s.trim().split(/\n\s*\n/).map((p) => p.split('\n').map((l) => l.trim()).filter(Boolean).join(' ')).join('\n\n');

/** { question, options, answer, why, numbers }, or null when the section is missing or has no numbered options. */
export function parseQuiz(block) {
  const text = String(block ?? '').replace(/\r/g, '').trim();
  if (!text) return null;
  const details = text.match(/<details>\s*<summary>[\s\S]*?<\/summary>([\s\S]*?)<\/details>/);
  const lines = (details ? text.slice(0, details.index) : text).trim().split('\n');
  const first = lines.findIndex((l) => OPTION.test(l));
  if (first < 0) return null;
  const options = [];
  const numbers = [];
  for (const line of lines.slice(first)) {
    const m = line.match(OPTION);
    if (m) { numbers.push(Number(m[1])); options.push(m[2].trim()); } else if (line.trim()) options[options.length - 1] += ` ${line.trim()}`;
  }
  const body = details?.[1].trim() ?? '';
  const a = body.match(/^\*\*(\d+)\.?\*\*\.?\s*([\s\S]*)$/);
  return { question: unwrap(lines.slice(0, first).join('\n')), options, answer: a ? Number(a[1]) : null, why: unwrap(a ? a[2] : body), numbers };
}

/** What makes a quiz unusable, in words a content author can act on; [] when it is fine (or when there is none). */
export function quizProblems(q) {
  if (!q) return [];
  const out = [];
  if (!q.question) out.push('the question is missing (write it before the numbered options)');
  if (q.options.length < 2 || q.options.length > 4) out.push(`it has ${q.options.length} option${q.options.length === 1 ? '' : 's'} (use 2 to 4)`);
  if (q.numbers.some((n, i) => n !== i + 1)) out.push('the options are not numbered 1, 2, 3…');
  if (!q.answer) out.push('the answer is missing (start the <details> body with **N.**)');
  else if (q.answer > q.options.length) out.push(`the answer **${q.answer}.** is not one of the options`);
  if (!q.why) out.push('the explanation is missing (write it after **N.**)');
  return out;
}
