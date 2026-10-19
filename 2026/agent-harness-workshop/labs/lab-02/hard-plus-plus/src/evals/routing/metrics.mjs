// Reading the results: which skills loaded (from the [skill:name] canaries), and how well each skill was routed.
// Your work: TODO(M3) canaries(), metrics() and report(). The exact format is in todo.md.

/** The [skill:name] tags in an answer: unique, in the order they first appear. */
export function canaries(answer) {
  // TODO(M3): find every [skill:<lowercase-with-hyphens>] tag.
  return [];
}

/**
 * results: [{ id, request, expect: name | null, got: [names] }]; names: the skills to score.
 * Per skill: precision = right / routed (0 when never routed), recall = right / expected (0 when never expected).
 * A miss is a request whose `got` isn't exactly [expect] (or [] when no skill was expected).
 */
export function metrics(results, names) {
  // TODO(M3): { perSkill: [{ skill, expected, routed, tp, fp, fn, precision, recall }] (in the order of names),
  //   macro: { precision, recall } (the mean over the skills), none: { total, left }, misses: [{ id, request, expect, got }] }
  return { perSkill: [], macro: { precision: 0, recall: 0 }, none: { total: 0, left: 0 }, misses: [] };
}

/** The report as Markdown. */
export function report(m, { mode = 'lexical' } = {}) {
  // TODO(M3): the title, one table row per skill, the macro row, the no-skill line and the misses (format in todo.md).
  return `# Routing eval · ${mode === 'real' ? 'real run' : 'lexical pre-check'}\n\nTODO\n`;
}
