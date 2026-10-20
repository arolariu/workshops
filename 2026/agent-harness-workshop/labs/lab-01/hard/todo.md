# 🔴 Hard · Prove it with data

> 🕐 1–1.5 h · 🏠 homework · 🆓 free checks · 🤖 optional agent check (about 2 prompts) · 🧱 builds on: Lab 01 · medium

## 🎯 Mission
"Instructions make the agent better": nice claim. **Prove it.** Ask Copilot the same question with and without your
instructions, several times, and score every answer against your rules. One run proves nothing: answers vary, so you
need hit rates and their spread. Keep the comparison honest (the "without" run must not be able to open `AGENTS.md`
with its own tools), write the result up as a report, then take the rules away one at a time to see which rule really
carries which behaviour.

## 📋 Requirements
1. Every run is read-only, quiet and capped with `--max-ai-credits`. "Without" switches custom instructions off **and**
   runs in a copy of the folder with no instruction file left in it.
2. `score()` looks for four signals in an answer: the canary, the test command, the exam rule and the no-dependencies
   rule.
3. `summarize()` gives, per variant, the hits and the hit rate per signal, and the mean ± standard deviation of the
   score over N runs.
4. `report()` writes the comparison as a Markdown table; `--from` rebuilds it from saved results without spending a
   credit.
5. `removeRule()` and `ablationTable()` show which signal drops when one rule leaves `AGENTS.md`.

## 🧭 Milestones
### M1 · An honest experiment
- `buildArgs(variant, prompt)`: `-p`, `-s`, `--no-ask-user`, a cap of 30–50 credits, `--deny-tool` for writes and the
  shell, never `--allow-all`. `without` adds `--no-custom-instructions`; the ablation variants (`no-canary`, …) don't
- `isInstructionFile(path)` is true for `AGENTS.md`, `CLAUDE.md` and `GEMINI.md` in any folder,
  `.github/copilot-instructions.md` and anything in `.github/instructions/`; false for `README.md`, `MY-AGENTS.md` or
  `AGENTS.md.bak`
- `prepare('without', folder)` (given) makes a copy with no instruction file, nothing that quotes the canary (it
  leaves out `scripts/` and `evals/`) and all the code; `node scripts/ab.mjs --dry-run --runs 2` shows four
  commands, two of them without instructions

### M2 · Score every rule
- `score(answer)` returns `{ canary, tests, examRule, deps }`, case-insensitive: `Harness check`; `npm test`,
  `node --test` or `node:test`; the exam **and** 5 (or "five"); and the rule, not the word: "No new dependencies",
  "zero dependencies" and "dependency-free" count, "Install the dependencies" doesn't

### M3 · N runs and the spread
- `stats(values)` returns `{ n, mean, sd }`, with the sample standard deviation (divide by n − 1), both rounded to 2
  decimals; `sd` is 0 for fewer than two values (there is nothing to spread)
- `summarize(results, variants = ['with', 'without'])` returns `{ runs, hits, rate, score }` per variant: hits per
  signal, `rate` = hits / runs (2 decimals), and `score` = `stats()` of how many signals each answer hit. Results of
  other variants are ignored

### M4 · The report
- `report(summary, { prompt, runs })` returns Markdown with this table, cells exactly like this:

```text
| Signal | With | Without | Δ |
|---|---|---|---|
| canary | 5/5 (100%) | 0/5 (0%) | +100 pts |
| test command | 5/5 (100%) | 3/5 (60%) | +40 pts |
| exam rule | 4/5 (80%) | 1/5 (20%) | +60 pts |
| no dependencies | 3/5 (60%) | 0/5 (0%) | +60 pts |
| score (0–4) | 3.40 ± 0.55 | 0.80 ± 0.84 | +2.60 |
```
- Δ comes from the hits (2/3 against 1/3 is +33 pts, not the +34 the rounded rates would give), and a score with fewer
  than two runs reads `1.00 ± n/a`
- `node scripts/ab.mjs --from runs/ab-results.json` prints the report and saves it to `runs/ab-report.md`

### M5 · Take one rule away
- `removeRule(text, rule)` drops every line of `AGENTS.md` that matches `rule.line` and returns `{ text, removed }`;
  it throws when no line matches
- `biggestDrop(base, other)` returns `{ signal, drop }` (in percentage points) for the signal that fell the most, or
  `null` when none fell
- `ablationTable(summary)` has a row `(none)`, then one row per rule with the hit rate of every signal and the biggest
  drop, like `| canary | 0% | 100% | 100% | 67% | canary (-100 pts) |`; `--from` on ablation results prints it and
  saves `runs/ablation-report.md`

