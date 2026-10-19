// Lab 03 · the three fixes REVIEW.md suggests for deadlines.js, as anchored edits of the reference file.
// Shared by the medium checks (do your red tests turn green when, and only when, their bug is fixed?) and the
// hard++ recorded run (what the implementer's edits leave behind). An anchor that no longer matches throws, so a
// change to the reference deadlines.js fails loudly instead of silently testing nothing.

export const FIXES = {
  // 🔴 deadlines.js:23 · upcoming() also returns assignments that are already done.
  done: [/\.filter\(\(a\) => \{\n(\s*)const left = daysBetween\(from, a\.due\);/, '.filter((a) => {\n$1if (a.done) return false;\n$1const left = daysBetween(from, a.due);'],
  // 🟡 deadlines.js:7 · today() uses toISOString(), which is UTC.
  utc: [/return now\.toISOString\(\)\.slice\(0, 10\);/, "const pad = (n) => String(n).padStart(2, '0');\n  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;"],
  // 🟢 deadlines.js:12 · daysBetween() returns NaN for invalid dates.
  invalid: [/export function daysBetween\(from, to\) \{\n/, "export function daysBetween(from, to) {\n  for (const d of [from, to]) {\n    const t = Date.parse(d);\n    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(String(d)) || Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== d) {\n      throw new RangeError(`Not a valid YYYY-MM-DD date: ${d}`);\n    }\n  }\n"],
};
export const FIX_NAMES = Object.keys(FIXES);
/** Where REVIEW.md places each finding. */
export const LOCATION = { done: 'deadlines.js:23', utc: 'deadlines.js:7', invalid: 'deadlines.js:12' };

/** `source` (the reference deadlines.js) with the named fixes applied. */
export function applyFixes(source, names = FIX_NAMES) {
  let out = String(source).replace(/\r\n/g, '\n');
  for (const name of names) {
    const [anchor, replacement] = FIXES[name] ?? [];
    if (!anchor) throw new Error(`Unknown fix: ${name}`);
    if (!anchor.test(out)) throw new Error(`The ${name} fix no longer matches the reference deadlines.js: update labs/_harness/fixtures/lab-03/deadlines-fixes.mjs.`);
    out = out.replace(anchor, () => replacement.replace(/\$1/g, out.match(anchor)[1] ?? ''));
  }
  return out;
}
