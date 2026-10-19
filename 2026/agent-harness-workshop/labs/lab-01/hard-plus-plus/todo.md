# 💎 Hard++ · Instructions as code

> 🕐 2–3 h · 🏠 homework · 🆓 free checks · 🤖 optional agent check (about 1 prompt) · 🧱 builds on: Lab 01 · hard+

## 🎯 Mission
StudyBuddy is a workspace now: the shared library at the root, and three packages owned by three teams
(`packages/cli`, `packages/portal`, `packages/planner`). Each team has rules of its own, and each sent them as notes.
Give every package a nested `AGENTS.md` on top of the shared baseline, then treat the instructions like code: a
`check-instructions.mjs` gate that lints them, catches drift and checks coverage, with exit codes CI understands;
CODEOWNERS, so every rule file has a reviewer; and a canary regression suite that proves each package still loads its
own rules, and only its own.

## 📋 Requirements
1. Every package has an `AGENTS.md` of at most 30 lines: commands that work in that package, its own rules and its
   canary. It never repeats or contradicts the root `AGENTS.md`.
2. `node scripts/check-instructions.mjs` runs your hard+ linter on every instruction file, nested ones too, and gives
   each finding a severity: vague rules, duplicates and the budget are warnings; contradictions, wrong commands, drift,
   coverage and owners are errors. It exits 0 when clean, 1 on errors (or on warnings with `--strict`), and 2 when the
   gate itself can't run; `--json` is for machines, `npm run check:instructions` for CI.
3. Drift: file names that don't exist, scoped files that match nothing, a canary that names another package, a suite
   case that expects a canary nobody says. Coverage: every package has an `AGENTS.md` and a canary case. In a folder
   without packages, the gate skips the package checks.
4. `.github/CODEOWNERS` gives the baseline to `@studybuddy/platform`, each package to its team, and each package's
   `AGENTS.md` to its team and platform together. `ownersOf()` reads it the way GitHub does, and the gate flags every
   instruction file nobody owns.
5. `evals/canaries.json` has a case for the root and one per package; `scripts/canaries.mjs` scores the answers, from
   recorded files for free or from real runs.

## 🧭 Milestones
### M1 · Nested rules on a shared baseline
- `packages/<p>/AGENTS.md` for `cli`, `portal` and `planner`: under 30 lines, a `## Commands` section whose commands
  work in that package, 3+ rules of its own, and the line `Harness check: <p> rules loaded` on top of the baseline's
  canary
- Each says what is special about its package: cli, `run()` returns `{ code, out }` and never calls `process.exit`;
  portal, every value goes through `escapeHtml()` and a page has one `<h1>`; planner, a plan skips done assignments
  and starts 2 days ahead
- No package rule repeats a root rule or contradicts one (the notes have traps)
- `copilot instruction list --json`, started in `packages/cli`, lists both files

### M2 · The gate
- `lintAll(root)` turns `lint()` into findings with a `severity` (from `SEVERITY`), plus `budget` warnings
- A vague rule in a package is a warning (exit 0, and exit 1 with `--strict`); a rule the baseline already has is a
  `duplicate` warning; "Round averages to one decimal." in a package is a `contradiction` error (exit 1); a command
  the package's own `package.json` can't run is a `command` error, even when the root's can
- An unknown option exits 2; `--json` prints `{ ok, code, findings }`; the root `package.json` has a
  `check:instructions` script

### M3 · Drift and coverage
- `drift(root)`: a file name in `code` that exists neither at the root nor next to the instruction file; a scoped file
  whose `applyTo` matches nothing; a nested canary that names another folder; a suite case that expects a canary no
  `AGENTS.md` on its path says
- `coverage(root)`: a package without an `AGENTS.md` or without a canary case; an instruction file or skill without an
  owner; no `CODEOWNERS` at all
- In a copy without `packages/` and `evals/`, the gate doesn't crash, and says it skipped the package checks

### M4 · Owners
- `ownersOf(codeowners, path)` works like GitHub: the last matching line wins, a line without owners un-owns, `/x` and
  `a/b` are anchored at the root, `x/` is a folder, `*` stays inside one folder, `x` without a slash matches anywhere
- `.github/CODEOWNERS`: `@studybuddy/platform` owns the baseline (`AGENTS.md`, `.github/`, `.agents/`, `scripts/`,
  `evals/`), each team its package, and each package's `AGENTS.md` both its team and platform
- With a `CODEOWNERS` that only covers `packages/cli/`, the gate reports `AGENTS.md` as unowned

### M5 · A canary regression suite
- `score(case, answer)` returns `{ id, pass, missing, leaked }`: every `expect` string is there, no `forbid` string
  is, and case doesn't matter
- `node scripts/canaries.mjs --from <answers.json>` exits 1 when a case fails and 0 when all pass; `--dry-run` shows one
  command per case, with its folder
