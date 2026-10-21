# 💎 Hard++ · Roll it out

> 🕐 3–4 h · 🏠 homework · 🆓 free checks · 🤖 optional agent check (about 1 prompt) · 🧱 builds on: Lab 08 · hard+

## 🎯 Mission
The Facilities team wants an agent on **CampusHub**, the university's room-booking system: three packages (`api/`,
`web/`, `jobs/`), a ticket tracker exported to a JSON file, an API key that must never leak, and a deploy that only a
release approver may run. Nobody on that team built StudyBuddy's harness, and they shouldn't have to. Roll your
packaged harness out to their repository the way a platform team would: install it (no copying), put the
organisation's policy above theirs, add the layer only they can write, measure what transferred, report on both
repositories, and sign off with a one-page review.

## 📋 Requirements
1. `campushub/apm.yml` depends on your package, `../dist/apm` (built by `node scripts/release.mjs patch --dry-run`),
   and `apm install --target copilot` installed it: `campushub/apm.lock.yaml` lists every installed file with its
   hash. Every installed file matches the lock and its file in the package, the package names this harness and holds
   only its files, and no package file sits in CampusHub outside the lock. CampusHub reaches **L4 Guarded** or better.
2. `campushub/.github/hooks/scripts/policy-guard.mjs` layers the organisation's policy (`policies/org.json`, or the
   file in `HARNESS_ORG_POLICY`) over CampusHub's (`policies/repo.json`) with the given engine, fails closed, logs
   the layer, and runs before every tool call in both shells. An organisation deny beats every repository override
   (force-pushing `preview` stays denied); CampusHub's rules hold for the API key, `.env.campushub`, deploys
   (`./deploy.sh --dry-run` stays allowed), the ticket file and approvals, and close two gaps: `npm start` and
   inline scripts that write a protected file.
3. CampusHub has an `AGENTS.md`, and one in each package (`api/`, `web/`, `jobs/`). Its `tickets` MCP server has two
   read-only tools (`list_tickets`, `get_ticket`) and one write tool, `close_ticket`, which refuses without a
   one-time approval that only a human gives. Its `campushub-release` skill checks a release ticket's scope.
4. StudyBuddy's attack pack and eval suite run on CampusHub. `campushub/attacks/pack.json` and
   `campushub/evals/cases.json` hold the repository's own versions, and `PORTABILITY.md` gives every attack family,
   the allowed calls and every eval case a verdict that the replays and the recorded runs back up. A false positive of
   the shared guard is fixed in the harness and rolled out again, never patched in CampusHub's copy.
5. `scripts/report.mjs` merges both repositories' session logs into one governance report: calls by tool, denials by
   rule, cost per session and the riskiest attempts.
6. `REVIEW.md` is a one-page harness review: the evidence for **L5 Governed**, the remaining risks and the next steps.
   The levels it states are the scorecard's, and the files it cites exist.

The commands you'll use (exit codes: 0 done, 1 a check failed, 2 refused):
```text
node scripts/release.mjs patch --dry-run        # the package, in dist/
node scripts/replay-hooks.mjs <repo> [pack…] [--json]
node scripts/report.mjs [--json] [<name>=<log file or folder> …]
node campushub/tickets/approve.mjs <ticket> --as <name>
node campushub/.github/skills/campushub-release/scope.mjs <ticket>
```

## 🧭 Milestones
### M1 · A second codebase
- `dist/apm/` is this harness's package, built by `release.mjs`: its `apm.yml` names the harness (`harness.json`) at
  the version it built, and each file in it is one of the harness's agents, skills, instructions or hook scripts
- `campushub/apm.yml` lists `../dist/apm` under `dependencies: apm:`, and `apm install --target copilot`, run in
  `campushub/`, put the reviewer, the testing instructions, the guard hook and the skills in place (APM puts skills in
  `.agents/skills/`, where Copilot CLI loads them too)
- `campushub/apm.lock.yaml` names the package (`local_path: ../dist/apm`) and every file it deployed; each one hashes
  to the lock (sha256 of the file with LF line endings) and equals its file in `dist/apm/`
