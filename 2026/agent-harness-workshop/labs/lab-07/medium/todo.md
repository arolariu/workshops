# 🟡 Medium · Two kinds of change

> 🕐 30–45 min · 🏠 homework · 🆓 free checks · 🧱 builds on: Lab 07 · easy

## 🎯 Mission
The triage bot is safe now, and the maintainers have a wish list. Bug reports should come with an operating system
and a Node.js version. They want to use the `good first issue` label. And issues that arrive while the bot is
down get no label at all, so once a day it should pick one up, on a budget. Some of these changes need
`gh aw compile`, and some don't. Make them all, keep the bot safe, and write down which is which and why, so the
team only recompiles when it has to.

## 📋 Requirements
1. The instructions ask bug reporters for their operating system and Node.js version when they're missing.
2. `good first issue` is an allowed label, and the workflow stays read-only with at most 1 label and 1 comment.
3. New issues still trigger the workflow, and one schedule runs it at most once a day.
4. A scheduled run can label the oldest issue without a label; comments stay on the issue that triggered the run.
5. A daily budget (`max-daily-ai-credits`, 500 or less) caps what the workflow spends in 24 hours, and fits at
   least one run.
6. `NOTES.md` has one row per change: frontmatter or body, recompile yes or no, and why.

## 🧭 Milestones
### M1 · A change in the body
- The instructions mention bug reports, and ask for the operating system and the Node.js version

### M2 · A change in the frontmatter
- `good first issue` is in `safe-outputs.add-labels.allowed` (quoted)
- The agent is still read-only, with `add-labels.max: 1` and `add-comment.max: 1`

### M3 · A schedule and a budget
- `on:` keeps `issues: [opened]` and gets one schedule that runs at most daily (`daily`, `weekly`, or a cron with
  a fixed minute and hour)
- `add-labels` has `target: "*"`; `add-comment` keeps its default target
- The body says what a scheduled run does: label the oldest issue without a label, no comment
- `max-daily-ai-credits` is between `max-ai-credits` and 500; `max-ai-credits` (≤ 100) and `timeout-minutes`
  (≤ 15) stay

### M4 · Recompile only when you need to
- `NOTES.md` has a table row for every change you made (at least the OS/Node.js question, `good first issue`, the
  schedule and the daily budget), each with "frontmatter" or "body" and "yes" or "no"
- The rows are right: frontmatter changes need a recompile, body changes don't
- A "Why" that names the `.lock.yml` and says when the agent reads the body

## 📂 Work here
```bash
cd labs/lab-07/medium/src
code .github/workflows/issue-triage.md NOTES.md
node labs/start.mjs test lab-07 medium     # from the workshop folder
```
`NOTES.md` has the table to fill in. Got `gh aw`? Try `gh aw hash-frontmatter .github/workflows/issue-triage.md`
before and after each change, and watch which ones move the hash.

## 💡 Hints
### M1
<details><summary>Where does each change go?</summary>

What the agent should *do* lives in the body. What it's *allowed* to do (labels, permissions, outputs,
triggers, budgets) lives in the frontmatter.

</details>

### M2
<details><summary>Labels with spaces</summary>

In a YAML list, quote it: `allowed: [bug, "good first issue"]`.

</details>

### M3
<details><summary>A trigger for a sweep</summary>

gh aw understands fuzzy schedules: `schedule: daily` becomes a cron at a scattered time, so a thousand repos don't
all run at midnight. Add `workflow_dispatch:` too, so you can start it by hand with `gh aw run issue-triage`.
```yaml
on:
  issues:
    types: [opened]
  schedule: daily
  workflow_dispatch:
```

</details>

<details><summary>No triggering issue</summary>

Safe outputs write to the item that triggered the run, by default. A scheduled run has none, so a label needs
`target: "*"` to reach the issue the agent picks. The comment doesn't: a sweep that comments on strangers' old
issues is noisy, so leave `add-comment` as it is and tell the agent in the body.

</details>

<details><summary>Two budgets</summary>

`max-ai-credits` caps one run. `max-daily-ai-credits` caps the whole workflow over 24 hours: the activation job
adds up the recent runs and skips the agent when the day's total is spent. With a schedule *and* an event trigger,
you want both.

</details>

### M4
<details><summary>Why the difference?</summary>

`gh aw compile` turns the frontmatter into the `.lock.yml` that Actions runs, and writes a hash of the frontmatter
on its first line. The body isn't in the lock: the lock imports the `.md` at run time. When the run starts, the
activation job recomputes the hash; if you changed the frontmatter and didn't recompile, the run stops.

</details>

## 🧠 Takeaway
The frontmatter is compiled and checked by hash, the body is read fresh at run time: recompile for the first (and for a `${{ vars.* }}` in the body), never for plain instructions.

## ❓ Check yourself
You add one line to the **body** of `issue-triage.md`: `Write in the tone ${{ vars.TRIAGE_TONE }}.` Do you need
`gh aw compile`?
1. Yes: `${{ vars.* }}` and `${{ env.* }}` expressions in the body count towards the frontmatter hash.
2. No: everything below the second `---` is read at run time, so body changes never need a recompile.
3. Only if `TRIAGE_TONE` is a secret, because secrets are resolved at compile time.

<details><summary>Answer</summary>

**1.** The rule "body changes are free" has an exception: `gh aw hash-frontmatter` also covers `env.` and `vars.`
expressions in the body (and the frontmatter of every imported file). Try it: the hash changes.

</details>

## 🚀 Going further
- Got `gh aw`? Run `gh aw compile` and read the first line of the `.lock.yml`: `frontmatter_hash` and `body_hash`.
  Change the body, recompile, and see which one moves.
- In a public repository, the GitHub tool hides issues from people who aren't collaborators unless you lower
  `tools.github.min-integrity`. What does that mean for your sweep? (Lab 07 hard+ looks at who the agent may read.)
- Use `gh aw logs` after a week of runs: how many credits did the sweep cost, compared with the issue runs?
