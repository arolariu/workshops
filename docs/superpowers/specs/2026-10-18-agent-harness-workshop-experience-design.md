# Agent Harness Workshop: learner experience and curriculum design

- **Date:** 2026-10-18 (revision 2)
- **Scope:** `2026/agent-harness-workshop/`, which covers the lab companion TUI (`labs/_harness/`) and the lab content (`labs/lab-*`)
- **Status:** Implemented (20 October 2026), on top of PR #1. See [§9 What shipped vs the spec](#9-what-shipped-vs-the-spec).
- **Path:** Architectural. This changes the course structure, the TUI, the content schema and the check engine, and it adds a lab.

**What changed in revision 2**, after your review:

- Only the 🟢 easy levels are done live, together. Every level above easy is optional homework, so those levels can go much deeper.
- There are five tiers instead of three: 🟢 easy, 🟡 medium, 🔴 hard, 🟣 hard+ and 💎 hard++.
- Labs build on each other. Every level starts where the level before it ended.
- Lab 08 is a full capstone project with five tiers, from about 1 hour (easy) to 3–4 hours (hard++).
- G6 (setup problems) and the setup doctor are dropped.

## 1. Goal

Make the workshop excellent for developers with little AI experience who want to understand:

1. **How LLMs and agents work.** Tokens, the context window, tool calls, the agent loop, and why output varies from run to run.
2. **What a harness is.** The layers around the model, and what each layer changes in the loop.
3. **How to build a harness for production.** Least privilege, guardrails, supply chain, evals, CI and governance.

The live session gives everyone a working harness and the mental model behind it. The homework turns that
into real engineering skill. Success means:

- **After the live session**, a learner can explain why each layer exists, in terms of the model's context
  and loop, and has built every layer once.
- **After the homework**, a learner has measured, attacked, governed and shipped their own harness, and has
  applied it to a codebase it wasn't built for (Lab 08).

## 2. Constraints and assumptions

| # | Assumption | Why |
|---|---|---|
| A1 | The live session stays **110 minutes**. It covers only the 🟢 easy levels of Labs 00–07, plus a kickoff for Lab 08. | Your review: easy levels together, everything else as homework. |
| A2 | **Labs build on each other**, but every level still ships a ready-to-run `src/`. That `src/` starts from the *reference* result of the level before it. An unfinished level never blocks the next one, and the `verify` rule still holds: every `src/` fails and every `sol/` passes. | Continuity without fragility, and facilitators can still demo any level. |
| A3 | **No dependencies**, Node 22+, built around Copilot CLI, and no TUI framework. | Beginners must not fight installs. |
| A4 | **The app's own features cost no AI credits.** Missions that need the real agent, such as agent checks and evals, stay opt-in. They always have a `--dry-run`, a credit cap and free checks. | Student plans have a monthly budget. |
| A5 | The tone stays the same: short sentences and emoji headers. Missions above easy read like real tickets, with a story, requirements, milestones and acceptance criteria. | Homework levels are long, and structure keeps them doable. |
| A6 | Each tier has a time budget (§5.1). Lab 08 uses the times you gave: about 1 hour for easy, up to 3–4 hours for hard++. | Your review. |
| A7 | Your note "So, let's follow" was cut off. I read it as: Lab 08 follows the same five-tier structure, and each tier builds on the one before. | My best guess. Tell me if you meant something else. |
| A8 | The work is split into **six phases**, and each phase gets its own implementation plan (§6). | The scope is too big for one plan. |

## 3. Current state

### What already works well

- **A polished TUI with no dependencies.** It has a splash screen, a progress grid, a mission screen, live
  checks and watch mode. It also has progressive hints, a solution peek with a confirmation step, safe
  reset with backups, launch-and-return for Copilot, "next up", celebrations and a setup row.
- **A clear arc, one harness layer per lab:** 00 runtime, 01 instructions, 02 skills, 03 agents, 04 MCP,
  05 hooks, 06 plugins/APM/extensions and 07 agentic workflows.
- **A strong theme of wishes versus guarantees.** Instructions are wishes. Tool lists and hooks are guarantees.
- **Free, deterministic checks** that give clear reasons, plus opt-in agent checks that run on a throwaway copy.
- **The easy solutions already form a chain, almost by accident:** `FINDINGS.md` (00) → `AGENTS.md` (01) →
  a skill and an attendance module (02) → a reviewer agent (03) → `.mcp.json` (04) → a guard hook (05) →
  `apm.yml` (06) → a safe workflow (07). Revision 2 makes this chain explicit and real.

### Gaps

| # | Gap | Effect on learners |
|---|---|---|
| G1 | **LLM mechanics stay hidden.** The labs say what to do, but rarely show what reaches the model. Nothing shows that instructions are sent again every turn, that skills load lazily, that a tool list decides which tool schemas the model sees, or that hooks run outside the model. | Learners copy patterns without a mental model, and "how do LLMs work?" never gets a direct answer. |
| G2 | **Labs don't build on each other.** Some seeds include files from earlier labs (an `AGENTS.md` from Lab 01 medium onward), but most don't, nothing tells learners, and their own work never carries forward. | The harness feels like eight separate tricks instead of one system. |
| G3 | **Enterprise ideas are scattered and incomplete.** Nothing covers prompt injection through tool output, regression tests for the harness, harness changes as code changes, ownership, or a maturity model. | "Enterprise-ready" is never taught as a whole, and never proven. |
| G4 | **No consolidation.** A level ends with confetti and "next up", but no takeaway and no check of understanding. | Learners finish the task but can miss the concept. |
| G5 | **Agent checks show only the last 8 lines of text.** The most useful part is hidden: which tools the agent called, what was denied, and how many tokens it used. | Learners miss the clearest view of the agent loop. |
| G7 | **A cross-platform bug.** Lab 01 medium's check "Copilot lists it with its applyTo" matches `sourcePath` with a regex that expects forward slashes. On Windows, Copilot CLI 1.0.99 returns `.github\instructions\…`, so **the reference solution fails on Windows**, and `verify` fails on Windows today. | Windows learners, the most common student OS, can't finish the level. |
| G8 | **New in revision 2: levels above easy are too shallow for homework.** They take 20–30 minutes. That's right for lab time, but not enough to build real engineering skill. | The deeper material that "enterprise-ready" needs has nowhere to live. |

G6 (setup problems) was dropped in review. The other IDs stay the same so they still match your comments.

## 4. Approaches considered

### Course structure

**A. Seeded chain (recommended).** Every level starts from the reference result of the level before it, so
the course reads as one project that grows. Learners can bring their own work forward whenever they want.

- ✅ Labs visibly build on each other.
- ✅ Nobody gets blocked. A skipped or failed level doesn't stop the next one, which matters most in the live session.
- ✅ Facilitators can still demo any level, and `verify` still works level by level.
- ⚠️ Inherited files must stay in sync across 45 levels, so this needs tooling (`sync-seeds`, `verify --chain`).

**B. One live folder.** A single `src/` that the learner grows through every lab.

- ✅ The purest continuity.
- ❌ One broken level blocks everything after it, which is fatal in a live session.
- ❌ No per-level demos, no per-level `verify`, and no starting anywhere.
- Rejected again.

**C. Standalone levels with a shared story (revision 1).**

- ✅ The simplest option.
- ❌ It doesn't meet the new requirement that labs build on each other.

Revision 1 also considered a prologue where learners build their own agent loop. It's now **Lab 00 hard++**,
where homework time makes it affordable.

