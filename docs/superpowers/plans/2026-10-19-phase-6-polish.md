# Phase 6 · Polish: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the workshop experience: a presenter mode, `--plain` output, an accessibility pass, a guard for the
workshop-commit pins, the last Phase 4 leftovers, and the wrap-up (spec status, final review, full verification).

**Architecture:** Everything reuses PR #1's and Phases 1–5's pieces. The presenter is a pure slide builder
(`screens/present.mjs`) shown by the TUI like the replay (←/→), printed as text when there is no TTY, and offered in
linear mode. `--plain` is PR #1's `--ascii` under the spec's name, with its one fold table (`ui.mjs` `FOLD`) completed
so every glyph that carries meaning becomes an ASCII marker instead of disappearing. The accessibility pass is mostly
tests: every screen in the key table, at 80×24, with `NO_COLOR`, and linear-mode coverage of every app feature.

**Tech Stack:** Node 22+, no npm dependencies, `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-18-agent-harness-workshop-experience-design.md` (§5.7 Phase 6 table, §6
step 6, §5.10 testing).

## Global Constraints

- No npm dependencies; unit tests use `node:test` in `labs/_harness/tests/*.test.mjs` (spec §5.10).
- Every screen fits 80×24 (scrolling is fine); `NO_COLOR` is respected everywhere; meaning is never shown by colour
  alone (spec §5.7).
- `--plain` output contains no character outside ASCII and box-drawing, at 80 columns (coordinator, Phase 6).
- No paid prompts in this phase. Free checks, `verify` and `copilot … list` cost nothing.
- Don't push and don't open a PR.
- Keep `verify --chain --bring` green and the TUI starting and navigating after every task.

## Coordinator decisions for this phase

1. Presenter mode: `node labs/start.mjs present [lab]`; slides from each readme's *In one minute*, *How it works* (or
   the closest equivalent) and *Under the hood*; ←/→; a slide for the Lab 08 closing demo and a closing slide with the
   homework map (tiers, times, paths); a non-TTY text fallback; fits 80×24.
2. `--plain`: ASCII markers for emoji everywhere the TUI and CLI print them (badges, status icons, timeline glyphs,
   the layer map, the X-ray); one mapping table; a test at 80 columns.
3. Accessibility: `NO_COLOR` everywhere; no colour-only meaning; 80×24; a linear-mode audit; the NO_COLOR subprocess
   test visits every screen in the key table.
4. The scorecard pin `d0e58b9` stays: a facilitator checklist in the readme (the 3 places) and a unit test that finds
   every pin of this repository in the levels.
5. Phase 4 leftover: no level keeps dead copies or imports of the old per-lab guard helpers.
6. Wrap-up: the spec's status "Implemented" with "What shipped vs the spec"; a final independent review of the
   Phase 6 range; the full verification (5 unit runs, `verify --chain --bring`, the same with `HARNESS_COPILOT` pointing
   at a missing binary, TUI smoke at 80 and 120 columns with `NO_COLOR=1`, `--no-anim` and `--plain`).

## Deviations from the spec (decided up front)

| Spec | Here | Why |
|---|---|---|
| A new `--plain` flag | `--plain` is PR #1's `--ascii` under the spec's name; both work | PR #1 already folds every symbol through one table (`ui.mjs` `FOLD`) in the app, linear mode and the CLI. A second mode would duplicate it. Box-drawing also folds to ASCII, which the "ASCII and box-drawing" rule allows. |
| *How it works* | The section named `How …` when there is one (Lab 00 *How it works*, Lab 05 *How a hook works*); otherwise the first section after *Under the hood* that explains the layer (Lab 01 *Where instructions live*, Lab 02 *Anatomy of a skill*, …) | Only two readmes have a *How* section; the rule picks "the closest equivalent" the same way for every lab, and a test names each lab's choice. |

---

### Task 1: Phase 4 leftovers

**Files:** delete `labs/lab-05/hard-plus-plus/tests/secrets.mjs` (nothing imports it); modify
`labs/lab-04/{medium,hard,hard-plus,hard-plus-plus}/tests/common.mjs`; test `labs/_harness/tests/content.test.mjs`.

- [ ] **Step 1: Failing test** in `content.test.mjs`: every `tests/*.mjs` file of a level other than `checks.mjs` and
  `agent.mjs` is imported (or run) by another file of that level; no level's tests parse `NODE_OPTIONS` for the kit's
  guard or define their own copilot blocker (`/no-copilot\.mjs\$/` inside a regex, `PATH: ''`).
