# Phase 5 · Lab 08 · 🟢 easy: Assemble and own it (plan)

Task 9 (easy part) of `2026-10-19-phase-5-capstone.md`; spec §5.6. Also writes `labs/lab-08/readme.md`.

**Goal:** the capstone's first tier, about 1 h of homework in the ticket format. The learner brings their harness in,
resolves the conflicts, gives it an owner (`HARNESS.md`), audits it to **L4 Guarded** and puts it on a context diet
(≤ 2,500 ≈tokens always on). No agent check.

## Files
- `labs/lab-08/easy/todo.md` (ticket: story, requirements, M1–M4 with 1–3 hints each, takeaway, quiz, going further;
  meta `🕐 about 1 h · 🏠 homework · 🆓 free checks · 🧱 builds on: Lab 07 · easy`).
- `labs/lab-08/easy/src/` = Lab 07 easy `sol/` (byte copy) + the simulated "brought" mess below.
- `labs/lab-08/easy/sol/` = the reference.
- `labs/lab-08/easy/tests/checks.mjs` + `tests/harness-rules.mjs` (generic helpers: twin agents, repeated rules,
  contradictions, `HARNESS.md` sections). The checks reuse `scanHarness`/`scorecard`/`maturity` and
  `contextBudget`/`measureMcp` from `labs/_harness/`.
- `labs/lab-08/readme.md` (lab guide: spine, threads, under the hood, in the enterprise, exercises with the capstone
  times, the live closing demo).

## The starter mess (src)
| File | Kind | What is wrong |
|---|---|---|
| `.github/agents/code-reviewer.agent.md` | new | same job as `reviewer`, no `tools` list (agent rules fail → L2) |
| `AGENTS.md` | **override** | a merged "Testing" section: a rule repeated word for word, and "mark a failing test `test.skip`" against "never change a test just to make it pass" |
| `.github/instructions/testing.instructions.md` | new | scoped to tests: Jest + `npx jest`, CommonJS `require`, rules repeated from `AGENTS.md`, plus two good rules worth keeping |
| `.github/copilot-instructions.md` | new | ≈2,400 ≈tokens always on: repeats `AGENTS.md`, a rarely needed ECTS conversion and release checklist, obsolete history, one good new rule |
| `.github/hooks/guardrails.json` | **override** | `preToolUse` for bash only (hooks rule fails) |
| `HARNESS.md` | new | skeleton: six headings and comment prompts, nothing filled in |

## Milestones and checks (free, deterministic)
- **M1 · Bring:** no two agents with one job (description word overlap, names that contain each other); no rule twice
  (normalised text lines across `AGENTS.md`, `copilot-instructions.md`, `*.instructions.md`); no contradiction on the
  test runner (Jest/Mocha/Vitest vs `package.json`'s `node --test`), module style (CommonJS vs `"type": "module"`) or
  failing tests (skip/`.only`/rewrite the expectation vs "never change a test"). Negated lines don't count.
- **M2 · Own:** `HARNESS.md` six sections, none empty (comments don't count); scorecard `harness-owner` passes; Owner
  names someone and Layers lists every layer present; Trust boundaries (untrusted input, the guard, the threat model),
  Budget (a token number and a credit limit), Changing the harness (PR/review + checks), Rollback (revert/tag) concrete.
- **M3 · Audit:** maturity ≥ L4 with MCP measured (local node servers only); every L1–L4 rule green; both shells reach
  the guard and it denies a recursive delete in each spelling.
- **M4 · Diet:** `contextBudget(scan, mcpTools).total` (+ scoped files whose `applyTo` matches everything) ≤ 2,500;
  the ECTS conversion and the release checklist are out of the always-on files and inside a skill.

The governance rules `governance-ci-gate` and `governance-evals` fail on purpose here (hard and hard+ add them); no
check looks at them, and the advisory "🧱 Your harness so far" group stops at Lab 07's layers.

## Overrides (for `course.json`)
- `AGENTS.md`: the brought mess adds a merged section with a repeated rule and a contradicting one (M1).
- `.github/hooks/guardrails.json`: the brought config registers the guard for bash only (M3).

## Deviations
- Contradiction detection is lexical (topic keywords minus negated lines); it names `file:line` so a learner can
  judge. Good enough for the three known topics, not a general contradiction finder.
- "Press `i` to bring" cannot be checked deterministically; the starter simulates the brought mess so every learner
  has conflicts to resolve, and `bring` (overrides are replaced by brought work) keeps the new starter files.

## Results
- `verify 08`: src fails 14/14, sol passes 14/14 (advisory group green). `verify 08 --bring`: +90 files from 35
  levels, src fails 12/14, sol passes 14/14 (the brought sol is L4 at ≈1,828 ≈tokens).
- Budget: src ≈2,854 ≈tokens every turn (L2 Equipped), sol ≈693 (L4 Guarded), MCP measured.

## Review fixes
- Bring replaces the two overrides (`AGENTS.md`, the hook config): the ticket, its hints and the readme (commands,
  closing demo) say so, so those two messes may already be gone; the checks judge whatever is in the folder.
- M4 "still always on" needs three of a topic's markers in one always-on file, and ignores lines that name a skill,
  so a one-line pointer to the skill passes.
- Contradictions are judged per clause (split on `, ; : . ! ?` before a space, and on a spaced dash): a negation
  (including `isn't`, `aren't`, any `n't`, `no longer`) only cancels its own clause, and whatever follows
  "instead of" / "rather than" never counts. Probed: "Jest instead of node:test" fails, "Jest isn't installed",
  "node:test instead of Jest" and "no longer CommonJS" pass, "If you can't fix it, mark it `test.skip`" fails.
