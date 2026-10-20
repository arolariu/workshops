# Phase 5 · Task 12 · Lab 08 🟣 hard+ "Change control": implementation plan

**Goal:** the tier where StudyBuddy's harness reaches **L5 Governed**: a CI gate on harness paths, owners and a PR
checklist, a versioned release that packages a plugin and an APM package, an agentic review of harness PRs, and a
rollback runbook with a script. Spec §5.6 (hard+), plan Task 12 and the wave contract (hard+ row).

**Scope:** `labs/lab-08/hard-plus/**` and this file. `src/` = `labs/lab-08/hard/sol/` + starters; `sol/` reaches L5,
`src/` stays at L4 (no CI gate yet). No agent check (Task 12). Free checks only: YAML parsing with the kit's
`parseYaml`, `gatesHarness` from the scorecard, and the learner's scripts run in temp git repos with a fixed config
(`GIT_CONFIG_GLOBAL` = an empty file, `GIT_CONFIG_NOSYSTEM=1`, identity from `GIT_AUTHOR_*`/`GIT_COMMITTER_*`).

## The level

| | |
|---|---|
| 🕐 | about 3 h · 🏠 homework · 🆓 free checks · 🧱 builds on: Lab 08 · hard |
| M1 · CI gate | `.github/workflows/harness-ci.yml`: `pull_request` (with `labeled`) and `push` to `main`, on harness `paths`; every time: scorecard ≥ L4 (`scripts/harness-check.mjs`), `node scripts/attack.mjs`, `node --test`, the eval self-test (`--from evals/runs/full --baseline`); real evals (`scripts/eval.mjs --runs 1 --budget 240 --baseline … --threshold 75 --report …`) only when someone adds the `run-evals` label (the `labeled` event) or on a push to `main`; `permissions` read-only, `timeout-minutes` on every job, `concurrency` on the jobs (the gate cancels, the paid job queues), every `uses:` pinned to a 40-hex SHA |
| M2 · Ownership | `.github/CODEOWNERS` owns every harness file of the folder (last match wins; itself included; the owner `HARNESS.md` names is among the owners); `.github/pull_request_template.md` has a checklist that covers the scorecard, attacks, evals, the budget and rollback |
| M3 · Release | `harness.json` (`name`, semver `version`), `CHANGELOG.md` (Keep a Changelog; top release = the version); `scripts/release.mjs <major\|minor\|patch> [--dry-run] [--json]`: bump, validate (scorecard ≥ L4, attacks clean, an Unreleased entry, a new tag), package `dist/plugin/` + `dist/apm/`, commit and tag `v<version>` only in its own repository |
| M4 · AI review | `.github/workflows/harness-review.md` (gh-aw): harness paths, imports the Lab 03 reviewer, read-only permissions, runs the scorecard in pre-agent `steps:` and the prompt reads its output, one `add-comment` (max 1), `timeout-minutes`, `max-ai-credits`; the scorecard's workflow rules stay green; `gh aw compile` optional |
| M5 · Rollback | `HARNESS.md` `## Rollback runbook` (numbered steps: decide, dry run, restore, check, PR, release a patch); `scripts/rollback.mjs --to <version> [--dry-run] [--json]` lists (or restores) the agent-facing harness paths from tag `v<version>`, never `CHANGELOG.md`/`harness.json` |

**How CI runs the scorecard outside the workshop:** the level ships `scripts/harness-check.mjs` (given plumbing). It
loads the workshop's scorecard from `--scorecard <file>`, `HARNESS_SCORECARD`, or by walking up to
`labs/_harness/scorecard.mjs`; CI checks the workshop's `labs/_harness` out at a pinned commit (sparse, like a pinned
action) next to the harness checkout. Exit 0 at or above `--min` (default L4), 1 below, 2 no scorecard or bad input.

**Starters (src):** `harness-check.mjs` (complete); skeletons with `TODO(M1)`…`TODO(M5)`: `harness-ci.yml`,
`CODEOWNERS`, `pull_request_template.md`, `harness.json` (version `TODO(M3)`) + `CHANGELOG.md` (an empty
Unreleased), `release.mjs` (plumbing given:
args, git helpers, file copy; `bump`, `validate`, `pack`, the release steps are TODO), `harness-review.md`
(a skeleton without `on`/limits), `rollback.mjs` (plumbing given; `plan`/`restore` TODO). M1 fails on behaviour
(the workflow has no trigger), not on a missing file.