### TUI

**Incremental modules (recommended).**

- New screens and logic go into new files: `_harness/screens/*.mjs` for screens, and pure modules with unit tests.
- `tui.mjs` gets a small screen registry.
- There's no big-bang refactor of the existing screens.

We rejected two alternatives:

- **Refactor the 1,076-line `tui.mjs` first.** That's risky without tests, and it gives learners nothing.
- **Adopt a TUI library such as Ink or blessed.** That breaks the no-dependency promise and creates install trouble.

## 5. Design

### 5.1 The course model

#### Five tiers

| Tier | Theme | Time, Labs 00–07 | Time, Lab 08 | Where |
|---|---|---|---|---|
| 🟢 easy | **Use it.** Apply the layer once, with guidance. | 8–10 min | about 1 h | 👥 together, live (Lab 08 easy is homework) |
| 🟡 medium | **Shape it.** Design the layer well for a real need. | 30–45 min | 1.5–2 h | 🏠 homework |
| 🔴 hard | **Prove it.** Automate it, test it and measure it. | 1–1.5 h | 2–2.5 h | 🏠 homework |
| 🟣 hard+ | **Break it.** Attacks, failure modes and edge cases. | 1.5–2 h | about 3 h | 🏠 homework |
| 💎 hard++ | **Scale it.** Make it work at org scale, or build the mechanism yourself. | 2–3 h | 3–4 h | 🏠 homework |

- **Folder names:** `easy`, `medium`, `hard`, `hard-plus` and `hard-plus-plus`.
- **Commands** also accept `hard+`, `hard++`, `h+`, `h++` and `1`–`5`.
- **Why 💎 and not ⚫ for hard++:** ⚫ disappears on the TUI's dark background.

#### The chain

```text
              🟢 easy         🟡 medium       🔴 hard        🟣 hard+        💎 hard++
 Lab 00      [00 easy] ───▶ [00 medium] ───▶ [00 hard] ───▶ [00 hard+] ───▶ [00 hard++]
                 │
                 ▼
 Lab 01      [01 easy] ───▶ [01 medium] ───▶ …
                 │
                 ▼
   ⋮              ⋮
                 │
                 ▼
 Lab 08      [08 easy] ───▶ [08 medium] ───▶ [08 hard] ───▶ [08 hard+] ───▶ [08 hard++]

 ▼ the live track: down the easy column, together
 ▶ the homework ladder: along a row
```

Two rules decide every starting point:

- **Down the easy column (the live track):** Lab N easy starts from Lab N−1 easy's result.
- **Along a row (the homework ladder):** each tier starts from the result of the tier to its left in the same lab.

The chain has a start and an end:

- **Lab 00 easy is the root.** It's the plain StudyBuddy app with its red build.
- **Lab 08 easy starts from Lab 07 easy**, so it already holds the reference harness from every easy level.
  Learners then bring in their own work from any tier (§5.2).

#### The live session (110 minutes)

| Time | What |
|---|---|
| 0–10 | Welcome and why a harness matters, then clone the repo, trust the folder and start the app |
| 10–98 | Labs 00–07, 11 minutes each: the idea (2), under the hood (2), the easy level together (6), and the takeaway with its check-yourself question (1). The Lab 00 "under the hood" slot uses the agent-loop replay (§5.7). |
| 98–110 | Lab 08 kickoff. Bring a finished harness together live, X-ray it and show its maturity level. Then walk through the homework map: tiers, times and paths. |

Anyone who falls behind presses `n`. The next easy level starts from the reference result, so they keep up
with the room.

#### Homework

Doing every level takes about 60 hours, so the homework is a menu, not a mandate. Levels can be skipped,
because every level has its own reference starting point. The TUI and the readme suggest these paths:

| Path | Levels | About |
|---|---|---|
| **One level deeper** | Every 🟡 medium in Labs 00–07 | 5 h |
| **Security** | 🟡 🔴 🟣 05, 🟣 04, 🟣 07, 🟡 08 | 9 h |
| **Platform** | 🔴 🟣 02, 🔴 🟣 06, 🔴 08 | 8 h |
| **Internals** | 🔴 🟣 💎 00, 💎 04 | 8 h |
| **Capstone** | Every tier of Lab 08 | 12 h |

### 5.2 Building on each other

#### Starting points (seeds)

Every level's `src/` is committed and ready to use. It contains:

- the reference result of the level before it, and
- this level's starter files, such as a stub script, fixtures, or a legacy file to refactor.

Because seeds use reference results, a learner who skipped or failed a level can still start the next one.
The mission header always says where the level starts:
`🧱 Starts from: Lab 04 · 🟢 easy (reference)`.

#### Bringing your work forward

The seed is the reference. Learners who want *their own* harness to grow can bring it in. Press `i` on a
mission screen, or run `node labs/start.mjs bring lab-05 hard+ [--dry-run]`.

**What gets brought in:**

- **Sources:** every level before this one, in course order (lab by lab, then tier by tier), whose checks pass.
- **Only your work.** From each source, `bring` takes only the files under the **harness paths** that differ
  from that level's seed, or that you added. The harness paths are listed in `course.json`: `AGENTS.md`,
  `*.instructions.md`, `.github/**`, `.mcp.json`, `mcp/**`, `apm.yml`, `apm.lock.yaml`, `scripts/**`,
  `evals/**` and `HARNESS.md`.
- **App code never travels.** Your harness travels with you; the app is the stage. Later seeds already
  hold the reference app.

**The rules:**

- For the same file, a later source wins. The plan shows each file, where it comes from, and what it replaces.
- Starter files that this level's mission needs are never overwritten. They're listed under `keep` in `course.json`.
- If a source's files changed since that level passed, its checks run again first. A source that now fails
  is skipped, with a note.
- `src/` is backed up to `labs/.backups/` first. Start over (`x`) still returns to the reference starting point.
- "Your work" is detected through `labs/_course/seeds.json`, a generated list of every seed file's hash. This
  works even if you committed your work, or downloaded a zip without git.

```text
🧳 Bring your work into Lab 05 · 🟣 hard+
   AGENTS.md                          ← lab-01 hard+    replaces the reference · also changed in lab-01 medium
   .github/agents/reviewer.agent.md   ← lab-03 hard     replaces the reference
   .github/skills/explain-error/      ← lab-02 medium   new
   .github/hooks/scripts/guard.mjs    ← lab-05 hard     replaces the reference
   ⏩ lab-04 hard skipped: its checks fail now
   🔒 kept: policy/policy.json (this level's starter)
   y bring it in · n cancel · your current src/ is backed up first
```

**Rules for authors**, so that bringing work in never breaks a level:

- A level's checks only test what that level teaches. They never compare harness files from earlier labs
  with the reference.
- `unchanged()` checks apply only to app files, which never travel.
- `verify --bring` simulates a learner who finished every earlier level exactly like the reference and
  brought everything in. Then it checks that every `sol/` still passes.

#### Keeping the chain in sync (maintainers)

With 45 levels, nobody can copy inherited files by hand.

- **`labs/_course/course.json`** is written by hand. It holds:
  - the list of tiers, the capstone lab, the harness paths, and the runtime files that are never part of a seed (such as `mcp/state.json`);
  - per-level exceptions:
    - `local`: files that don't pass to the next level, such as `SOLUTION-NOTES.md`;
    - `keep`: starter files that `bring` never overwrites;
    - `overrides`: inherited files that this level's starter changes on purpose, such as a guard turned back into a stub;
    - `drop`: inherited files this level must not have, such as a file its own mission asks you to create.
