# 🟣 Hard+ · Change control

> 🕐 about 3 h · 🏠 homework · 🆓 free checks · 🧱 builds on: Lab 08 · hard

## 🎯 Mission
Three course teams want StudyBuddy's harness next term. Last week a "small wording fix" to `AGENTS.md` went straight
to `main`, and the grading answers were wrong for a day before anyone noticed. A change to the agent's context is a
change to production code, so give it the same change control: a CI gate on every harness pull request, owners who
must review it, a version and a release script that packages the harness as a plugin and an APM package, an AI
reviewer, and a runbook and a script that roll back to the last good version. Your harness reaches **L5 Governed**.

## 📋 Requirements
1. `.github/workflows/harness-ci.yml` runs on every pull request that changes a harness file, and on pushes to
   `main`. Every time: the scorecard (L4 Guarded or better), the attack pack, the self-tests and the eval self-test.
   Real evals, against the baseline and within a credit budget, run only when someone adds the `run-evals` label,
   and on `main`.
2. The workflow is locked down: read-only `permissions`, a `timeout-minutes` on every job, `concurrency` that never
   cancels a paid run halfway, and every action pinned to a full commit SHA.
3. `.github/CODEOWNERS` owns every harness file, and `.github/pull_request_template.md` has a harness checklist.
4. `harness.json` (`name`, semantic `version`) and `CHANGELOG.md` version the harness. `scripts/release.mjs` bumps
   the version, validates, packages `dist/plugin/` and `dist/apm/`, commits and tags `v<version>`, but only at the
   top of its own git repository. `--dry-run` builds `dist/` and changes nothing else.
5. `.github/workflows/harness-review.md` reviews harness pull requests with your Lab 03 reviewer: read-only, with
   the scorecard's output as input, one comment through safe outputs, and a time and a credit limit.
6. `HARNESS.md` has a rollback runbook, and `scripts/rollback.mjs --to <version>` restores the agent-facing harness
   from the tag `v<version>` (`--dry-run` only lists what it would restore).

The scripts' command lines (their exit codes: 0 done, 1 a check failed, 2 refused):
```text
node scripts/harness-check.mjs [--min L4] [--json] [--scorecard <file>]
node scripts/release.mjs <major|minor|patch> [--dry-run] [--json]
node scripts/rollback.mjs --to <version> [--dry-run] [--json]
```

## 🧭 Milestones
### M1 · CI gate
- `harness-ci.yml` runs on `pull_request` (with the `labeled` type, so adding a label starts a run) and on `push`
  to `main`, and its `paths` let every harness file of this folder through
- In jobs without an `if`: the scorecard (`scripts/harness-check.mjs`, at least L4, told where the scorecard is),
  `node scripts/attack.mjs`, `node --test` and `node scripts/eval.mjs --from … --baseline …`
- A step runs `scripts/eval.mjs` for real, with `--baseline` and a `--budget`, only on a push to `main` or when
  someone adds the `run-evals` label (the `labeled` event for that label): never on the other events of a pull
  request that has the label
- `permissions` is read-only, every job has a `timeout-minutes`, there is a `concurrency` group that never cancels
  a paid eval run halfway, and every `uses:` is pinned to a 40-character commit SHA
- The X-ray now shows **L5 Governed**

### M2 · Ownership
- `.github/CODEOWNERS` gives every harness file of this folder an owner (the last matching line wins), its own
  line included, and the owner `HARNESS.md` names is one of them
- `.github/pull_request_template.md` has a checklist (`- [ ]`) with an item for each of: the scorecard, the attack
  pack, the evals, the budget and the rollback

### M3 · Release
- `harness.json` has a `name` and a semantic `version`; `CHANGELOG.md` follows Keep a Changelog, and its newest
  release is that version
- `release.mjs` exports `bump(version, part)`; `--dry-run` validates (the scorecard at least L4, the attack pack
  clean, something under `## [Unreleased]`), builds `dist/plugin/` (a `plugin.json` and every agent, skill and hook
  of the harness) and `dist/apm/` (an `apm.yml` and the same layers in `.apm/`) at the next version, and leaves
  `harness.json`, `CHANGELOG.md` and the tags alone; it exits 1 when one of those validations fails
- A real release, at the top of its own repository, moves the Unreleased notes under the new version, commits and
  tags `v<version>`; inside another repository (like this workshop) it refuses with exit 2

### M4 · AI review
- `harness-review.md` runs on pull requests that change harness files, imports the reviewer agent, has read-only
  `permissions`, `timeout-minutes` and `max-ai-credits`, and writes only one comment (`add-comment`, `max: 1`)
- It runs `scripts/harness-check.mjs` before the agent starts, and its prompt reads that output
- The X-ray's workflow rules stay green; `gh aw compile --strict` accepts it (optional, when `gh aw` is installed)

