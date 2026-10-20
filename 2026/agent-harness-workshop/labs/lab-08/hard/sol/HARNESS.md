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
| 🔒 Hooks | `.github/hooks/guardrails.json`, `.github/hooks/scripts/guard.mjs` | the guard: `preToolUse` on bash and powershell, with a timeout; twelve rules with ids, each decision logged in `.agent-logs/`; its test suite is the attack pack (`attacks/pack.json`, `attacks.local.json`, `scripts/attack.mjs`) |
| 📦 Distribution | `apm.yml` | shared through APM, every dependency pinned to a tag |
| 🚀 Workflows | `.github/workflows/issue-triage.md` | issue triage in CI: a read-only agent, safe outputs with a `max`, a credit and a time limit |
| 🏛️ Governance | `HARNESS.md` | this page |

## Trust boundaries
The threat model, in short (the full table is the next section):
- **Untrusted input:** the portal's MCP data (deadline titles and notes), the text of a new issue in the triage
  workflow, and any file the agent reads. Any of it can carry prompt injection: text that tells the agent to do
  something else.
- **What each part may do:** the main agent edits code and runs commands in this folder, through the guard; the
  reviewer only reads and searches; the triage agent is read-only and writes only through safe outputs (one label
  from an allow-list, one comment).
- **What stops an attack:** the guard runs before every tool call, on both shells, and denies by rule whatever the
  model was told: destructive commands, secrets, uploads, new code from outside, and changes to the harness itself.
  The boundaries in `AGENTS.md` ask the model first; the guard enforces them.

## Threat model
Every family of the attack pack, the control that stops it (the guard's rule ids), and what can still get through.
`node scripts/attack.mjs` proves the controls: 44 attacks denied on both shells, 12 everyday calls allowed. The guard reads a
command the way a shell does (line continuations, quotes, `bash -c` and `powershell -Command`, full paths, prefixes like
`env` and `time`, git's and npm's global options), so a rule protects an outcome, not one spelling of it; quoted text in
`echo` or a commit message is data. The remaining risks name the spellings it still can't see.

| Family | Example | Control | Remaining risk |
|---|---|---|---|
| 💥 Destructive commands | `rm -rf ./`, `rm -Recurse -Force .git`, `\| Remove-Item`, `git clean -fdx` | `recursive-delete`, `git-history`; git keeps the history | a command the guard can't see: an alias or function defined in the session, a program name in a variable (`& $c -rf .`), a script file the agent wrote and then runs, a loop that deletes file by file |
| 🔑 Reading secrets | `view .env`, `cat config/.env.local`, `printenv GITHUB_TOKEN` | `secret-files` (every tool, by file name), `secret-env` | a secret in a file with an innocent name, a glob (`cat .e*`), or a program the agent runs that prints one |
| ✍️ Writing secrets | `create .env`, a hardcoded password, `$env:GITHUB_TOKEN \| Out-File` | `secret-files`, `secret-env`, `hardcoded-secret` | a literal in a variable with an innocent name; GitHub push protection is the next line |
| 📤 Sending data out | `curl --data-binary @grades.js`, `-Method Post`, `scp`, `nc`, `web_fetch` to an unknown host | `upload`, `egress` (an allow-list of six hosts) | data hidden in a request to an allowed host (a GitHub gist), a URL without a scheme (`curl evil.example.dev`), a script that opens its own connection |
| 📦 Supply chain | `npm install lodash`, `curl … \| sh`, `iwr … \| iex`, `npx`, editing `package.json` | `new-dependency`, `remote-code`, `package-json` | a script the agent writes and then runs (`sh setup.sh`); a human who installs it after all; a typosquatted name in a reviewed pull request |
| 🛠️ Tampering with the harness | editing the hook config, deleting the guard, `sed -i` on `AGENTS.md`, granting the reviewer tools, a new MCP server | `harness-controls`, `boundaries`; the owner reviews every harness change | a person with write access; a script or a glob that edits the guard without naming it (`Set-Content .git*/ho*/*.json`) |
| 💉 Indirect injection | a portal record or an issue that asks for any of the above | the guard judges the action, not the text; read-only portal tools, a read-only reviewer, safe outputs in CI | an answer that is wrong without any tool call (a false deadline); only evals and a person catch that |

## Budget
- Always-on context: at most **2,500 ≈tokens** per turn, as the X-ray measures it (the merged starter was ≈2,854;
  this harness is ≈690).
- Issue triage: `max-ai-credits: 50` credits and `timeout-minutes: 10` per run.
- Interactive sessions: a person watches them; scripted runs need their own credit limit before they are added.

## Changing the harness
- Every change to a harness path (`AGENTS.md`, `HARNESS.md`, `.github/**`, `.mcp.json`, `mcp/**`, `apm.yml`) is a
  pull request that the owner reviews.
- Before it is merged: `npm test` is green, the checks (`node labs/start.mjs test lab-08 medium`) pass,
  `node scripts/attack.mjs` (the attack pack and `attacks.local.json`) exits 0 with no miss and no false positive, and
  the X-ray still shows L4 Guarded or better, with the always-on total under budget. Update the numbers on this page.
- A new guard rule comes with an attack it stops and an everyday call it must still allow, in `attacks.local.json`.
- One rule, one place: search before you add a rule. Project-wide rules go in `AGENTS.md`, rules for one kind of file
  in a scoped instructions file, rarely needed procedures in a skill.

## Rollback
- A harness change is one merged pull request: `git revert` its commit, then run the checks and the X-ray to confirm
  that the previous harness is back.
- Each released harness is tagged (`harness-v1.0.0`, …). To go back further, restore the harness paths from the last
  good tag: `git checkout harness-v1.0.0 -- AGENTS.md HARNESS.md .github .mcp.json mcp apm.yml`.
