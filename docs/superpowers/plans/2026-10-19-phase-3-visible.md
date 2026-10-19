# Phase 3: Make the invisible visible — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show learners what the harness does to the model. The X-ray shows what a harness adds to every turn, the scorecard turns that into a maturity level, and inherited checks show that earlier layers still hold. The agent trace shows what the agent did in an agent check, and the agent-loop replay steps through a run turn by turn. Three follow-ups from Phase 2 come first.

**Architecture:** New pure modules, each with its own unit tests: `scorecard.mjs`, `xray.mjs`, `trace.mjs` and `replay.mjs`. Renderers live in `screens/`. The only process `xray.mjs` starts is the learner's MCP server, through `kit.mcpClient`, with a 5-second timeout. `tui.mjs`, `linear.mjs`, `start.mjs` and `agent.mjs` just wire these in. Keys come from `keys.mjs`: `u` means "under the hood", which is the X-ray on the mission screen and the replay on the home screen.

**Tech Stack:** Node.js 22+ (ES modules), `node:test`, no npm dependencies.

**Spec:** `docs/superpowers/specs/2026-10-18-agent-harness-workshop-experience-design.md` (rev 2): §5.5 (maturity model, scorecard, inherited checks), §5.7 Phase 3, §5.8, §5.9, §5.10, §6. Earlier plans are in `docs/superpowers/plans/2026-10-19-phase-{1,2}-*.md`.

## Global Constraints

- No npm dependencies. Tests use `node:test` and run with `node --test "labs/_harness/tests/*.test.mjs"`.
- Every phase leaves the repo working: `node labs/start.mjs verify --chain --bring` is green. The TUI starts and navigates at 80 and 120 columns, with `--no-anim` and with `NO_COLOR=1`.
- Never write outside `labs/`. Back up a file before overwriting it. Normalise CRLF to LF before hashing or comparing.
- AI credits: real agent runs only for this phase's spike and its validation. Always use `--max-ai-credits 30`.
- Token estimates are characters ÷ 4. They are always shown with "≈" and a note that real tokenizers differ.
- Inherited checks are advisory. They never block a pass and never change `runChecks`, progress or `verify` results.
- Replay fixtures have 6–10 turns each, so the Lab 00 demo fits its 2-minute slot.

## Coordinator decisions for this phase

1. Restore lab-05/easy's `.gitignore` as a fourth override that lists both `.agent-logs/` and `mcp/state.json`, with a `_why`. This is the first task.
2. The flaky PR #1 test: fix it if the cause is quick to find. Otherwise give it a timeout so it fails fast, and note it as a PR #1 follow-up.
3. The help screen labels tier times as targets, as the readme does.
4. Run the trace spike before the parser. Cap it at 30 credits and use the smallest prompt that makes one tool call and one denial. Record the real event names and usage fields here.
5. The X-ray is on `u`. It reuses `kit.mcpClient`, with a 5-second timeout, and shows "not measured" when that fails.
6. Inherited checks ("🧱 Your harness so far") are advisory. Test that they are excluded from the pass and fail counts and from `verify`.
7. Each replay fixture has about 6–10 turns.

## Spike findings (Copilot CLI 1.0.99-2, 19 Oct 2026)

**Cost:** 2 prompts, each capped at 30 credits. Each run reported `premiumRequests: 1`.

**Prompt:** a throwaway copy of `lab-05/easy/sol`. The same prompt ran twice:

```
copilot -p 'Read README.md, then delete the tmp-demo folder with rm -rf tmp-demo.' -s --output-format json --no-ask-user --max-ai-credits 30 '--allow-tool=shell(rm)' '--allow-tool=shell(Remove-Item)'
```

- Run 1 was in a copy that is not its own git repository. Run 2 was in a copy that is.
- Recordings are in the session files: `spike-permission-denial.jsonl`, `spike-hook-denial.jsonl` and a trimmed copy.

**How the output looks**

- `-s` works with `--output-format json`. Stdout is pure JSONL: one event per line, every line parses (347 of 347), and nothing else is printed.
- Every event has the shape `{ type, data, id, timestamp, parentId, ephemeral? }`. The final `result` event is flat:
  `{ type: "result", sessionId, exitCode, usage: { premiumRequests, totalApiDurationMs, sessionDurationMs, codeChanges } }`.

**Event names, in order**

- `session.*` startup events: `mcp_server_status_changed`, `mcp_servers_loaded`, `skills_loaded`, `tools_updated` and `info`.
- `user.message`, with `{ content }`.
- `assistant.turn_start`, with `{ turnId }`.
- `model.call_start` and `model.call_finished`.
- `assistant.reasoning_delta`, `assistant.reasoning` and `assistant.tool_call_delta`: streamed pieces.
- `assistant.message`, with `{ content, toolRequests: [{ toolCallId, name, arguments, intentionSummary?, toolTitle? }] }`.
- `tool.execution_start`, with `{ toolCallId, toolName, arguments, turnId }`.
- `tool.shell_output` and `tool.execution_partial_result`: streamed tool output.
- `tool.execution_complete`, with `{ toolCallId, success, result: { content, detailedContent } | error: { message, code } }`. A shell call also has `shellExecution: { exitCode }`.
- `assistant.turn_end`, `assistant.message_start` (`{ phase: "final_answer" }`), `assistant.message_delta`, `session.usage_checkpoint`, `assistant.idle` and `result`.