## 📂 Work here
```bash
cd labs/lab-01/hard/src
code scripts/ab.mjs
node scripts/ab.mjs --dry-run           # free: what would run
node labs/start.mjs test lab-01 hard     # from the workshop folder
node scripts/ab.mjs --runs 3            # 6 prompts: spends AI credits
node scripts/ab.mjs --ablate --runs 3   # 15 prompts: spends AI credits
```
The runner, the copies and the files in `runs/` are given; the parts marked `TODO(Mn)` are yours. The checks never run
Copilot: they test your functions on recorded answers in `tests/fixtures/`. The real runs are up to you, and they cost
credits. Every run is capped with `--max-ai-credits`, so N runs cost at most N × your cap: start with `--runs 1`.

## 💡 Hints
### M1
<details><summary>Which flags?</summary>

`copilot --help` is your friend: `-p`, `-s`, `--max-ai-credits`, `--deny-tool` with a tool kind (`write`, `shell`),
and, for "without", the flag that disables custom instructions.

</details>

<details><summary>Why a copy?</summary>

`--no-custom-instructions` keeps `AGENTS.md` out of the context, but not off the disk: the agent can still open it
with its `view` tool and repeat the canary. That's exactly how the old version of this experiment fooled itself. In a
copy without instruction files there is nothing to find, and the original is out of reach: Copilot only lets the
agent read inside its working folder and the temp folder (`copilot help permissions`). Other files can quote the
canary too (this script does, so do the hard++ evals): the copies leave out `scripts/` and `evals/`, and each
result lists the files that still mention it. One more difference: `--no-custom-instructions` also turns off your
personal and plugin instructions, which "with" keeps; each "with" result records what `copilot instruction list`
showed in its copy.

</details>

### M2
<details><summary>A rule, not a word</summary>

Regular expressions with the `i` flag do it. For `deps`, look for "no", "never", "zero" or "don't add" shortly before
"dependenc", or for "dependency-free". The exam rule needs two things in the same answer: the exam and the number.

</details>

### M3
<details><summary>Variance in three lines</summary>

mean = sum / n; variance = the sum of (x − mean)² / (n − 1); sd = √variance. Round at the end with `round2()`, which is
already there. One run has no spread to measure (n − 1 would be 0): `stats()` says 0, and the report prints n/a.

</details>

<details><summary>The shape of a summary</summary>

```js
{ with: { runs: 5,
          hits: { canary: 5, tests: 5, examRule: 4, deps: 3 },
          rate: { canary: 1, tests: 1, examRule: 0.8, deps: 0.6 },
          score: { n: 5, mean: 3.4, sd: 0.55 } },
  without: { … } }
```
The score of one answer is how many signals it hit (0–4). Collect them per variant, then call `stats()`.

</details>

### M4
<details><summary>Formatting the cells</summary>

A rate is hits ÷ runs as a whole percentage. Δ is the difference of the two rates in percentage points, with its sign
(`+40 pts`): work it out from the hits, then round, or two rounded rates can be a point off. The score cells use
`toFixed(2)`, and `n/a` for the spread of a single run. `LABELS` names the rows.

</details>

### M5
<details><summary>Why the ablation surprises</summary>

Run the fixture through your table: without the canary rule the canary drops 100 points, but without the test-command
rule its signal drops only 33, because `package.json` and the tests give the command away. A rule the model can work
out from the code buys little for what it costs on every turn; a rule nobody can guess (the canary, the exam rule)
earns its tokens. Lab 01 hard+ starts from there.

</details>

## 🧠 Takeaway
Output varies, so one run proves nothing: measure hit rates over N runs, keep the comparison honest, and ablate to find the rules that earn their place.

## ❓ Check yourself
Your A/B run with N = 2: with instructions the canary appears 2 times out of 2, without it 1 time out of 2. What do
you conclude?
1. Instructions add 50 points to the canary: the canary rule is weak, so make it louder.
2. The "without" run saw the canary somewhere: find that leak before you trust any number.
3. Two runs are enough when the difference is this clear.

<details><summary>Answer</summary>

**2.** `--no-custom-instructions` switches off every instruction file, personal ones included, so a "without" answer
with the canary read it somewhere else: a file its tools could open (an instruction file left in its folder, a script
or an eval that quotes the canary). Fix the experiment first, then measure with more runs.

</details>

## 🚀 Going further
- Add a 95% confidence interval to every hit rate (the Wilson interval works for small N), and mark a Δ as "within
  noise" when the intervals overlap.
- Try a task instead of a question ("Fix the failing test") and score behaviour, not words: did `grades.test.js` stay
  untouched?
- Record the model (`--model`) and `copilot --version` in `runs/ab-results.json`: results from different models
  don't belong in one table.
