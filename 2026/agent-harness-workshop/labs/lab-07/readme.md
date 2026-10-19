# Lab 07 · 🚀 Agentic workflows — Agents in CI

> **Harness layer:** Automation · **Maturity:** L5 Governed · 🟢 together · 🟡 🔴 🟣 💎 homework
>
> **Threads:** 🕵️ The reviewer · 💉 Prompt injection · 🔐 Least privilege

## In one minute
**GitHub Agentic Workflows** (`gh aw`) run an AI agent inside GitHub Actions, triggered by events like a new
issue, a pull request or a schedule. You write the workflow in **Markdown**: YAML frontmatter for the
trigger, permissions, tools and outputs, and plain-language instructions in the body. `gh aw compile` turns
it into a normal, locked-down Actions workflow (`.lock.yml`).

## Why it matters
Everything so far ran on your laptop, with you watching. In CI nobody is watching, so the harness must do
all the work: **read-only** permissions for the agent, a **firewall** for the network, **safe outputs**
(the agent *proposes* a label or a comment; a separate job with write access applies it, within limits you
set) and a **budget**. Get this right and you have "continuous AI": triage, reviews and reports that run on
their own.

## 🔬 Under the hood
```text
 issue opened
  ├─ job 1 · the agent · read-only, firewalled ─▶ proposes: add-labels ["bug"], add-comment
  └─ job 2 · no model  · the only write token  ─▶ checks the allow-list and max, then applies
```
It's the same loop as on your laptop (Lab 00), but **headless**: no human sees the tool calls or answers a
permission prompt. So the harness splits the work in two. The model only **proposes** actions, as structured
safe outputs. A separate job with no model in it, and the only write token, **carries them out** after checking
them against your limits. Whatever the agent reads, and whatever it gets tricked into writing, it can't push code
or add a label you didn't allow, because it never holds the means to.
The issue text is untrusted input written by strangers (Lab 04), which is exactly why the job that reads it is
the one that can't write.

## Anatomy of a workflow
```markdown
---
on:
  issues:
    types: [opened]
permissions:          # the AGENT's permissions: read-only
  contents: read
  issues: read
engine: copilot
tools:
  github:
    toolsets: [issues]
network: defaults     # only the default domains get through
safe-outputs:         # what the agent may PROPOSE, applied by a separate job
  add-labels:
    allowed: [bug, enhancement, question, documentation]
    max: 1
  add-comment:
    max: 1
max-ai-credits: 50
timeout-minutes: 10
---

# Issue triage
Read issue #${{ github.event.issue.number }} and pick exactly one label…
```
| Frontmatter | Body |
|---|---|
| trigger, permissions, tools, network, safe outputs, budget | the instructions, in plain language |
| **change it → run `gh aw compile` again** | change it → no recompile needed |

## The commands
```bash
gh extension install github/gh-aw                    # once (macOS, Linux or WSL)
gh aw compile --strict                        # .md → .lock.yml, with the strictest safety checks
gh aw hash-frontmatter .github/workflows/issue-triage.md   # what the lock is checked against
gh aw run issue-triage                        # needs a workflow_dispatch trigger
gh aw logs                                    # what did the agent do, and what did it cost?
```
To run for real you need your own GitHub repository, Actions enabled, and a Copilot token stored as a
repository secret (see the gh-aw docs). The exercises check the **design**, so they work without any of that.
The labs were checked against gh-aw **v0.92.0** (`gh extension install github/gh-aw --pin v0.92.0` to match).

Good to know (gh-aw v0.92.0):
- The `.lock.yml` holds a **hash of the frontmatter**, and the run stops when the `.md` no longer matches it. The body
  isn't in the lock: it's imported at run time. Even a YAML comment in the frontmatter needs a recompile, and so
  does a `${{ vars.* }}` or `${{ env.* }}` expression in the body.
- `add-labels.max` counts **calls**; `max-labels` (default 10) caps the labels in one call. `blocked` is checked
  before `allowed`. By default, `@mentions` of collaborators survive, and links outside GitHub become `(redacted)`.
- `--strict` checks the mechanics (pinned actions, no write permissions), not your threat model: a workflow with a
  network wildcard and `curl` compiles fine.
- `imports:` shares `tools`, `network` and `safe-outputs` between workflows, and a workflow can import an agent from
  `.github/agents/`. A shared file can also set default budgets, `max-turns` and a concurrency group (the workflow's
  own value wins), but not `timeout-minutes` or `cancel-in-progress`. The imports docs' field list is older than
  v0.92.0: when the docs and the compiler disagree, compile and read the lock.
- `max-ai-credits` caps one run (default 1,000); `max-daily-ai-credits` caps a workflow's last 24 hours.

## 🏛️ In the enterprise
- **At scale:** "continuous AI": triage, reviews and weekly reports running in many repositories, on every event,
  without anyone watching each run.
- **The risk:** an agent with a write token reading hostile input, or a workflow that loops on a big budget.
  Nobody is there to say no.
- **The control:** read-only agent permissions, safe outputs with allow-lists and a `max`, a network firewall, a
  credit limit and a timeout on every workflow, and the run logs (`gh aw logs`) kept for review.

## Exercises
| Level | Mission | You practise |
|---|---|---|
| 🟢 easy | **Make it safe**: a triage workflow that can do far too much | permissions, safe outputs, budgets |
| 🟡 medium | **Two kinds of change**: a body change, a frontmatter change, a daily sweep and a daily budget, and which ones need a recompile | the compile model |
| 🔴 hard | **A reviewer in CI**: a pull-request review from scratch with your Lab 03 reviewer, path filters, one comment, and a measured worst case | triggers, tools, outputs |
| 🟣 hard+ | **Hostile input**: strangers try to get `approved`, ping maintainers and leak data; a shipped simulator replays them against your settings | injection in CI |
| 💎 hard++ | **A continuous-AI fleet**: four workflows sharing one configuration, budgets and concurrency per workflow, failure handling, a cost report from `gh aw logs`, and a runbook | running agents in production |

## Common pitfalls
- **Write permissions for the agent**: never. Writes go through safe outputs, with an allow-list and a `max`.
- **Forgetting to compile**: the `.lock.yml` is what Actions runs. Commit both files.
- **Unbounded runs**: always set `timeout-minutes` and a credit limit.

## Learn more
- [GitHub Agentic Workflows](https://github.github.com/gh-aw/)
- [github/gh-aw](https://github.com/github/gh-aw): the CLI extension and examples
- [Safe outputs](https://github.github.com/gh-aw/reference/safe-outputs/), [imports](https://github.github.com/gh-aw/reference/imports/)
  and [integrity filtering](https://github.github.com/gh-aw/reference/integrity/): the references behind hard+ and hard++
- `gh aw json-schema logs`: the format of `gh aw logs --json`, which the hard++ cost report reads