- `evals/canaries.json` has a case in `.` that expects the root canary, and one per package that expects both
  canaries and forbids the other packages'
- `node scripts/check-instructions.mjs --strict` passes your workspace

## 📂 Work here
```bash
cd labs/lab-01/hard-plus-plus/src
code packages/cli/AGENTS.md packages/portal/AGENTS.md
code packages/planner/AGENTS.md
code scripts/check-instructions.mjs .github/CODEOWNERS
code scripts/canaries.mjs evals/canaries.json
node scripts/check-instructions.mjs     # the gate
node scripts/canaries.mjs --dry-run     # the suite, free
node labs/start.mjs test lab-01 hard++  # from the workshop folder
```
Each package's `AGENTS.md` holds the team's notes in a comment: turn them into rules, and watch out, every set of notes
has a trap. The gate gives you the plumbing (`packagesOf()`, `check()`, the CLI and its exit codes) and builds on your
hard+ linter and your medium `which-instructions.mjs`; `canaries.mjs` already knows how to run Copilot. A real suite
run costs one prompt per case, each capped with `--max-ai-credits`: try `--only cli` first.

## 💡 Hints
### M1
<details><summary>What goes in a nested file</summary>

Only what is different in this package. The root `AGENTS.md` loads in every package anyway, so "never add
dependencies" or "dates are YYYY-MM-DD strings" would just cost tokens twice. And check every note against the
baseline: one team wants averages "rounded to one decimal", but the baseline (and the code) says 2.

</details>

<details><summary>Two canaries, one answer</summary>

The baseline already says "End every answer with the line: `Harness check: AGENTS.md loaded`". A package rule that
says the same about another line fights it. Write "In this package, **also** end every answer with the line:
`Harness check: cli rules loaded`", and both lines show up.

</details>

### M2
<details><summary>Severity is a policy</summary>

`lint()` already finds everything; the gate decides what blocks a merge. A vague rule is worth a review comment, not a
red build; a contradiction or a command that doesn't exist misleads the agent today. `--strict` is for the day the
team wants zero warnings. Exit 2 is different: the gate couldn't run, so CI must not read it as "clean".

</details>

### M3
<details><summary>Paths in code spans</summary>

Only spans that look like a file name (`name.js`, `x.json`, `y.md`, folders allowed). Look for the file at the root,
then next to the instruction file: `index.js` in `packages/cli/AGENTS.md` means `packages/cli/index.js`. Skip anything
with a space: `import { x } from './grades.js'` is code, not a path.

</details>

<details><summary>Why skip, not fail?</summary>

`scripts/` travels with you: `bring` carries this gate into the later labs, where StudyBuddy has no packages. There,
"no packages" is a fact, not a finding. Every other check still runs.

</details>

### M4
<details><summary>Last match wins</summary>

Go through the lines in order and keep the owners of the last pattern that matches. To get a glob for `matches()`:
drop a leading `/`; put `**/` in front of a pattern without a `/`; `x/` becomes `x/**`; a name without `*` may also
be a folder (try `x` and `x/**`). That's why the lines for the package `AGENTS.md` files come **after** the lines for
the package folders.

</details>

### M5
<details><summary>Leaks prove the scoping</summary>

A canary suite answers two questions: did the rules load (`expect`), and did only these rules load (`forbid`)? Started
in `packages/cli`, Copilot can't read the other packages (it only reads inside its working folder), so a portal canary
there means a portal rule leaked into a file that loads everywhere.

</details>

## 🧠 Takeaway
At team scale, instructions are code: they have owners, a CI gate that catches drift and contradictions, and canaries that prove every rule still loads where it should.

## ❓ Check yourself
A teammate renames `packages/planner` to `packages/schedule` and moves its `AGENTS.md` along, unchanged. What catches
it first?
1. The gate: the canary in `packages/schedule/AGENTS.md` still says "planner rules loaded", which is drift.
2. CODEOWNERS: GitHub refuses the pull request, because the new folder has no owner.
3. Nothing needs to: Copilot notices the old name and leaves the rule out.
4. The unit tests: `npm test` fails, because the folder changed.

<details><summary>Answer</summary>

**1.** CODEOWNERS only decides who must review (here the catch-all line still matches), the tests never read the
instructions, and Copilot loads the stale file as it is. The drift check is the one that compares the rules with the
repository.

</details>

## 🚀 Going further
- Run the gate in GitHub Actions on every pull request that touches `AGENTS.md`, `.github/instructions/` or
  `packages/*/AGENTS.md`, and turn on "Require review from Code Owners" in a branch rule.
- Run the canary suite nightly rather than on every pull request: it costs a prompt per case. Lab 07 puts agents in CI.
- Add a coverage rule of your own: every package with a `test` script names it in its `## Commands`.