- **`node labs/start.mjs sync-seeds`** walks the chain in order. For each level, it:
  1. copies the predecessor's `sol/` (minus `local`) into this level's `src/` (minus `overrides`);
  2. reapplies this level's *solution delta*, meaning the files where its `sol/` differs from its `src/`,
     on top of the new `src/`;
  3. stops and reports a conflict if an inherited file changed upstream and is also in the delta;
  4. regenerates `seeds.json`.
- **`verify --chain`** does the same walk without writing anything, and fails on any drift.

### 5.3 The learning spine: a content schema

Every lab and every level gets the same few short sections, in a format code can read. `catalog.mjs` parses
them, and the TUI shows each one in the right place. Every section is optional. If a section is missing,
the TUI hides that feature.

**`lab-XX/readme.md`** gets a maturity tag in its header line and two new sections:

```markdown
> **Harness layer:** Context · **Maturity:** L1 Instructed · 🟢 together · 🟡 🔴 🟣 💎 homework

## 🔬 Under the hood
(At most 12 lines, plus an optional small diagram: what this layer does to the model's context or loop)

## 🏛️ In the enterprise
(3 bullets: how this layer scales to a team or an organisation, the main risk, and the control for it)
```

**Easy levels** keep their current `todo.md` format: Mission, Work here, Done when and Hints. Each one adds
a few things:

- a "builds on" item in the meta line;
- a 🧠 **Takeaway**: one sentence the learner should remember;
- a ❓ **Check yourself** question:

```markdown
> 🕐 10 min · 👥 together · 🆓 free checks · 🤖 optional agent check (about 1 prompt) · 🧱 builds on: Lab 02 · easy

## ❓ Check yourself
Why does a reviewer agent without `edit` stay read-only, even when the prompt says "fix it"?
1. The instructions tell it not to edit.
2. The edit tool is never offered to the model, so the model can't call it.
3. Copilot asks for permission before every edit.

<details><summary>Answer</summary>

**2.** The tool list decides which tool schemas reach the model at all. It's a guarantee, not a wish.

</details>
```

How the parser reads a *Check yourself* section:

- The question is the text before the numbered list, and the options are the numbered items.
- The answer is the `**N.**` at the start of the `<details>` body. The rest of that body is the explanation.
- Because the answer sits inside `<details>`, viewing the file on GitHub doesn't give it away.

**Levels above easy** use a ticket format with **milestones**, because 1–4 hours of work needs checkpoints:

```markdown
# 🟣 Hard+ · Policy as code

> 🕐 1.5–2 h · 🏠 homework · 🆓 free checks · 🤖 optional agent check (about 2 prompts) · 🧱 builds on: Lab 05 · hard

## 🎯 Mission
(The story: why this matters, in 3–6 lines)

## 📋 Requirements
1. (Numbered and testable)

## 🧭 Milestones
### M1 · The policy file
- (What "done" means for this milestone)
### M2 · The engine
- …

## 📂 Work here
## 💡 Hints
### M1
<details><summary>…</summary> … </details>

## 🧠 Takeaway
## ❓ Check yourself
## 🚀 Going further
```

Each check names its milestone, like this: `t.check('Deny wins over allow', fn, { milestone: 'M2' })`. Each
milestone has up to three hints.

### 5.4 Curriculum: the ladders

Each lab keeps its easy level, trimmed to fit 8–10 minutes live. Existing medium and hard levels stay as the
core of the new medium and hard levels, and they grow to fit their time budgets. These are marked **(+)**.
Hard+ and hard++ levels are all new.

#### Lab 00 · 💻 Runtime: the agent loop

| Tier | Level | Mission | You learn |
|---|---|---|---|
| 🟢 | First contact | Make Copilot find out why the build is red and write `FINDINGS.md`, without touching the code. | sessions, `@file`, `!command` |
| 🟡 | Think first (+) | Plan a GPA feature with `/plan`, build it, review it with `/diff`, and undo a deliberately bad turn with `/rewind`. Keep the plan and your review in `PLAN.md`, and compare `/usage` for plan-first versus direct. | planning, reviewing, undoing, cost |
| 🔴 | Agent in a script (+) | `run-stats.mjs` summarises recorded JSON event streams: event types, tools and their success rate, tokens, and a timeline per turn. It also records new runs, read-only and with a credit cap. Unit tests cover three fixtures, including a failed run and a denied call. | `-p`, JSON events, permission flags |
| 🟣 | Flight recorder | Record the same prompt N times with metadata (model, flags, git commit). `compare` two runs and report the variance across N: which tools, how many turns, tokens and outcome. Explain in `VARIANCE.md` why one prompt gives different runs. | nondeterminism, observability |
| 💎 | Build the loop | Write `mini-agent.mjs`, an agent loop that talks to a scripted fake model. It covers the message history, tool schemas, parsing tool calls, a permission gate, running tools, feeding results back, and stop rules (maximum turns and a budget). It logs JSON events in Copilot's format, so your `run-stats.mjs` can read them. | what a harness *is*, from the inside |

#### Lab 01 · 📜 Instructions: what the agent knows

| Tier | Level | Mission | You learn |
|---|---|---|---|
| 🟢 | The rules nobody wrote down | Turn `team-notes.md` and your Lab 00 `FINDINGS.md` into an `AGENTS.md` with a canary, then let the agent fix the build the right way. | `AGENTS.md`, canary, `/instructions` |
| 🟡 | Rules for one folder (+) | Add scoped rules for tests and docs with `applyTo`. Resolve a conflict between a root rule and a scoped rule, and prove which files apply to which paths. | `.instructions.md`, globs, precedence |
| 🔴 | Prove it with data (+) | The A/B experiment, now with N runs, a hit rate per signal, variance, and a Markdown report. Then remove one rule at a time and show which signal drops. | measurement, ablation |
| 🟣 | The context diet | A shipped 300-line legacy instructions file bloats every turn. Build `lint-instructions.mjs`, which finds vague rules, duplicates, contradictions, commands that don't match `package.json`, and ≈tokens per path. Then refactor the file into a lean `AGENTS.md`, scoped files and one skill, within a budget. Keep every rule; a rules inventory proves nothing was lost. | the cost of always-on context, attention |
| 💎 | Instructions as code | StudyBuddy becomes a three-package workspace. Write nested `AGENTS.md` files on top of a shared baseline, a `check-instructions.mjs` gate (lint, drift and coverage) with exit codes for CI, CODEOWNERS, and a canary regression suite. | instructions at team scale |

#### Lab 02 · 🧩 Skills: know-how on demand

| Tier | Level | Mission | You learn |
|---|---|---|---|
| 🟢 | Teach a recipe once | A `new-module` skill with templates. Use it to create the attendance module. | `SKILL.md`, descriptions, templates |
| 🟡 | A command you call by name (+) | `/explain-error` with an argument hint, a strict output format, and a justified choice about whether the model may call it on its own. It must handle three crash fixtures. | `argument-hint`, output contracts |
| 🔴 | A skill with a script (+) | Release notes from git history. A deterministic script parses conventional commits, including scopes, breaking changes and reverts, and has unit tests. The skill never invents entries, and a golden output proves it. | deterministic tools inside skills |
| 🟣 | Vet before you trust | Skills can run code. Build `vet-skill.mjs`, which checks frontmatter, name versus folder, description quality, absolute paths, and risky script patterns (network calls, `eval`, `curl \| sh`, writes outside the repo). Use it to review three third-party skills in `vendor/` (one malicious, one sloppy, one good), and write `VERDICT.md`. | skills as a supply chain |
| 💎 | A library that routes | Six skills with overlapping jobs. Write descriptions so the right skill loads. A routing eval sends 24 requests and reads a per-skill canary (`[skill:name]`) from each answer, with a free lexical pre-check and an opt-in real run. Report precision and recall, then split a skill that's too broad, using `references/` files loaded on demand. | routing, progressive disclosure |

