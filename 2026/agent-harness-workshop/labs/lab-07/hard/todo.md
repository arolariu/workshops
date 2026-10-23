# 🔴 Hard · A reviewer in CI

> 🕐 1–1.5 h · 🏠 homework · 🆓 free checks · 🧱 builds on: Lab 07 · medium

## 🎯 Mission
In Lab 03 you built a reviewer that you call by hand. Now it runs on every pull request, with nobody watching: write
`pr-review.md` from scratch. It starts only when code or rules change, brings in your Lab 03 reviewer's checklist,
reads the pull request and nothing else, posts **one** review comment that stays one comment after five pushes,
and stops at a timeout and a credit limit. A human still decides. Then prove the triggers are worth it: measure
how many reviews a month of real pull requests would start, and what the worst case costs.

## 📋 Requirements
1. The workflow triggers on `pull_request` (opened and synchronize), never `pull_request_target`, with path filters:
   code, `package.json` and `AGENTS.md` start a review; docs-only changes don't.
2. It imports your Lab 03 reviewer (`.github/agents/reviewer.agent.md`), which stays read-only.
3. The instructions name the PR, follow `AGENTS.md`, ask for one comment with a Severity table, and say a human
   decides (never approve or merge).
4. The agent is read-only, can read pull requests and files, and has one safe output: one comment, with older
   reviews hidden after a new push.
5. No shell, `network` locked down, `max-ai-credits` ≤ 200, `timeout-minutes` ≤ 20.
6. `scripts/review-plan.mjs` counts the review runs and the worst-case credits of your triggers over
   `fixtures/prs.json`.

## 🧭 Milestones
### M1 · When it runs
- `on: pull_request` with `opened` and `synchronize` (no `pull_request_target`)
- Path filters (`paths` or `paths-ignore`) start a review for `grades.js`, `src/util/dates.js`, `package.json`,
  `AGENTS.md` and `.github/hooks/scripts/guard.mjs`, and skip `README.md`, `docs/guide.md` and
  `.github/ISSUE_TEMPLATE/bug.md`

### M2 · Your reviewer, in CI
- `imports:` brings in `.github/agents/reviewer.agent.md`, and its tools stay read-only
- The body has the PR number, `AGENTS.md`, a table with a Severity column, exactly one comment, and "never approve
  or merge"

### M3 · One comment, nothing else
- Read-only permissions with `contents: read` and `pull-requests: read`; the GitHub tool with the `pull_requests`
  and `repos` toolsets
- The only safe output is `add-comment` with `max: 1`, and `hide-older-comments: true` when new pushes trigger it

### M4 · Limits
- No unrestricted shell, `network` set, `max-ai-credits` ≤ 200, `timeout-minutes` ≤ 20

### M5 · Measure it before it runs
- `globToRegExp()` follows GitHub's filter pattern rules: `**` crosses folders, `*` doesn't, `?` and `+` apply to the
  character before them, `[0-9]` is one character from a set
- `estimate(prs, trigger, maxAiCredits)` returns `{ prs, reviewed, skipped, runs, worstCase }`: one run per PR
  opened, push and reopen (only for the types you trigger on), for the PRs your filters let through
- `node scripts/review-plan.mjs fixtures/prs.json` prints the numbers for **your** workflow and exits 0; a missing
  file exits 1

## 📂 Work here
```bash
# Start here: workshop root (2026/agent-harness-workshop/)
cd labs/lab-07/hard/src
code .github/workflows/pr-review.md scripts/review-plan.mjs
node scripts/review-plan.mjs fixtures/prs.json
cd ../../../..

# Expected working directory: workshop root
node labs/start.mjs test lab-07 hard        # from the workshop folder
```
`pr-review.md` is an empty frame with a TODO per milestone. Your Lab 03 reviewer is already in
`.github/agents/reviewer.agent.md`. `review-plan.mjs` reads your workflow for you: you write the three functions.

