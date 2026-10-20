# Phase 5 · Lab 08 · 🔴 Hard · Measure it

> Task 11 of `2026-10-19-phase-5-capstone.md`. Written in parallel with Lab 08 · medium: `src/` = Lab 08 · easy's
> `sol/` + this level's starter files; the coordinator later rebases the level onto medium's `sol/`.

**Goal:** an eval suite for the harness: golden cases, a credit-capped read-only runner with statistics, a baseline
gate and a layer-value (ablation) report. Free checks test the math, the arguments, the comparison and the ablation on
recorded runs that ship with the level; one optional agent check runs one real case.

## Files

| Path (under `labs/lab-08/hard/`) | src | sol |
|---|---|---|
| `todo.md` | | |
| `evals/cases.json` | 2 example cases + `$comment` with `TODO(M1)` | 8 cases, five layers |
| `evals/runs/full/<case>.jsonl` (8) | shipped (starter) | same |
| `evals/runs/ablate-{instructions,skills,hooks}/<case>.jsonl` (24) | shipped (starter) | same |
| `evals/baseline.json` | — | the report of `evals/runs/full` |
| `scripts/eval.mjs` | CLI + plumbing, given | same |
| `scripts/eval/score.mjs` | `splitRuns`, `facts`, `CAP`, `checkCases` given; `score`, `evalArgs`, `plan` stubs (`TODO(M2)`) | done |
| `scripts/eval/stats.mjs` | `passRate`, `passAtK`, `variance`, `caseReport` (`TODO(M2)`), `compare` (`TODO(M3)`), `ablation` (`TODO(M4)`) stubs | done |
| `tests/checks.mjs`, `tests/helpers.mjs`, `tests/agent.mjs` | | |

