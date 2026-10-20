# 🔴 Hard · Measure it

> 🕐 2–2.5 h · 🏠 homework · 🆓 free checks · 🤖 optional agent check (about 1 prompt) · 🧱 builds on: Lab 08 · medium

## 🎯 Mission
"Does the harness actually work?" Last month someone trimmed `AGENTS.md` and the grading answers were wrong for two
days before anyone noticed; this week a teammate swears the new skill "obviously helps". Impressions don't survive a
pull request. Write golden cases for every layer, run them read-only and on a budget, and turn the runs into
numbers: pass rate, pass@k, variance and tokens. Then put the numbers to work: a baseline that fails a regression,
and an ablation report that says what each layer is worth. The level ships recorded runs, so all of it works
without spending a credit.

## 📋 Requirements
1. `evals/cases.json` has at least 8 golden cases. Every layer of your harness that a prompt can exercise
   (instructions, skills, agents, MCP, hooks) has one, and every case is scored by deterministic `expect` rules.
2. `scripts/eval.mjs` runs each case N times, read-only, quiet and credit-capped (every run at least 30 credits, the
   CLI's minimum), and refuses a plan whose worst case is over the budget: `--dry-run`, `--runs <n>`,
   `--budget <credits>`.
3. It scores each run from its JSON events, computes the pass rate, pass@k, variance and tokens of each case, and
   writes `report.json` and `report.md` (`--report <dir>`, by default `evals/reports`).
4. `--baseline <file> [--threshold <pp>]` exits 1 when a case drops by more than the threshold, and names it.
   `evals/baseline.json` is saved.
5. `--ablate <layer|all>` compares the recorded "layer removed" suites with the full one: the layer-value report.
6. Exit codes: 0 done, 1 a regression, 2 refused (arguments, cases, budget) or nothing measured (no run started).
   A run that fails is recorded as failed and its error is shown. Nothing free ever starts Copilot.

A case, and the rules `expect` can use (one key per rule; a run passes when it finished and every rule holds):

```json
{ "id": "skill-ects", "layer": "skills",
  "prompt": "Which ECTS grade is a final grade of 8.75?",
  "expect": [{ "skill": "ects-grades" },
             { "answerMatches": "8\\.75 \\(B\\)" }] }
```

```text
{ "tool": "studybuddy-get_deadlines" }  a call to it succeeded; * globs
{ "noTool": "edit" }                    no call to it, not even denied
{ "skill": "ects-grades" }              the skill tool loaded it
{ "denied": true }                      a call was denied (false: none)
{ "answerMatches": "VERDICT: \\w+" }    the final answer matches (no case)
{ "answerNotMatches": "deleted" }       ...and doesn't match this one
Optional: "agent": "reviewer", "allow": ["studybuddy(get_grades)"],
"credits": 45 (the run's cap: 30 when it's left out, from 30 to 60)
```

## 🧭 Milestones
### M1 · Cases
- `evals/cases.json` has `{ "cases": [...] }` with at least 8 valid cases: a unique `id` (lowercase and hyphens: it
  names the recorded file), a `layer` (`instructions`, `skills`, `agents`, `mcp`, `hooks`, …), a `prompt`, and
  `expect` rules from the table; `allow` grants read-only tools only
- Every layer your harness has among instructions, skills, agents, MCP and hooks has at least one case
- The five kinds are there: a rule followed (an instructions case with `answerMatches`), the right skill (a `skill`
  rule naming one of yours), a read-only agent (`agent` plus `{ "noTool": "edit" }`), an MCP tool used
  (`{ "tool": "<server>-<tool>" }`), and a denial handled gracefully (`{ "denied": true }` plus an answer rule)

### M2 · Runner
- In `scripts/eval/score.mjs`: `score(events, expect)` returns `{ pass, failed }`; `evalArgs(c)` builds one run's
  arguments (`--agent` when the case has one, the prompt, `-s`, `--no-ask-user`, `--output-format json`,
  `--max-ai-credits` = the case's `credits` or 30, the `allow` list, `--deny-tool=write` and `--deny-tool=shell`; it
  throws when `allow` asks for write or shell, or when the cap is under 30 or over 60); `plan()` gives the worst
  case: every run spends its whole cap
- In `scripts/eval/stats.mjs`: `passRate`, `passAtK(n, c, k)` (the unbiased estimator), `variance` (the population
  variance) and `caseReport` (runs, passed, pass rate, pass@k for every k, variance, mean tokens per run)
- `node scripts/eval.mjs --from evals/runs/full` scores the recordings with your cases, and every case gets a row
  (scored with the reference cases, the suite comes out at **78.1%**); `--dry-run` prints the worst case and runs
  nothing; a run that fails to start is recorded as a failed run with its error shown, and when no run starts at
  all, the runner exits 2 (the plumbing does this; a check proves it with a fake CLI)

### M3 · Baseline
- `compare(baseline, current, { threshold })` works case by case: a drop of **more than** `threshold` percentage
  points is a regression; cases on one side only are listed (`missing`, `added`), not judged
- `--baseline <file>` exits 1 and names the cases that dropped; `report.json` keeps the comparison
- `evals/baseline.json` is a report of your suite, with a row for every case

### M4 · Ablation
- `ablation(full, removed, { threshold })` gives each layer's drop and the cases that depend on it, most valuable first
- `node scripts/eval.mjs --ablate all` reads `evals/runs/ablate-<layer>/` next to `evals/runs/full/` and writes
  `layer-value.json` and `layer-value.md`

## 📂 Work here
```bash
cd labs/lab-08/hard/src
node scripts/eval.mjs --from evals/runs/full          # score recordings
node scripts/eval.mjs --dry-run --runs 1 --budget 240 # plan, run nothing
node scripts/eval.mjs --from evals/runs/ablate-skills \
  --baseline evals/baseline.json                      # a regression?
node scripts/eval.mjs --ablate all                    # layer value
```

The recordings are `evals/runs/<suite>/<case-id>.jsonl`: four runs per case in `full/`, two in each `ablate-*/`,
appended one after another (each run ends with its `result` event). Real runs (`--runs 1 --budget 240`, no
`--from`) cost credits and go to `evals/runs/run-<stamp>/`; `--case` takes one id or a comma list. The plumbing in
`scripts/eval.mjs` (arguments, files, Markdown, spawning Copilot, failed starts) is done; your work is in
`scripts/eval/` and `evals/`.

## 💡 Hints
### M1
<details><summary>Start from the recordings</summary>

`evals/runs/full/` has four runs of eight prompts; the file name is the case id and the first line of each file is
the prompt. Write a case for each (your `expect` rules decide which runs pass), then add cases of your own. Read a
run with `Get-Content evals/runs/full/skill-ects.jsonl -TotalCount 4` (or `head -n 4`).

</details>

<details><summary>Rules that measure behaviour, not luck</summary>

Prefer rules about what the agent **did** (`tool`, `noTool`, `skill`, `denied`) over the exact wording of an answer.
When you match an answer, match the part your harness is responsible for: the footer line `AGENTS.md` asks for, the
`8.75 (B)` format the skill teaches, the `VERDICT:` line of the reviewer. MCP tools appear in the events as
`<server>-<tool>`, like `studybuddy-get_deadlines`.

</details>

### M2
<details><summary>score() from facts()</summary>

`facts(events)` already gives `{ tools: [{ name, args, outcome }], skills, denied, answer, complete, exitCode }`.
A run that never finished, or exited with another code than 0, fails whatever its rules say. `toolMatches()`
handles the `*` in `"studybuddy-*"`. Answer rules use `new RegExp(source, 'i')`.

</details>

<details><summary>pass@k without big numbers</summary>

```js
if (n - c < k) return 1;   // every draw of k holds a pass
let none = 1;              // C(n - c, k) / C(n, k)
for (let i = 0; i < k; i++) none *= (n - c - i) / (n - i);
return 1 - none;
```
Check it by hand: 4 runs, 1 passed, k = 2 → 1 − C(3,2)/C(4,2) = 1 − 3/6 = 0.5.

</details>

<details><summary>The budget is the worst case, not the average</summary>

A run usually spends far less than its cap, but nothing stops it from spending all of it. So the plan multiplies:
runs × the case's cap, summed over the cases. The CLI refuses a cap under 30 (`copilot help limits`), so every run
counts 30 at least: 8 cases with `--runs 3` is 720 credits, which the default `--budget 100` refuses; `--runs 1`
is 240.

</details>

### M3
<details><summary>Floating point and "beyond"</summary>

`0.8 - 0.7` is `0.10000000000000009`, so a 10 pp drop looks like 10.000000000000009 pp and fails a 10 pp
threshold. Round the drop to 2 decimals (`Math.round(x * 10000) / 100`) before you compare, and use `>`.

</details>

<details><summary>Why case by case</summary>

Score `evals/runs/ablate-skills` against the baseline: with the reference cases the suite drops only 9.4 pp, under a
10 pp threshold, yet `skill-ects` loses 75 pp. An average hides a broken case behind seven good ones.

</details>

### M4
<details><summary>Ablation is compare() per layer</summary>

For every layer, `compare(full, removed[layer], { threshold })` already has the suite's drop and the cases that
dropped beyond the threshold. Keep `{ layer, before, after, dropPp, cases }` and sort by `dropPp`, largest first.

</details>

<details><summary>A layer worth nothing?</summary>

Without the hooks the suite does no worse: the eval runs are read-only, so the CLI's own `--deny-tool=shell` denies
the `rm -rf` before anything else could. Read-only evals can't see the guard; the attack pack (medium) is what
measures it. Write that down instead of deleting the hooks.

</details>

## 🧠 Takeaway
Probabilistic output needs statistics, baselines and budgets, not impressions.

## ❓ Check yourself
A case passed 3 of 4 runs last week (75%) and 2 of 4 today (50%). Your gate uses a 10 pp threshold. What should you
conclude?
1. A regression: 25 pp is far beyond 10, so revert the last change.
2. Nothing at all: pass rates of a language model can't be compared.
3. Not yet: with 4 runs, one flaky run moves the case by 25 pp. Run more, or set the threshold above what noise
   alone can do.

<details><summary>Answer</summary>

**3.** One run out of four is 25 pp, so a 10 pp threshold on 4 runs fires on noise. The variance (0.1875 and 0.25
here) says how flaky the case is; more runs or a wider threshold make the gate trustworthy. Answer 2 is the
impression this level replaces: with enough runs, a drop is a fact.

</details>

## 🚀 Going further
- Record a real suite: `node scripts/eval.mjs --runs 1 --budget 240` (worst case 8 × 30), then score it with
  `--from` and compare it with the recordings. Which cases fail on your machine?
- Gate a pull request on it (hard+ does): on every pull request, for free,
  `node scripts/eval.mjs --from evals/runs/full --baseline evals/baseline.json` (the runner and the baseline still
  agree); with the `run-evals` label or on `main`,
  `node scripts/eval.mjs --runs 1 --budget 240 --baseline evals/baseline.json --threshold 75 --report evals/reports`
  (worst case 8 × 1 × 30 = 240 credits). With one run a case scores 0% or 100%, so a 75 pp threshold flags only a
  case that always passed and now fails; for finer gates, run a subset more often (`--case a,b --runs 2`).
- Record an ablation for real: copy the project into a folder Copilot trusts (inside the workshop folder), remove a
  layer there (say `.github/agents/`), run the suite in the copy, and save its run folder as `evals/runs/ablate-agents/`.
- Add a rule of your own to the vocabulary (`maxTools`, `maxTokens`…) and a case that needs it.
