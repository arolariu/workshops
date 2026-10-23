# Phase 4 · The homework ladders: overview plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow every 🟡 medium and 🔴 hard level of Labs 00–07 to its tier's time budget, and add 🟣 hard+ and 💎 hard++ to every lab, so the homework ladder of §5.4 is complete (37 levels: 16 grown, 16 new, plus Lab 05 hard+/hard++ inside those counts).

**Architecture:** Content in `labs/lab-XX/<tier>/` (todo.md, src/, sol/, tests/) on top of the Phase 1 chain. Each level starts from the reference result of the tier to its left; `sync-seeds` carries every change down the row. One plan per lab (spec §6): Lab 05 first as the exemplar (`2026-10-19-phase-4-lab-05.md`), reviewed by the coordinator before the other seven fan out.

**Tech Stack:** Node 22+ ESM, `node:test`, the check kit (`labs/_harness/kit.mjs`), no npm dependencies.

**Spec:** `docs/superpowers/specs/2026-10-18-agent-harness-workshop-experience-design.md` (§5.1 tiers and times, §5.3 the ticket format, §5.4 the ladders, §5.10 testing, §6 Phase 4, §8 risks).

## Global Constraints

- **Tier times (§5.1):** 🟡 medium 30–45 min · 🔴 hard 1–1.5 h · 🟣 hard+ 1.5–2 h · 💎 hard++ 2–3 h. A level's `🕐` must sit inside its tier's range.
- **Ticket format (§5.3) for every level above easy:** meta line `> 🕐 … · 🏠 homework · 🆓 free checks · [🤖 optional agent check (about N prompts) ·] 🧱 builds on: Lab XX · <tier>`; then 🎯 Mission (the story, 3–6 lines), 📋 Requirements (numbered, testable), 🧭 Milestones (2–6, `### M1 · Title` with "done" bullets), 📂 Work here, 💡 Hints (`### M1` subsections, **1–3 per milestone**), 🧠 Takeaway (one line), ❓ Check yourself (2–4 options, answer in `<details>`), 🚀 Going further. No "Done when" list on milestone levels.
- **Free checks decide pass/fail.** Every milestone has at least one free check (`{ milestone: 'Mx' }`). They are deterministic: no network, no model, nothing that depends on the learner's machine unless marked `{ env: true }` / `needs: [...]` like the existing checks.
- **The starter fails meaningfully at M1**, not only because a file is missing: skeleton files exist and fail with a message that says what to do.
- **`sol/` passes every check**, including the advisory "🧱 Your harness so far" group (content test), unless the level's plan says it teaches breaking a rule on purpose.
- **Agent checks:** optional, at most **2 prompts per level**, specific enough to be stable. Validation in Phase 4 spends at most **40 prompts in total**, each capped at `--max-ai-credits=30`, and only for levels whose agent check is new or changed.
- **Easy levels stay unchanged** apart from small fixes: they are the live track.
- **Fixtures** are small and committed. Shared fixtures live under `labs/_harness/fixtures/<lab-id>/` only when two labs need them.
- **The chain:** each level's `src/` = its predecessor's `sol/` + its own starter files. Never edit an inherited file in `src/` without an `overrides` entry (with `_why`) in `course.json`. Run `sync-seeds` once at the end of each batch, then `verify --chain --bring`.
- **Windows:** `core.autocrlf=true`; normalise CRLF before comparing text in checks (`t.read` already does).
- **No npm dependencies; tests use `node:test`; the harness tests run with `node --test "labs/_harness/tests/*.test.mjs"`.**

## Coordinator decisions for this phase

1. Checkpoint after the Lab 05 exemplar (all five tiers done, verified, committed): report and wait.
2. Every new or grown level fills its tier's time budget with the §5.4 mission, in the ticket format.
3. Fix the flaky agent checks during the rewrites: lab-01/hard (make the "without instructions" variant honest, e.g. run it in a copy without `AGENTS.md`, or score that difference explicitly) and lab-05/medium (use the timeline to see whether it is the allow list again).
4. Fan-out: one subagent per lab, each editing only its own lab's level folders (and shared fixtures it creates under a lab-named path). I run `sync-seeds` once at the end and resolve any conflicts myself.
5. Plugins in timelines: leave as is; add one readme line in the agent-check section.