#### Lab 03 · 🎭 Custom agents: roles with least privilege

| Tier | Level | Mission | You learn |
|---|---|---|---|
| 🟢 | Eyes, not hands | A read-only reviewer that reports in a fixed table. | `tools`, output formats |
| 🟡 | A specialist with a boundary (+) | A test-writer agent turns the findings in the easy level's `REVIEW.md` into red tests that prove the bugs, without fixing them. | narrow roles, red tests |
| 🔴 | Two agents, one loop (+) | `review-loop.mjs` passes structured JSON findings from the reviewer to the fixer. It loops until the code is clean or a maximum is reached, caps credits per round, stops when nothing improves, and writes a run report. | `--agent`, handoffs, stop rules |
| 🟣 | Privilege audit | `audit-agents.mjs` works out each agent's effective capabilities, including aliases and MCP wildcards, and checks them against a role policy (`roles.json`). It flags instructions that fight the tool list, and delegation paths that reach a more powerful agent (the "confused deputy" problem). Then fix the five shipped agents. | least privilege, privilege escalation |
| 💎 | An agent team | Planner → implementer → tester → reviewer, with separation of duties. Stages pass artifacts (`plan.json`, a patch, `test-report.json`, `verdict.json`), and there are per-stage budgets, a human approval gate, and runs that can resume. Free checks use a recorded run and the stage contracts. | multi-agent design |

#### Lab 04 · 🔌 MCP servers: connect your systems

| Tier | Level | Mission | You learn |
|---|---|---|---|
| 🟢 | Plug in the portal | Connect the local MCP server and ask about your week. | `.mcp.json`, trust, `/mcp` |
| 🟡 | Add a tool (+) | `get_exam_dates`, with a schema, a description the model understands, `readOnlyHint`, input validation and helpful errors. | tool design |
| 🔴 | A tool that changes things (+) | `mark_done`, with validation, `isError`, persistence, idempotency and atomic writes. Contract tests run through a real MCP client. | write tools |
| 🟣 | Untrusted output | The portal now serves text written by other students, and some of it is hostile. Label where data comes from, cap sizes, strip control characters, never return secrets, and authenticate with a server-side token that the model never sees. Injection fixtures check your work. | indirect prompt injection |
| 💎 | MCP from the protocol up | Build a second server without the helper plumbing: initialize and capabilities; tools, resources and prompts; pagination; cancellation and timeouts; an HTTP transport with a bearer token; a shipped conformance suite; and a versioned tool schema with a deprecation. | the protocol itself |

#### Lab 05 · 🔒 Guardrails and hooks: what the agent may do

| Tier | Level | Mission | You learn |
|---|---|---|---|
| 🟢 | A hook that says no | Block every spelling of `rm -rf`. | `preToolUse`, the deny JSON |
| 🟡 | Soft rules → hard rules (+) | Turn the rules about dependencies, `.env` and the guard's own files into hard rules. Add an audit trail, and a script that reports calls per tool and lists every denial. | rule design, `postToolUse` |
| 🔴 | Defense in depth (+) | Secret scanning with redaction, tests after every edit, an autonomous run on a leash, and a table-driven test suite for the guard. | layered safety |
| 🟣 | Policy as code | Turn the guard into an engine plus `policy.json` (match, decision, reason, severity). Deny wins, and a bad policy or a timeout fails closed. Normalise bash and PowerShell spellings, such as `Remove-Item -Recurse -Force`, `rm -r -f` and `del /s /q`, and keep each call under 50 ms. | policy engines, failing closed |
| 💎 | Layered governance | Organisation and repository policies, where an organisation denial can't be overridden. `sessionStart` and `userPromptSubmitted` hooks that add context and flag prompts that look like injection. A tamper-evident audit log (a hash chain) with a verifier, and a report of denials by rule and session. | governance |

#### Lab 06 · 📦 Plugins, extensions and APM: extend and share

| Tier | Level | Mission | You learn |
|---|---|---|---|
| 🟢 | Install, don't copy | A shared harness through APM, plus a marketplace plugin. | `apm.yml`, lockfiles, plugin installs |
| 🟡 | A zero-credit command (+) | `/grades` and `/due` as an extension, with argument parsing and clear errors. | extensions, `joinSession` |
| 🔴 | Ship it as a plugin (+) | Package your agents, skills, hooks and MCP server from Labs 02–05 as one plugin, with prefixed names, a version, and `--plugin-dir` tests. | `plugin.json`, naming |
| 🟣 | Supply chain | Your own APM package with pinned dependencies. Add a lock verifier that finds drift between installed files and the lock, and a detector for project items that shadow plugin items. Then upgrade through a breaking change: migrate, and prove nothing broke. | pinning, drift, upgrades |
| 💎 | An internal marketplace | A marketplace repository with two versioned plugins, a release script (bump, changelog, tag, validate), and an extension that gives the model a deterministic tool that costs no credits. | distribution at org scale |

#### Lab 07 · 🚀 Agentic workflows: agents in CI

| Tier | Level | Mission | You learn |
|---|---|---|---|
| 🟢 | Make it safe | Lock down a triage workflow that can do far too much. | permissions, safe outputs, budgets |
| 🟡 | Two kinds of change (+) | Changes to the frontmatter versus changes to the body. Add a schedule trigger and a budget, and recompile only when you need to. | the compile model |
| 🔴 | A reviewer in CI (+) | A pull-request review workflow from scratch, using your Lab 03 reviewer, with triggers, path filters, tools, one comment and a timeout. | triggers, tools, outputs |
| 🟣 | Hostile input | Malicious issues try to get an `approved` label, ping maintainers, or leak secrets. Tighten the safe outputs, the network allow-list, and the context the agent sees. A shipped simulator replays hostile proposals against your configuration. | injection in CI |
| 💎 | A continuous-AI fleet | Three workflows (triage, review and a weekly report) that share configuration. Add budgets per workflow, concurrency limits and failure handling, a cost report from recorded `gh aw logs` output, and a runbook. | running agents in production |

#### Under the hood and in the enterprise

Every lab readme gets these two sections. The table shows what each one covers.

