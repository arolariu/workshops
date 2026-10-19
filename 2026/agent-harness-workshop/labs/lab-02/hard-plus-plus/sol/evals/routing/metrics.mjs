// Reading the results: which skills loaded (from the [skill:name] canaries), and how well each skill was routed.

/** The [skill:name] tags in an answer: unique, in the order they first appear. */
export function canaries(answer) {
  return [...new Set([...String(answer ?? '').matchAll(/\[skill:([a-z0-9]+(?:-[a-z0-9]+)*)\]/g)].map((m) => m[1]))];
}

/**
 * results: [{ id, request, expect: name | null, got: [names] }]; names: the skills to score.
 * Per skill: precision = right / routed (0 when never routed), recall = right / expected (0 when never expected).
 * A miss is a request whose `got` isn't exactly [expect] (or [] when no skill was expected).
 */
export function metrics(results, names) {
  const perSkill = names.map((skill) => {
    const expected = results.filter((r) => r.expect === skill).length;
    const routed = results.filter((r) => r.got.includes(skill)).length;
    const tp = results.filter((r) => r.expect === skill && r.got.includes(skill)).length;
    return { skill, expected, routed, tp, fp: routed - tp, fn: expected - tp, precision: routed ? tp / routed : 0, recall: expected ? tp / expected : 0 };
  });
  const mean = (k) => (perSkill.length ? perSkill.reduce((n, s) => n + s[k], 0) / perSkill.length : 0);
  const none = results.filter((r) => r.expect === null);
  const missed = (r) => (r.expect === null ? r.got.length > 0 : !(r.got.length === 1 && r.got[0] === r.expect));
  return {
    perSkill,
    macro: { precision: mean('precision'), recall: mean('recall') },
    none: { total: none.length, left: none.filter((r) => r.got.length === 0).length },
    misses: results.filter(missed).map(({ id, request, expect, got }) => ({ id, request, expect, got })),
  };
}

const n2 = (x) => x.toFixed(2);
/** The report as Markdown. */
export function report(m, { mode = 'lexical' } = {}) {
  const lines = [
    `# Routing eval · ${mode === 'real' ? 'real run' : 'lexical pre-check'}`,
    '',
    '| Skill | Expected | Routed | Right | Precision | Recall |',
    '|---|---:|---:|---:|---:|---:|',
    ...m.perSkill.map((s) => `| ${s.skill} | ${s.expected} | ${s.routed} | ${s.tp} | ${n2(s.precision)} | ${n2(s.recall)} |`),
    `| **macro** | | | | **${n2(m.macro.precision)}** | **${n2(m.macro.recall)}** |`,
    '',
    `Requests that need no skill: ${m.none.left} of ${m.none.total} loaded none.`,
    '',
    '## Misses',
    ...(m.misses.length ? m.misses.map((x) => `- ${x.id} · expected ${x.expect ?? 'no skill'}, got ${x.got.join(' + ') || 'no skill'} · ${x.request}`) : ['None.']),
    '',
  ];
  return lines.join('\n');
}