## Spikes (§6)

| Spike | Result |
|---|---|
| `sessionStart` and `userPromptSubmitted` payloads (Lab 05 hard++) | **Done, 1 prompt** (see the Lab 05 plan). Order in `-p` mode: `userPromptSubmitted → sessionStart → preToolUse/postToolUse… → agentStop → sessionEnd`. `sessionStart` gets `{ sessionId, timestamp, cwd, source: "new", initialPrompt }` and its `additionalContext` reaches the model. `userPromptSubmitted` gets `{ sessionId, timestamp, cwd, prompt }`; command-hook output is dropped (docs). `preToolUse.toolArgs` is an **object** in the real payload (the kit sends a JSON string; guards must accept both). |
| `copilot plugin marketplace add` repository format (Lab 06 hard++) | At Lab 06 fan-out: docs first (free), `copilot plugin marketplace --help` (free). |
| Shared configuration in the pinned gh-aw (Lab 07 hard++) | At Lab 07 fan-out: docs and `gh aw --help` (free). Checks stay `needs: ['gh-aw'], optional: true` like today. |

## Tasks

### Task 1: The content test for ticket-format levels (harness, TDD)

**Files:**
- Modify: `labs/_harness/tests/content.test.mjs`

**Interfaces:**
- Consumes: `loadCatalog`, `DIFFICULTIES` (`time: '30–45 min'` etc.), `parseDurationRange` behaviour via `ex.minutesRange`, `predecessorOf`, `quizProblems`, `loadAgentChecks` from `agent.mjs`.
- Produces: a `GROWN` set of lab ids whose homework levels must follow the ticket format. Lab 05 joins it in the Lab 05 plan; the fan-out adds the others; the last task replaces the set with "every lab 00–07, all five tiers".

- [ ] **Step 1: Write the test** (fails once a lab joins `GROWN` before its levels are written):

```js
import { DIFFICULTIES } from '../catalog.mjs';
import { loadAgentChecks } from '../agent.mjs';

const GROWN = new Set(['lab-05']);
const tierRange = (d) => { const [lo, hi] = d.time.replace(/[^\d.–-]/g, ' ').trim().split(/\s*[–-]\s*/).map(Number); const unit = /h/.test(d.time) ? 60 : 1; return [lo * unit, (hi ?? lo) * unit]; };

test('every homework level of a grown lab follows the ticket format and fits its tier', async () => {
  for (const lab of catalog.filter((l) => GROWN.has(l.id))) {
    assert.deepEqual(lab.levels.map((e) => e.level), DIFFICULTIES.map((d) => d.id), `${lab.id}: all five tiers`);
    for (const ex of lab.levels.filter((e) => e.level !== 'easy')) {
      const d = DIFFICULTIES.find((x) => x.id === ex.level);
      const [lo, hi] = tierRange(d);
      const [a, b] = ex.minutesRange ?? [];
      assert.ok(a >= lo && b <= hi, `${ex.key}: 🕐 ${ex.time} is outside ${d.time}`);
      assert.match(ex.meta, /🏠 homework/, ex.key);
      assert.equal(ex.buildsOn, predecessorOf(order, ex.key).key, `${ex.key}: 🧱 builds on`);
      assert.ok(ex.mission && ex.mission.split('\n').length >= 3, `${ex.key}: 🎯 a story of 3–6 lines`);
      assert.ok((ex.requirements.match(/^\d+\.\s/gm) ?? []).length >= 2, `${ex.key}: 📋 numbered requirements`);
      assert.ok(ex.milestones.length >= 2 && ex.milestones.length <= 6, `${ex.key}: 2–6 milestones`);
      for (const m of ex.milestones) {
        const n = ex.hints.filter((h) => h.milestone === m.id).length;
        assert.ok(n >= 1 && n <= 3, `${ex.key}: ${m.id} has ${n} hints (1–3)`);
      }
      assert.ok(ex.takeaway && !ex.takeaway.includes('\n'), `${ex.key}: 🧠 one-line takeaway`);
      assert.ok(ex.quiz, `${ex.key}: ❓ Check yourself`);
      assert.deepEqual(quizProblems(ex.quiz), [], ex.key);
      assert.ok(ex.further, `${ex.key}: 🚀 Going further`);
      if (ex.hasAgent) {
        const specs = await loadAgentChecks(ex.dir);
        const prompts = specs.reduce((n, s) => n + (s.command ? (s.prompts ?? 1) : 1), 0);
        assert.ok(prompts <= 2, `${ex.key}: agent checks use at most 2 prompts (${prompts})`);
      }
    }
  }
});
```

