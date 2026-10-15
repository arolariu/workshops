# Lab 03 · 🎭 Custom agents — Roles with least privilege

> **Harness layer:** Roles · 🟢 easy (together) · 🟡 medium · 🔴 hard

## In one minute
A **custom agent** is a specialist teammate defined in one Markdown file: who it is (instructions), what it's
for (description) and, most importantly, **which tools it may use**. A reviewer that can only read. A
test-writer that can edit tests and run them. You switch to an agent, start Copilot with it, or let the main
agent delegate work to it as a subagent with its own clean context.

## Why it matters
"Be careful and don't edit anything" in a prompt is a *wish*. A tool list without `edit` is a *guarantee*.
Least privilege is the oldest rule in security, and it applies to AI agents too. Specialists with narrow
jobs and narrow permissions are also simply better at their job: focused context, focused instructions.

## Anatomy of an agent
```markdown
---
name: reviewer
description: Finds bugs and risky patterns. Read-only; never edits files.
tools: ['read', 'search']
---
You are a careful senior reviewer...
Report findings in this table: | Severity | Location | Problem | Suggestion |
```
File: `.github/agents/reviewer.agent.md` (the file name is the agent name).

| Tool alias | Lets the agent… |
|---|---|
| `read` | read files |
| `search` | search the code (grep/glob) |
| `edit` | create and change files |
| `execute` | run shell commands |
| `web` | fetch web pages |
| `agent` | delegate to other agents |
| `studybuddy/*` | use every tool of the MCP server named `studybuddy` (Lab 04) |

Leave `tools` out and the agent gets **everything**, so always set it.

## Using agents
| You want to… | Do this |
|---|---|
| Pick an agent in a session | `/agent` |
| Start a session as an agent | `copilot --agent reviewer` |
| Script it | `copilot --agent reviewer -p "Review deadlines.js" -s` |
| Delegate from the main agent | *"Use the reviewer agent to check deadlines.js"* |

Agents live in `.github/agents/` (project), `~/.copilot/agents/` (personal) or in a plugin (Lab 06).

## Exercises
| Level | Mission | You practise |
|---|---|---|
| 🟢 easy | **Eyes, not hands**: a reviewer that physically cannot edit | `tools`, output formats |
| 🟡 medium | **A specialist with a boundary**: a test-writer that proves bugs instead of fixing them | narrow roles, red tests |
| 🔴 hard | **Two agents, one loop**: reviewer → fixer, scripted | `--agent`, `-p`, permission flags |

## Common pitfalls
- **No `tools` line**: the agent can do anything. Least privilege means an explicit list.
- **Instructions that fight the tool list** ("fix it" for a read-only agent): the agent can't, and gets confused.
- **Vague descriptions**: the main agent uses the description to decide when to delegate.

## Learn more
- [Creating custom agents for Copilot CLI](https://docs.github.com/copilot/how-tos/copilot-cli/customize-copilot/create-custom-agents-for-cli)
- [Custom agents configuration reference](https://docs.github.com/copilot/reference/custom-agents-configuration)
