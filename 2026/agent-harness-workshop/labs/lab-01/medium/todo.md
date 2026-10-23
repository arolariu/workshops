# 🟡 Medium · Rules for one folder

> 🕐 30–45 min · 🏠 homework · 🆓 free checks · 🧱 builds on: Lab 01 · easy

## 🎯 Mission
`AGENTS.md` covers the whole project, but some rules only matter for some files. Tests are the classic case: the
agent writes them in a different style every time. Add rules that apply **only to test files**. Then take over the
docs rules a teammate wrote for the docs sprint: they apply to every file and contradict `AGENTS.md` twice, and
Copilot has no order to decide which rule wins. Fix their scope, make the rules agree, and build a small script that
proves which instruction files apply to which path.

## 📋 Requirements
1. `.github/instructions/tests.instructions.md` applies to every `*.test.js` file, in any folder, and to nothing else.
   It has a `description` and at least three rules, including `node:test` and `node:assert/strict`.
2. `grades.test.js` has at least three new `weightedAverage` tests, two of them error cases, written by the agent with
   your rules loaded; `npm test` is green.
3. `.github/instructions/docs.instructions.md` applies to `README.md` and the Markdown files in `docs/`, and to nothing
   else.
4. No scoped rule contradicts `AGENTS.md`: code examples use ES modules, and grades use the 1-10 scale.
5. `scripts/which-instructions.mjs` says, for any path, which instruction files Copilot adds to the context, and it
   agrees with `copilot instruction list`.

## 🧭 Milestones
### M1 · Rules for tests
- The `applyTo` of `tests.instructions.md` matches `grades.test.js` and `lib/deep/deadlines.test.js`, not `grades.js`
  or `README.md`; the frontmatter has a `description`
- At least three bullet rules, naming `node:test` and `node:assert/strict`
- `grades.test.js` has 3+ new `weightedAverage` tests (2+ new `assert.throws`), and `npm test` is green
- `copilot instruction list --json` shows the file with its `applyTo`

### M2 · Rules for docs
- The `applyTo` of `docs.instructions.md` matches `README.md`, `docs/grading.md` and `docs/guides/setup.md`, and not
  `grades.js`, `grades.test.js`, `AGENTS.md` or the instruction files themselves
- It keeps at least three rules

### M3 · One rule, not two
- No scoped rule asks for CommonJS (`require()`) or for grades as percentages
- The docs rules say what to do instead: examples use `import`, grades use the 1-10 scale

### M4 · Which rules apply where
- `matches(glob, path)` handles `**` (any number of folders, also none), `*`, `?` and `{a,b}`
- `applicable(sources, path)` returns the always-on files and every source with a matching glob, in order
- `node scripts/which-instructions.mjs --json grades.test.js docs/grading.md` lists the right files for each path,
  nested `AGENTS.md` files included, and its sources agree with `copilot instruction list --json`

## 📂 Work here
```bash
cd labs/lab-01/medium/src
code .github/instructions/tests.instructions.md
code .github/instructions/docs.instructions.md
code scripts/which-instructions.mjs
copilot instruction list               # what Copilot loads here
node labs/start.mjs test lab-01 medium  # from the workshop folder
```
`tests.instructions.md` is a skeleton: its `applyTo` and its rules are yours to write. `docs.instructions.md` is
Radu's, as he left it. `which-instructions.mjs` already finds the instruction files and reads their `applyTo`; you
write `matches()` and `applicable()`. The checks that call `copilot instruction list` cost no AI credits.

## 💡 Hints
### M1
<details><summary>Anatomy of a scoped file</summary>

```markdown
---
applyTo: "<glob>"
description: <one line>
---
- rule one
- rule two
```
The glob is matched against paths relative to the project, so think about tests in subfolders too.

</details>

<details><summary>Good test rules</summary>

Think about what makes tests easy to read and hard to break: which runner and assert style, one behaviour per test,
test names as full sentences, fixed data instead of `new Date()` or random numbers, and at least one error case.

</details>

<details><summary>See it working</summary>

Run `copilot instruction list`: your file appears with its `applyTo`. Then, in a session: *"Add edge-case tests for
weightedAverage: a single item, a total weight of zero, and input that is not an array."* Check that the new tests
follow your rules.

</details>

### M2
<details><summary>Why "**" is a problem</summary>

Run `copilot instruction list --json` before you change anything: Radu's file is listed **without** an `applyTo`.
Copilot treats `applyTo: "**"` as always on, so his docs rules ride along on every turn, also when the agent edits
`grades.js`. Several globs fit in one string, separated by commas: `"README.md,docs/**/*.md"`.

</details>

### M3
<details><summary>Which rule wins?</summary>

Neither. Copilot combines every file that applies and puts no order between them (the documentation says: "Avoid
conflicting instructions"). A scoped rule should add detail for its own files, never say the opposite of the root.
The team agreed: ES modules everywhere, the 1-10 scale everywhere. Rewrite Radu's two rules so they say that.

</details>

### M4
<details><summary>From a glob to a regular expression</summary>

Walk the glob one character at a time. `**/` becomes `(?:.*/)?` (any folders, or none), a `**` on its own becomes
`.*`, `*` becomes `[^/]*`, `?` becomes `[^/]`, and `{a,b}` becomes `(?:a|b)`. Escape everything else (in a glob, `.`
is just a dot), and anchor the result with `^…$`.

</details>

<details><summary>The always-on files</summary>

`instructionSources()` gives always-on files `applyTo: null`: they apply to every path. Every other source applies
when at least one of its globs matches. Keep the order of `sources` and return the paths.

</details>

## 🧠 Takeaway
Scope rules with `applyTo` so they only cost tokens where they matter, and never let a scoped rule contradict the root: Copilot won't pick a winner for you.

## ❓ Check yourself
`AGENTS.md` says "ES modules only". A scoped file for `docs/**/*.md` says "examples use `require()`". The agent writes
a code example in `docs/setup.md`. What happens?
1. The scoped file wins, because it is more specific than `AGENTS.md`.
2. `AGENTS.md` wins, because Copilot loads it first.
3. Both rules reach the model with no order between them, so the result depends on the model's guess.
4. Copilot spots the conflict and leaves both rules out.

<details><summary>Answer</summary>

**3.** Copilot combines every instruction file that applies and defines no precedence between them. Specific or
general, first or last: the model just sees two answers. Resolve conflicts in the files themselves.

</details>

## 🚀 Going further
- Run `node scripts/which-instructions.mjs` without arguments: every file of the project and the rules it gets. Which
  files get no scoped rules at all, and should they?
- Start `copilot` in `docs/` and run `copilot instruction list`: `AGENTS.md` still loads, but `.github/instructions/`
  doesn't. Copilot looks for scoped files in the repository root and in the folder you start in, not in the folders
  between them, and here `src/` sits between the workshop's root and `docs/`.
- Lab 01 hard+ uses this script to count what every path costs in tokens.
