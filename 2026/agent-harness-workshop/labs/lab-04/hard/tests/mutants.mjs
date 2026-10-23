// The six broken servers for the contract-suite check (M5), built from the reference server when the check runs: each
// one is the reference with exactly one behaviour broken. If an anchor is missing (the reference changed), building
// fails loudly, so the check can never quietly test against a stale copy.
const MUTATIONS = {
  // An unknown id is "marked" instead of refused.
  'accepts-unknown-ids': (s) => cut(s, /^ {6}if \(!assignment\) throw new Error\(.*\n/m, '      if (!assignment) return { ok: true, id: wanted, changed: true, message: `Marked ${wanted} as done.` };\n'),
  // A repeat is an error again.
  'errors-on-repeat': (s) => cut(s, /^ {6}if \(isDone\(assignment, state\)\) return .*\n/m, '      if (isDone(assignment, state)) throw new Error(`${wanted} is already done.`);\n'),
  // Done ids live in memory only, so a restarted server forgets them.
  'forgets-on-restart': (s) => cut(cut(s, /^function writeState\(state\) \{\n/m, 'let MEMORY = null;\nfunction writeState(state) {\n  MEMORY = state;\n  return;\n'), /^function readState\(\) \{\n/m, 'function readState() {\n  if (MEMORY) return { ok: true, done: MEMORY.done };\n'),
  // get_deadlines ignores what was marked done.
  'still-listed': (s) => cut(s, /\.filter\(\(a\) => !isDone\(a, state\)\)/, '.filter((a) => !a.done)'),
  // mark_done says it is read-only, so a client could run it without asking.
  'claims-read-only': (s) => cut(s, /annotations: \{ readOnlyHint: false, destructiveHint: false, idempotentHint: true/, 'annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true'),
  // Bad input becomes a JSON-RPC error instead of a result with isError.
  'protocol-errors': (s) => cut(cut(s, /return send\(\{ id, result: toolError\((`Invalid arguments[^`]*`)\) \}\);/, 'return send({ id, error: { code: -32602, message: $1 } });'), /return send\(\{ id, result: toolError\(e\.message\) \}\);/, 'return send({ id, error: { code: -32603, message: e.message } });'),
};
export const MUTANTS = Object.keys(MUTATIONS);

function cut(source, re, replacement = '') {
  if (!re.test(source)) throw new Error(`the reference server no longer has ${re}: update tests/mutants.mjs`);
  return source.replace(re, replacement);
}

/** The source of one mutant, from the reference server's source. */
export function mutant(name, reference) {
  const source = reference.replace(/\r\n/g, '\n');
  const out = MUTATIONS[name](source);
  if (out === source) throw new Error(`mutant ${name} changes nothing`);
  return out;
}
