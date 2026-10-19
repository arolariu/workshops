# Lab 00 · 💻 Copilot CLI — Your agent runtime

> **Harness layer:** Runtime · **Maturity:** L0 Bare · 🟢 together · 🟡 🔴 🟣 💎 homework
>
> **Threads:** 🔴 The red build · 📏 Measurement · 🪙 Tokens and budget · 🔐 Least privilege

## In one minute
GitHub Copilot CLI is an AI agent that lives in your terminal. You ask in plain language; it reads files,
runs commands and edits code, and it asks for permission before anything risky. Everything else in this
workshop (instructions, skills, agents, MCP servers, hooks) plugs into this runtime, so this lab is about
driving it well: giving it context, choosing a mode, checking its work and scripting it.

## Why it matters
An agent is only as good as the loop around it. Knowing how to feed it the right files, how to make it plan
before it types, how to review and undo its changes, and how to run it from a script is what turns
"autocomplete on steroids" into a teammate you can trust with real work.

## How it works
```text
 you ──prompt──▶  Copilot CLI (the harness)  ──▶  model
                  │   ▲
           tools  │   │  results
                  ▼   │
     files · shell · MCP servers · your extensions
```
The model only proposes actions. The CLI decides what actually runs: it checks permissions, runs hooks,
and shows you every step.

## 🔬 Under the hood
```text
 turn 1 │ system · instructions · tools · prompt                 │ ─▶ 🧠 ─▶ tool call
 turn 2 │ system · instructions · tools · prompt · call · result │ ─▶ 🧠 ─▶ tool call
 turn 3 │ system · instructions · tools · prompt · … · result    │ ─▶ 🧠 ─▶ answer
          └─────────── sent again, in full, every turn ─────────┘
```
The model is **stateless**: it remembers nothing between calls. Every turn, the harness sends the whole context
again: the system prompt, your instructions, the tool schemas, the conversation so far and every tool result.
A **tool call** is JSON the model writes, like `{"tool": "bash", "command": "npm test"}`. The model can't run
anything itself: the harness checks permissions, runs the tool and adds the result to the next turn's context.
Two consequences you'll meet in every lab:
- **Tokens are cost.** Everything in the context is paid for again on every turn. `/context` shows what's in it.
- **Output varies.** The model samples each answer, so one prompt can take different paths. Trust checks and
  repeated runs, not one lucky answer.

**Watch it:** press **u** on the home screen (or run `node labs/start.mjs replay`) and step through a run with
**←**/**→**: each turn shows the context window, the tool call the model wrote, what the harness decided and what went
back into the history. Then press **tab** to see the same task with a harness, on the same turn.

## Cheat sheet
| You want to… | Do this |
|---|---|
| Start a session in this folder | `copilot` |
| Log in (first time) | `/login` inside a session |
| Attach a file to your prompt | `@grades.js` |
| Run a command yourself (no AI) | `!npm test` |
| Plan before building | `/plan add a gpa() function` (or **Shift+Tab** to switch mode) |
| Review what the agent changed | `/diff` |
| Undo the last turn and its file changes | `/rewind` |
| See what Copilot loaded here | `/env` |
| See your spending | `/usage` · cap it with `/limits` or `--max-ai-credits` |
| One prompt from a script | `copilot -p "…" -s` |
| Machine-readable events | `copilot -p "…" --output-format json` |

## Permissions in 30 seconds
- In a session, Copilot asks before it writes files or runs commands. Answer once, or allow for the session.
- From a script you decide up front: `--allow-tool='shell(npm:*)'`, `--allow-tool=write`, `--deny-tool='shell(git push)'`.
  **Deny always wins** over allow. Avoid `--allow-all` / `--yolo` outside throwaway sandboxes.
- Copilot only loads project files (skills, MCP servers, hooks) from **trusted folders**. Trust the workshop
  folder once: run `copilot` in the repo root and choose *Yes, and remember this folder*.

## 💳 AI credits
Every prompt costs AI credits. Student plans get a monthly budget, so: use `!command` for things that don't
need AI, keep prompts focused, check `/usage`, and use `--max-ai-credits` (minimum 30) on scripted runs.
The cap is a **soft** cap: usage is known only after a response, so a response can cross it. Near the cap, the next
model call is the last one, with tools disabled; once the cap is reached, Copilot asks you to raise or unset the
limit before it goes on (`copilot help limits`).

## 📈 What a scripted run prints
`copilot -p "…" -s --output-format json` prints one JSON event per line, and nothing else:
- `user.message`, then per turn `assistant.turn_start` → `assistant.message` (its `toolRequests` are the tool calls
  the model wrote) → `tool.execution_start` and `tool.execution_complete` → `assistant.turn_end`. At the end:
  `session.usage_checkpoint` (tokens per model) and a flat `result` (`exitCode`, `usage.premiumRequests`).
- A refused call is a `tool.execution_complete` with `success: false` and `error.code: "denied"`: by a hook
  (`Denied by preToolUse hook: …`) or by the permission system (`Permission denied because no interactive user
  response was available`). Any other code is a failure.
- `session.tools_updated` and `assistant.message` name the model that really ran (`auto` picks one for you).

## 🏛️ In the enterprise
- **At scale:** every scripted run can emit JSON events (`--output-format json`): which tools ran, what they
  returned and how many tokens it took. Kept together, they are your audit trail and your cost report.
- **The risk:** a script with `--allow-all` and no budget. One bad prompt, and the agent can run anything for as
  long as it likes.
- **The control:** explicit `--allow-tool` / `--deny-tool` flags and a `--max-ai-credits` cap on every scripted
  run, reviewed like any other code.

## Exercises
| Level | Mission | You practise |
|---|---|---|
| 🟢 easy | **First contact**: find out why the build is red, without touching the code | sessions, trust, `@file`, `!command` |
| 🟡 medium | **Think first**: plan a GPA feature, review the diff, undo a bad turn, and compare what planning cost | `/plan`, `/diff`, `/rewind`, `/usage` |
| 🔴 hard | **Agent in a script**: read real JSON runs (tools, denials, tokens, a timeline per turn), prove it with tests, and record new runs read-only with a cap | `-p`, `--output-format json`, permission flags |
| 🟣 hard+ | **Flight recorder**: record one prompt N times with its setup, compare two runs, measure the spread, and explain it | nondeterminism, observability |
| 💎 hard++ | **Build the loop**: your own agent loop around a scripted fake model, with a permission gate, stop rules and Copilot's JSON events | what a harness *is*, from the inside |

## Common pitfalls
- **"Copilot doesn't see my files"**: start it *inside* the exercise's `src/` folder.
- **It asks for permission all the time**: that's the safety net. Allow for the session when you trust the step.
- **Long, vague prompts** cost more and work worse. Say what, where, and how you'll judge "done".

## Learn more
- [About GitHub Copilot CLI](https://docs.github.com/copilot/concepts/agents/about-copilot-cli)
- [Using Copilot CLI](https://docs.github.com/copilot/how-tos/use-copilot-agents/use-copilot-cli)
- In the CLI: `copilot help commands`, `copilot help permissions`, `copilot help billing`