### M5 · Rollback
- `HARNESS.md` has a `## Rollback runbook` with numbered steps: the dry run, the restore, the checks, a pull
  request, and a patch release with a CHANGELOG line
- In a repository with the tags `v1.0.0` and `v1.1.0`, `rollback.mjs --to 1.0.0 --dry-run` lists every
  agent-facing harness file that changed (restore, remove, bring back; with `--json`:
  `{ "to", "changes": [{ "path", "action" }] }`) and changes nothing; `--to 9.9.9` exits 2
- Without `--dry-run` it restores those files in the working tree, never `CHANGELOG.md` or `harness.json`, and
  refuses (exit 2) while a harness file has uncommitted changes

## 📂 Work here
```bash
cd labs/lab-08/hard-plus/src
code .github/workflows/harness-ci.yml .github/CODEOWNERS
code .github/pull_request_template.md harness.json CHANGELOG.md
code scripts/release.mjs .github/workflows/harness-review.md
code scripts/rollback.mjs HARNESS.md
node scripts/harness-check.mjs                  # the maturity level
node scripts/release.mjs minor --dry-run        # then look in dist/
node labs/start.mjs test lab-08 hard+           # from the workshop
```
Each new starter file has a `TODO(M<n>)` where its milestone's work goes (M5's runbook goes in `HARNESS.md`). The
level gives you `scripts/harness-check.mjs`: it runs the workshop's scorecard (the one in the X-ray) on this folder,
so CI and `release.mjs` judge the harness the way you see it. Inside the workshop it finds
`labs/_harness/scorecard.mjs` by walking up; anywhere else, give it
the file (`--scorecard`, or the `HARNESS_SCORECARD` variable). `release.mjs` and `rollback.mjs` give you the
plumbing (arguments, git, printing, copying files): you write the decisions.

## 💡 Hints
### M1
<details><summary>Outside the workshop, where is the scorecard?</summary>

Your own repository doesn't have `labs/_harness/`. Treat the scorecard like any other tool you run in CI: check it
out at a pinned commit, next to your harness, and point `HARNESS_SCORECARD` at it. Two checkouts need two folders
(`path:`), and `defaults.run.working-directory` saves you a `cd` in every step.
```yaml
- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
  with:
    repository: arolariu/workshops
    ref: d0e58b9d0fd7029ddabe562ece22bece41dd1feb  # a commit
    path: tools
    sparse-checkout: 2026/agent-harness-workshop/labs/_harness
```

</details>

<details><summary>Real evals: a person decides when</summary>

Put them in their own job, with `needs:` on the gate and an `if:` that reads the **event**, not the label list:
```yaml
evals:
  needs: gate
  if: >-
    (github.event_name == 'push' && github.ref == 'refs/heads/main')
    || (github.event.action == 'labeled'
        && github.event.label.name == 'run-evals')
```
Adding the label is the decision to spend credits, and it runs the evals once. "The pull request has the label"
would run them again on every push and on every other label, without anyone deciding; to re-run, push and then
remove and add the label again. A label is only an event when `types:` lists `labeled`. Size the budget from the
worst case: 8 cases × 1 run × 30 credits (the smallest cap a Copilot session takes) = about 240 (the cap is soft: a
run can go one response over), so `--runs 1 --budget 240`. With one run a case scores 0 or 100%, so `--threshold 75`
flags only a case that always passed and now fails. The job needs a Copilot token (`secrets.COPILOT_GITHUB_TOKEN`)
and the CLI at a pinned version. On a CI runner no folder is trusted, so Copilot wouldn't load your MCP server,
hooks or agents: `eval.mjs` passes `--trust-folder` to each run, which trusts the folder for that one session only.
Pull requests from forks get no secrets: that's a feature here.

</details>

<details><summary>Pinning actions, and a paid run nobody cancels</summary>

A tag like `@v7` can be moved to other code at any time; a commit SHA can't. Write the SHA and keep the version in
a comment: `actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0`. Dependabot updates both. Add
`persist-credentials: false` to the checkouts: nothing in this workflow pushes. A workflow-level `concurrency` with
`cancel-in-progress: true` would also cancel an eval run that has already spent its credits. Put concurrency on
the jobs instead: the gate's group cancels (a new push makes the old check pointless), the evals job's group has
`cancel-in-progress: false`, so a second paid run waits for the first.

</details>

### M2
<details><summary>How CODEOWNERS matches</summary>

Lines read like `.gitignore`: `/AGENTS.md` is the root file only, `*.instructions.md` matches at any depth, and
`/.github/` is everything under it. The **last** matching line wins, so put the broad lines first and the stricter
ones after them. GitHub accepts a review from **any one** of a line's owners, so the controls (the hooks, the
workflows, the scripts whose exit code is the gate, the eval baseline, the shipped attack pack, `CODEOWNERS` itself)
get lines that name only the harness owner. A line with no owner un-owns its files. Owners are `@user`,
`@org/team` or an e-mail address, and they need write access to the repository.

