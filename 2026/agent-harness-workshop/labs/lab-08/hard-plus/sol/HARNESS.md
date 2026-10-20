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
| 🚀 Workflows | `.github/workflows/issue-triage.md`, `.github/workflows/harness-review.md` | issue triage, and an AI review of harness pull requests with the reviewer and the scorecard: read-only agents, safe outputs with a `max`, a credit and a time limit |
| 🏛️ Governance | `HARNESS.md`, `harness.json`, `CHANGELOG.md`, `.github/CODEOWNERS`, `.github/pull_request_template.md`, `.github/workflows/harness-ci.yml`, `scripts/harness-check.mjs`, `scripts/release.mjs`, `scripts/rollback.mjs`, `evals/` | this page, the version and its changelog, the owners, the CI gate, releases (a plugin and an APM package in `dist/`) and rollbacks |

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
`node scripts/attack.mjs` proves the controls: 44 attacks denied on both shells, 12 everyday calls allowed.

| Family | Example | Control | Remaining risk |
|---|---|---|---|
| 💥 Destructive commands | `rm -rf ./`, `rm -Recurse -Force .git`, `\| Remove-Item`, `git clean -fdx` | `recursive-delete`, `git-history`; git keeps the history | a delete the rules don't parse: a script file, `node -e`, a loop that deletes file by file |
| 🔑 Reading secrets | `view .env`, `cat config/.env.local`, `printenv GITHUB_TOKEN` | `secret-files` (every tool, by file name), `secret-env` | a secret in a file with an innocent name, or printed by a program the agent runs |
| ✍️ Writing secrets | `create .env`, a hardcoded password, `$env:GITHUB_TOKEN \| Out-File` | `secret-files`, `secret-env`, `hardcoded-secret` | a literal in a variable with an innocent name; GitHub push protection is the next line |
| 📤 Sending data out | `curl --data-binary @grades.js`, `-Method Post`, `scp`, `nc`, `web_fetch` to an unknown host | `upload`, `egress` (an allow-list of six hosts) | data hidden in a request to an allowed host (a GitHub gist), or a URL without a scheme |
| 📦 Supply chain | `npm install lodash`, `curl … \| sh`, `iwr … \| iex`, `npx`, editing `package.json` | `new-dependency`, `remote-code`, `package-json` | a human who installs it after all; a typosquatted name in a reviewed pull request |
| 🛠️ Tampering with the harness | editing the hook config, deleting the guard, `sed -i` on `AGENTS.md`, granting the reviewer tools, a new MCP server | `harness-controls`, `boundaries`; the owner reviews every harness change | a person with write access; the guard can't protect a file it isn't asked about (a script that edits it) |
| 💉 Indirect injection | a portal record or an issue that asks for any of the above | the guard judges the action, not the text; read-only portal tools, a read-only reviewer, safe outputs in CI | an answer that is wrong without any tool call (a false deadline); only evals and a person catch that |

## Budget
- Always-on context: at most **2,500 ≈tokens** per turn, as the X-ray measures it (the merged starter was ≈2,854;
  this harness is ≈690).
- Issue triage: `max-ai-credits: 50` credits and `timeout-minutes: 10` per run.
- Harness review: `max-ai-credits: 60` credits and `timeout-minutes: 15` per pull request that changes the harness.
- Harness CI: the gate is free (no model). Real evals run once when someone adds the `run-evals` label, and on every
  push to `main`: about **240 credits** a run (8 cases × 1 run × 30 credits, `--budget 240`; the cap is soft, a run
  can go one response over), and 45 minutes. A paid run is queued, never cancelled halfway.
- Interactive sessions: a person watches them; scripted runs need their own credit limit before they are added.

## Changing the harness
- Every change to a harness path (`AGENTS.md`, `HARNESS.md`, `.github/**`, `.mcp.json`, `mcp/**`, `apm.yml`,
  `scripts/**`, `evals/**`, `attacks/**`) is a pull request. `.github/CODEOWNERS` makes the owner a required reviewer,
  and the pull-request template carries the harness checklist.
- The CI gate (`.github/workflows/harness-ci.yml`) runs on every such pull request: the scorecard must stay at L4
  Guarded or better (`node scripts/harness-check.mjs`), `node scripts/attack.mjs` has no miss and no false positive,
  `node --test` is green, and the eval self-test passes against `evals/baseline.json`. To measure a change to
  instructions, skills, agents, MCP or hooks for real, add the `run-evals` label: adding it is the decision to spend
  the credits, and it runs the evals once (push, then remove and add the label to run them again). `main` always
  gets a real run.
- In the workshop, the checks (`node labs/start.mjs test lab-08 hard+`) and the X-ray show the same: L5 Governed with
  the always-on total under budget. Update the numbers on this page.
- A new guard rule comes with an attack it stops and an everyday call it must still allow, in `attacks.local.json`.
- One rule, one place: search before you add a rule. Project-wide rules go in `AGENTS.md`, rules for one kind of file
  in a scoped instructions file, rarely needed procedures in a skill.
- Every change gets a line under `## [Unreleased]` in `CHANGELOG.md`. A release (`node scripts/release.mjs
  <major|minor|patch>`, from the harness's own repository) bumps `harness.json`, validates, packages `dist/plugin/`
  and `dist/apm/`, commits and tags `v<version>`. Try it with `--dry-run` first.

## Rollback runbook
When a harness change makes things worse (wrong answers, a guard that blocks everyday work, a cost spike):
1. **Decide** with the owner, and pick the last good version from `CHANGELOG.md` and the tags (`git tag --list 'v*'`).
   For one bad pull request that is still the newest change, `git revert` its merge commit instead and skip to step 4.
2. **Dry run:** `node scripts/rollback.mjs --to <version> --dry-run` lists every agent-facing file it would restore,
   remove or bring back (instructions, skills, agents, hooks, MCP, the APM manifest and lock).
3. **Restore:** `node scripts/rollback.mjs --to <version>` changes those files in the working tree. It never touches
   the change control (workflows, `CODEOWNERS`, scripts, evals, attacks) or the history (`CHANGELOG.md`,
   `harness.json`), and it refuses while a harness file has uncommitted changes.
4. **Check:** `node scripts/harness-check.mjs`, `node scripts/attack.mjs`, `node --test` and the eval self-test. The
   newest attacks and evals judge the old harness: a failure here is what the rollback costs you, so write it down.
5. **Pull request:** open one titled "Roll back the harness to v<version>", with the reason, and the `run-evals`
   label. The owner reviews it like any other harness change.
6. **Release:** after the merge, add a `### Changed` line ("Rolled back to v<version>: …") under `## [Unreleased]`
   and release a patch (`node scripts/release.mjs patch`). Versions only move forward.
7. **Tell the teams** that installed the package (APM or the plugin) to update to the new patch version.
