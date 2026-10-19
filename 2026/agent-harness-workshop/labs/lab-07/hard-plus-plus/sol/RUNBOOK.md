# Runbook: the StudyBuddy agent fleet

**Owner:** @alice (backup: @bob). Changes to `.github/workflows/` go through a pull request that one of them reviews.

## The fleet and its budgets

The fleet shares `.github/workflows/shared/fleet.md`: the network, mentions, failure reports, the fleet rules, and a
default turn limit (30). Each workflow sets its own budgets, timeout and concurrency (its own value always wins over
the shared file, and gh aw refuses a timeout there). The whole fleet may spend 1,000 AI credits a day; the daily
budgets below add up to 850.

| Workflow | Trigger | Run budget (`max-ai-credits`) | Daily budget (`max-daily-ai-credits`) | Timeout |
|---|---|---|---|---|
| issue-triage | new issues, daily sweep | 50 | 200 | 10 min |
| pr-review | pull requests that change code or rules | 100 | 300 | 15 min |
| issue-assistant | issue comments | 50 | 150 | 10 min |
| weekly-report | Mondays, or by hand | 150 | 200 | 15 min |

Change a budget in the workflow's frontmatter, run `gh aw compile`, and update this table in the same pull request.
A change to `shared/fleet.md`'s frontmatter needs `gh aw compile` too: it changes the hash of every workflow that
imports it.

## A run failed

1. Failures open an issue automatically (`report-failure-as-issue`), except transient AI-endpoint errors and rate
   limits. Start from that issue's run link.
2. `gh aw logs <workflow> -c 5` shows the last runs, their conclusion and cost; `gh aw audit <run-id>` explains one.
3. `driver_exit` (zero turns): setup or the engine failed before the agent ran. Re-run once; if it repeats, check
   the `COPILOT_GITHUB_TOKEN` secret and `gh aw doctor`.
4. `agent_logic` or `timed_out`: read the agent log. A loop hits `max-turns`; a run without any safe output means
   the agent forgot `noop`: fix the instructions (no recompile for the body).
5. A stale lock (the activation job says the frontmatter hash changed): someone edited the frontmatter without
   `gh aw compile`. Recompile and commit both files.

## The budget alarm went off

1. `gh aw logs --json > logs.json`, then `node scripts/cost-report.mjs logs.json`: which workflow, which day,
   which runs.
2. Runs near the run budget: the task got bigger (a larger diff, a busier week) or the agent loops. Tighten the
   instructions or path filters before you raise `max-ai-credits`.
3. A day over the daily budget: look for a burst (many issues at once, repeated manual runs). The daily guardrail
   skips the agent for the rest of the day; that is working as intended.
4. To stop a workflow now: `gh aw disable <workflow>`. Turn it back on with `gh aw enable <workflow>`.

## A hostile issue got through

1. Stop the workflow: `gh aw disable issue-assistant` (or the one involved).
2. Undo what it did by hand: remove the label, hide the comment, close the issue it opened.
3. Find out what it proposed: `gh aw logs <workflow> --artifacts agent` and `gh aw audit <run-id>`.
4. Write the attack down as a case for `scripts/aw-sim.mjs`, then tighten the safe outputs, the network or what the
   agent reads until the simulator blocks it.
5. `gh aw compile --strict`, open a pull request with the fix and the new case, and `gh aw enable` it once merged.

## Reading the logs

- `gh aw logs` downloads the runs of every workflow (`-c` for how many, `--start-date -1w` for a week).
- `gh aw logs --json` is what `scripts/cost-report.mjs` reads: `aic` is AI credits, `conclusion` and
  `failure_kind` explain failures, `turns` and `token_usage` show how hard the agent worked.
- Keep a week of `logs.json` with the weekly report, so next week's numbers have something to compare with.
