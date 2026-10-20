// 📈 The statistics of an eval suite: pass rate, pass@k and variance per case, a case's report, and how two suites
// compare (a baseline gate, and the value of each layer).

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * The share of runs that passed.
 * @param {boolean[]} outcomes - one entry per run: did it pass?
 * @returns {number | null} 0..1, or null when there are no runs
 */
export function passRate(outcomes) {
  // TODO(M2)
  return null;
}

/**
 * The unbiased estimator of pass@k: the chance that at least one of k runs, drawn from n recorded runs of which c
 * passed, passes: 1 − C(n − c, k) / C(n, k).
 * @param {number} n - runs recorded
 * @param {number} c - runs that passed
 * @param {number} k - runs you'd get
 * @returns {number}
 */
export function passAtK(n, c, k) {
  // TODO(M2)
  return null;
}

/**
 * The population variance, Σ(x − mean)² / n. For pass/fail outcomes (1/0) it is p(1 − p).
 * @param {number[]} values
 * @returns {number | null} null when there are no values
 */
export function variance(values) {
  // TODO(M2)
  return null;
}

/**
 * One case's numbers from its scored runs.
 * @param {{ layer: string }} c - the case
 * @param {{ pass: boolean, failed: string[], tokens: { input: number, output: number } }[]} scored - one per run
 * @returns {{ layer, runs, passed, passRate, passAtK: Record<number, number>, variance, tokens: { input, output } | null, failures: { run: number, failed: string[] }[] }}
 */
export function caseReport(c, scored) {
  // TODO(M2): passAtK for every k from 1 to the number of runs; tokens are the mean per run, rounded.
  return null;
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
  // TODO(M3)
  return null;
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
  // TODO(M4): compare() already knows how to find the cases that dropped.
  return null;
}
