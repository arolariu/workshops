# Lab 05 · 🔒 Guardrails & hooks — What the agent may do

> **Harness layer:** Safety · **Maturity:** L4 Guarded · 🟢 together · 🟡 🔴 🟣 💎 homework
>
> **Threads:** 💉 Prompt injection · 🔐 Least privilege

## In one minute
Instructions are **wishes**: the model usually follows them, but nothing forces it. Guardrails are
**guarantees**. Copilot CLI gives you several layers: permission rules (what may run without asking),
**hooks** (your own code that runs before and after every tool call and can block it), sandboxing, and
budget caps. Together they let you hand the agent more autonomy without crossing your fingers.

## The layers
| Layer | How | Strength |
|---|---|---|
| Instructions | "Never run rm -rf" in AGENTS.md | 🟡 soft: a strong hint, not enforced |
| Permissions | prompts in a session; `--allow-tool` / `--deny-tool` in scripts | 🟢 enforced, per tool or command |
| **Hooks** | `.github/hooks/*.json` → your script decides, every single call | 🟢 enforced, any logic you can code |
| Sandbox | `/sandbox`: limit file paths and network at OS level | 🟢 enforced by the OS |
| Budget | `--max-ai-credits`, `/limits` | 🟢 enforced spending cap |

## How a hook works
```text
agent wants: bash "rm -rf build"
      │
      ▼  JSON on stdin: { "toolName": "bash", "toolArgs": "{\"command\":\"rm -rf build\"}", "cwd": "..." }
 your script (.github/hooks/scripts/guard.mjs)
      │
      ▼  JSON on stdout: { "permissionDecision": "deny", "permissionDecisionReason": "No recursive force-deletes" }
Copilot blocks the call and tells the model why
```
```json
{
  "version": 1,
  "hooks": {
    "preToolUse":  [{ "type": "command", "bash": "node .github/hooks/scripts/guard.mjs",
                      "powershell": "node .github/hooks/scripts/guard.mjs", "cwd": ".", "timeoutSec": 10 }],
    "postToolUse": [{ "type": "command", "bash": "node .github/hooks/scripts/audit.mjs",
                      "powershell": "node .github/hooks/scripts/audit.mjs", "cwd": ".", "timeoutSec": 10 }]
  }
}
```
| Event | Fires | Typical use |
|---|---|---|
| `preToolUse` | before every tool call | **block** dangerous calls |
| `postToolUse` | after a tool call | audit logs, run tests after edits |
| `userPromptSubmitted` | when you send a prompt | add context, filter prompts |
| `sessionStart` / `sessionEnd` | once per session | setup, cleanup, reports |

Good to know:
- Print **nothing** to allow; print the deny JSON to block. Keep hooks fast (they run on *every* call).
- **Fail closed**: if the guard can't decide, block, and say why. Copilot denies the call when a `preToolUse` hook
  crashes or exits non-zero, but a hook that **times out is skipped** (fails open), so a guard needs its own deadline.
- Hooks load at session start and only in **trusted** folders. Edit them, then restart Copilot.
- The shell tool is called `bash` on macOS/Linux and `powershell` on Windows. Handle both. `toolArgs` arrives as an
  object (accept a JSON string too: older tools and the checks send one).
- `postToolUse` only sees calls that succeeded; a failed call fires `postToolUseFailure` (with `error`) instead.
- In `copilot -p`, `userPromptSubmitted` fires before `sessionStart`. Its output is ignored: it can record a prompt,
  not block it. `sessionStart` can add `additionalContext` that the model reads before its first call.

## 🔬 Under the hood
```text
 🧠 model ─▶ tool call (JSON) ─▶ preToolUse hook: your code, outside the model ─▶ allow ─▶ the tool runs
                                         │
                                         └─▶ deny + reason ─▶ back into the context: "blocked, because…"
```
A hook is a program the harness runs **outside the model**, with the tool call as JSON on stdin. Its answer is
deterministic: the same call gets the same decision, every time, and no wording in a prompt or a tool result can
talk it round, because the model never runs the hook; it only sees the outcome. The deny reason goes back into the
context, so a good reason teaches the model what to do instead.
Because the hook is code, it can **fail closed**: if it crashes or can't parse the call, it blocks. Instructions
are wishes the model weighs against everything else in its context; a hook is a guarantee the harness enforces.

## 🏛️ In the enterprise
- **At scale:** organisation-wide policy: the same guard in every repository, with rules a security team owns and
  developers can't switch off by editing a prompt.
- **The risk:** a guard that fails open (crashes and allows), misses a spelling, or logs the secrets it was meant
  to protect.
- **The control:** hooks that fail closed, tests for every rule (the denied spellings *and* the allowed work),
  sandboxing for what hooks can't see, redacted audit logs kept for review, and secrets that never enter the context.

## Exercises
| Level | Mission | You practise |
|---|---|---|
| 🟢 easy | **A hook that says no**: block every spelling of `rm -rf` | `preToolUse`, deny JSON |
| 🟡 medium | **Soft rules → hard rules**: dependencies, `.env`, protecting the hooks, an audit trail and its report | rule design, `postToolUse` |
| 🔴 hard | **Defense in depth**: a secret scanner, tests after every edit, a guard suite that catches mutants, and a leash | layered safety, testing a guard |
| 🟣 hard+ | **Policy as code**: an engine and `policy.json`, every spelling normalised, fail closed when broken or slow, injection-shaped calls | policy engines, failing closed |
| 💎 hard++ | **Layered governance**: an org policy nobody can override, session and prompt hooks, a hash-chained audit log and its report | governance, tamper evidence |

## Common pitfalls
- **Pattern too wide**: blocking every `rm` makes the agent useless. Be precise, and test the allowed cases too.
- **Pattern too narrow**: `rm -rf`, `rm -fr`, `rm -r -f`, `rm --recursive --force`… attackers (and models) get creative.
- **Logging secrets**: your audit log must not become the leak.

## Learn more
- [Using hooks with Copilot CLI](https://docs.github.com/copilot/how-tos/copilot-cli/customize-copilot/use-hooks)
- [Hooks reference](https://docs.github.com/copilot/reference/hooks-reference): every event, its payload, and what fails open or closed
- `copilot help permissions` and `copilot help sandbox`
