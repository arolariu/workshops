// The six mutants for the guard-suite check (M3), built from the reference guard when the check runs: each one is the
// reference with exactly one change. If an anchor is missing (the reference guard changed), building fails loudly, so
// the check can never quietly test against a stale copy.
const MUTATIONS = {
  'no-rm': (s) => cut(s, /^ {4}if \(parts\.some\(isRecursiveForceDelete\)\) return .*\n/m),
  'no-deps': (s) => cut(cut(s, /^ {4}if \(parts\.some\(addsDependency\) \|\| parts\.some\(writesPackageJson\)\) return NO_DEPS;\n/m), /^ {4}if \(\/package\\\.json\/\.test\(text\)\) return NO_DEPS;\n/m),
  'no-env': (s) => cut(s, /^ {2}if \(mentionsEnvFile\(text\)\) return NO_ENV;\n/m),
  'no-hooks': (s) => cut(cut(s, /^ {4}if \(parts\.some\(changesHooks\)\) return HOOKS;\n/m), /^ {4}if \(HOOKS_PATH\.test\(text\)\) return HOOKS;\n/m),
  'no-secrets': (s) => cut(s, /^ {4}const secret = findSecret\(text\);\n {4}if \(secret\) return .*\n/m),
  'over-blocking': (s) => cut(s, /^( {2}const text = JSON\.stringify\(args \?\? \{\}\);\n)/m, "$1  if (SHELL_TOOLS.has(toolName) && /\\bnpm\\b/.test(String(args.command ?? ''))) return 'npm is blocked in this project. Ask the human to run it instead.';\n"),
};
export const MUTANTS = Object.keys(MUTATIONS);

function cut(source, re, replacement = '') {
  if (!re.test(source)) throw new Error(`the reference guard no longer has the line ${re}: update tests/mutants.mjs`);
  return source.replace(re, replacement);
}

/** The source of one mutant, from the reference guard's source. */
export function mutant(name, reference) {
  const source = reference.replace(/\r\n/g, '\n');
  const out = MUTATIONS[name](source);
  if (out === source) throw new Error(`mutant ${name} changes nothing`);
  return out;
}
