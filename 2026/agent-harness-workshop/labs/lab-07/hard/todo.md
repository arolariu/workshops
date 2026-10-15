# 🔴 Hard · A reviewer in CI

> 🕐 25 min · 🆓 free checks

## 🎯 Mission
Write an agentic workflow **from scratch**: every pull request gets reviewed against the project's own
rules in `AGENTS.md`, and the result is **exactly one** comment with a findings table. The agent may read
the repository and the pull request, and nothing else. A human always makes the final decision.

## 📂 Work here
```bash
cd labs/lab-07/hard/src
code .github/workflows/pr-review.md
```
Look at `labs/lab-07/easy/sol/.github/workflows/issue-triage.md` for the overall shape.

## ✅ Done when
- `.github/workflows/pr-review.md` triggers on pull requests (at least when they're **opened**)
- The agent is read-only, with at least `contents: read` and `pull-requests: read`, and the GitHub tool for pull requests
- Its only safe output is **one** comment; it can never approve, merge or push
- `network` is locked down, `max-ai-credits` is 200 or less, `timeout-minutes` is 20 or less
- The instructions reference the PR number, tell the agent to follow `AGENTS.md`, define a table with a
  **Severity** column, ask for exactly **one** comment, and say that a human decides (never approve or merge)

## 💡 Hints
<details><summary>The trigger and the expression</summary>

```yaml
on:
  pull_request:
    types: [opened, synchronize]
```
In the body, `${{ github.event.pull_request.number }}` is the PR number.

</details>

<details><summary>Tools for pull requests</summary>

The GitHub tool has toolsets: `pull_requests` lets the agent read PRs and their diffs, `repos` lets it read
files such as `AGENTS.md`.

</details>

<details><summary>Reuse your reviewer</summary>

The `reviewer` agent in `.github/agents/` already has a great table format and checklist. Borrow its
instructions for the workflow body.

</details>

## 🚀 Going further
- Add a `schedule:` workflow that posts a weekly report as an issue (`create-issue` with a `title-prefix`).
- Compare costs: how many credits does one review use (`gh aw logs`)?
