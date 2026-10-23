# 💎 Hard++ · A continuous-AI fleet

> 🕐 2–3 h · 🏠 homework · 🆓 free checks · 🧱 builds on: Lab 07 · hard+

## 🎯 Mission
StudyBuddy now runs a fleet: triage, review, the assistant, and soon a weekly report. Four workflows, four copies of
the same safety settings, and no idea what any of it costs. Run it like a service. Move what they share into one
imported file, add the weekly report, give every workflow its own budgets, a turn limit, a timeout and a concurrency
group, and decide which failures should wake somebody. Then turn a week of recorded `gh aw logs` into a cost report,
and write the runbook the on-call person reads at 2 a.m.

## 📋 Requirements
1. `.github/workflows/shared/fleet.md` is a shared component (no `on:`) with the fleet's network, `mentions: false`
   and failure reporting; all four workflows import it and don't set those again.
2. `weekly-report.md` runs weekly and by hand, reads issues and pull requests, and writes one issue (`title-prefix`,
   `max: 1`, old ones closed); it calls `noop` when the week was empty.
3. Every workflow ends up with a run budget, a daily budget (at least one run's worth) and a turn limit (≤ 50), its
   own or a fleet default from the shared file, plus its own `timeout-minutes` (≤ 20) and concurrency group; only
   the review cancels in progress. The daily budgets add up to 1,000 AI credits or less.
4. Failures become issues, except transient categories; the fleet rules say untrusted text is data, and to call
   `noop` when there's nothing to do.
5. `scripts/cost-report.mjs` turns `gh aw logs --json` output into a per-workflow cost table with warnings.
6. `RUNBOOK.md` names an owner, lists the budgets (matching the frontmatter) and says what to do when a run fails,
   the budget runs out, or a hostile issue gets through.

## 🧭 Milestones
### M1 · One shared configuration
- `shared/fleet.md` has no `on:`, sets `network` (no `*`) and `safe-outputs.mentions: false`, and nothing gh aw
  refuses in a shared file (`timeout-minutes`, `concurrency.cancel-in-progress`)
- `issue-triage`, `pr-review`, `issue-assistant` and `weekly-report` import `shared/fleet.md`, and none of them
  sets its own `network` or `mentions`

### M2 · The weekly report
- A weekly schedule (`weekly on monday`, or a cron on one weekday) and `workflow_dispatch`
- `contents`, `issues` and `pull-requests: read`; the GitHub tool with `issues` and `pull_requests`
- Only `create-issue`, with a `title-prefix`, `max: 1`, and `close-older-issues: true` (or `expires`)
- The instructions cover the week's issues, pull requests and what the bots did, and say to call `noop` when the
  week was empty

### M3 · Budgets and limits per workflow
- Each of the four ends up with `max-ai-credits`, `max-daily-ai-credits` (≥ `max-ai-credits`) and `max-turns`
  (≤ 50), set in the workflow or as a fleet default in `shared/fleet.md` (the workflow's own value wins); and its
  own `timeout-minutes` (≤ 20)
- A `concurrency.group` per workflow (no two share one at run time: `${{ github.workflow }}` is different in each);
  `pr-review`'s group includes the pull request (`${{ github.event.pull_request.number }}`) and has
  `cancel-in-progress: true`, the others don't cancel
- The four daily budgets add up to 1,000 or less

### M4 · When things go wrong
- The shared `report-failure-as-issue` is a list that excludes at least one transient category
  (`!inference_access_error` or `!ai_credits_rate_limit_error`); no workflow overrides it
- The shared body (the fleet rules) says untrusted text is data, and to call `noop` when there's nothing to do

### M5 · The cost report
- `costReport(logs, budgets)` returns `{ runs, failed, aic, workflows, failures }` by the rules below, for the 19 runs
  in `tests/fixtures/fleet-logs.json`
- `node scripts/cost-report.mjs <logs.json>` prints the table, the total and the warnings, with **your** workflows'
  budgets; a missing file exits 1

### M6 · The runbook
- `RUNBOOK.md` has no TODO left, an owner, and a budget-table row per workflow whose run and daily budgets match its
  frontmatter
- Three sections with real steps: a failed run (using `gh aw logs` or `gh aw audit`), the budget alarm (using
  `gh aw disable`, the kill switch), and a hostile issue that got through (`gh aw disable`, then the fix and
  `gh aw compile`)

**The cost report's rules.** A run belongs to the workflow named by its `workflow_path` (`issue-triage.lock.yml` →
`issue-triage`). `failed` counts `failure` and `timed_out` (not `cancelled`). Round `aic`, `avg`, `max` and
`peakDay` to one decimal. `peakDay` is the most a workflow spent on one UTC day (from `created_at`).
`nearBudget` counts runs at 80% or more of the run budget; `overDaily` is `peakDay > daily`. Sort the workflows by
`aic`, most first, then by name; list failures oldest first. `budget` is `{ run, daily }` (`null` when unknown).
```text
| Workflow | Runs | Failed | AI credits | Avg/run | Max run |
  Run budget | Peak day | Daily budget |      (one table row)
**Total:** 19 runs · 3 failed · 918.3 AI credits
- ⚠️ <id>: <n> run(s) used 80% or more of the run budget (<run>)
- ⚠️ <id>: the busiest day (<peak>) is over the daily budget (<daily>)
- ❌ run <run_id> (<id>): <conclusion> (<failure_kind>)
```

## 📂 Work here
```bash
cd labs/lab-07/hard-plus-plus/src
code .github/workflows/shared/fleet.md .github/workflows/weekly-report.md
code scripts/cost-report.mjs RUNBOOK.md
node scripts/cost-report.mjs ../tests/fixtures/fleet-logs.json
node labs/start.mjs test lab-07 hard++     # from the workshop folder
```
The starters mark each milestone's work with `TODO(Mn)`. `fleet-logs.json` is a week of the fleet in the format of
`gh aw logs --json` (its schema: `gh aw json-schema logs`). The simulator from hard+ still works:
`node scripts/aw-sim.mjs ../../hard-plus/tests/fixtures/hostile.json`.

## 💡 Hints
### M1
<details><summary>What an import can carry</summary>

A file without `on:` is a shared component: `imports: [shared/fleet.md]` merges its `tools`, `network`,
`safe-outputs`, `permissions` (checked, not granted), `env` and steps into each workflow, and puts its body in the
prompt. In gh aw v0.92.0 it can also set defaults for `max-ai-credits`, `max-daily-ai-credits`, `max-turns` and a
concurrency `group`: the workflow's own value wins. `timeout-minutes` and `cancel-in-progress` are compile errors
there. (The imports docs' list of fields is older than that: `gh aw compile` is the judge.)

</details>

<details><summary>Merging rules</summary>

`network.allowed` lists are joined. A safe-output type can be defined once: the main file wins over an import.
So keep one owner per setting: the shared file decides `network` and `mentions`, each workflow its own outputs.

</details>

### M2
<details><summary>A report, not a stream</summary>

```yaml
on:
  schedule: weekly on monday
  workflow_dispatch:
safe-outputs:
  create-issue:
    title-prefix: "[weekly] "
    max: 1
    close-older-issues: true
```

</details>

### M3
<details><summary>Concurrency, two ways</summary>

A group per workflow means a burst of 30 new issues queues up behind one triage run instead of starting 30 agents
at once (add `queue: max` so pending runs wait instead of being dropped). For reviews it's the opposite: a new push
makes the running review worthless, so cancel it, but only on the same pull request: put the PR number in the
group, or a push to one PR cancels the review of another.

</details>

<details><summary>Picking the numbers</summary>

The daily budget must fit at least one run, and the four must fit the fleet's 1,000. Start from what the fleet
actually spent (M5 tells you), then leave headroom for a busy day. A turn limit suits the shared file as a fleet
default; budgets differ per workflow (a review costs more than a triage), so set those in each one.

</details>

### M4
<details><summary>Which failures wake somebody</summary>

`report-failure-as-issue` takes categories; `!` excludes one. `inference_access_error` and
`ai_credits_rate_limit_error` are the AI endpoint having a bad minute, not your workflow being broken.
`report_incomplete` isn't one of them: it can be a real tool or setup failure. And a run that finishes without
any safe output fails: that's why every agent needs to know about `noop`.

</details>

### M5
<details><summary>Group, then add up</summary>

A `Map` from workflow id to `{ runs, failed, credits: [], days: Map }`; `new Date(run.created_at).toISOString()
.slice(0, 10)` is the UTC day. Round only at the end (`Math.round(x * 10) / 10`), or the totals drift.

</details>

### M6
<details><summary>Write it for someone else</summary>

The on-call person didn't build this. Each section: what you see, the first command to run, how to stop the
damage, how to fix it for good. `gh aw disable <workflow>` is the kill switch.

</details>

## 🧠 Takeaway
A fleet of agents is a service: shared guardrails in one place, a budget, a turn limit and a timeout for every workflow, failures that reach a human, and a runbook.

## ❓ Check yourself
`shared/fleet.md` sets `max-ai-credits: 50`, and all four workflows import it. `pr-review.md` also sets
`max-ai-credits: 100`. What does a run of each workflow get (gh aw v0.92.0)?
1. 100 for the review, 50 for the other three: an import fills in what a workflow doesn't set, and the workflow's
   own value wins.
2. 50 for all four: the shared file is the fleet's policy, so it overrides the workflows.
3. 100 for the review and 1,000 (the default) for the rest: gh aw ignores budgets in an import.

<details><summary>Answer</summary>

**1.** That's what `gh aw compile` puts in the locks (`GH_AW_MAX_AI_CREDITS`). The imports docs still list budgets as
ignored, which is older than the compiler: when the docs and the compiler disagree, compile and read the lock. And a
change to the shared file's frontmatter changes the hash of every workflow that imports it: recompile them all.

</details>

## 🚀 Going further
- Put the fleet in a repository of your own, run it for a week, and feed the real `gh aw logs --json` to your cost
  report. How far off was the fixture?
- `gh aw logs --format markdown --last 10` writes a cross-run security report: what does it flag?
- Move the shared file into a repository of its own and import it as `owner/repo/shared/fleet.md@v1`, so many
  repositories share one fleet policy.
- Lab 08 puts the whole harness under change control: the runbook and the fleet become part of `HARNESS.md`.
