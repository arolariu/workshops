# Lab 01 · 📜 Instructions — What the agent knows

> **Harness layer:** Context · **Maturity:** L1 Instructed · 🟢 together · 🟡 🔴 homework
>
> **Threads:** 🔴 The red build · 📏 Measurement · 🪙 Tokens and budget

## In one minute
Instruction files are plain Markdown that Copilot loads into **every** conversation, automatically. They
are the onboarding document for your AI teammate: how to build and test, the conventions, the business
rules, what it must never do, and what "done" means. Write them once; every session (and every teammate)
benefits.

## Why it matters
Without instructions, the agent guesses. It guesses your test command, your style and, worst of all, your
rules. Remember the red build in Lab 00? A rule like *"you pass only with an exam grade of at least 5"*
lives in a professor's email, not in the code. If the agent doesn't know it, it may "fix" the test instead
of the code. Instructions are the cheapest, highest-leverage part of the harness.

## 🔬 Under the hood
```text
 every turn │ system · AGENTS.md · *.instructions.md (applyTo matches) · tools · history · prompt │ ─▶ 🧠
```
Instruction files are not "read once and remembered": the harness puts them **into the context on every turn**,
next to the conversation (see Lab 00). Two things follow:
- **You pay for them every turn.** A 400-line file costs tokens on every prompt of every session, used or not.
- **Long files dilute attention.** The model weighs everything in its context; ten vague rules make the one rule
  that matters easier to miss. Scoped files (`applyTo`) only join the context when matching files are involved.

Even a loaded rule is a strong hint, not a guarantee: output varies from run to run. So you **measure**: a canary
proves the file is loaded, and an A/B run (Lab 01 hard) shows whether the rules actually change behaviour.

## Where instructions live
| File | Applies to | Good for |
|---|---|---|
| `AGENTS.md` (repo root, or the folder you start in) | everything | the main onboarding doc; other agents read it too |
| `.github/copilot-instructions.md` | everything in the repo | Copilot-specific extras |
| `.github/instructions/*.instructions.md` with `applyTo:` | only files matching the glob | rules for tests, docs, one folder |

```markdown
---
applyTo: "**/*.test.js"
description: How we write tests
---
- Use node:test and node:assert/strict.
- One behaviour per test; the test name is a full sentence.
```

## What good instructions look like
- **Short and concrete**: aim for under 100 lines. Every line should change behaviour.
- **Commands that work**: `npm test`, not "run the tests".
- **Rules with reasons** where it helps: *"Never add dependencies: the course forbids them."*
- **Boundaries**: what the agent must never do.
- **A canary**: *"End every answer with `Harness check: AGENTS.md loaded`"*. Now you can *see* it's loaded.

## Inspect and control
| You want to… | Do this |
|---|---|
| See which instruction files apply | `/instructions` in a session, or `copilot instruction list` |
| Generate a first draft | `/init` |
| Run without any instructions (for comparisons) | `copilot --no-custom-instructions` |

Instructions are read when a session starts. After editing them, start a new session (`/new` or restart).

## 🏛️ In the enterprise
- **At scale:** treat instructions as code. They live in the repo, change through pull requests, and have owners
  (a `CODEOWNERS` line for `AGENTS.md` and `.github/instructions/`).
- **The risk:** drift and bloat. Rules pile up, contradict each other and mention commands that no longer exist,
  and every one of them is paid for on every turn.
- **The control:** a short root file, scoped files for the rest, a canary to prove they load, and a review of the
  instructions whenever the build or the conventions change.

## Exercises
| Level | Mission | You practise |
|---|---|---|
| 🟢 easy | **The rules nobody wrote down**: turn messy team notes into an AGENTS.md, then fix the build the right way | AGENTS.md, canary, `/instructions` |
| 🟡 medium | **Rules for one folder**: rules that apply only to test files, then better tests | `.instructions.md`, `applyTo` globs |
| 🔴 hard | **Prove it with data**: an A/B experiment, with vs without instructions | `-p`, `--no-custom-instructions`, measuring |

## Common pitfalls
- **A wall of text**: long instructions dilute the important rules. Cut ruthlessly.
- **Vague rules** ("write clean code") change nothing. Be specific.
- **Forgetting to restart**: an edited file is only picked up by a new session.

## Learn more
- [Adding custom instructions for Copilot CLI](https://docs.github.com/copilot/how-tos/copilot-cli/add-custom-instructions)
- [agents.md](https://agents.md): the open AGENTS.md format
