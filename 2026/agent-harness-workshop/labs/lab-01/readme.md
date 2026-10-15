# Lab 01 · 📜 Instructions — What the agent knows

> **Harness layer:** Context · 🟢 easy (together) · 🟡 medium · 🔴 hard

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
