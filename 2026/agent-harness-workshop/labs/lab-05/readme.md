# Lab 05 · 🔒 Guardrails & hooks — What the agent may do

> **Harness layer:** Safety · 🟢 easy (together) · 🟡 medium · 🔴 hard

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
- **Fail closed**: if the guard can't decide, block, and say why.
- Hooks load at session start and only in **trusted** folders. Edit them, then restart Copilot.
- The shell tool is called `bash` on macOS/Linux and `powershell` on Windows. Handle both.

## Exercises
| Level | Mission | You practise |
|---|---|---|
| 🟢 easy | **A hook that says no**: block every spelling of `rm -rf` | `preToolUse`, deny JSON |
| 🟡 medium | **Soft rules → hard rules**: dependencies, `.env`, protecting the hooks, plus an audit trail | rule design, `postToolUse` |
| 🔴 hard | **Defense in depth**: a secret scanner, tests after every edit, and an autonomous run on a leash | layered safety, least privilege |

## Common pitfalls
- **Pattern too wide**: blocking every `rm` makes the agent useless. Be precise, and test the allowed cases too.
- **Pattern too narrow**: `rm -rf`, `rm -fr`, `rm -r -f`, `rm --recursive --force`… attackers (and models) get creative.
- **Logging secrets**: your audit log must not become the leak.

## Learn more
- [Using hooks with Copilot CLI](https://docs.github.com/copilot/how-tos/copilot-cli/customize-copilot/use-hooks)
- `copilot help permissions` and `copilot help sandbox`
