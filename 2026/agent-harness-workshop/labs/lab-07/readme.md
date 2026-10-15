# Lab 07 · 🚀 Agentic workflows — Agents in CI

> **Harness layer:** Automation · 🟢 easy (together) · 🟡 medium · 🔴 hard

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
gh aw run issue-triage                        # needs a workflow_dispatch trigger
gh aw logs                                    # what did the agent do, and what did it cost?
```
To run for real you need your own GitHub repository, Actions enabled, and a Copilot token stored as a
repository secret (see the gh-aw docs). The exercises check the **design**, so they work without any of that.

## Exercises
| Level | Mission | You practise |
|---|---|---|
| 🟢 easy | **Make it safe**: a triage workflow that can do far too much | permissions, safe outputs, budgets |
| 🟡 medium | **Two kinds of change**: one needs a recompile, one doesn't | frontmatter vs body |
| 🔴 hard | **A reviewer in CI**: a pull-request review workflow from scratch | triggers, tools, one-comment output |

## Common pitfalls
- **Write permissions for the agent**: never. Writes go through safe outputs, with an allow-list and a `max`.
- **Forgetting to compile**: the `.lock.yml` is what Actions runs. Commit both files.
- **Unbounded runs**: always set `timeout-minutes` and a credit limit.

## Learn more
- [GitHub Agentic Workflows](https://github.github.com/gh-aw/)
- [github/gh-aw](https://github.com/github/gh-aw): the CLI extension and examples