## 💡 Hints
### M1
<details><summary>The trigger and the expression</summary>

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened]
    paths:
      - "**/*.js"
      - "**/*.mjs"
```
In the body, `${{ github.event.pull_request.number }}` is the PR number. `pull_request_target` runs with a write
token in the context of the base branch: never point an agent at untrusted code with it.

</details>

<details><summary>Which files count</summary>

`AGENTS.md` ends in `.md`, but it's the rule book the reviewer enforces, so a change to it deserves a review.
A filter like `paths-ignore: ["**/*.md"]` would skip it. Quote globs that start with `*` in YAML. GitHub's patterns
have no `{js,mjs}`: list each pattern on its own line.

</details>

### M2
<details><summary>Reuse your reviewer</summary>

```yaml
imports:
  - .github/agents/reviewer.agent.md
```
gh aw puts the agent file's instructions in front of your body at run time (one agent file per workflow). Its
`tools:` line is for Copilot CLI; in CI, the workflow's own `tools:` decide.

</details>

### M3
<details><summary>Tools for pull requests</summary>

The GitHub tool has toolsets: `pull_requests` reads PRs and their diffs, `repos` reads files such as `AGENTS.md`.
Anything that writes (`submit-pull-request-review`, `merge-pull-request`, `add-labels`, …) doesn't belong here.

</details>

<details><summary>One comment, five pushes</summary>

`max: 1` counts per run, and every push is a new run. `hide-older-comments: true` under `add-comment` collapses
the earlier reviews, so the PR shows one.

</details>

### M4
<details><summary>Locking down the rest</summary>

Leave out `bash` (a reviewer reads; it doesn't run things), add `network: defaults`, `max-ai-credits` and
`timeout-minutes`.

</details>

### M5
<details><summary>Globs to regular expressions</summary>

Walk the glob one character at a time: `**/` becomes `(?:.*/)?`, a lone `**` becomes `.*`, `*` becomes `[^/]*`.
GitHub's cheat sheet gives `?` ("zero or one of the preceding character"), `+` ("one or more of the preceding
character") and `[…]` the meaning they have in a regex, so they pass through; escape everything else. Anchor it:
`^…$`.

</details>

<details><summary>Counting runs</summary>

For `paths`, go through the patterns in order for each file: a match selects it, a `!pattern` match deselects it,
and the last one wins. The PR runs if any file is selected. For `paths-ignore`, it runs if any file is *not*
ignored. Then: runs = opened (1) + pushes + reopens, each only if its type is in `types`.

</details>

## 🧠 Takeaway
In CI the trigger is the first budget: filter what starts a run, give it one comment and a timeout, and measure before you ship.

## ❓ Check yourself
Your review workflow triggers on `opened` and `synchronize`, with `add-comment.max: 1`. A contributor opens a pull
request and then pushes five more commits. How many review comments can end up on it?
1. One: `max` counts per pull request, so the later runs can't comment.
2. Up to six: `max` counts per run and every push starts one, unless `hide-older-comments` hides the old ones.
3. None after the first: gh aw skips `synchronize` when the workflow already commented.

<details><summary>Answer</summary>

**2.** Safe-output limits apply to one run. Six runs can post six comments; `hide-older-comments: true` keeps the
PR readable, and path filters keep runs (and credits) for changes that need a review. (Pull request runs also
cancel each other when a newer push arrives, so in practice you see fewer.)

</details>

## 🚀 Going further
- Got `gh aw`? `gh aw compile --strict` here, then read the `.lock.yml`: find the `runtime-import` of your reviewer.
- Skip draft pull requests, and add a `workflow_dispatch` input to review one PR by hand.
- Compare costs for real: put `src/` in a repo of your own and read `gh aw logs pr-review` after a week. How close
  was your estimate's worst case?
- Lab 08 hard+ points this reviewer at harness changes: a PR that edits `.github/hooks/` or `AGENTS.md`.