- [ ] **Step 2:** Run it: fails on `lab-05/hard-plus-plus/tests/secrets.mjs` and Lab 04's `kitNodeOptions`.
- [ ] **Step 3:** Delete the file; in Lab 04, `import { guardNodeOptions } from '../../../_harness/no-copilot.mjs'`
  and pass `NODE_OPTIONS: guardNodeOptions()` (the kit's own helper, the same value `t.unitTests` uses).
- [ ] **Step 4:** `node labs/start.mjs verify 04` and `verify 05`; the content test passes. Commit.

### Task 2: `--plain` (one fold table, markers for meaning)

**Files:** `labs/_harness/ui.mjs` (`FOLD`, `MARKERS`), `labs/start.mjs` (`plain` accepted wherever `ascii` is),
`labs/_harness/tui.mjs` (help line), `readme.md` (display options); tests `labs/_harness/tests/plain.test.mjs` (new).

**Interfaces:** Produces `export const MARKERS` (glyph → marker, the meaning-carrying part of `FOLD`) and keeps
`asciiFold(s)`, `setAscii(on)`, `isAscii()`. `startTui({ ascii })` unchanged; `--plain` sets the same option.

- [ ] **Step 1: Failing tests** (`plain.test.mjs`):
  - every glyph the harness prints with a meaning folds to a non-empty marker: the `STATUS` icons, the five tier
    badges, the mode icons (👥 🏠), the X-ray file marks (🆕 ✏️ 🧳), the trace and replay glyphs (scan
    `screens/replay.mjs`, `trace.mjs`, `screens/xray.mjs` for their glyph constants), 💳, 🔖, 🔐, 🧱;
  - a scan of every non-ASCII character in `labs/_harness/**/*.mjs` string literals: each one either has a `FOLD`
    entry, is a box-drawing/arrow handled by the table, or is in an explicit `DECORATIVE` list (dropped on purpose,
    e.g. a lab's own emoji before its name);
  - `node labs/start.mjs list --plain`, `path --plain`, `help --plain`, `glossary --plain` and `xray lab-08 easy --sol
    --plain` print only ASCII and box-drawing (U+2500–U+257F), at `COLUMNS=80`.
- [ ] **Step 2:** Run: fails (no `plain` option; X-ray marks fold to nothing).
- [ ] **Step 3:** Add the markers to `FOLD` (for example 🆕 `[new]`, ✏️ `[chg]`, 🧳 `[brought]`, 👥 `[live]`,
  🏠 `[hw]`, 💳 `[credits]`); `start.mjs`: treat `--plain` as `--ascii` in `UI_OPTS` and in every command's `opts`
  (one helper that adds both); help and readme name `--plain` (and say `--ascii` still works).
- [ ] **Step 4:** Tests pass; `node labs/start.mjs list --plain` by eye. Commit.

### Task 3: Presenter mode

**Files:** create `labs/_harness/screens/present.mjs`; modify `labs/_harness/keys.mjs` (`present` screen),
`labs/_harness/tui.mjs` (state, screen, handlers, help line), `labs/start.mjs` (`present [lab]` command, non-TTY text),
`labs/_harness/linear.mjs` (`present [lab]`), `readme.md` (For facilitators); tests
`labs/_harness/tests/present.test.mjs` (new), `tests/tui.test.mjs`, `tests/docs.test.mjs`.

**Interfaces:**
- `export function slidesFor(catalog, { labsDir, lab = null, W = 76 }) → [{ id, title, kicker, lines: string[] }]`:
  per lab (or only `lab`): *In one minute*, the *How* section (rule above), *Under the hood*; then the Lab 08 demo
  (*🎤 The live closing demo*) and the homework map (tiers with times and capstone times, every path with its time).
  Lines are rendered Markdown at width `W`; a slide taller than its budget (24 rows minus title, footer and margins)
  continues on a second slide titled "… (2/2)".
- `export function slideLines(slide, { index, total, W, fmt }) → string[]` (the screen body).
- `export function howSection(sections) → string|null` (the rule; tested per lab).

- [ ] **Step 1: Failing tests** (`present.test.mjs`): every lab gives 3 slides with non-empty bodies and its *How*
  choice is named per lab; `present` (all) ends with the demo and the homework map; the homework map names all five
  tiers with both times and every path; every slide fits 80×24 (`slideLines` at W 76 ≤ 24 − 4 rows) and continues
  rather than cutting; `present lab-03` gives only Lab 03's slides; `node labs/start.mjs present lab-01` without a TTY
  prints the slides as text and exits 0; in the app, → and ← move, `q` quits, and the KEYMAP has the `present` screen.
- [ ] **Step 2:** Run: fails (no module).
- [ ] **Step 3:** Implement `present.mjs` (sections read with the catalog's readme parser; `renderMarkdown` for the
  body), the TUI screen (copy of the replay pattern: `S.present = { slides, idx }`, keys `right`/`left`/`space`, `home`,
  `end`, back), `start.mjs present [lab]` (TTY → app straight into the slides; otherwise text with `--- n/N ---`
  separators), linear `present [lab]`, help and readme lines.
- [ ] **Step 4:** Tests pass; smoke at 80×24 and 120×40. Commit.

### Task 4: Accessibility pass

**Files:** `labs/_harness/tests/tui.test.mjs` (the NO_COLOR subprocess test, the 80×24 test),
`labs/_harness/tests/linear.test.mjs` (coverage), and fixes where the tests find gaps (`tui.mjs`, `screens/*.mjs`,
`linear.mjs`, `ui.mjs`).

- [ ] **Step 1: Failing tests:**
  - the NO_COLOR subprocess test visits every screen in `KEYMAP` (driving keys from home, a level, the checks, the
    agent confirmation with a fake environment, history, the solution confirmation, bring, changes, learn, X-ray,
    replay, recovery and its confirmation, doctor, export, the menu, browse, present); it asserts no colour codes and
    lists any screen it did not reach;
  - every visited frame at 80×24: no line wider than 80, no more than 24 rows, and when content is cut the footer says
    so ("more below");
  - no raw colour escapes outside `ui.mjs` (`grep` of `\x1b[3`/`38;5` in `labs/_harness`, `labs/start.mjs`);
  - colour is never the only signal: the status cells, tier rows, milestone bars, diff lines, trace rows and X-ray rows
    rendered with `NO_COLOR` still carry a glyph or a word for every state (table-driven over `STATUS`);
  - linear mode: a table maps every KEYMAP action of the level and home screens to a linear command (or to "not
    applicable" with a reason); the test fails for an action with no entry, and each listed command is in `HELP`.
- [ ] **Step 2:** Run: record the gaps.
- [ ] **Step 3:** Fix them (add missing linear commands such as `present`, `guide`, `tier`; make cut screens say "more
  below"; give any colour-only state a word).
- [ ] **Step 4:** Tests pass. Commit.

### Task 5: The workshop-commit pins

**Files:** `readme.md` (For facilitators: a "Before the workshop, after the merge" checklist), test
`labs/_harness/tests/content.test.mjs`.

- [ ] **Step 1: Failing test:** find every `repository: arolariu/workshops` followed by `ref: <sha>` (and
  `arolariu/workshops@<sha>`) in `labs/lab-*/**` (not `.runs`, `.recovery`, `.backups`); all refs are equal; the
  source places are exactly the three the readme lists (`lab-08/hard-plus/todo.md`,
  `lab-08/hard-plus/sol/.github/workflows/harness-ci.yml`, `lab-08/hard-plus/sol/.github/workflows/harness-review.md`)
  and every other hit is an inherited copy in a later level of the chain; the readme's checklist names the three
  and the current SHA.
- [ ] **Step 2:** Run: fails (no checklist).
- [ ] **Step 3:** Write the checklist (re-pin the three places to a commit on `main`, run `sync-seeds`, run the test).
- [ ] **Step 4:** Test passes. Commit.

### Task 6: Wrap-up

- [ ] The spec: **Status: Implemented** (date), and a "What shipped vs the spec" section: one line per phase with a
  link to its plan's deviation table, plus the decisions the coordinator made on the way (G6 dropped, PR #1 base).
- [ ] Final independent review of the Phase 6 range; fix Critical and Important findings.
- [ ] Verification: 5 consecutive full unit runs; `verify --chain --bring`; the same with `HARNESS_COPILOT` pointing at
  a missing binary; TUI smoke at 80 and 120 columns with `NO_COLOR=1`, `--no-anim` and `--plain`.
- [ ] Implementation notes here; commit; report (final commit, commit count from 6dae8a5, prompts across all phases).

## Self-review

- Spec §5.7 Phase 6 rows → Tasks 3 (presenter), 2 (`--plain`), 4 (accessibility). Coordinator items 4 → Task 5,
  5 → Task 1, 6 → Task 6.
- Names: `slidesFor`, `slideLines`, `howSection`, `MARKERS`, `asciiFold`, `setAscii`, `guardNodeOptions`.
- Risk: the every-screen subprocess test needs states that normally need Copilot (the agent confirmation); it uses the
  same fake environment the existing TUI tests use (`deps.inspectEnvironment`), never the real CLI.
