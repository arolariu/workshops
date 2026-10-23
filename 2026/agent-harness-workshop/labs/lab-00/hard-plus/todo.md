# 🟣 Hard+ · Flight recorder

> 🕐 1.5–2 h · 🏠 homework · 🆓 free checks · 🤖 optional agent check (about 1 prompt) · 🧱 builds on: Lab 00 · hard

## 🎯 Mission
Run one prompt three times and you get three different runs: other tools, more turns, twice the tokens. Was it the
model, or did something change: the commit, the flags, the model `auto` picked, a plugin on your machine? Pilots
don't guess, they read the flight recorder. Build one: record N runs of a prompt with the conditions they ran under,
compare two runs, measure the spread across N, survive the messy runs (killed halfway, missing files, mixed setups),
and explain in `VARIANCE.md` why one prompt gives different runs.

## 📋 Requirements
1. `record()` runs a prompt N times through your `recordArgs()` and saves each run's events with a `meta.json`.
2. `loadRun()` reads a run back, and `compare()` puts two runs side by side and says when their setups differ.
3. `variance()` measures N runs: turns, tool calls and tokens (min, median, max), which tools, how many different
   paths, and the outcomes.
4. Broken, half-written and unexplained runs become problems you can read, never crashes or silent numbers.
5. `VARIANCE.md` reports one series and explains why the runs differ.

**A recorded run** (the series folder is `<stamp>-<slug of the prompt>`):
```text
runs/20261020-101500-which-functions/run-1/events.jsonl
                                          /meta.json
{ "prompt": "Which functions does grades.js export?",
  "model": "gpt-6.1-sol",
  "flags": ["-s", "--output-format", "json", "--no-ask-user", …],
  "git": { "commit": "2e56d97e…", "dirty": false },
  "cli": "1.0.99-2", "startedAt": "2026-10-20T10:15:00.000Z",
  "exitCode": 0 }
```

## 🧭 Milestones
### M1 · Record with metadata
- `record({ prompt, n, model, dir, run, git, cli })` writes `<dir>/<series>/run-1` … `run-N`, each with
  `events.jsonl` (exactly what Copilot printed) and `meta.json`; Copilot is called as `run(recordArgs(prompt, { model }))`
- `meta.json` has the prompt, the model the stream names (else the `--model` you asked for), the flags (the arguments
  without the prompt), `git` (`{ commit, dirty }` from `git()`), `cli` (from `cli()`), `startedAt` and `exitCode`
- A run that fails (exit 1, nothing printed) is recorded with its exit code, and the series goes on

### M2 · Compare two runs
- `loadRun(dir)` returns `{ id, dir, meta, summary, problems }`, where `summary` is your `summarize()` of
  `events.jsonl`
- `compare(a, b)` returns `setup` (`{ same, differs }` over prompt, model, flags, commit and CLI), `tools` (both tool
  sequences, and whether they're the same), `turns`, `toolCalls`, `tokens` (in and out) and `outcome` (`ok`,
  `denied` for a finished run with a denial, `failed` or `incomplete`)
- `node scripts/flight.mjs compare` on `run-2` and `run-3` prints "6 vs 3" turns; on `run-1` and `run-2` it warns (⚠)
  that the commit differs

### M3 · Variance across N
- `variance(runs)` returns `n`, `measured` (how many runs the spread comes from), `prompt`, `setup`, `turns`,
  `toolCalls` and `tokens.input`/`tokens.output` (each `{ min, median, max }`), `tools` (in how many runs each tool
  appears), `sequences` (how many different tool sequences), `outcomes` and `problems`
- On `fixtures/flight/`: turns 3/5/6, input tokens 61840/86609/119891, powershell in 3 runs, skill in 1, 3 different
  sequences, denied 3/3, and the commit differs
- `node scripts/flight.mjs variance fixtures/flight` prints the report (`report()` is given)

### M4 · Messy runs
- A stream cut in the middle of a line (a killed run): the broken line is counted, the outcome is `incomplete`, and
  `problems` says so; `variance()` counts it as `incomplete`, lists it under `problems`, and keeps it out of the
  turns, tool calls and tokens (it stopped halfway: its 0 tokens would drag the spread down)
- No `meta.json`: no crash, `meta` is `null`, and nobody can call it the same setup (`differs` starts with `meta`)
- No `events.jsonl`: the run stays out of the numbers and is listed in `problems`; with fewer than 2 usable runs,
  `variance()` throws an error that says "at least 2", and the CLI exits 1
- A run on another model makes `compare` warn

### M5 · Why one prompt gives different runs
- `VARIANCE.md` → `## Setup`: the prompt (in quotes), N, the model, the flags and the commit(s); `## Results`: the
  report of your series
