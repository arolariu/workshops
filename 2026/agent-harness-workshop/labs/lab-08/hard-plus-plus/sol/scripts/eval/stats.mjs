// 📈 The statistics of an eval suite: pass rate, pass@k and variance per case, a case's report, and how two suites
// compare (a baseline gate, and the value of each layer).

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
/** Percentage points between two rates (0..1), rounded to 2 decimals so 0.6 − 0.5 is 10, not 9.999999999999998. */
const pp = (before, after) => {
  const x = (before - after) * 10000;
  return (Math.sign(x) * Math.round(Math.abs(x))) / 100;
};

/**
 * The share of runs that passed.
 * @param {boolean[]} outcomes - one entry per run: did it pass?
 * @returns {number | null} 0..1, or null when there are no runs
 */
export function passRate(outcomes) {
  if (!outcomes?.length) return null;
  return outcomes.filter(Boolean).length / outcomes.length;
}

/**
 * The unbiased estimator of pass@k: the chance that at least one of k runs, drawn from n recorded runs of which c
 * passed, passes. 1 − C(n − c, k) / C(n, k), computed as a product so it never needs big factorials.
 * @param {number} n - runs recorded
 * @param {number} c - runs that passed
 * @param {number} k - runs you'd get
 * @returns {number}
 */
export function passAtK(n, c, k) {
  if (![n, c, k].every(Number.isInteger) || n < 1 || c < 0 || c > n || k < 1 || k > n) throw new RangeError(`passAtK needs 0 <= c <= n and 1 <= k <= n (got n=${n}, c=${c}, k=${k}).`);
  if (n - c < k) return 1;
  let none = 1; // C(n − c, k) / C(n, k): the chance that all k runs fail
  for (let i = 0; i < k; i++) none *= (n - c - i) / (n - i);
  return 1 - none;
}

/**
 * The population variance, Σ(x − mean)² / n. For pass/fail outcomes (1/0) it is p(1 − p): 0 for a case that always
 * or never passes, 0.25 for a coin flip.
 * @param {number[]} values
 * @returns {number | null} null when there are no values
 */
export function variance(values) {
  if (!values?.length) return null;
  const m = mean(values);
  return mean(values.map((x) => (x - m) ** 2));
}

/**
 * One case's numbers from its scored runs.
 * @param {{ layer: string }} c - the case
 * @param {{ pass: boolean, failed: string[], tokens: { input: number, output: number } }[]} scored - one per run
 * @returns {{ layer, runs, passed, passRate, passAtK: Record<number, number>, variance, tokens: { input, output } | null, failures: { run: number, failed: string[] }[] }}
 */
export function caseReport(c, scored) {
  const n = scored.length;
  const passed = scored.filter((r) => r.pass).length;
  const at = {};
  for (let k = 1; k <= n; k++) at[k] = passAtK(n, passed, k);
  return {
    layer: c.layer,
    runs: n,
    passed,
    passRate: passRate(scored.map((r) => r.pass)),
    passAtK: at,
    variance: variance(scored.map((r) => (r.pass ? 1 : 0))),
    tokens: n ? { input: Math.round(mean(scored.map((r) => r.tokens.input))), output: Math.round(mean(scored.map((r) => r.tokens.output))) } : null,
    failures: scored.map((r, i) => ({ run: i + 1, failed: r.failed })).filter((f) => f.failed.length),
  };
}

/**
 * Compare a suite with a baseline, case by case. Only cases with a pass rate on both sides are compared; a drop of
 * more than `threshold` percentage points is a regression.
 * @param {{ cases: Record<string, { passRate: number | null }> }} baseline
 * @param {{ cases: Record<string, { passRate: number | null }> }} current
 * @param {{ threshold?: number }} [options]
 * @returns {{ ok: boolean, threshold: number, before: number | null, after: number | null, dropPp: number | null, regressions: { id, before, after, dropPp }[], improvements: { id, before, after, dropPp }[], missing: string[], added: string[] }}
 */
export function compare(baseline, current, { threshold = 10 } = {}) {
  const rate = (rep, id) => rep?.cases?.[id]?.passRate;
  const scored = (rep) => Object.keys(rep?.cases ?? {}).filter((id) => typeof rate(rep, id) === 'number');
  const a = scored(baseline);
  const b = scored(current);
  const shared = a.filter((id) => b.includes(id));
  const rows = shared.map((id) => ({ id, before: rate(baseline, id), after: rate(current, id), dropPp: pp(rate(baseline, id), rate(current, id)) }));
  const before = shared.length ? mean(rows.map((r) => r.before)) : null;
  const after = shared.length ? mean(rows.map((r) => r.after)) : null;
  const regressions = rows.filter((r) => r.dropPp > threshold).sort((x, y) => y.dropPp - x.dropPp);
  return {
    ok: regressions.length === 0,
    threshold,
    before,
    after,
    dropPp: shared.length ? pp(before, after) : null,
    regressions,
    improvements: rows.filter((r) => r.dropPp < 0).sort((x, y) => x.dropPp - y.dropPp),
    missing: a.filter((id) => !b.includes(id)),
    added: b.filter((id) => !a.includes(id)),
  };
}

/**
 * The value of each layer: how much the suite loses when that layer is removed, and which cases depend on it (they
 * drop by more than `threshold` percentage points). Most valuable first.
 * @param {object} full - the report of the whole harness
 * @param {Record<string, object>} removed - layer → the report of the harness without that layer
 * @param {{ threshold?: number }} [options]
 * @returns {{ layer: string, before: number, after: number, dropPp: number, cases: { id, before, after, dropPp }[] }[]}
 */
export function ablation(full, removed, { threshold = 10 } = {}) {
  return Object.entries(removed ?? {})
    .map(([layer, rep]) => {
      const c = compare(full, rep, { threshold });
      return { layer, before: c.before, after: c.after, dropPp: c.dropPp, cases: c.regressions };
    })
    .sort((x, y) => y.dropPp - x.dropPp);
}
