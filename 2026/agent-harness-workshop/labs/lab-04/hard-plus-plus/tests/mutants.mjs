// The six broken servers for the conformance-suite check (M6), built from the reference server when the check runs:
// each one is the reference with exactly one protocol promise broken. If an anchor is missing (the reference changed),
// building fails loudly, so the check can never quietly test against a stale copy.
const MUTATIONS = {
  // initialize echoes whatever version the client asks for, even one the server doesn't speak.
  'any-version': (s) => cut(s, /session\.version = VERSIONS\.includes\(asked\) \? asked : VERSIONS\[0\];/, 'session.version = asked ?? VERSIONS[0];'),
  // Pages overlap by one, so a client that follows the cursors sees a course twice.
  'overlapping-pages': (s) => cut(s, /return \{ items: items\.slice\(offset, next\), \.\.\.\(next < items\.length \? \{ nextCursor: cursorFor\(next\) \}/, 'return { items: items.slice(offset, next), ...(next < items.length ? { nextCursor: cursorFor(next - 1) }'),
  // notifications/cancelled is ignored: the cancelled call still answers.
  'ignores-cancel': (s) => cut(s, /^ {4}if \(method === 'notifications\/cancelled'\) .*\n/m),
  // HTTP lets anyone in, token or not.
  'open-door': (s) => cut(s, /if \(!authorized\(req\.headers\.authorization\)\) return reply\(401/, 'if (false) return reply(401'),
  // find_courses is no longer marked as deprecated in tools/list.
  'silent-deprecation': (s) => cut(s, /_meta: \{ 'dev\.studybuddy\/schema-version': 1, 'dev\.studybuddy\/deprecated': DEPRECATED \},/, "_meta: { 'dev.studybuddy/schema-version': 1 },"),
  // Requests are served before initialize.
  'serves-before-initialize': (s) => cut(s, /^ {2}if \(!session\.ready && method !== 'initialize' && method !== 'ping'\) .*\n/m),
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