No inherited file changes (nothing easy's `sol/` has is touched). Nothing under `attacks/` or `scripts/attack.mjs`.

## Milestones and checks

- **M1 · Cases** (generic, on the learner's `evals/cases.json`): schema (id, layer from the scorecard's layers,
  prompt, `expect` rules from the vocabulary, valid regexes, optional `agent`, `allow` read-only, `credits` 30–60);
  ≥ 8 cases and one per runtime layer the harness has (scanHarness); the five kinds name real things (a skill that
  exists, an agent with `noTool` on edits, a `<server>-<tool>` of a configured MCP server, `{ denied: true }`, an
  instructions case with `answerMatches`). src fails: 2 cases.
- **M2 · Runner**: `passRate`/`passAtK`/`variance` on hand-picked inputs; `score()` on built events (each rule, an
  incomplete run); `evalArgs()` like `leashArgs` (prompt, `-s`, `--no-ask-user`, JSON, cap = `credits` ?? 30,
  `--deny-tool=write` + `--deny-tool=shell`, no `--allow-all`/`--yolo`, throws on a write/shell allow and on a cap
  outside 30–60); `--dry-run` worst case and `--budget` refusal (exit 2, nothing written); failed runs with a fake CLI
  (`EVAL_COPILOT`: a run that never starts is a failed run with its stderr shown, exit 2 when no run starts); the
  report of the reference recordings (hand-checked); the learner's own recordings parse and every case of their
  `cases.json` gets a row.
- **M3 · Baseline**: `compare()` (threshold is strict, unshared cases are listed, not judged); the CLI exits 1 naming
  the dropped cases, 0 when within the threshold; `evals/baseline.json` is a report of the learner's cases.
- **M4 · Ablation**: `ablation()` on hand-picked reports; `--ablate skills` and `--ablate all` on the recordings
  (hand-checked), JSON + Markdown.
- **Agent check (1 prompt)**: setup adds a neutral `eval-smoke` case; `node scripts/eval.mjs --runs 1 --case
  eval-smoke --budget 30`; expects one recorded run with a `result` event and a report with `runs: 1`.

## Hand-checked numbers (the recordings in `evals/runs/`)

Full suite, 4 runs per case (passes): rules-footer 4, rules-pass-rule 3, skill-ects 3, skill-release 1,
reviewer-read-only 4, mcp-deadlines 4, mcp-grades 2, hooks-denied-delete 4.

- Pass rates: 1, .75, .75, .25, 1, 1, .5, 1. Suite = mean of the case rates = 6.25 / 8 = **0.78125** (= 25 / 32 runs).
- `passAtK(n, c, k) = 1 − C(n−c, k) / C(n, k)`, 1 when n − c < k:
  skill-release (4, 1): k=1 .25; k=2 1 − C(3,2)/C(4,2) = 1 − 3/6 = **.5**; k=3 1 − C(3,3)/C(4,3) = 1 − 1/4 = **.75**;
  k=4 1. mcp-grades (4, 2): k=2 1 − C(2,2)/C(4,2) = 1 − 1/6 = **.8333**; k=3 1. rules-pass-rule (4, 3): k=2 **1**
  (n − c = 1 < 2). Synthetic: (5,2,3) 1 − 1/10 = **.9**; (10,3,5) 1 − 21/252 = **.916667**; (4,0,1) **0**.
- `variance(xs) = Σ(x − mean)² / n` (population; p(1 − p) for pass/fail): rules-footer **0**, rules-pass-rule
  .75 · .25 = **.1875**, skill-release **.1875**, mcp-grades **.25**. Synthetic: [3, 5, 7] → 8/3 = **2.6667**.
- Tokens (mean per run): rules-footer in (18200+17800+18100+17900)/4 = **18000**, out (62+58+61+59)/4 = **60**;
  skill-ects in (24100+23900+18200+23800)/4 = **22500**, out (140+150+80+150)/4 = **130**.
- Dry run (check's own 3 cases, `credits` 45 on one, `--runs 2`): 2 · (30 + 30 + 45) = **210** credits; `--budget 200`
  refuses (exit 2), `--budget 210` accepts. `--case B --runs 3`: 3 · 30 = **90**. The cap is 30 at least: `copilot
  help limits` says "Minimum: 30 AI credits" for `--max-ai-credits` (a cap of 15 made every real run fail at startup).

Ablations, 2 runs per case (passes, in the order above):
- `ablate-instructions`: 0, 0, 2, 1, 2, 2, 1, 2 → rates 0, 0, 1, .5, 1, 1, .5, 1 = 5 / 8 = **.625**; drop
  78.125 − 62.5 = **15.625 pp**; beyond 10 pp: rules-footer **100**, rules-pass-rule **75**.
- `ablate-skills`: 2, 2, 0, 0, 2, 2, 1, 2 → 5.5 / 8 = **.6875**; drop **9.375 pp** (under the threshold for the suite,
  yet two cases regress: skill-ects .75 → 0 = **75 pp**, skill-release .25 → 0 = **25 pp**). This is also the
  baseline regression case: `--from ablate-skills --baseline baseline.json` exits **1** naming both; `--threshold 30`
  names skill-ects only; `--threshold 80` exits **0**.
- `ablate-hooks`: 2, 2, 2, 1, 2, 2, 1, 2 → 7 / 8 = **.875**; drop **−9.375 pp**, no dependent case: the read-only evals
  can't see the guard (the CLI's own `--deny-tool=shell` denies the call too), which is why the attack pack exists.
- `--ablate all` order: instructions (15.625), skills (9.375), hooks (−9.375).

## Deviations

- **Suites are folders**, not flat `*.jsonl`: `evals/runs/<suite>/<case-id>.jsonl`, N runs appended per file (a run
  ends with its `result` event). Suites: `full`, `ablate-<layer>`; real runs write `run-<stamp>/`.
- **Recordings are trimmed** to the event types the runner reads (`user.message`, `tool.execution_start/complete`,
  `assistant.message`, `session.usage_checkpoint`, `result`), with the real field shapes (MCP calls carry
  `mcpServerName`/`mcpToolName`, `toolName` is `<server>-<tool>`; denials have `error.code: "denied"` with the real
  hook and permission messages from the Phase 4 spikes). No deltas, no ids: about 1 KB per run.
- **Read-only evals can't exercise a hook that only guards writes or shells**: the hooks case measures the graceful
  answer after a denial; the ablation shows that honestly (hooks layer value ≈ 0).
- **The checks read the reference recordings from `sol/`** (`t.solDir`), so a learner who re-records keeps the
  hand-checked numbers stable.

## For hard+

CI, every pull request (free): `node scripts/eval.mjs --from evals/runs/full --baseline evals/baseline.json` (exit 0:
the runner and the baseline agree). With the `run-evals` label or on `main` (real runs): `node scripts/eval.mjs --runs
1 --budget 240 --baseline evals/baseline.json --threshold 75 --report evals/reports`: worst case 8 cases × 1 run × 30
credits = **240**. With one run a case scores 0 or 1, so a 75 pp threshold flags only a case that always passed in the
baseline and now fails (a 100 pp drop). `--runs 3 --budget 400` is refused (720 worst case). A subset with more runs
is the alternative: `--case rules-footer,reviewer-read-only,mcp-deadlines,hooks-denied-delete --runs 2 --budget 240
--threshold 50` (4 × 2 × 30 = 240; a regression is a stable case failing both runs). Exit codes: 0 ok, 1 regression
beyond the threshold, 2 refused (budget, invalid cases or arguments) or nothing measured (no run started).

## Implementation notes

- `verify 08`: hard src fails 16/16, sol passes 16/16. Sol maturity L4 Guarded (`governance-evals` green,
  `governance-ci-gate` red until hard+). A mutation run of the reference (22 mutants: rule semantics, unfinished
  runs, the read-only arguments, the cap and its minimum, the plan, pass@k, sample variance, summed tokens, unrounded
  or `>=` comparisons, unsorted ablation, a failed start that is hidden, unrecorded or exits 0) is caught by at least
  one check each.
- The recordings come from a deterministic generator (kept outside the repo, in the session's files); they total
  ≈ 140 KB per copy (32 files, 2–10 KB each).
- Fix after validation: the first version capped runs at 15 credits; the CLI's minimum is 30 (`copilot help limits`),
  so every real run failed at startup, and the runner hid it (exit 0, a report of failed runs). Now `MIN_CAP = 30`
  (cases may set 30–60), a run that exits non-zero or never reaches its `result` event is recorded as failed with the
  CLI's stderr printed, and `eval.mjs` exits 2 when no run of the plan started. `EVAL_COPILOT=<program>` runs a fake
  CLI instead of `copilot` (a `.mjs` runs with node); the free check uses it, so it never needs PATH tricks.
- Real-run plumbing: N runs append to one file per case; a run without a `result` event gets a marked one (exit code
  ≥ 1) so runs stay split, and a result that says 0 while the process exited non-zero takes the process's code. The
  report keeps each case's arguments. On Windows, `copilot.cmd` needs the shell fallback; the command is quoted for
  cmd.exe. `--case` takes a comma list.