- [ ] **Step 2:** Run `node --test labs/_harness/tests/content.test.mjs`; expect FAIL for lab-05 until the Lab 05 plan's tasks are done.
- [ ] **Step 3:** Commit together with the Lab 05 content (the test documents the format the exemplar meets).

### Task 2: Lab 05, the exemplar

Follow `docs/superpowers/plans/2026-10-19-phase-4-lab-05.md`. Then `sync-seeds`, `verify --chain --bring`, unit tests, agent validation (≤ 6 prompts), commit, **report to the coordinator and wait**.

### Task 3: The readme line about plugins in timelines

**Files:** `2026/agent-harness-workshop/readme.md` (🧪 Two kinds of checks section), `labs/_harness/tests/docs.test.mjs`.

- [ ] Add after the paragraph on run folders: "The 🧭 timeline shows every tool call of the run, including skills and plugins from your **personal** Copilot setup (for example a `skill` step you installed yourself): learners without them won't see those steps."
- [ ] `docs.test.mjs`: assert the 🧪 section mentions "personal" and "timeline".

### Task 4: Fan-out (after the coordinator approves the exemplar)

One subagent per lab (00, 01, 02, 03, 04, 06, 07), in parallel. Each gets: this overview's Global Constraints, the spec §5.4 row of its lab, the Lab 05 plan and its committed result as the pattern, the lab's current files, and the rule "edit only `labs/lab-XX/{medium,hard,hard-plus,hard-plus-plus}/` (and `labs/_harness/fixtures/lab-XX/` if a fixture must be shared); never run `sync-seeds`; never edit `labs/_harness/**` code; never run agent checks". Each writes its lab plan as `docs/superpowers/plans/2026-10-19-phase-4-lab-XX.md` first.

Per-lab specifics the kickoff must carry:
- **lab-01/hard:** fix the flaky A/B agent check: the "without" variant must run in a copy without `AGENTS.md` (setup removes it) or score the difference explicitly.
- **lab-06/hard++:** the marketplace spike (free: docs and `--help`).
- **lab-07/hard++:** the gh-aw shared-configuration spike (free).
- **lab-00/hard++:** the fake model's scenarios are deterministic fixtures with their own tests (§5.10).

