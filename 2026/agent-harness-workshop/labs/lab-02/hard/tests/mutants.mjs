// The five mutants: the reference script (sol/) with one rule broken each. Built at check time, so they never drift
// from the reference; every edit must match exactly once, or the check reports that the reference changed.
export const MUTANTS = [
  { name: 'the scope is dropped', find: /const scope = m\?\.\[2\] \?\? null;/, replace: 'const scope = null;' },
  { name: '"!" is ignored', find: /const bang = Boolean\(m\?\.\[3\]\);/, replace: 'const bang = false;' },
  { name: 'BREAKING CHANGE footers are ignored', find: /const note = body\.match\(FOOTER\)\?\.\[1\]\.trim\(\) \?\? null;/, replace: 'const note = null;' },
  { name: 'a revert never cancels its commit', find: /const target = parsed\.find\(/, replace: 'const target = undefined && parsed.find(' },
  { name: 'breaking changes are listed twice', find: /\.filter\(\(e\) => !breakingHashes\.has\(e\.hash\)\)/, replace: '' },
];

export function mutant(m, reference) {
  const hits = reference.match(new RegExp(m.find.source, 'g'))?.length ?? 0;
  if (hits !== 1) throw new Error(`The mutant "${m.name}" can't be built: its edit matches ${hits} places in the reference script (expected 1).`);
  return reference.replace(m.find, m.replace);
}