**Inherited files changed in `sol/`:** `HARNESS.md` (Layers, Budget, Changing the harness; `## Rollback` grows into
`## Rollback runbook`). None in `src/` (no overrides).

## Deviations and notes
- The CI eval step is hard's final recommendation: `--runs 1 --budget 240 --baseline evals/baseline.json --threshold
  75 --report evals/reports` (Copilot's per-session minimum is 30 credits: 8 cases × 1 run × 30 = 240; one run
  scores a case 0 or 100%, so 75 points flags only a case that always passed and now fails). The checks judge the
  step generically (it runs `scripts/eval.mjs` with `--baseline` and a `--budget`, under an `if` that names
  `run-evals` and `main`).
- `dist/` is tracked in the learner's own repository (like a JavaScript action's `dist/`): an APM or plugin install
  pinned to a tag needs the package inside the tagged tree. `--dry-run` writes `dist/` and nothing else.
- **gh-aw v0.92.0: custom `steps:` replace the default checkout.** Compiling `harness-review.md` with `steps:` drops
  "Checkout repository (gh-aw default)" and "Checkout PR branch" from the agent job (compared with `issue-triage.md`
  compiled by the same CLI), so the review's steps start with `actions/checkout`; a check requires it.
- **APM 0.33.0 (spike, local path dependency `../repo/dist/apm`, `apm install --target copilot`):** local path
  dependencies work offline; `.apm/agents/` → `.github/agents/`, `.apm/instructions/` → `.github/instructions/`,
  `.apm/hooks/<x>.json` → `.github/hooks/<pkgdir>-<x>.json`, **skills → `.agents/skills/`** (not `.github/skills/`).
  A hook's script is deployed only when its command points at it relative to the hook file (`node ./scripts/guard.mjs`
  → `.github/hooks/scripts/<pkgdir>/scripts/guard.mjs`, command rewritten); `node .github/hooks/scripts/guard.mjs`
  deploys the config without the script.
- The scorecard's CI-gate rule reads `.yml` workflows only; `apm-pinned` rejects a local path dependency (its PINNED
  regex needs `#<tag|sha>`), and skills are scanned only in `.github/skills/`: both matter to hard++ (see the report).
- Review fixes (after the first commit): the paid eval job runs only on `push` to `main` or on the `labeled` event
  whose `github.event.label.name` is `run-evals` (a person decides; push and re-label to re-run), and concurrency
  moved onto the jobs (the gate cancels, the evals job queues with `cancel-in-progress: false`; a workflow-level
  `cancel-in-progress` would cancel a run that already spent credits). The check evaluates the job's and the
  step's `if:` (and the `if:` of every job it needs) with a small GitHub-expression evaluator over six events
  (opened; a push to a labelled PR; another label added; reopened with the label; the run-evals label added; a push
  to main), so any spelling of the right condition passes. "About 240 credits" (the cap is soft). `eval.mjs` gets
  `--trust-folder` from hard (a CI runner trusts no folder). CODEOWNERS names only the owner for the gate's scripts,
  `evals/baseline.json` and `attacks/pack.json` (GitHub accepts any one listed owner).

## Implementation notes
- Files: `todo.md`; `tests/checks.mjs` (22 checks: M1 6, M2 2, M3 7, M4 4 with the optional `gh aw compile`, M5 3),
  `tests/helpers.mjs` (Actions globs, CODEOWNERS matching with last-match-wins, workflow steps and gates, Keep a
  Changelog, temp git repos with `GIT_CONFIG_GLOBAL`/`GIT_CONFIG_NOSYSTEM` and a fixed identity, `HARNESS_SCORECARD`).
- `src/` = hard's `sol/` + 9 starters (`harness-check.mjs` complete; the rest skeletons with `TODO(M1)`…`TODO(M5)`);
  no inherited file changed. `sol/` changes `HARNESS.md` (Layers, Budget, Changing the harness, `## Rollback
  runbook`).
- `verify 08`: hard-plus src fails 19/22, sol passes 21/22 (the optional gh-aw compile skipped there; it passes in
  `test --sol`). `verify 08 --bring`: same. src is L4 Guarded, sol L5 Governed.
