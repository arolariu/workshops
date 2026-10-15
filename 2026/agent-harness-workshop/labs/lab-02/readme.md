# Lab 02 · 🧩 Skills — Know-how on demand

> **Harness layer:** Capabilities · 🟢 easy (together) · 🟡 medium · 🔴 hard

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

## Where skills live
| Location | Who gets it |
|---|---|
| `.github/skills/<name>/` (also `.agents/skills/`, `.claude/skills/`) | everyone working on this project |
| `~/.copilot/skills/<name>/` | you, in every project |
| inside a plugin | everyone who installs the plugin (Lab 06) |

Inspect with `/skills` in a session or `copilot skill list` in the terminal.

## Exercises
| Level | Mission | You practise |
|---|---|---|
| 🟢 easy | **Teach a recipe once**: a skill that creates modules the team's way | SKILL.md, descriptions, templates |
| 🟡 medium | **A command you call by name**: `/explain-error` for stack traces | `argument-hint`, output formats |
| 🔴 hard | **A skill with a script**: release notes from git history, never invented | bundled scripts, deterministic tools |

## Common pitfalls
- **A vague description** ("helps with modules"): the agent won't know when to use it. Say *when*.
- **Doing in prose what a script does better**: parsing git logs is a job for code, not for the model.
- **Absolute paths**: reference bundled files relative to the project, e.g. `.github/skills/<name>/templates/...`.

## Learn more
- [Creating agent skills for Copilot CLI](https://docs.github.com/copilot/how-tos/copilot-cli/customize-copilot/create-skills)
- [The Agent Skills standard](https://agentskills.io)
- [awesome-copilot](https://github.com/github/awesome-copilot): community skills to learn from
