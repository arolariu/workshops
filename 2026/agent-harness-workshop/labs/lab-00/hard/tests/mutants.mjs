// The five mutants for the run-stats suite check (M4), built from the reference run-stats.mjs when the check runs: each
// one is the reference with exactly one plausible bug. If an anchor is missing (the reference changed), building fails
// loudly, so the check can never quietly test against a stale copy.
const MUTATIONS = {
  // A denial is counted as a success.
  'denied-as-ok': (s) => swap(s, "step.outcome = d.success ? 'ok' : d.error?.code === 'denied' ? 'denied' : 'failed';", "step.outcome = d.success || d.error?.code === 'denied' ? 'ok' : 'failed';"),
  // A failed call is counted as a success.
  'failed-as-ok': (s) => swap(s, "step.outcome = d.success ? 'ok' : d.error?.code === 'denied' ? 'denied' : 'failed';", "step.outcome = d.success || d.error?.code !== 'denied' ? 'ok' : 'denied';"),
  // The usage checkpoint is ignored: every run costs 0 tokens.
  'no-usage': (s) => swap(s, '        usage = d;\n', ''),
  // Only the exit code's presence counts: a run with a session error and exit 1 is "ok".
  'ignores-exit-code': (s) => swap(s, "s.outcome = s.exitCode === null ? 'incomplete' : s.exitCode !== 0 || s.errors.length ? 'failed' : 'ok';", "s.outcome = s.exitCode === null ? 'incomplete' : 'ok';"),
  // Every tool lands in the first turn.
  'one-turn': (s) => swap(s, 'turnOf(d.turnId).tools.push(step);', "turnOf('0').tools.push(step);"),
};
export const MUTANTS = Object.keys(MUTATIONS);

function swap(source, from, to) {
  if (!source.includes(from)) throw new Error(`the reference run-stats.mjs no longer has "${from.trim()}": update tests/mutants.mjs`);
  return source.replace(from, to);
}

/** The source of one mutant, from the reference run-stats.mjs. */
export function mutant(name, reference) {
  const source = reference.replace(/\r\n/g, '\n');
  const out = MUTATIONS[name](source);
  if (out === source) throw new Error(`mutant ${name} changes nothing`);
  return out;
}