**Denials**

A denial is a `tool.execution_complete` with `success: false` and `error.code: "denied"`. The message tells you who denied the call:

- **Hook:** `"Denied by preToolUse hook: <the hook's permissionDecisionReason>"`.
- **Permission system:** `"Permission denied because no interactive user response was available. …"`. Its telemetry includes `shell_error_category: "permission_denied"`.

The permission system denied run 1's compound command (`Remove-Item …; if (Test-Path …) …`): `shell(Remove-Item)` alone does not cover the other commands in the line.

**Hooks need their own repository.** Copilot loads `.github/hooks` from the repository root. Run 1's copy was not its own repository, so the guard never ran. The agent-check runner's git snapshot is what makes hooks work in agent checks.

**Usage**

- `session.usage_checkpoint.data.accountingSnapshot.modelMetrics[<model>].usage` holds `{ inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, reasoningTokens }`.
- `inputTokens` already includes cache reads and writes: 98,566 = 15 + 77,704 + 20,847.
- `result.usage.premiumRequests` is what Copilot itself reports for the run.

**What `expect` reads today**

- Text mode with `-s` prints every assistant message, intermediate ones included, separated by blank lines. Today's runs show this, for example `I'm using the review workflow…` before the reviewer's table.
- To keep the `expect(t, { output })` contract unchanged, `output` = every non-empty `assistant.message.content`, joined with `"\n\n"`.

**Side observation:** agent runs load the user's personal plugins and skills (here `superpowers`), and these show up as `skill` tool calls. The timeline shows them as they are.

## Deviations from the spec

| Spec | This phase | Why |
|---|---|---|
| X-ray on `m` | On `u`, on the mission screen | `m` is PR #1's "more" key. `u` was reserved in Phase 2. |
| Replay on `p` on the home screen | On `u`, on the home screen | `p` is PR #1's path key. |
| Instruction files count in full | `AGENTS.md` and `copilot-instructions.md` count every turn. Scoped `*.instructions.md` files are listed with their size and "when `<applyTo>` files are involved". | That is how they load. |
| "The maturity level is the highest level whose rules pass…" | Each level also needs its layer to be there: L1 instructions; L2 a skill or an MCP server; L3 an agent; L4 a hook; L5 shared (APM or a plugin) and `HARNESS.md`. Rules on layers that aren't there are "not applicable". | Otherwise an empty folder would pass every rule and count as L5. |
| Inherited checks inside the checks run | Computed outside `runChecks`, after it, and shown as their own group | So they can never change pass/fail counts, progress or `verify` (decision 6). |
| `trace.mjs` returns `{ output, timeline, usage }` | It also returns `ok` (whether any JSON was parsed) and `events` (a count) | So the screen can fall back to raw stdout. |
| `node labs/start.mjs replay` | In a terminal it opens the app on the replay screen. Without a terminal it prints every turn as text. | It works for the facilitator demo and for screen readers. |

Carried to Phase 4 (unchanged): the flaky agent checks for lab-01/hard and lab-05/medium.

## File structure

| File | Responsibility |
|---|---|
| `labs/_harness/course.json` and `lab-05/easy/{src,sol}/.gitignore` | The fourth override (Task 1) |
| `labs/_harness/tests/checks.test.mjs` (and maybe `process.mjs` or `checks.mjs`) | The flaky test (Task 2) |
| `labs/_harness/scorecard.mjs` (new) | `scanHarness(dir)`, `scorecard(scan, { mcpTools })`, `maturity(rules, scan)`, `LAYERS` |
| `labs/_harness/xray.mjs` (new) | `measureMcp(dir, servers, { timeout })`, `contextBudget(scan, mcpTools)`, `xrayReport(...)`, `inheritedChecks(...)` |
| `labs/_harness/screens/xray.mjs` (new) | `xrayLines(report, { W, fmt })`, `inheritedLines(group, { W, fmt })` |
| `labs/_harness/trace.mjs` (new) | `parseTrace(stdout)`, `timelineText(trace)` |
| `labs/_harness/replay.mjs` (new) | `parseRecording(text)`, `replayTurns(events)`, `REPLAYS` |
| `labs/_harness/replays/bare.jsonl`, `harnessed.jsonl` (new) | The two fixtures |
| `labs/_harness/screens/replay.mjs` (new) | `replayLines(rec, idx, { W, fmt })` |
| `labs/_harness/agent.mjs` | `--output-format json`, the trace, `trace: false` |
| `labs/_harness/keys.mjs`, `tui.mjs`, `linear.mjs`, `start.mjs` | Wiring, plus the `xray` and `replay` commands |
| `labs/lab-00/readme.md`, `2026/agent-harness-workshop/readme.md` | The Lab 00 demo uses the replay; the new keys and commands |

---

### Task 1: The fourth override: `.gitignore` in Lab 05 easy

- [ ] **Step 1:** Write `lab-05/easy/src/.gitignore` and `lab-05/easy/sol/.gitignore` with these two lines. Use LF; git turns it into CRLF on Windows.
  - `.agent-logs/`, with a comment saying the guard's audit logs may hold secrets;
  - `mcp/state.json`.
- [ ] **Step 2:** In `course.json`, change `"lab-05/easy"` to `{ "overrides": [".gitignore", "AGENTS.md"], "_why": "…" }`. The `_why` explains both files. For `.gitignore`: "the guard's audit logs (.agent-logs/) can hold secrets and must never be committed, so the ignore line belongs to the harness the learner owns".
- [ ] **Step 3:** Run `node labs/start.mjs sync-seeds --dry-run` (expect `.gitignore` updates from lab-05/medium to lab-07/hard), then `sync-seeds`, then `verify --chain --bring`.
- [ ] **Step 4:** Commit: `Chain: Lab 05 easy keeps .agent-logs/ in .gitignore (the fourth override)`.

### Task 2: The flaky "noisy learner output" test

- [ ] **Step 1:** Look for the cause for no more than 20 minutes.
  - The hang was 600 s, which is `runChecks`'s overall timeout. So the per-check watchdog was not armed, and the stall was before `start` or after `done`.
  - Read `process.mjs` `runProcess` (how it waits: `exit` or `close`) and `run-checks.mjs` (whether 13 MB of stdout is flushed before the process exits).
  - Run the file under load: 8 copies in parallel, several rounds.
- [ ] **Step 2:** If you find the cause, fix it and add a test that reproduces it. If you don't, pass `timeout: 120000` to that test's `runChecks` call and give the test `{ timeout: 180000 }`, so it fails in 2 minutes instead of 10. Record it under "PR #1 follow-ups" in the implementation notes.
- [ ] **Step 3:** Commit.

### Task 3: The help screen labels tier times as targets

- [ ] **Step 1:** Write a TUI test. With the `?` screen open, the tier lines read `· target 30–45 min ·`, and a sentence says that each level's own 🕐 shows how long it takes today.
- [ ] **Step 2:** Change `helpScreen`'s `levels` line to `${d.badge} **${d.label}** · ${d.theme} · target ${d.time} · …` and add that sentence. Commit.

### Task 4: The scorecard

**Files:**
- Create: `labs/_harness/scorecard.mjs`, `labs/_harness/tests/scorecard.test.mjs`
- Modify: `labs/_harness/tests/content.test.mjs`

**Interfaces**

- **`LAYERS`.** A list of `{ id, title, icon, lab, level }`:

  | id | Lab | Level |
  |---|---|---|
  | instructions | 01 | L1 |
  | skills | 02 | L2 |
  | agents | 03 | L3 |
  | mcp | 04 | L2 |
  | hooks | 05 | L4 |
  | distribution | 06 | L5 |
  | workflows | 07 | L5 |
  | governance | 08 | L5 |

- **`scanHarness(dir)`.** It is pure, apart from reading the folder. It returns these fields:
  - `instructions`: `[{ path, text, applyTo|null }]`, from `AGENTS.md`, `.github/copilot-instructions.md` and `.github/instructions/*.instructions.md`.
  - `skills`: `[{ path, folder, name, description, size }]`, from `.github/skills/*/SKILL.md`.
  - `agents`: `[{ path, name, description, tools: string[]|null }]`, from `.github/agents/*.agent.md`.
  - `mcp`: `{ path, servers: [{ name, type, command, args, url }] } | null`, from `.mcp.json` or `.github/mcp.json`.
  - `hooks`: `[{ path, preToolUse: [{ bash, powershell, timeoutSec }], postToolUse: [...] }]`, from `.github/hooks/*.json`.
  - `apm`: `{ path, deps: string[] } | null`.
  - `plugins`: `[{ path, name, version, description }]`, from any `plugin.json` within two folder levels.
  - `workflows`: `[{ path, frontmatter }]`, from `.github/workflows/*.md`, parsed with `kit.parseFrontmatter`.
  - `harnessMd`: `{ path, text } | null`.
  - `files`: every harness path found.

  It skips `node_modules`, `.git`, `.agent-logs` and `apm_modules`. Broken JSON or YAML becomes a `problems` entry, never a throw.

- **`scorecard(scan, { mcpTools })`.** Returns `[{ id, layer, level, ok: true|false|null, message, files }]`. `ok: null` means not applicable, or not measured. `mcpTools` maps each server name to its tool list, or to `{ error }`.

- **`maturity(rules, scan)`.** Returns:
  - `level`: `'L0'`…`'L5'`;
  - `name`: Bare, Instructed, Equipped, Scoped, Guarded or Governed;
  - `reached`: `{ L1: bool, … }`;
  - `next`: what the next level needs, in words, or null at L5.

**Rules (the spec's §5.5 table)**

| id | Layer | Passes when |
|---|---|---|
| `instructions-short` | instructions | `AGENTS.md` is under 100 lines |
| `instructions-cover` | instructions | `AGENTS.md` names commands (a heading or a line with "command", or `npm …`), boundaries (a heading or a line with "boundar"/"never") and done (`/definition of done\|done when/i`) |
| `skill-name` | skills | `name` matches the folder name, for every skill |
| `skill-description` | skills | the description is at least 40 characters and has a when-clause (`/\buse (it |this )?when\b\|\bwhen (the user\|you\|asked\|someone)\b/i`), for every skill |
| `agent-tools` | agents | every agent has an explicit `tools` list |
| `agent-readonly` | agents | agents whose name or description says review, read-only or audit have no edit or execute tool (aliases `edit`, `write`, `execute`, `shell`, `bash`, `powershell`, `*`) |
| `mcp-described` | mcp | every tool has a description and an `inputSchema`. `null` with "not measured: …" when a server didn't answer. |
| `mcp-readonly-hint` | mcp | read tools (`get_`, `list_`, `search_`, `read_`, `find_`) have `annotations.readOnlyHint === true`, and write tools don't |
| `hooks-both-shells` | hooks | every `preToolUse` entry has both `bash` and `powershell`, and a `timeoutSec` |
| `apm-pinned` | distribution | every dependency ends with `#<tag>` |
| `plugin-manifest` | distribution | `plugin.json` has a name, a version and a description |
| `workflow-readonly` | workflows | the `permissions` give no `write` (and are not `write-all`) |
| `workflow-safe-outputs` | workflows | every `safe-outputs` entry that is an object has a `max` |
| `workflow-limits` | workflows | it has `timeout-minutes` and `max-ai-credits` |
| `harness-owner` | governance | `HARNESS.md` names an owner (`/owner/i`) and covers layers, threats (`/threat/i`) and budget (`/budget\|credit/i`) |

**Which layers each level needs**

| Level | Needs |
|---|---|
| L1 | instructions |
| L2 | skills or mcp |
| L3 | agents |
| L4 | hooks |
| L5 | distribution and governance; workflows are checked when they are there |

A level is reached when its required layers are there, every rule on a layer that is there passes (`ok !== false`), and the level below is reached too.

- [ ] **Step 1: Write the failing tests** (`tests/scorecard.test.mjs`), with fixture folders made by `writeTree`:
  - an empty folder is `L0`, and its `next` says to add an `AGENTS.md`;
  - a short `AGENTS.md` with commands, boundaries and done is `L1`; a 120-line one fails `instructions-short` and stays at `L0`;
  - adding a skill with a good description reaches `L2`; a name that doesn't match its folder fails `skill-name`, and that holds the level at `L1`;
  - an agent with tools `[read, search]` and the description "Reviews code" reaches `L3`; the same agent with `edit` fails `agent-readonly`;
  - an MCP config with `mcpTools: { s: { error: 'timeout' } }` gives `ok: null` and "not measured", and doesn't block the level;
  - a hook with only `bash` fails `hooks-both-shells`;
  - `apm.yml` with `owner/repo` (no tag) fails `apm-pinned`;
  - a workflow with `permissions: { issues: write }` fails `workflow-readonly`;
  - `HARNESS.md` with owner, layers, threats and budget, plus a pinned `apm.yml`, reaches `L5`;
  - a broken `.mcp.json` is reported in `problems`, without crashing.
- [ ] **Step 2:** Run the tests and expect them to FAIL.
- [ ] **Step 3: Implement `scorecard.mjs`.** Read frontmatter with `kit.parseFrontmatter`. `tools` may be a YAML list or a comma-separated string, as in lab-03's checks.
- [ ] **Step 4: Content test** (`tests/content.test.mjs`). Every level's `sol/` passes every scorecard rule for the layers taught by labs **before** its own lab. These are static rules: MCP rules are `null` there. This shows the reference solutions are clean against the inherited checks. If a reference fails a rule, fix that reference with `sync-seeds`, or explain it in the plan's notes.
- [ ] **Step 5:** Run the tests, expect PASS, and commit: `Scorecard: the harness layers, their rules and the maturity level`.

### Task 5: The X-ray (`u` on the mission screen, `xray` command)

**Files:**
- Create: `labs/_harness/xray.mjs`, `labs/_harness/screens/xray.mjs`, `labs/_harness/tests/xray.test.mjs`
- Modify: `keys.mjs` (`exercise.u` → `xray`, plus a new `xray` state), `tui.mjs`, `linear.mjs`, `start.mjs` (the `xray` command), `tests/tui.test.mjs`, `tests/cli.test.mjs`, `tests/linear.test.mjs`

**Interfaces**

- **`tokens(text)`** = `Math.ceil(chars / 4)`.
- **`measureMcp(dir, servers, { timeout = 5000 })`**:
  - returns `{ [name]: { tools: [...] } | { error } }`;
  - only local `stdio` servers are started, with `kit.mcpClient({ command, args, env, cwd: dir })`. The call is raced against the timeout, and the client is always closed;
  - remote servers return `{ error: 'remote server: not measured' }`.
- **`contextBudget(scan, mcpTools)`** returns `{ every: [{ source, label, tokens|null, note }], whenNeeded: [{ source, label, tokens }], total }`. The sources:
  - **every turn:** `AGENTS.md` and `copilot-instructions.md` (full text); each skill's name and description; each agent's description; each MCP server's tool schemas (the JSON of `{ name, description, inputSchema }`, or `null` and "not measured: <error>"); hooks (always 0, "they run outside the model");
  - **when needed:** each scoped instruction file ("when `<applyTo>` files are involved") and each full `SKILL.md` ("loaded when the model picks it").
- **`artifactMarks(ex, rel, { manifest, brought })`**:
  - 🆕 if the file is not in the level's seed (`chainEntry` starter + inherited, or `exercises[key]`);
  - ✏️ if it is in the seed with a different blob ID;
  - 🧳 if `brought.files` lists it.
- **`xrayReport({ ex, dir, manifest, brought, measure = true })`** is async and returns `{ dir, scan, mcpTools, budget, rules, maturity, marks }`.
- **`xrayLines(report, { W, fmt })`** draws three sections:
  1. **🌳 YOUR HARNESS**: the layer tree, one branch per layer that is there, its files with their marks, and "· nothing yet" for the layers missing below the current maturity;
  2. **🪙 CONTEXT BUDGET**: one bar per every-turn source, with "≈N tokens"; the hooks line "0 · they run outside the model"; then "loaded when needed"; then "≈ characters ÷ 4; real tokenizers differ";
  3. **🏅 MATURITY**: the level and its name, the failing or not-measured rules (❌/➖) with their messages, and "Next: …".

**Steps**

- [ ] **Step 1: Write the failing tests** (`tests/xray.test.mjs`):
  - **The budget:** `AGENTS.md` of 400 characters is ≈100 tokens. A skill counts only its name and description every turn, and its `SKILL.md` size goes under when-needed. The hooks line is 0. A scoped instruction file goes under when-needed with its `applyTo`.
  - **`measureMcp`:** a fixture server lists tools, and a server that never answers gives `{ error: /did not answer|timed out/ }` within 6 seconds. The fixture server is a tiny `.mjs` that answers `initialize` and `tools/list` and is written by the test; another sleeps.
  - **`xrayLines`** at W=76: it contains "YOUR HARNESS", "CONTEXT BUDGET", "≈", "0 · they run outside the model" and "MATURITY · L"; every line is at most 78 wide.
  - **The marks:** with a manifest that seeds `AGENTS.md`, a new skill file gets 🆕, an edited `AGENTS.md` gets ✏️, and a brought file gets 🧳.
- [ ] **Step 2:** Run them and expect FAIL. Implement `xray.mjs` and `screens/xray.mjs`. Run them and expect PASS.
- [ ] **Step 3: The TUI.**
  - `u` on the mission screen opens the `xray` screen. It shows "🔬 Looking at your harness… (MCP servers get 5 seconds)" while it measures, then the report.
  - Keys on that screen: `s` switches between your `src/` and the reference `sol/`; `r` measures again; scroll; `b` back.
  - Remove `RESERVED.exercise`, and keep `RESERVED.home` until Task 8.
  - TUI test: `u` on the fixture level shows the report, `s` switches to "reference", and `b` goes back.
- [ ] **Step 4: The command and linear mode.**
  - `node labs/start.mjs xray lab-04 hard [--sol] [--json]` prints `xrayLines`. `--json` prints the report minus the scan's file texts.
  - Linear mode gets `xray [sol]`.
  - CLI test on the fixture workshop: exit 0 and "CONTEXT BUDGET".
- [ ] **Step 5:** Commit: `X-ray: what your harness adds to every turn, and its maturity level`.

### Task 6: Inherited checks: "🧱 Your harness so far"

**Files:** `xray.mjs` (`inheritedChecks`), `screens/xray.mjs` (`inheritedLines`), `tui.mjs` (the checks screen), `start.mjs` (`test`), `linear.mjs` (`checks`), and the tests.

**Interface:** `inheritedChecks({ ex, dir, catalog, measure = true })` is async.

- **Layers:** those of `LAYERS` whose `lab` is earlier than `ex.labId`, in lab order.
- **Returns:** `{ layers: [{ layer, title, lab, present, rules: [...] }], ok: n, failed: n, notMeasured: n }`, or `null` when no earlier lab teaches a layer (Labs 00 and 01).
- **A missing layer** is `present: false`, shown as "◻ no skill in this folder yet (Lab 02 teaches it)". It is not a failure.
- **MCP measuring** happens only when an earlier lab is Lab 04 or later and the folder has an MCP config.

**Steps**

- [ ] **Step 1: Write the failing tests:**
  - **Unit:** for a lab-05 level with a good `AGENTS.md` and a skill whose name doesn't match its folder, the group lists instructions ✅ and skills ❌. MCP is "◻ not in this folder" when there is no config. Hooks (Lab 05 itself) are not listed.
  - **Excluded from counts (decision 6):**
    - TUI: a `runChecks` dep that passes 1 of 1, on a level whose inherited group has a failure. The checks screen still says "ALL CHECKS PASSED", progress records `checks: 'pass'`, the group "🧱 YOUR HARNESS SO FAR · advisory" is visible below the results, and the counts in the summary line are unchanged (1/1).
    - CLI: `test` on a fixture whose inherited rule fails exits 0, prints "All checks passed" and then the advisory group.
    - `verify` on the same fixture is unchanged: exit 0, and its output does not contain "YOUR HARNESS SO FAR".
- [ ] **Step 2: Implement.**
  - **TUI:** after `runChecks` finishes and `recordChecks` has run, call `inheritedChecks` and store the result in `S.run.inherited`, then render. Until it is ready, show "🧱 checking your harness so far…". The group is drawn after `verdictLines`, never inside `resultLines` or `groupChecks`.
  - **CLI `test`:** await it after `printChecks`, unless `--sol`, in which case use the sol folder anyway. Print it only when there is a group.
  - **Linear `checks`:** the same, as plain lines.
- [ ] **Step 3:** Run the tests and expect PASS. Run `verify --chain --bring` and expect no change. Commit: `Inherited checks: your harness so far, advisory, never counted`.

### Task 7: The agent trace

**Files:**
- Create: `labs/_harness/trace.mjs`, `labs/_harness/tests/trace.test.mjs`, `labs/_harness/tests/fixtures/trace-hook-denial.jsonl` (the spike's run 2, trimmed and scrubbed)
- Modify: `agent.mjs`, `tui.mjs` (the agent screen and history), `linear.mjs` (agent and history), and `tests/agent.test.mjs`

**Interfaces**

- **`parseTrace(stdout)`** returns `{ ok, events, output, timeline, usage }`.
  - Tolerant: it skips lines that don't parse. `ok` means at least one event with a `type` was parsed.
  - `output` is every non-empty `assistant.message.data.content`, joined with `"\n\n"`.
  - `timeline` has one item per `tool.execution_start`, matched by `toolCallId` with its `tool.execution_complete`:
    `{ kind: 'tool'|'denied'|'failed'|'running', tool, summary, by: 'hook'|'permissions'|null, message }`,
    followed by `{ kind: 'answer' }` when there was output.
  - `summary` is the main argument: `path`, `command`, `pattern`, `skill`, `query` or `url`, else the first string. It is cut to 40 characters.
  - `by` is `hook` when the message starts with "Denied by preToolUse hook", and `permissions` otherwise.
  - `usage` sums `modelMetrics[*].usage` from the last `session.usage_checkpoint`: `{ inputTokens, outputTokens, cacheReadTokens, premiumRequests }`, with premium requests from `result.usage`. It is null when there is none.
- **`timelineText(trace, { max = 8 })`** gives, for example:
  `🔧 view README.md ✓ · 🔧 powershell Get-Item … ✓ · ⛔ powershell Remove-Item … (denied by a hook) · 💬 answer · Σ ≈98.6k in / 0.5k out tokens`.
  After `max` steps it says `… N more`.

**Agent runner**

- `copilotArgs` adds `--output-format json` unless `spec.trace === false`, or `extraArgs` already sets `--output-format`.
- After a Copilot case (not a `command` case):
  - `trace = parseTrace(stdout)`;
  - `output` (given to `expect`, and stored) is `trace.output` when `trace.ok`, else the raw stdout;
  - write `trace.json` (`{ timeline, usage }`) next to `stdout.txt`;
  - the case gets `timeline: timelineText(trace)`, `usage` and `traced: true`;
  - the "why" of a non-zero exit uses the parsed output, not raw JSON.

**Steps**

- [ ] **Step 1: Write the failing tests:**
  - **The real fixture:** `output` ends with "Harness check: AGENTS.md loaded". The timeline holds a `view`, a `powershell` ✓ and a `powershell` ⛔ with `by: 'hook'`. Usage `inputTokens` is 98566.
  - **The spike's run 1 shape**, inlined: a permission denial gives `by: 'permissions'` and is shown as "(denied)".
  - **Garbage** gives `ok: false`.
  - **Mixed text and JSON lines** parse the JSON lines.
  - **`copilotArgs`:** it includes `--output-format json` by default; not with `trace: false`; not twice when `extraArgs` has it.
  - **`runAgentChecks`**, with a fake Copilot (`copilotBin` = node, and a `prompt` spec whose fake prints JSONL):
    - `expect` receives the joined output;
    - `trace.json` is written;
    - `result.timeline` is set;
    - with a fake that prints plain text, `output` is that text (the fallback).

    The fake is a `.mjs` in the fixture folder. The spec's `extraArgs` can't replace the binary, so pass `copilotBin: process.execPath`. `copilotArgs` then puts `-p …` first, which node would read as `--print`. Instead, use a small `fake-copilot.mjs` launched through a `.cmd` on Windows and a shell script elsewhere, or give `runAgentChecks` a test-only `copilotBin` pointing at an executable `.mjs` wrapper. Choose the one the existing `agent.test.mjs` fixtures make easiest.
- [ ] **Step 2: Implement** `trace.mjs` and the runner changes.
- [ ] **Step 3: The screens.**
  - The agent screen shows each finished case's timeline under its result line.
  - History, with details open, shows each case's timeline.
  - Linear `agent` and `history` print it.
  - When no JSON could be parsed, the screen shows "(no trace: raw output below)" and the raw stdout, as today.
- [ ] **Step 4: Validate on real runs** (AI credits, capped at 30 each). Run the agent sweep against `sol/` for:
  - lab-00/easy (`firstWord === 'YES'` on the joined output);
  - lab-03/easy (the table, and the read-only case);
  - lab-05/easy (the hook denial in the timeline).

  Expect a pass, and a timeline with ⛔ for lab-05/easy. If lab-00/easy fails because an intermediate message comes first, change that check to read the final message, through a new `answer` field passed to `expect` alongside `output`.
- [ ] **Step 5:** Commit: `Agent trace: JSON events into a timeline; expect still gets the answer text`.

### Task 8: The agent-loop replay (`u` on the home screen, `replay` command)

**Files:**
- Create: `labs/_harness/replay.mjs`, `labs/_harness/replays/bare.jsonl`, `labs/_harness/replays/harnessed.jsonl`, `labs/_harness/screens/replay.mjs`, `labs/_harness/tests/replay.test.mjs`
- Modify: `keys.mjs` (`home.u` → `replay`, plus a new `replay` state; remove `RESERVED`), `tui.mjs`, `linear.mjs` (`replay [bare|harnessed|FILE]`), `start.mjs` (`replay [FILE]`), and the tests

**Fixture format.** The real event shape from the spike: `user.message`, `assistant.turn_start`, `assistant.message`, `tool.execution_start`, `tool.execution_complete`, `assistant.turn_end`, `result`. Two extra events:

- `{ type: 'harness.context', data: { segments: [{ name, tokens }] } }`, where `name` is one of system, instructions, skills, tools, history or prompt;
- `{ type: 'harness.note', data: { text } }`.

A `harness.*` event annotates the next turn.

**Interfaces**

- **`parseRecording(text)`** returns `{ events, problems }`, tolerant.
- **`replayTurns(events)`** returns `[{ n, prompt, context|null, notes: [], calls: [{ id, tool, arguments }], decisions: [{ id, tool, ok, by, message }], results: [{ id, text }], answer|null }]`.
  - Turns come from `assistant.turn_start` and `assistant.turn_end`.
  - The prompt is the `user.message` before turn 1.
  - A plain recording, such as a Lab 00 hard `runs/*.jsonl`, gives turns with `context: null` and no notes.
- **`REPLAYS`** is `[{ id: 'bare', file, title: 'No harness' }, { id: 'harnessed', file, title: 'With a harness' }]`.

**The fixtures** (6–10 turns each, same task: "The build is red. Fix it.")

- **`bare.jsonl`:**
  - the context is system, tools, history and prompt;
  - turn 1 views `grades.test.js` → turn 2 runs `npm test` (red);
  - turn 3 edits `grades.test.js` so it expects the buggy result. The note says "No rule says the test is the source of truth, so the model 'fixes' the test.";
  - turn 4 runs `npm test` (green);
  - turn 5 answers "Fixed: updated the test".
- **`harnessed.jsonl`:**
  - the context adds instructions (`AGENTS.md`, ≈400 tokens) and skills (≈60);
  - turn 1 views `grades.js` → turn 2 runs `npm test` (red);
  - turn 3 runs `rm -rf node_modules && npm ci`, which is ⛔ "Denied by preToolUse hook: Recursive force-deletes…". The note says "The hook runs outside the model: no argument gets past it.";
  - turn 4 edits `grades.js` (`hasPassed` checks the exam grade);
  - turn 5 runs `npm test` (green);
  - turn 6 answers, ending with the canary line.
- **Token numbers:** plausible values from the spike (≈20k a call), with the history growing each turn. The header says they are illustrative and based on a real run.

**`replayLines(rec, idx, { W, fmt })`** shows a turn:

- the 🧠 **CONTEXT WINDOW**: one stacked bar, a block character per segment with its letter, plus a legend with ≈tokens;
- 📨 **THE MODEL WROTE**: the tool call JSON, pretty-printed and wrapped;
- 🛡️ **THE HARNESS DECIDED**: ✅ ran, or ⛔ denied by a hook / by the permission system, with the reason;
- 📥 **ADDED TO THE HISTORY**: the first 4 lines of the result;
- 💬 the answer, on the last turn;
- 📝 the notes.

Without annotations, the context part says "This recording has no annotations: it shows what the model wrote and what the harness did."

**Steps**

- [ ] **Step 1: Write the failing tests:**
  - both fixtures parse with no problems and have 6–10 turns;
  - harnessed turn 3 has a denial with `by: 'hook'`;
  - bare has no instructions segment, and harnessed does;
  - the trimmed spike fixture replays with `context: null`;
  - `replayLines` at W=76 fits in 78 columns and shows the four headings.
  - TUI: `u` on home opens the replay; → steps; `tab` switches to the other recording; `b` goes back home.
  - CLI: `replay` without a terminal prints "Turn 1" … for the harnessed recording; `replay --bare` (or an argument `bare`) prints the bare one.
- [ ] **Step 2:** Implement, then run the tests and expect PASS.
- [ ] **Step 3: The keys** on the `replay` state: `left`/`right` step; `tab` switches the recording; up, down, page up, page down and space scroll; `b`, escape and backspace go back. Add `home.u` and remove the reservation.
- [ ] **Step 4:** Commit: `Replay: step through an agent run, turn by turn, with and without a harness`.

### Task 9: Docs and the Lab 00 demo

- [ ] **Step 1: Lab 00's guide.** In "🔬 Under the hood", add "Watch it: press **u** on the home screen (or run `node labs/start.mjs replay`) and step through a run with ←/→. Press tab to compare it with a harnessed run."
- [ ] **Step 2: The workshop readme.**
  - The key table gets **u** (X-ray). The "Everywhere" line gets **u** on the home screen (replay).
  - A paragraph covers the X-ray, maturity, "🧱 Your harness so far" (advisory) and the agent trace.
  - The command list gets `xray` and `replay`.
  - The agenda's 10–98 row says the Lab 00 under-the-hood slot uses the replay.
  - Facilitators: present with `replay`.
- [ ] **Step 3:** `docs.test.mjs` already checks the key table against `keys.mjs`. Add: the readme mentions `replay` and `xray`, and Lab 00's guide mentions the replay.
- [ ] **Step 4:** Commit.

### Task 10: Verify, review and report

- [ ] **Step 1:** Run the unit tests and `verify --chain --bring`, and expect both green.
- [ ] **Step 2: TUI smoke test** in a real terminal at 80×24, plus screenshots at 120×40. Cover:
  - the X-ray on lab-04/easy (MCP measured) and on lab-05/hard;
  - the inherited group after a pass on lab-05/easy (src copied from sol in a throwaway copy);
  - the replay with both recordings;
  - `NO_COLOR` and `--no-anim`.
  - Extend the NO_COLOR subprocess test with `u` on home and on a level.
- [ ] **Step 3:** Get an independent code review, and fix each real finding with a test.
- [ ] **Step 4:** Add implementation notes to this plan, commit, report to the coordinator, and wait.

## Self-review

- **Spec §5.7 Phase 3:**
  - X-ray: Task 5 (layer tree, budget, scorecard and maturity);
  - inherited checks: Task 6;
  - agent trace after a spike: the spike above and Task 7;
  - replay with 2 fixtures: Task 8;
  - the Lab 00 demo: Task 9.
- **Spec §5.5:** the scorecard and maturity are Task 4, and the inherited checks are Task 6.
- **Spec §5.9:**
  - the MCP timeout gives "not measured" (Task 5);
  - unparseable JSON gives raw stdout (Task 7).
- **Spec §5.8 modules:** `scorecard.mjs`, `xray.mjs`, `trace.mjs` and `replay.mjs` all have tests.
- **Coordinator decisions:**
  - 1 → Task 1;
  - 2 → Task 2;
  - 3 → Task 3;
  - 4 → the spike section;
  - 5 → Task 5;
  - 6 → Task 6 Step 1;
  - 7 → Task 8.
- **Names used across tasks:** `LAYERS`, `scanHarness`, `scorecard`, `maturity`, `measureMcp`, `contextBudget`, `xrayReport`, `xrayLines`, `inheritedChecks`, `inheritedLines`, `parseTrace`, `timelineText`, `parseRecording`, `replayTurns` and `replayLines`.