- No package file was copied by hand: an agent, skill or instruction that comes from the package but isn't in the
  lock fails the check
- CampusHub's own scorecard (`scanHarness('campushub')`) says L4 Guarded or better

### M2 · Org versus repo
- `decision(toolName, args, { session })` in `policy-guard.mjs` returns `{ decision, rule, layer, severity, reason }`:
  it loads both policies, merges them with `effectivePolicy(org, repo)` and asks `evaluate(policy, normalize(…))`;
  no organisation policy, an unreadable one or a merge with problems denies every call (`rule: policy-unusable`,
  `layer: org`)
- `.github/hooks/campushub-policy.json` runs it on `preToolUse` for `bash` and `powershell`, with a `timeoutSec`
- `git push --force origin preview` is denied by `org-no-force-push` (layer `org`), although `repo.json` allows it
  with an override; a repository override for `curl … | sh` can't beat the organisation either
- CampusHub's own rules still decide (layer `repo`): `echo $CAMPUSHUB_API_KEY`, `cat .env.campushub`, `npm run deploy`
  and changes to `tickets/tickets.json` are denied, however they're spelled (`tickets/./tickets.json`, PowerShell's
  `copy`, `cpi` and `move`); `./deploy.sh --dry-run`, `npm test` and reading `.env.campushub.example` are allowed
- `repo.json` closes two gaps the CampusHub team left: `npm start` (with npm's options, and `npm restart`: it loads
  `.env.campushub` into the server, and the guard never sees the file) and inline scripts (`node -e "…"`,
  `node -pe "…"`) that touch `tickets/tickets.json`, `.approvals/` or `tickets/approve.mjs`; the agent can't approve
  its own ticket closes (`tickets/approve.mjs` and `.approvals/`, from tools and the shell)

### M3 · The repo layer
- `campushub/AGENTS.md` passes the scorecard's rules (commands, boundaries, a definition of done, under 100 lines)
  and points to `api/AGENTS.md`, `web/AGENTS.md` and `jobs/AGENTS.md`; each of those names its owners from
  `README.md`, its own test script (`npm run test:api` …) and at least one `Never` line, in at most 40 lines
- `campushub/.mcp.json` starts the `tickets` server (`node mcp/tickets-server.mjs`); `list_tickets` and `get_ticket`
  have `readOnlyHint: true`, `close_ticket({ id })` has `readOnlyHint: false`, and every tool has a description and
  an input schema
- `close_ticket` closes a ticket only with a valid approval, `.approvals/<ID>.json`
  (`{ ticket, action: "close", by, expires }`, written by `tickets/approve.mjs`), and deletes it, so it's used once.
  Without one, or with an expired one or one for another ticket, it answers `isError: true`, says how to get one,
  and leaves `tickets/tickets.json` byte for byte as it was. Every call appends
  `{ at, tool, ticket, outcome: "closed" | "refused", why?, by? }` to `.agent-logs/tickets.jsonl`
- `.github/skills/campushub-release/SKILL.md` (named after its folder, with a "Use when …" description) walks
  CampusHub's release process from `README.md` and starts with its `scope.mjs <ticket>`, which prints each ticket in
  the release's scope with its status: exit 1 for CH-108 today (CH-104 and CH-105 aren't done), 0 once every one is
  `done`, 2 for a ticket that isn't a release

### M4 · Portability
- `node scripts/replay-hooks.mjs campushub attacks/pack.json` replays StudyBuddy's pack through **every** hook
  CampusHub runs (one deny blocks the call); the CampusHub pack (`campushub/attacks/pack.json`: at least 6 attacks
  and 3 allowed calls, on the deploy, the key, `.env.campushub`, tickets and approvals) passes with no miss and no
  false positive. A pack holds no real-looking key: write `chk_live_{{FAKE_KEY}}`, and the replay fills in made-up
  letters and digits
