# Lab 02 · 🧩 Skills — Know-how on demand

> **Harness layer:** Capabilities · **Maturity:** L2 Equipped · 🟢 together · 🟡 🔴 🟣 💎 homework
>
> **Threads:** 📏 Measurement · 🪙 Tokens and budget

## In one minute
A **skill** is a folder that teaches the agent how to do one specific job: a `SKILL.md` with instructions,
plus any scripts, templates or reference files the job needs. Copilot only sees each skill's **name and
description** up front, which costs almost nothing. When your request matches a description, it loads the
full skill. You can also call a skill yourself with `/skill-name`.

## Why it matters
Instructions are for rules that *always* apply. Skills are for **know-how you only need sometimes**: "how we
create a module", "how we write release notes", "how we debug a crash". Putting everything in AGENTS.md
bloats every prompt; a skill loads only when it's needed. And because skills follow an open standard
([agentskills.io](https://agentskills.io)), the same folder works in Copilot CLI, VS Code and other agents.

## 🔬 Under the hood
```text
 every turn │ … · skills: the name and description of each one           │ ─▶ 🧠
 when used  │ … · new-module/SKILL.md: the full steps, loaded on demand │ ─▶ 🧠
```
This is **progressive disclosure**. Every turn, the context holds only each skill's name and description, a line
or two. When the model decides a skill fits the request, the harness loads that skill's `SKILL.md` (and the
model can then read the files it points to). Twenty skills cost about as much as twenty sentences until one is used.
- **The description is a routing prompt.** The model picks a skill by comparing your request with the descriptions
  alone. "Helps with modules" never wins; "Create a StudyBuddy module. Use when the user asks for a new module" does.
- **Scripts take exact work away from the model.** Parsing a git log or counting commits in prose invites
  mistakes; a bundled script gives the same answer every time, and the model only reads its output.

## Anatomy of a skill
```text
.github/skills/release-notes/       ← folder name = skill name
├── SKILL.md                        ← frontmatter + step-by-step instructions
├── scripts/changes.mjs             ← optional: code the agent can run
└── templates/entry.md              ← optional: files the agent can copy
```
```markdown
---
name: release-notes
description: Write release notes from the git history. Use when the user asks for release notes, a changelog or "what changed".
argument-hint: "[version]"
---
1. Run `node .github/skills/release-notes/scripts/changes.mjs` ...
2. ...
```
- `name`: lowercase with hyphens, same as the folder.
- `description`: **what it does + when to use it**. This is the only part the agent sees before choosing a skill.
- `argument-hint` (optional): shown when you type `/name`.
- `disable-model-invocation: true` (optional): the agent never picks it on its own; only you call it.
- `allowed-tools` (optional): tools the skill may use **without asking you**. Pre-approving `shell` means every
  command the skill asks for runs unprompted: only do it for a skill you have read and trust.

## Where skills live
| Location | Who gets it |
|---|---|
| `.github/skills/<name>/` (also `.agents/skills/`, `.claude/skills/`) | everyone working on this project |
| `~/.copilot/skills/<name>/` | you, in every project |
| a folder you register with `copilot skill add <folder>` | you, in every project (it's saved in your settings) |
| inside a plugin | everyone who installs the plugin (Lab 06) |

Inspect with `/skills` in a session or `copilot skill list` in the terminal.

Good to know:
- A folder that isn't one of these (like `vendor/`) is never loaded, which makes it a safe place for skills under review.
- `copilot skill add --project path/to/SKILL.md` copies **only** `SKILL.md` into `.github/skills/<name>/`: a skill with
  scripts must be copied as a whole folder.
- Personal and plugin skills compete for the same requests as the project's. In `--output-format json`, every skill
  that loads shows up as a `skill` tool call, whoever installed it.
- Copilot can also pick skills with embeddings (`--dynamic-retrieval skills=on|off`). That flag **saves** the choice
  in your settings, so don't put it in scripts.

## 🏛️ In the enterprise
- **At scale:** a shared skill library (in a plugin or an APM package, Lab 06) gives every team the same recipes:
  how to release, how to debug, how to add a service.
- **The risk:** skills that ship scripts run code on your machine, and a third-party skill is untrusted code with a
  friendly description.
- **The control:** vet skills like any dependency: review the scripts, check for network calls and writes outside
  the repo, pin the version, and give each skill an owner.

## Exercises
| Level | Mission | You practise |
|---|---|---|
| 🟢 easy | **Teach a recipe once**: a skill that creates modules the team's way | SKILL.md, descriptions, templates |
| 🟡 medium | **A command you call by name**: `/explain-error` with an output contract and a justified invocation choice, on three crashes | `argument-hint`, output contracts |
| 🔴 hard | **A skill with a script**: release notes from git history (scopes, breaking changes, reverts), tested against mutants, proven by a golden | bundled scripts, deterministic tools |
| 🟣 hard+ | **Vet before you trust**: `vet-skill.mjs` reviews three third-party skills (one malicious), then `VERDICT.md` and an install | skills as a supply chain |
| 💎 hard++ | **A library that routes**: six overlapping skills, canaries, a routing eval with precision and recall, and a split with `references/` | routing, progressive disclosure |

## Common pitfalls
- **A vague description** ("helps with modules"): the agent won't know when to use it. Say *when*.
- **A description that claims everything**: it competes with every other skill and wins nothing. One job per skill.
- **Doing in prose what a script does better**: parsing git logs is a job for code, not for the model.
- **Absolute paths**: reference bundled files relative to the project, e.g. `.github/skills/<name>/templates/...`.
- **Installing before reading**: a downloaded skill runs code and gives orders with your permissions. Vet it first.

## Learn more
- [Creating agent skills for Copilot CLI](https://docs.github.com/copilot/how-tos/copilot-cli/customize-copilot/create-skills)
- [The Agent Skills standard](https://agentskills.io)
- [awesome-copilot](https://github.com/github/awesome-copilot): community skills to learn from