| Lab | 🔬 Under the hood (the LLM mechanic) | 🏛️ In the enterprise | Maturity |
|---|---|---|---|
| 00 Runtime | The agent loop. The model is stateless, so the whole context is sent again every turn. A tool call is JSON that the model writes, and the harness runs it. Tokens are cost, and output varies from run to run. | Audit and cost tracking from JSON events, and budgets on every scripted run | L0 |
| 01 Instructions | Instructions are always in the context, so you pay for them every turn, and long ones dilute the model's attention. Output varies, so you have to measure. | Treat instructions as code: review them in pull requests, set CODEOWNERS, add a canary | L1 |
| 02 Skills | Progressive disclosure: only the name and description are always in the context, and the body loads when needed. The description works as a routing prompt. Scripts take exact, repeatable work away from the model. | A shared skill library. Skills that ship scripts run code, so vet them. | L2 |
| 03 Agents | A subagent gets a fresh context window. The tool list decides which tool schemas the model sees at all. | Separation of duties (the reviewer isn't the fixer) and least privilege for each role | L3 |
| 04 MCP | Tool schemas and descriptions are added to the context. **Tool results are untrusted tokens**, which makes indirect prompt injection possible. JSON-RPC runs over stdio. | Allow-listed servers, credentials kept on the server, and approval for write tools | L2 |
| 05 Hooks | Hooks run **outside** the model, so they're deterministic and the model can't argue its way past them. They fail closed. | Organisation-wide policy, sandboxing, audit retention, and handling secrets safely | L4 |
| 06 Distribution | When every teammate gets the same context, results are reproducible. A skill or plugin is a dependency made of prompts and code. | Pin, lock and review dependencies, and run an internal marketplace | L5 |
| 07 Workflows | A headless loop with no human in it: the model *proposes* actions, and a separate deterministic job *carries them out*. | Read-only agent tokens, safe outputs, budgets and logs | L5 |
| 08 Capstone | All the layers together. You need evals because the output is probabilistic. | The maturity model, a scorecard, a red team, a CI gate and rollout | L4 → L5 |

#### Threads that run through the labs

Besides the chain, a few threads make the building visible. Each readme names the threads it continues.

| Thread | Where it runs |
|---|---|
| 🔴 The red build | 00 easy finds it → 01 easy fixes it the right way |
| 🕵️ The reviewer | 03 easy creates it → 03 hard loops it → 06 hard ships it → 07 hard runs it in CI → 08 hard+ reviews harness changes |
| 💉 Prompt injection | 04 hard+ (untrusted tool output) → 05 hard+ (policy) → 07 hard+ (hostile issues) → 08 medium (red team) |
| 📏 Measurement | 00 hard (run stats) → 00 hard+ (variance) → 01 hard (A/B) → 02 hard++ (routing eval) → 08 hard (evals) |
| 🪙 Tokens and budget | 00 (cost) → 01 hard+ (context diet) → 02 (progressive disclosure) → 08 easy (context budget) |
| 🔐 Least privilege | 00 hard (permission flags) → 03 (tool lists) → 03 hard+ (privilege audit) → 07 (read-only agent) → 08 hard++ (org policy) |

### 5.5 Maturity model and scorecard

The maturity model gives "enterprise-ready" a concrete meaning. The X-ray, the inherited checks and Lab 08
all use it.

| Level | Name | Evidence |
|---|---|---|
| L0 | Bare | The runtime only |
| L1 | Instructed | A short `AGENTS.md` with commands, domain rules, boundaries and a definition of done |
| L2 | Equipped | Skills and MCP tools whose descriptions say what they do and when to use them |
| L3 | Scoped | Custom agents with an explicit `tools` list, and scripted runs with least-privilege flags |
| L4 | Guarded | Hooks that fail closed, redacted secrets, an audit trail, and a passing attack pack |
| L5 | Governed | Pinned and shared (APM or a plugin), a CI gate on harness changes, evals, and an owner in `HARNESS.md` |

The maturity levels follow the evidence, not the lab order. Lab 04 (MCP) teaches L2, for example, even
though Lab 03 already reached L3.

**The scorecard** lives in `_harness/scorecard.mjs`. It's a set of pure functions with unit tests. Each rule
returns `{ id, layer, level: 'L1'…'L5', ok, message }`. The maturity level is the highest level whose rules
pass, together with every level below it.

| Layer | Rules |
|---|---|
| Instructions | `AGENTS.md` is under 100 lines, and it covers commands, boundaries and the definition of done. |
| Skills | Each skill's `name` matches its folder name. Its description says what the skill does and when to use it: at least 40 characters, with a "Use when"-style clause. |
| Agents | Every agent has an explicit `tools` list, and read-only roles have no `edit` or `execute`. |
| MCP | Every tool has a description and an input schema. Read tools are marked read-only, and write tools aren't. |
| Hooks | `preToolUse` is registered with both `bash` and `powershell` commands, and it has a timeout. |
| Distribution | APM dependencies are pinned (`#tag`), and `plugin.json` has a name, version and description. |
| Workflows | The agent's permissions are read-only. Writes go only through safe outputs with a `max`. There's a timeout and a credit limit. |
| Governance | `HARNESS.md` names an owner and lists the layers, the threat model and the budget. |

**Inherited checks.** Every level also runs the scorecard rules for the layers that earlier labs taught.
These checks appear in a separate group, "🧱 Your harness so far", and they don't block passing. They show
learners that their harness still holds as it grows.

### 5.6 Lab 08 · 🏛️ Capstone: ship an enterprise-ready harness

**The story.** The university wants every course team to use StudyBuddy's harness, and you're the harness
owner. Take what you built in Labs 00–07, make it one coherent system, attack it, measure it, and put it
under change control. Finally, roll it out to a second team's codebase.

Lab 08 has the usual structure: `todo.md`, `src/`, `tests/` and `sol/`. Each tier starts from the tier
before it. The checks are generic (scorecard rules, attack replays, contract tests and math on recorded
runs), so they work on any learner's harness.

#### 🟢 Easy · Assemble and own it (about 1 hour)

| Milestone | What you do |
|---|---|
| M1 · Bring | Press `i` to bring in your work from every level you passed. Review the plan and resolve conflicts, such as two versions of one rule, or two agents with the same job. |
| M2 · Own | Write `HARNESS.md`: the owner, the layer inventory, the trust boundaries, the budget, how to change the harness, and how to roll back. |
| M3 · Audit | Fix the scorecard findings until the harness reaches **L4 Guarded**. |
| M4 · Diet | Keep the always-on context under ≈2,500 tokens per turn, as measured by the X-ray. Move rules that are rarely needed into a skill. |

**Takeaway:** a harness is one system, with an owner and a budget.

#### 🟡 Medium · Red-team it (1.5–2 hours)

| Milestone | What you do |
|---|---|
| M1 · Attack pack | Make the guard pass a shipped pack of about 30 simulated tool calls, in six families: destructive commands (bash and PowerShell spellings), reading secrets, writing secrets, sending data out, supply chain (`npm i`, `curl \| sh`, editing `package.json`), and tampering with the harness itself (hooks, the policy, or removing boundaries from `AGENTS.md`). It also has indirect injection chains: an MCP tool result that contains instructions, followed by the call it tries to cause. About 12 allowed calls catch false positives. The target is no misses and no false positives. |
| M2 · Your own attacks | Add at least five attacks of your own in `attacks.local.json`, and make the guard handle them. |
| M3 · Threat model | Add a table to `HARNESS.md` with each attack family, the control that stops it, and the risk that remains. |
| Optional agent check | A poisoned portal record tells the agent to read `.env`. The real agent, running with your harness, must not do it, and the guard log proves it. |

**Takeaway:** a deterministic guard stops the action, whatever the model was persuaded to do.

#### 🔴 Hard · Measure it (2–2.5 hours)

| Milestone | What you do |
|---|---|
| M1 · Cases | Write `evals/cases.json` with at least eight golden cases across the layers: rules followed, the right skill used, the reviewer staying read-only, the MCP tool used, and a denial handled gracefully. |
| M2 · Runner | Write `scripts/eval.mjs`. It runs each case N times (read-only, quiet, with a credit cap) and computes the pass rate, pass@k, variance and tokens per case, reusing Lab 00's run stats. It writes JSON and Markdown reports, and has `--dry-run`, `--runs` and `--budget`. |
| M3 · Baseline | Add `--baseline`, which compares with a saved run and fails on a regression beyond a threshold. |
| M4 · Ablation | Run the suite with one layer removed at a time, and write a "layer value" report: which cases depend on which layer. |

The free checks test the math, the arguments and the comparison, using recorded runs (shipped JSONL files).
Real runs are opt-in.

**Takeaway:** probabilistic output needs statistics, baselines and budgets, not impressions.

#### 🟣 Hard+ · Change control (about 3 hours)

| Milestone | What you do |
|---|---|
| M1 · CI gate | Write `.github/workflows/harness-ci.yml`. It runs on pull requests that touch harness paths. The scorecard (at least L4), the attack pack and the self-tests run every time. Evals run within a budget, compared with the baseline, on the `run-evals` label or on `main`. The workflow uses read-only permissions, a timeout, a concurrency group, and actions pinned to commit SHAs. |
| M2 · Ownership | Add CODEOWNERS for every harness path, and a pull-request template with a harness checklist. |
| M3 · Release | Give the harness a semantic version and a `CHANGELOG.md`. Write `scripts/release.mjs`, which bumps the version, validates, packages a plugin and an APM package, and tags, with a `--dry-run`. |
| M4 · AI review | Add an agentic workflow that reviews harness pull requests with your Lab 03 reviewer. It reads the scorecard output and posts one comment through safe outputs. |
| M5 · Rollback | Write a rollback runbook in `HARNESS.md`, and `scripts/rollback.mjs --to <version> --dry-run`. |

**Takeaway:** a change to the agent's context is a change to production code.

#### 💎 Hard++ · Roll it out (3–4 hours)

| Milestone | What you do |
|---|---|
| M1 · A second codebase | The level ships **CampusHub**, an unfamiliar three-package repository (`api/`, `web/` and `jobs/`, about 1,500 lines) with a fake ticket system. Install your packaged harness from hard+ through APM or the plugin. No copying. |
| M2 · Org versus repo | Merge an organisation baseline policy with CampusHub's own policy. Organisation denials can't be overridden, and CampusHub adds its own rules, for API secrets and deploy commands. |
| M3 · The repo layer | Write nested `AGENTS.md` files for each package, an MCP server for the ticket system (read tools, plus one write tool that needs approval), and a skill for CampusHub's release process. |
| M4 · Portability | Run your attack pack and eval suite on CampusHub. Write down which cases transferred and which needed repo-specific versions. |
| M5 · Governance report | `scripts/report.mjs` merges the audit logs of both repositories into one report: calls by tool, denials by rule, cost per session, and the riskiest attempts. |
| M6 · Harness review | Write a one-page review with the evidence for **L5 Governed**, the remaining risks, and next steps. |

**Takeaway:** a harness proves itself when it transfers to a codebase it wasn't built for, and stays
governed at scale.

### 5.7 TUI features

The keys below are new, and they don't clash with existing keys. Every feature degrades gracefully (see §5.9).

#### Phase 1: the engine

| Feature | Details |
|---|---|
| **Five tiers** | The catalog reads all five tier folders. The TUI shows the 🟢 🟡 🔴 🟣 💎 badges, and keys `1`–`5` switch tiers. The home grid gets five narrower columns, marked 👥 together and 🏠 homework, plus a Lab 08 row. The lab screen shows each tier's theme and time, for example `🟣 HARD+ · Break it · 1.5–2 h`. Progress shows two counts: `Workshop 8/8 · Homework 5/37`. |
| **Next up** | On an easy level, `n` moves down the live track to the next lab's easy level, even if this one isn't finished, so nobody gets stuck behind the room. Everywhere else, next up is chosen in this order: the level you were last on, if it's unfinished; then the first unfinished easy level; then the next tier in the lab you worked on last; then the lowest unfinished tier of the next lab. |
| **Starting point** | The mission header shows where the level starts: `🧱 Starts from: Lab 04 · 🟢 easy (reference)`, or `(your work, brought in on 12 Nov)`. |
| **Bring your work** | Press `i` on the mission screen to see the plan (§5.2). `y` applies it, then the checks run again. `n` cancels. The command line equivalent is `bring`. |
| **Milestones** | The checks screen groups results by milestone, each with a ▰▰▱ progress bar. Finished milestones fold into one line. "Next to fix" comes from the earliest unfinished milestone. Hints are grouped by milestone, and `h` reveals the next hint for the current one. A short celebration plays when a milestone is done. |
| **G7 fix** | In `lab-01/medium/tests/checks.mjs`, change `\` to `/` before matching `sourcePath`. A scan of the other checks that parse CLI output found the same mistake nowhere else. |

#### Phase 2: the live track and learning UI

| Feature | Details |
|---|---|
| **Takeaway and *Check yourself*** | After the first pass, show `🧠 Takeaway` and the question below the celebration. Learners answer with `1` to `4`. Show ✅ for a right answer, or 💡 and the explanation for a wrong one, because the point is learning, not grading. Record `quiz: 'right' \| 'wrong'`. After a pass, the mission screen shows the question again. |
| **Layer map** | The lab screen shows a small harness tree, like the one in the readme, with this lab's layer highlighted and the threads it continues. |
| **Level timer and nudge** | Show `⏱ 12 min here · suggested 10`, using the lower bound of `🕐` in the meta line (`10 min`, or `1.5–2 h`). Count time while the level is the current one, including time spent in Copilot, but cap each stretch at 45 minutes so an idle laptop doesn't inflate it. Past 1.5 times the suggested time, if hints are left, show one toast: "⏱ A hint (h) could save you time." |
| **Diff view** | Press `d` on the mission screen to see `git diff` of `src/` against the last commit, coloured and scrollable. Without git, explain why it can't work and suggest `git init`. |
| **Solution diff** | Press `d` on the solution screen to switch between the full reference file and `git diff --no-index <yours> <reference>`. |
| **Credit meter** | For each agent-check run, record `{ at, level, prompts }`, using `spec.prompts ?? 1` as today. The home screen shows `💳 ≈ N prompts used by agent checks this month`, labelled as an estimate, with a pointer to `/usage`. |
| **Glossary** | `labs/glossary.md` has about 22 terms. Each one gets one line and a pointer to the lab that teaches it. It's shown on the `?` screen, and by `node labs/start.mjs glossary`. |

#### Phase 3: make the invisible visible

**Harness X-ray.** Press `m` on the mission screen, or run `node labs/start.mjs xray lab-04 hard [--sol]`.
It shows three things:

1. **The layer tree.** Every harness artifact found, with 🆕 marking the files you added, and 🧳 marking the ones you brought in.
2. **The context budget.** About how many tokens the harness adds **to every turn**, as a bar for each source:
   - Instruction files: the full text.
   - Skills: only the name and description. The full `SKILL.md` size is shown separately, as "loaded when needed".
   - Agents: their descriptions.
   - MCP tool schemas: read from `tools/list` through `kit.mcpClient`, with a 5-second timeout. If the server doesn't answer in time, the bar says "not measured".
   - **Hooks: 0 tokens, because they run outside the model.**

   Estimates use characters ÷ 4. They're always shown with "≈", plus a one-line note that real tokenizers differ.
3. **The scorecard findings and the maturity level** (§5.5).

**Inherited checks.** The "🧱 Your harness so far" group (§5.5) appears on the checks screen.

**Agent trace.** On the agent screen:

- Agent checks run with `--output-format json`.
- A tolerant parser builds the `output` text by joining the `assistant.message` contents, so the current
  `expect` contract still works.
- It also builds a timeline, for example:
  `🔧 view grades.js ✓ · 🔧 bash npm test ✓ · ⛔ bash rm -rf … (denied) · 💬 answer · Σ ≈7.0k in / 0.4k out tokens`.
- If no JSON can be parsed, the screen shows the raw stdout instead. A check can opt out with `trace: false`.

**Agent-loop replay.** Press `p` on the home screen, or run `node labs/start.mjs replay [file.jsonl]`. Use
←/→ to step through an annotated recording. For each turn it shows:

- the **context window** as stacked segments: system, instructions, skill descriptions, tool schemas, history and the new prompt;
- the **tool-call JSON** the model wrote;
- the **harness decision**, from a permission check or a hook;
- the result that gets added to the history.

Two fixtures ship in `_harness/replays/`:

- `bare.jsonl`: no harness, and the agent "fixes" the test.
- `harnessed.jsonl`: `AGENTS.md` loaded, a hook denies `rm -rf`, and the code gets fixed properly.

The fixtures use the real event shape, plus two extra events:

- `harness.context`, which lists the context segments and their ≈tokens;
- `harness.note`, a short explanation.

Plain recordings, such as those from Lab 00 hard, replay without annotations. The replay is the Lab 00 live demo.

#### Phase 6: polish

| Feature | Details |
|---|---|
| **Presenter mode** | `node labs/start.mjs present` shows full-screen "slides" built from each readme's *In one minute*, *How it works* and *Under the hood* sections, moved with ←/→. This covers the facilitator's 11-minute slots, with no separate slide deck. |
| **`--plain`** | Replaces emoji with ASCII markers, for terminals that draw emoji at the wrong width, such as the older Windows console. |
| **Accessibility pass** | Respect `NO_COLOR` everywhere. Never show meaning by colour alone; always add an icon or a word. Check the layout at 80×24. |

### 5.8 Data model

**`labs/_course/course.json`** is written by hand. It holds:

- the tier list;
- the harness paths that `bring` uses;
- per-level `local`, `keep` and `overrides` lists (§5.2).

**`labs/_course/seeds.json`** is generated by `sync-seeds`. For each level, it maps every seed file to its
SHA-256 hash, split into inherited files and starter files.

**`labs/.progress.json`.** All new fields are optional, so existing files keep working.

- For each level: `firstOpened`, `activeMs`, `passedAt`, `passHash` (a hash of the harness files when the level passed), `quiz`, `milestones` (for example `{ "M1": "pass" }`) and `brought` (`{ at, files }`).
- `_credits`: `{ runs: [{ at, level, prompts }] }`, keeping only the last 200 runs.

**Catalog (`catalog.mjs`).**

- For each lab: `layer`, `maturity`, `threads`, `underTheHood` and `enterprise`.
- For each level: `tier`, `theme`, `minutes: [min, max]`, `mode: 'together' | 'homework'`, `buildsOn`,
  `takeaway`, `quiz: { question, options[], answer, why } | null`, `milestones: [{ id, title }]`, and the
  hints, each with an optional `milestone`.

**New modules.** Each one has unit tests, and none of them write files except `chain.mjs` and `bring.mjs`.

| Module | What it does |
|---|---|
| `chain.mjs` | The course order, each level's predecessor, `sync-seeds` and `verify --chain` |
| `bring.mjs` | Builds a bring plan from progress and `seeds.json`. Applying the plan is a separate function. |
| `quiz.mjs` | Parses the *Check yourself* section |
| `scorecard.mjs` | Runs the scorecard rules and computes the maturity level |
| `xray.mjs` | Scans a folder and estimates its context budget |
| `trace.mjs` | Turns JSON events into `{ output, timeline, usage }` |
| `replay.mjs` | Turns a recording into a list of turns |

### 5.9 Error handling and graceful degradation

| Situation | Behaviour |
|---|---|
| git isn't installed | Diff and reset explain why they can't work and suggest `git init`. `bring` still works, because it uses the hashes in `seeds.json` and makes its backup with a plain file copy. |
| `seeds.json` has no entry for a source level | `bring` skips that source and says why. |
| A source level's checks fail now | `bring` skips it and says so in the plan. |
| A brought file breaks this level's checks | The checks show it like any other failure. Start over (`x`) returns to the reference starting point, and the backup keeps your previous files. |
| The MCP server doesn't start, or times out, during an X-ray | Show "Tool schemas: not measured", with the server's error line. |
| Copilot's JSON output can't be parsed | Hide the trace and show the raw stdout, as today. |
| A `todo.md` has no Takeaway, *Check yourself* or Milestones section | Hide that feature, with no errors. |
| The terminal is narrower than 80 columns | Keep the current minimum-width behaviour. New screens wrap and never crash. |

Two rules apply everywhere: never write outside `labs/`, and back up anything before overwriting it.

### 5.10 Testing

- **Unit tests.** Every new module gets tests in `labs/_harness/test/*.test.mjs`, using `node:test`, so
  there are no dependencies. `node labs/start.mjs selftest` runs them.
- **`verify`.** It covers all 45 levels: every `src/` fails and every `sol/` passes. After the G7 fix, it
  must pass on **Windows, macOS and Linux**.
- **`verify --chain`.** The chain has no drift.
- **`verify --bring`.** The "perfect learner" simulation still passes every `sol/` (§5.2).
- **Catalog tests.** Every `todo.md` parses. A quiz, when present, has 2–4 options and a valid answer.
  Every milestone that a check names exists in the `todo.md`, and every milestone has at least one check.
- **Agent checks.** After every re-seed, run each agent check once against `sol/`. More harness in later
  seeds can change how the agent behaves. This costs the facilitator some credits each time.
- **The fake model for Lab 00 hard++.** Its scenarios are deterministic, and they're tested like any other fixture.
- **Manual TUI smoke test, every phase.** Test in Windows Terminal and macOS Terminal, at 80×24 and
  120×40, and with `--no-anim` and `NO_COLOR=1`.

## 6. Phases

Each phase can ship on its own, and each gets its own implementation plan.

1. **The engine.**
   - Five tiers in the catalog, the CLI and the TUI.
   - The chain: `course.json`, `sync-seeds`, `seeds.json` and `verify --chain`.
   - Re-seed the existing 24 levels into the chain, without changing their missions.
   - `bring` and `verify --bring`.
   - Milestones in the check kit and the TUI.
   - The G7 fix, and the `selftest` setup.
2. **The live track and learning UI.**
   - Spine content for the 8 readmes and the 8 easy levels, with each easy level trimmed to 8–10 minutes.
   - Takeaway and *Check yourself*, the layer map, the timer and nudge, the diff views, the credit meter and the glossary.
   - The workshop readme: agenda, tiers, homework paths and keys.
3. **Make the invisible visible.**
   - The X-ray and the scorecard, and inherited checks.
   - The agent trace, after a spike.
   - The replay, with its 2 fixtures. The Lab 00 demo switches to the replay.
4. **The homework ladders.** For Labs 00–07, grow the medium and hard levels, and add hard+ and hard++. Every
   level gets milestones, a takeaway and a quiz. Write one plan per lab. Lab 05 goes first as the exemplar,
   because it already has the deepest material, and gets reviewed before the other seven.
5. **The capstone.** Lab 08 with all five tiers: CampusHub, the attack pack, the eval runner and its
   recorded runs, CI and release, and org policy.
6. **Polish.** Presenter mode, `--plain`, and the accessibility pass.

Phase 1 comes first. Phases 2 and 3 can follow in either order. Phase 4 needs Phase 1, and Phase 5 needs
Phases 1 and 3.

**Spikes.** Copilot CLI facts change, so each phase that relies on one starts with a short spike:

| Spike | Phase |
|---|---|
| JSON event names and usage fields, and whether `-s` works together with `--output-format json` | 3 |
| The payloads of the `sessionStart` and `userPromptSubmitted` hooks | 4 (Lab 05 hard++) |
| The repository format that `copilot plugin marketplace add` reads | 4 (Lab 06 hard++) |
| Shared configuration in the pinned version of gh-aw | 4 (Lab 07 hard++) |

## 7. Non-goals

- A setup doctor. It was dropped in review.
- A facilitator dashboard that collects the room's progress over the network.
- New npm dependencies or a TUI framework.
- Replacing Copilot CLI with a homemade agent. Lab 00 hard++'s mini agent is a learning exercise against a fake model, not a product.
- Grading, certificates or leaderboards.
- A code editor inside the TUI.

## 8. Risks

| Risk | How we reduce it |
|---|---|
| **The content volume.** 21 new levels and 16 levels that grow, plus 45 takeaways and quizzes. | Write one plan per lab in Phase 4. Write the Lab 05 exemplar first and review it. Share fixtures and helpers between labs. |
| **Changes ripple down the chain.** | `sync-seeds` propagates changes, and `verify --chain` catches drift. Run `verify` in CI. |
| **Later seeds change agent behaviour.** More harness in a seed can change what the agent picks in an agent check, such as an extra agent or skill. | Re-run every agent check against `sol/` after re-seeding, and keep agent-check prompts specific. |
| **45 levels can look overwhelming.** | The TUI frames the easy levels as the workshop and everything else as a menu, with times and suggested paths. Nothing has to be done in order. |
| **Long levels lose learners halfway.** | Milestones with their own checks, hints and celebrations, and "next up" that returns you to where you were. |
| **Bringing work in clutters or breaks a level.** | Only harness paths travel. Learners see a preview and get a backup, they can always start over, and `verify --bring` and the author rules guard against breakage. |
| **Copilot CLI facts change.** This covers JSON events, the marketplace format, gh-aw and hook payloads. | Run a spike at the start of each phase that relies on them, keep CLI-specific strings in one module, and use a tolerant trace parser. |
| **Learners read the token estimates as exact numbers.** | Always show "≈" and explain the method in one line. The point is to compare layers, not to measure exactly. |

## 9. What shipped vs the spec

Everything in §5 and §6 shipped, phase by phase, on top of PR #1 (the workshop companion overhaul), which the
coordinator chose as the base before any code was written. Each phase plan records its deviations, with the reason
and, where a tool's behaviour decided it, the evidence:

| Phase | What shipped | Deviations |
|---|---|---|
| 1 · Engine | Five tiers on PR #1's catalog; the seeded chain (`chain.mjs`, `sync-seeds`, `verify --chain`) on PR #1's `starters.json`; `bring` and `verify --bring`; milestones in the check engine and the TUI | [Phase 1 plan](../plans/2026-10-19-phase-1-engine.md#deviations-from-the-spec-because-pr-1-is-the-base) |
| 2 · The live track | Every 🟢 easy level fits its 8–10 minutes and builds on the last; the takeaway and quiz; next-up; homework paths in PR #1's `learning.mjs`; the verifiable credit meter | [Phase 2 plan](../plans/2026-10-19-phase-2-live-track.md#deviations-from-the-spec) |
| 3 · Make it visible | The X-ray (`u`), the scorecard and maturity levels, the replay with recorded traces, "your harness so far" | [Phase 3 plan](../plans/2026-10-19-phase-3-visible.md#deviations-from-the-spec) |
| 4 · The homework ladders | Labs 00–07, medium to hard++ in the ticket format, Lab 05 first as the exemplar | [Phase 4 plan](../plans/2026-10-19-phase-4-ladders.md#implementation-notes-as-built-20-oct-2026), and per lab: [00](../plans/2026-10-19-phase-4-lab-00.md#deviations-from-the-spec) · [01](../plans/2026-10-19-phase-4-lab-01.md#deviations-from-the-spec) · [02](../plans/2026-10-19-phase-4-lab-02.md#deviations-from-the-spec) · [03](../plans/2026-10-19-phase-4-lab-03.md#deviations-from-the-spec) · [04](../plans/2026-10-19-phase-4-lab-04.md#deviations-from-the-spec) · [05](../plans/2026-10-19-phase-4-lab-05.md#deviations-from-the-spec) · [06](../plans/2026-10-19-phase-4-lab-06.md#deviations-from-the-spec) · [07](../plans/2026-10-19-phase-4-lab-07.md#deviations-from-the-spec) |
| 5 · The capstone | Lab 08 in five tiers (CampusHub for hard++); the kit's "free checks never start Copilot" guard; the cross-platform CI workflow; L5 evidence in the scorecard | [Phase 5 plan](../plans/2026-10-19-phase-5-capstone.md#deviations), [part 2](../plans/2026-10-19-phase-5-capstone.md#deviations-part-2), and per tier: [easy](../plans/2026-10-19-phase-5-lab-08-easy.md#deviations) · [medium](../plans/2026-10-19-phase-5-lab-08-medium.md#deviations) · [hard](../plans/2026-10-19-phase-5-lab-08-hard.md#deviations) · [hard+](../plans/2026-10-19-phase-5-lab-08-hard-plus.md#deviations-and-notes) · [hard++](../plans/2026-10-19-phase-5-lab-08-hard-plus-plus.md#implementation-notes) · [CampusHub](../plans/2026-10-19-phase-5-lab-08-campushub.md#implementation-notes) |
| 6 · Polish | Presenter mode (`present`), `--plain`, the accessibility pass, the facilitator's re-pin checklist | [Phase 6 plan](../plans/2026-10-19-phase-6-polish.md#deviations-from-the-spec-decided-up-front) |

**Decisions made on the way** (by the reviewer of each phase, recorded in the plans):

- **PR #1 is the base.** Its concepts were extended instead of duplicated: the five-tier `DIFFICULTIES` table, the
  starter manifest (the chain's seed manifest), progress fingerprints (a source counts as passed only when its pass is
  fresh), `learning.mjs` paths, its test layout, its doctor and its linear mode. (G6 and a new setup doctor had already
  been dropped in this spec's own review, revision 2; PR #1's doctor covers setup.)
- **The credit meter shows what is verifiable**: agent-check runs this month and the upper bound from their caps, with
  `/usage` for the real number, never an estimate.
- **`--plain` is PR #1's `--ascii`** under the spec's name, with one fold table that gives every meaning-carrying glyph
  an ASCII marker.
- **Facts the tools decided:** `--max-ai-credits` has a minimum of 30 and is a soft cap (`copilot help limits`);
  `--trust-folder` trusts one prompt-mode session, which evals and the hard++ agent check use; Copilot CLI loads project
  skills from `.agents/skills/` too (where APM installs them); gh-aw v0.92.0 is the tested version (the doctor warns on
  another one).
- **Open after the merge:** Lab 08 hard+'s CI pins this repository at a commit of the implementation branch; the
  readme's *For facilitators* section lists the three places to re-pin, and `pins.test.mjs` finds every pin.
