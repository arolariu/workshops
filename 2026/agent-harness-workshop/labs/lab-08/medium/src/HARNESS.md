# StudyBuddy's agent harness

One page that makes the harness one system: who owns it, what it is made of, what it trusts, what it may cost, and
how it changes.

## Owner
Alex Morgan (@alex-morgan), for the StudyBuddy maintainers team. When Alex is away, the course's teaching assistants
(@studybuddy/tas) review harness changes.

## Layers
| Layer | Files | What it is for |
|---|---|---|
| 📜 Instructions | `AGENTS.md`, `.github/instructions/testing.instructions.md` | commands, conventions, domain rules, boundaries and the definition of done; test rules only for `*.test.js` |
| 🧩 Skills | `.github/skills/new-module/`, `.github/skills/ects-grades/`, `.github/skills/release-checklist/` | the team's way to add a module; rarely needed rules, loaded only when the model picks them |
| 🎭 Agents | `.github/agents/reviewer.agent.md` | one read-only reviewer (`read`, `search`) |
| 🔌 MCP | `.mcp.json`, `mcp/studybuddy-server.mjs` | the student portal: 3 tools, the read tools marked read-only |
| 🔒 Hooks | `.github/hooks/guardrails.json`, `.github/hooks/scripts/guard.mjs` | the guard: `preToolUse` on bash and powershell, with a timeout; it logs every decision in `.agent-logs/` |
| 📦 Distribution | `apm.yml` | shared through APM, every dependency pinned to a tag |
| 🚀 Workflows | `.github/workflows/issue-triage.md` | issue triage in CI: a read-only agent, safe outputs with a `max`, a credit and a time limit |
| 🏛️ Governance | `HARNESS.md` | this page |

## Trust boundaries
The threat model, in short (a full table follows when the attack pack is in place):
- **Untrusted input:** the portal's MCP data (deadline titles and notes), the text of a new issue in the triage
  workflow, and any file the agent reads. Any of it can carry prompt injection: text that tells the agent to do
  something else.
- **What each part may do:** the main agent edits code and runs commands in this folder, through the guard; the
  reviewer only reads and searches; the triage agent is read-only and writes only through safe outputs (one label
  from an allow-list, one comment).
- **What stops an attack:** the guard runs before every tool call, on both shells, and denies recursive deletes
  whatever the model was told. The boundaries in `AGENTS.md` (no new dependencies, no `.env`, hands off the hooks)
  are requests to the model, not controls yet: that is the remaining risk.

## Budget
- Always-on context: at most **2,500 ≈tokens** per turn, as the X-ray measures it (the merged starter was ≈2,854;
  this harness is ≈690).
- Issue triage: `max-ai-credits: 50` credits and `timeout-minutes: 10` per run.
- Interactive sessions: a person watches them; scripted runs need their own credit limit before they are added.

## Changing the harness
- Every change to a harness path (`AGENTS.md`, `HARNESS.md`, `.github/**`, `.mcp.json`, `mcp/**`, `apm.yml`) is a
  pull request that the owner reviews.
- Before it is merged: `npm test` is green, the checks (`node labs/start.mjs test lab-08 easy`) pass, and the X-ray
  still shows L4 Guarded or better, with the always-on total under budget. Update the numbers on this page.
- One rule, one place: search before you add a rule. Project-wide rules go in `AGENTS.md`, rules for one kind of file
  in a scoped instructions file, rarely needed procedures in a skill.

## Rollback
- A harness change is one merged pull request: `git revert` its commit, then run the checks and the X-ray to confirm
  that the previous harness is back.
- Each released harness is tagged (`harness-v1.0.0`, …). To go back further, restore the harness paths from the last
  good tag: `git checkout harness-v1.0.0 -- AGENTS.md HARNESS.md .github .mcp.json mcp apm.yml`.