</details>

<details><summary>A checklist people actually tick</summary>

One line per check, each with the command that proves it: `node scripts/harness-check.mjs`, `node
scripts/attack.mjs`, the eval self-test (and when to add the `run-evals` label), the X-ray's always-on total for the
budget, and the version to roll back to. GitHub fills the pull request's description with the template.

</details>

### M3
<details><summary>Bumping a version</summary>

`1.4.2` → patch `1.4.3`, minor `1.5.0`, major `2.0.0`: the parts to the right of the bumped one go back to 0, and a
pre-release suffix (`-rc.1`) is dropped. Anything else (`1.4`, `v1.4.2`, `minor-ish`) throws.

</details>

<details><summary>What goes in which package</summary>

The plugin (as in Lab 06): `plugin.json` with `name`, `version`, `description` and the folders: `agents/`,
`skills/`, `hooks/hooks.json` (its command becomes `node hooks/scripts/guard.mjs`: a plugin's hooks run from the
plugin's folder) and `mcp/servers.json` with the server. APM: `apm.yml`, and `.apm/instructions/`, `.apm/agents/`,
`.apm/skills/`, `.apm/hooks/`. A hook's command points at its script relative to the hook file
(`node ./scripts/guard.mjs`): `apm install` copies the script and rewrites the path. `AGENTS.md` stays home: it's
this repository's own rules.

</details>

<details><summary>Only in its own repository</summary>

`git rev-parse --show-cdup` prints the way up to the top of the repository: nothing at the top. Inside the
workshop (from `labs/lab-08/hard-plus/src`) it prints `../../../../../../`, so a real release refuses there;
`--dry-run` never tags, so it works anywhere. A release commits `dist/` too: an install pinned to a tag needs the
package inside the tagged tree, the way a JavaScript action commits its `dist/`.

</details>

### M4
<details><summary>Giving the agent the scorecard</summary>

gh-aw runs the frontmatter's `steps:` in the agent's job, before the agent starts. Once you write your own steps,
gh-aw no longer checks the repository out for you, so start with `actions/checkout`. Then fetch the scorecard (as in
M1), run `harness-check.mjs` and write its output to a file (`… > scorecard.txt 2>&1 || true`: a low score is
something to review, not a reason to skip the review), and tell the agent in the prompt to read that file first.
The agent doesn't need a shell for it.

</details>

<details><summary>The reviewer, not a new prompt</summary>

`imports: [.github/agents/reviewer.agent.md]` makes your Lab 03 reviewer the agent. The prompt only adds what's
special about harness changes: compare the scorecard with the previous level, read the threat model in
`HARNESS.md`, and look for weakened boundaries, new tools and raised limits.

</details>

### M5
<details><summary>What a rollback restores</summary>

What the agent runs with: `AGENTS.md`, instructions, skills, agents, hooks, the MCP config and server, and the APM
manifest and lock. Not the change control (workflows, `CODEOWNERS`, the scripts, evals and attacks): the newest
checks then tell you whether the old harness still meets today's bar. Not the history: `CHANGELOG.md` and
`harness.json` only move forward. A rollback is released as a new patch version.

</details>

<details><summary>Asking git</summary>

`git diff --name-status --no-renames --relative v1.0.0` compares the tag with the working tree: `M` restore, `A`
(new since the tag) remove, `D` (gone since) bring back. `git restore --source v1.0.0 --worktree -- <paths>` does
all three in one go, without touching the index.

</details>

## 🧠 Takeaway
A change to the agent's context is a change to production code: review it, gate it, version it, and know how to roll it back.

## ❓ Check yourself
A pull request changes one sentence in `AGENTS.md`. Your gate runs the scorecard, the attack pack and the
self-tests, and all three pass. Why does the workflow still offer real evals behind the `run-evals` label?
1. The scorecard only checks the harness's structure and the attack pack only the guard: neither sees whether the
   model still gives the right answers with the new sentence. Evals do, but they cost credits, so they run on
   request and on `main`.
2. Real evals are free in GitHub Actions, so the label only keeps the log short.
3. The attack pack can't run on pull requests from forks, and evals replace it there.

<details><summary>Answer</summary>

**1.** Structure and guard rules are deterministic and free, so they run every time. Whether a sentence in
`AGENTS.md` changes the model's behaviour is a probabilistic question: only evals against a baseline answer it, and
each run spends credits, so a person decides when (the label), and `main` always gets one.

</details>

## 🚀 Going further
- Turn on branch protection for `main`: require the gate's job and a review from Code Owners, so neither can be
  skipped.
- Sign the release tags (`git tag -s`), and attach `dist/` to a GitHub release with a checksum file.
- `apm pack --format plugin` builds a plugin from an APM project: compare its output with your `dist/plugin/`.
- Lab 08 hard++ installs this package into a second team's codebase, with no copying.