Then I, alone: merge, `sync-seeds` once, resolve conflicts, `verify --chain --bring`, unit tests, validate new/changed agent checks (budget: 40 − Lab 05's spend), extend `GROWN` to every lab, extend the homework `PATHS` in `learning.mjs` with the new levels (§5.1 paths), update the workshop readme's homework section, independent code review, commit, report.

## Self-review

- §5.1 times → Task 1 enforces them; §5.3 ticket format → Task 1; §5.4 ladders → Tasks 2 and 4; §5.10 catalog tests and "every milestone has a check" → Task 1 and `verify`; §6 "one plan per lab, Lab 05 first" → Tasks 2 and 4; §8 risks (content volume, ripples, agent behaviour) → exemplar review, `sync-seeds` once, re-validation of changed agent checks.
- Coordinator decisions 1–5 → Tasks 2, 1, 2/4, 4, 3.

## Implementation notes (as built, 20 Oct 2026)

**Fan-out.** Seven general-purpose subagents (Labs 00, 01, 02, 03, 04, 06, 07) ran in parallel, one lab each, from a
shared brief (`files/phase4-fanout-brief.md` in the session: the exemplar's seven rules plus the coordinator's two,
the chain rules, allowed commands, and "never touch other labs, git state, sync-seeds or agent checks"). Each wrote its
own plan (`2026-10-19-phase-4-lab-XX.md`), kept its row consistent by hand (`sync-seeds --dry-run`: 0 changes), and
reported. I committed each lab separately and ran `sync-seeds` once (it wrote only `starters.json`, and later the
easy-guard fix into Labs 06 and 07).

**Central changes (deviations from this plan, each with a test):**
| Change | Why |
|---|---|
| `bring` carries **support files**: a passed level's new starter files on the harness paths that its work uses unchanged (e.g. `org.json`, `roles.json`), only into a level that lacks them, never over real work, never on their own. | Found by Lab 03: a brought audit script or Lab 05 hard++ guard would run without its policy (the guard would deny every call). |
| `/.mcp.json`, `/apm.yml`, `/apm.lock.yaml` pinned to the root in `harnessPaths`. | Lab 06: a plugin folder's own `apm.yml` travelled alone. |
| `lab-02/hard-plus` `local: ["VERDICT.md", "vendor/**"]`. | The vendor samples (one malicious, inert) are hard+ evidence only. |
| Scorecard: `tools: []` is "no tools"; gh-aw's global safe-output options and system types need no `max`; workflow rules follow `imports:`. | Copilot and gh-aw docs; Labs 03 and 07. |
| Agent checks may compute `agent` from the copy (`<plugin>:<agent>`); a spec function that throws fails its case. | Validation: Copilot names plugin agents `<plugin>:<agent>` (plugin skills keep their names). |
| `t.tmp()` returns real paths; each check's temp folders go when it ends. | Review: through a symlink (macOS `/var`), a junction or an 8.3 name, a script's main-module test fails and a guard silently allows everything. Every lab's scripts now compare real paths too. |
| Content test: every lab 00–07 (`CONTENT_TEST_LABS` for one), and a `TODO(Mn)` marker per milestone in each hard+/hard++ level's own starters. | Coordinator decision (skeletons with markers). |
| Crash-left `mcp/state.json.*.tmp` is a runtime file (fingerprints, chain, `.gitignore`). | Lab 04. |
| Help screen and readme give tier times as they are now; homework paths per spec §5.1. | Phase 4 fills the tiers. |

**Spikes (free):** Lab 06's marketplace format (`marketplace.json` in `.github/plugin/`, needs `name`, `owner`,
`plugins`; relative `marketplace add` paths fail) and Lab 07's gh-aw shared configuration (budgets in a shared file
do reach the lock, against the docs; `timeout-minutes`/`cancel-in-progress` there are compile errors). Details in
those labs' plans. The CLI auto-updated to 1.0.101-0 during the phase.

**Agent validation (fan-out budget 31, each `--max-ai-credits 30`):** 27 prompts. Batch 1 (12): lab-00 hard and hard+,
lab-01 hard and hard++, lab-03 medium, hard and hard+, lab-04 hard+ and hard++ pass; lab-06 hard failed before any
model call (the plugin agent's name), fixed. Batch 2 (4): lab-02 medium and hard++, lab-06 hard pass. After the review
fixes, batches 3–5 (11): lab-02 medium, lab-04 hard and hard++, lab-05 hard+ and hard++, lab-03 medium and hard,
lab-01 hard and hard++.

**Independent review of the whole range (nine reviewers: seven labs, the Lab 05 fixes, the harness): every one "with
fixes", no critical issue left.** The lab subagents fixed their labs' findings; I fixed Lab 05 (a newline let a second
command past the engine and past "allow covers every command"; prefix depth; substitutions; escaped quotes;
PowerShell script blocks) and the harness. Cross-cutting fixes: free checks that a learner's bug could turn into paid
Copilot runs now run with Copilot unreachable, and every script's main-module test compares real paths.