- The shared guard's false positive on CampusHub's test convention is fixed upstream: a test file (`*.test.mjs`)
  inside the session's folder may hold a made-up key (`apiKey: 'server-test-key'`); a source file may not, nor
  `tests/../api/config.mjs`, nor a file under a `tests/` folder above the project, nor a patch that moves a test file
  to a source file; no file may hold a real key format (an `AKIA…` key); StudyBuddy's pack still passes; and the fix
  reached CampusHub through `release.mjs` and `apm install` (CampusHub's installed guard is this one)
- `node ../scripts/eval.mjs --cases ../evals/cases.json --from evals/runs/studybuddy` (in `campushub/`) scores the
  shipped runs of StudyBuddy's suite in CampusHub; `campushub/evals/cases.json` holds the cases that transferred and
  the repository's own versions, and `eval.mjs --dry-run` accepts it
- `PORTABILITY.md` has a row for each of the pack's six families, one for its allowed calls, and one per eval case,
  each with a verdict: `transferred`, `repo version` (naming the CampusHub case ids) or `doesn't apply` (saying why
  in the row). A "transferred" family is denied in full on CampusHub, "transferred" allowed calls all pass, a
  "transferred" eval case passed at least half of its recorded runs and is in CampusHub's suite, every repo version
  named exists, and in each table at least one row transferred or has a repo version
- The closing explanation requires the learner's recorded StudyBuddy and CampusHub artifacts/results and distinguishes
  structural/install success from semantic portability. It explains the recorded numbers, confounders, and any
  alternate evidence rather than manufacturing green scores or assuming a universal threshold. The global shell and
  write denials can confound hook ablations, so negative hook-ablation evidence is not proof to remove hooks.

### M5 · Governance report
- `summarize(logs)` and `render(summary)` in `scripts/report.mjs` turn `audit/2026-w45.jsonl` (StudyBuddy) and
  `campushub/audit/2026-w45.jsonl` (CampusHub), a week of Copilot session logs (`--output-format json`, several
  sessions per file), into exactly `tests/fixtures/governance-report.golden.md`:
  ```text
  # Governance report

  2 repositories · 7 sessions · 21 tool calls · 9 denied · 10 premium …

  ## Calls by tool
  | Tool | studybuddy | campushub | Total |
  ## Denials by rule
  | Rule | Repository | Denials |
  ## Cost per session
  | Session | Repository | Calls | Denied | Premium requests | Tokens |
  ## Riskiest attempts
  1. `5c0e7a41` (campushub) · 3 denied · secret-files, … · first: `…`
  ```
- Rules: a call is a `tool.execution_start`, a denial a `tool.execution_complete` with `error.code: "denied"`, the rule
  the id before the first `:` of its reason (`Denied by preToolUse hook: secret-files: …`, else `(unnamed)`), a
  session ends at its `result` event (`sessionId`, `usage.premiumRequests`), and its tokens are the input and output
  tokens of its last `session.usage_checkpoint`. Tools: most calls first, then by name; rules: most denials first,
  then by rule and repository; sessions in log order, then a **Total** row; riskiest: the sessions with denials, most
  first (then log order), at most five, each with its rules in order of first denial and its first denied call
- `--json` prints `{ sessions, calls, denied, premiumRequests, tokens, byTool: { tool: n }, byRule: { rule: n } }`
  (over every log), and a log that is missing or has no session exits 2

### M6 · Harness review
- `REVIEW.md` replaces the Lab 03 code review with a one-page harness review (at most 60 lines) with three sections:
  `## L5 evidence`, `## Remaining risks` and `## Next steps`
- It states both levels, `StudyBuddy … L5` and `CampusHub … L4` (whatever the scorecard says), and they match
- Every file it cites in backticks in the evidence section exists (`campushub/apm.lock.yaml`, `PORTABILITY.md` …)
- At least three remaining risks and two next steps, as list items

## 📂 Work here
```bash
# Expected working directory: workshop root (2026/agent-harness-workshop/)
cd labs/lab-08/hard-plus-plus/src
node scripts/release.mjs patch --dry-run        # M1: builds dist/
cd campushub                                    # now CampusHub is the expected cwd
apm install --target copilot
cd ..                                           # back to Lab tier src/
node scripts/replay-hooks.mjs campushub attacks/pack.json
node scripts/report.mjs
# Expected working directory: workshop root
cd ../../../..
node labs/start.mjs test lab-08 hard++          # from the workshop root
```
`campushub/` is the second team's repository: read its `README.md` first, and keep its 55 tests green
(`npm test` in `campushub/`). Each new starter file has a `TODO(M<n>)` where its milestone's work goes. The level
gives you `campushub/.github/hooks/scripts/engine.mjs` (Lab 05 hard++'s policy engine, hardened: you don't need to
have done that level), the organisation's `policies/org.json`, the human side of approvals
(`campushub/tickets/approve.mjs`), `scripts/replay-hooks.mjs`, a week of session logs in `audit/` and
`campushub/audit/`, and recorded runs of StudyBuddy's suite in CampusHub (`campushub/evals/runs/studybuddy/`).
You need [APM](https://github.com/microsoft/apm) for M1 (`apm --version`; this level was built with 0.33.0). A plugin
(`copilot --plugin-dir`) would install the harness for one person, not for the repository: nothing to review, lock
or check.

## 💡 Hints
### M1
<details><summary>Building and installing</summary>

`release.mjs` builds the package at the next version (`1.0.1`) and changes nothing else in a dry run. Then:
```yaml
dependencies:
  apm:
    - ../dist/apm
```
and `apm install --target copilot` in `campushub/`. APM adds `apm_modules/` to `.gitignore`: commit everything
else it wrote, the lock included. Change the harness later? Build again and install again: the lock follows.

</details>

<details><summary>Why the check hashes LF</summary>

APM hashes each file with LF line endings, but git (`core.autocrlf`) checks text out with CRLF on Windows. The check
hashes your file the way APM did, so a checkout on any OS proves the same thing: the bytes came from the package.

</details>

### M2
<details><summary>Two hooks, one decision</summary>

CampusHub now runs two `preToolUse` hooks: StudyBuddy's guard (installed, the same everywhere) and the policy guard
(CampusHub's layers). Copilot runs every hook it finds; one deny blocks the call. So each layer can be strict
without knowing about the other, and nothing in `repo.json` can switch StudyBuddy's guard off.

</details>

<details><summary>The two gaps</summary>

`npm start` runs `node --env-file=.env.campushub api/server.mjs`: the guard sees `npm start`, never the file. Deny
it (`npm -s start`, `npm --prefix . start` and `npm restart` too) with a reason that offers `node api/server.mjs`
(read-only, no key). An inline script names its target in the command line, so a `commandLine` rule can catch
`node -e "…tickets/tickets.json…"`, if it also knows `-pe`, `--eval` and `import('./tickets/approve.mjs')`.

Be plain about the limit: a deny-list can't fully close this. The ticket file and `.approvals/` are on the agent's
own disk, and a rule stops only the spellings it lists; a script the agent writes to a file and then runs still gets
through. Write that down for M6: the real fix is moving approvals off the agent's disk.

</details>

### M3
<details><summary>Which AGENTS.md does Copilot read?</summary>

Copilot CLI reads `AGENTS.md` from the folder you start it in up to the repository's root (a request for recursive
discovery is open: [copilot-cli#3051](https://github.com/github/copilot-cli/issues/3051)). Start it in `api/` and it
reads `api/AGENTS.md` and `campushub/AGENTS.md`; start it in `campushub/` and only the root one. So the root file
says where the package rules are, and each package file stays short and specific.

</details>

<details><summary>Designing the approval gate</summary>

The tool can't ask the human itself, so the human leaves a one-time grant where the server finds it:
`node tickets/approve.mjs CH-107 --as mara.ionescu` writes `.approvals/CH-107.json`, valid 15 minutes. The server
checks the ticket, the action and the time, closes the ticket with `updateTicket()`, and deletes the grant. The guard
(M2) keeps the agent away from `approve.mjs` and `.approvals/` as far as a deny-list can, which isn't all the way:
the grant sits on the agent's disk. In production the approval lives where the agent's machine can't write (the
tracker's API, with the approver's own credentials). Read-only hints only inform the client: the gate is the
refusal in your own code.

</details>

<details><summary>Reading the release scope</summary>

CH-108's body starts `Scope: CH-104 and CH-105.` Take the ids on the `Scope:` line, `getTicket()` each one from
`tickets/store.mjs`, print `CH-104 in-progress` lines, and exit 1 when any isn't `done`.

</details>

### M4
<details><summary>Transferred, or just still passing?</summary>

StudyBuddy's guard is installed byte for byte, so most of its pack still passes in CampusHub. That's necessary, not
sufficient: `.env` and `GITHUB_TOKEN` aren't what CampusHub has to protect. A family transfers when its cases mean
something there; otherwise write CampusHub's versions (`.env.campushub`, `CAMPUSHUB_API_KEY`, the deploy). The eval
runs work the same way: a case that passes for the wrong reason (`skill-release` loads StudyBuddy's checklist) still
needs a repo version.

</details>

<details><summary>Fixing a false positive at the right layer</summary>

Replay an allowed call that writes `api/rate-limit.test.mjs` with `apiKey: 'test-key-for-rate-limits'`: StudyBuddy's
`hardcoded-secret` rule denies it. Patching `campushub/.github/hooks/scripts/apm/…` would break the lock (M1) and the
next install would undo it. Fix `.github/hooks/scripts/guard.mjs` here (a test file may hold a made-up value, never one
in a real key format such as `AKIA…` or `ghp_…`), add the case to `attacks.local.json` (a key in a pack is
`…_live_{{FAKE_KEY}}`: the replay fills it in, so the repository never holds a real-looking one), run
`node scripts/attack.mjs`, release, install.

Decide "is it a test?" on the path inside the session's folder, not on the text: normalise
`path.relative(cwd, p)` and refuse anything absolute or with `..` in it. Otherwise `tests/../api/config.mjs`, or any
file of a learner who cloned into `~/tests/`, counts as a test.

</details>

### M5
<details><summary>Reusing what you have</summary>

`splitRuns()` from `scripts/eval/score.mjs` already cuts a log into sessions at each `result` event. One pass per
session gives its calls, denials and tokens; then four tables. Short session ids: the first 8 characters.

</details>

### M6
<details><summary>What counts as evidence</summary>

Files and numbers someone else can check: the scorecard's level for each repository, `campushub/apm.lock.yaml`,
the attack replays and the eval scores in `PORTABILITY.md`, the governance report's totals. Risks are what the checks
can't rule out (the approval file on the same disk, scripts the agent writes and runs, StudyBuddy-only skills in
CampusHub's install).

</details>

## 🧠 Takeaway
A harness proves itself when it transfers to a codebase it wasn't built for, and stays governed at scale.

## ❓ Check yourself
CampusHub's tests are blocked by StudyBuddy's guard, so a teammate edits
`campushub/.github/hooks/scripts/apm/scripts/guard.mjs` to let them through. What happens?
1. Nothing goes wrong: CampusHub owns the files APM installed into its repository.
2. APM refuses to install anything until the file is restored.
3. The file no longer matches `apm.lock.yaml`, the next `apm install` puts the old guard back, and StudyBuddy and
   every other team keep the bug: the fix belongs in the harness, released and installed again.

<details><summary>Answer</summary>

**3.** The lock records what the package installed, so a hand edit is drift that the check (and the next install)
undoes. Fixing the shared guard upstream fixes it for every repository that installs the next version.

</details>

## 🚀 Going further
- Publish the package from its own repository and depend on a tag (`owner/studybuddy-harness#v1.0.1`) instead of
  `../dist/apm`.
- Split the package: an organisation baseline (guard, reviewer) and a StudyBuddy package (`ects-grades`,
  `release-checklist`), so CampusHub installs only what applies to it.
- Record real runs of CampusHub's suite (`--runs 1 --budget …`), keep them in `campushub/audit/`, and report on them.
- Move approvals out of the agent's reach: the tracker's own API with the approver's credentials, or an MCP
  elicitation the client shows to the human.