- `## Why the runs differ`, with numbers from your results: how the model picks each step, what the harness sends
  every turn, how one different early step changes the rest, and what in the setup can change
- `## What I'd do about it`: 2+ bullets on measuring or testing an agent whose runs differ

## 📂 Work here
```bash
cd labs/lab-00/hard-plus/src
node scripts/flight.mjs variance fixtures/flight
cd fixtures/flight
node ../../scripts/flight.mjs compare run-2 run-3
cd ../..
node scripts/flight.mjs record --n 3 "What does grades.js export?"
```
`scripts/flight.mjs` gives you the plumbing (the CLI, `gitInfo()`, `cliVersion()`, `runCopilot()`, `report()`).
**Recording costs AI credits:** every run is a full session, capped at 30 credits by your `recordArgs()`; a short
read-only prompt costs far less than the cap, but N runs cost N times one. The checks never record: they give
`record()` a fake Copilot. If you'd rather not spend credits, write `VARIANCE.md` about the three recorded runs in
`fixtures/flight/` (its `README.md` says where they come from). Your own runs land in `runs/`, which is never part of
the level.

## 💡 Hints
### M1
<details><summary>Inject, don't spawn</summary>

`record()` takes `run`, `git` and `cli` as parameters, with the real ones as defaults. That's what lets the checks
(and your own tests) record without Copilot: `run` returns `{ code, stdout, stderr }`. Write `stdout` untouched:
the recording is the evidence, so it must be what Copilot said, not what you parsed.

</details>

<details><summary>Which model?</summary>

Ask for `auto` and Copilot picks one; ask for nothing and you get your default. So record what the stream says
(`summarize(stdout).model`), and fall back to the `--model` you passed only when the stream says nothing (a run that
failed before the first event).

</details>

### M2
<details><summary>Same setup, in one line</summary>

Map each run's meta to `{ prompt, model, flags: JSON.stringify(flags), commit, cli }`. A key differs when
`new Set(runs.map((r) => setup[key])).size > 1`. Comparing `flags` as a string keeps their order meaningful.

</details>

<details><summary>A run in numbers</summary>

`summary.turns.flatMap((t) => t.tools.map((x) => x.name))` is the tool sequence; its length is the tool calls. A run
that finished `ok` but had a denial (`Object.values(summary.tools).some((t) => t.denied)`) gets the outcome `denied`:
it's the outcome you'd want to see in a table.

</details>

### M3
<details><summary>Counting tools once per run</summary>

"Runs that used it" counts a tool once per run, however often that run called it: loop over
`new Set(sequence)`. `sequences` is `new Set(sequences.map((s) => s.join('>'))).size`. `stat()` is given.

</details>

### M4
<details><summary>Never trust a file</summary>

`fs.existsSync` before reading, `JSON.parse` inside `try`, and every surprise becomes one sentence in `problems`
("no meta.json: the setup is unknown"). In `variance()`, keep `runs.filter((r) => r.summary)` and list the problems of
all of them.

</details>

### M5
<details><summary>What can sampling explain?</summary>

Compare `run-2` and `run-3` first: same commit, model and flags, and 6 versus 3 turns. But `run-3` is **derived** from
`run-2` (`fixtures/flight/README.md`), so that gap illustrates what sampling does; it doesn't prove it. Your own N
runs are the real test. Then `run-1` and `run-2`: the commit differs (the deny reason the model read changed), so not
all of that difference is the model's. Which numbers moved most, and why does an early step move all the later ones?

</details>

## 🧠 Takeaway
One run is an anecdote: record N runs with the setup they ran under, and measure the spread before you trust a change.

## ❓ Check yourself
Three runs of a prompt took 3, 5 and 6 turns on one setup. You edit `AGENTS.md` and record one more run: 4 turns.
What can you say about your edit?
1. It helped: 4 turns is below the median of 5.
2. It made things worse: 4 turns is more than the best run's 3.
3. Nothing yet: 4 falls inside the spread you already measured. Record N runs with the edit and compare the two
   spreads.

<details><summary>Answer</summary>

**3.** Output varies run to run, so a single run can't tell an improvement from luck. Compare distributions (median,
min, max, outcomes) of N runs per variant, with everything else in the setup pinned: that's what Lab 01 hard's A/B
test does.

</details>

## 🚀 Going further
- Record one series per model (`--model`) and compare their spreads, not single runs.
- Add a hash of `AGENTS.md` and `.github/**` to `meta.json`: a dirty tree is a different setup too.
- Save `copilot --usage-output-file` next to `events.jsonl`, and check it against your summary's tokens.
- Lab 00 hard++ builds the loop itself, around a scripted model that never varies: the same scenario always takes
  the same path, so every difference is your loop's.
