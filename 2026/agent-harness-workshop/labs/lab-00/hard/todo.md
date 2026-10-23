# 🔴 Hard · Agent in a script

> 🕐 1–1.5 h · 🏠 homework · 🆓 free checks · 🤖 optional agent check (about 1 prompt) · 🧱 builds on: Lab 00 · medium

## 🎯 Mission
`copilot -p` turns the agent into a command-line tool, and `--output-format json` makes it print every step of the
loop as a JSON event: what the model asked for, what the harness ran or refused, what it cost, how it ended. That
stream is your audit trail and your cost report, if you can read it. Build `scripts/run-stats.mjs`: it summarises
real recorded runs (event types, tools and their success rate, tokens, the outcome, a timeline per turn), its unit
tests **prove** it on three fixtures, and it records new runs safely: read-only, with a credit cap.

## 📋 Requirements
1. `summarize(lines)` reads a recorded run: events and event types, broken lines, and the model.
2. It counts every tool's calls and how they ended: `ok`, `denied` or `failed`.
3. It reports the tokens, the premium requests, the exit code, the errors and the outcome, and a timeline per turn;
   `node scripts/run-stats.mjs <run.jsonl>` prints all of it.
4. `test/run-stats.test.mjs` tests all three fixtures, passes on your code and on the reference, and fails on five
   broken versions of it.
5. `recordArgs(prompt, { model })` builds the arguments for a read-only, capped recording run.

**What `summarize()` returns** (the checks and the next levels rely on it):
```text
{ events, skipped, byType: { [type]: n }, model,
  tools: { [name]: { calls, ok, failed, denied } },
  turns: [{ id, tools: [{ name, outcome }], said }],
  tokens: { input, output, cacheRead },
  premiumRequests, exitCode, errors: [message],
  outcome: 'ok' | 'failed' | 'incomplete' }
```

## 🧭 Milestones
### M1 · Read the real stream
- `fixtures/ok.jsonl` gives 22 events, 0 skipped, 3 `assistant.turn_start`, 2 `assistant.message_delta` and the model
  `gpt-6.1-sol` (the first `data.model` in the stream)
- Blank lines don't count; a line that isn't a JSON object is `skipped`; an event without `data` still counts

### M2 · Tools and their success rate
- `tools[name]` is `{ calls, ok, failed, denied }`: a call starts with `tool.execution_start` and ends with the
  `tool.execution_complete` that has the same `toolCallId`
- `success: false` with `error.code: "denied"` is a denial (`denied.jsonl`: `powershell` 0 of 1 ok, 1 denied); any
  other code is a failure (`failed.jsonl`: `view` 1 of 2 ok, 1 failed)

### M3 · Tokens, outcome and a timeline per turn
- `tokens` come from the **last** `session.usage_checkpoint`, summed over its models (`ok.jsonl`: 55924 in, 253 out,
  36509 cached); `premiumRequests` and `exitCode` from `result`; `errors` from `session.error`
- `outcome` is `incomplete` without a `result`, `failed` with a non-zero exit code or an error, else `ok` (a denial
  doesn't fail a run)
- `turns` has one entry per `turnId`, in order: its tools with their outcomes, and `said` when the model wrote text
- `node scripts/run-stats.mjs fixtures/denied.jsonl` prints the tools, the tokens and the timeline

### M4 · Tests that catch mutants
- `test/run-stats.test.mjs` reads `ok.jsonl`, `denied.jsonl` and `failed.jsonl`, and `node --test
  test/run-stats.test.mjs` passes on your code
- It also passes on the reference `run-stats.mjs`, and **fails** on each of five mutants: the reference with one bug
  (a denial counted as ok, a failure counted as ok, no tokens, the exit code ignored, every tool in turn 0).
  `tests/mutants.mjs` builds them when the check runs

### M5 · Record safely
- `recordArgs('…')`: `-p`, `--output-format json`, `--no-ask-user`, `--max-ai-credits` between 30 and 50,
  `--deny-tool=write` and `--deny-tool=shell`; no `--allow-tool`, no `--allow-all`, no `--yolo`
- `recordArgs('…', { model: 'gpt-x' })` adds `--model gpt-x`; without a model there's no `--model`

## 📂 Work here
```bash
cd labs/lab-00/hard/src
node scripts/run-stats.mjs fixtures/ok.jsonl
node --test test/run-stats.test.mjs
```
`scripts/run-stats.mjs` has the printing and the `--record` plumbing; you write `summarize()` and `recordArgs()`.
The three fixtures are real Copilot runs, trimmed: `ok.jsonl` is Lab 00 easy's agent check, `denied.jsonl` is a
run whose `--allow-tool=shell(rm)` didn't cover the command the model wrote, and `failed.jsonl` is `ok.jsonl` with a
missing file and a rate limit added (no recorded run had failed yet). The `skill` calls come from a plugin on the
machine that recorded them: your own runs show your own setup.

## 💡 Hints
### M1
<details><summary>Look at the data first</summary>

Open `fixtures/ok.jsonl`: one event per line, `{ type, data, id, timestamp, parentId }`. The last line, `result`, is
flat: `exitCode` and `usage` sit next to `type`, not inside `data`. There is no `session.start` event: the model's
name appears in `data.model` of `session.tools_updated`, `assistant.message` and the tool events.

</details>

<details><summary>The loop</summary>

Trim each line, skip blank ones, `JSON.parse` inside `try`/`catch` (a failure is `skipped++`), and skip anything
that isn't a plain object (`Array.isArray`). Then `byType[type] = (byType[type] ?? 0) + 1`. A `switch (type)` keeps
the rest readable.

</details>

### M2
<details><summary>Match by id, not by order</summary>

Two calls of one turn can finish in either order. Keep a `Map` from `toolCallId` to the step you created at
`tool.execution_start`, and fill in its outcome at `tool.execution_complete`.

</details>

### M3
<details><summary>Where the tokens are</summary>

`session.usage_checkpoint` → `data.accountingSnapshot.modelMetrics` → one entry per model → `usage.inputTokens`,
`outputTokens`, `cacheReadTokens`. Each checkpoint holds the running totals, so keep the last one (don't add them
up), and sum its models. `inputTokens` already includes the cached part.

</details>

<details><summary>Turns</summary>

`assistant.turn_start` has `data.turnId` (a string: `"0"`, `"1"`, …), and so do `assistant.message` and the tool
events. Find or create the turn by that id, push each tool there, and set `said` when an `assistant.message` has
non-empty `content`.

</details>

### M4
<details><summary>What to assert</summary>

For each fixture, assert what a mutant would get wrong: the tools object, the tokens, the outcome and the timeline
(`turns.map((t) => t.tools.map((x) => x.name + ':' + x.outcome))`). `ok.jsonl`: skill 1/1, view 2/2, 55924/253/36509,
`ok`. `denied.jsonl`: powershell denied, `ok`. `failed.jsonl`: view 1 ok + 1 failed, exit 1, `failed`.

</details>

<details><summary>Trying a mutant yourself</summary>

In a scratch copy of `src/`, break one line of `summarize()` (count a denial as ok), run `node --test test/`, and
read which test fails. If none does, your suite has no assertion about that behaviour.

</details>

### M5
<details><summary>Read-only means every route</summary>

`--deny-tool=write` stops the file tools, but the shell can write too (`echo x > grades.js`). Deny both, and add no
`--allow-tool`: deny always wins, and a read-only run has nothing to allow. `copilot help permissions` lists the
patterns; `copilot help limits` explains the cap (a soft cap: the call that crosses it still completes).

</details>

## 🧠 Takeaway
A JSON run is evidence: count what the agent did, what was refused, what it cost and how it ended, and test the counter.

## ❓ Check yourself
A recorded run has `"exitCode": 0`, but one `tool.execution_complete` says `"success": false` with
`"code": "denied"`. What happened?
1. The run failed: any call that doesn't succeed makes Copilot exit with an error.
2. The harness refused one call, told the model why, and the run went on to finish normally.
3. The model ran the command, but its output was too long to keep.

<details><summary>Answer</summary>

**2.** A denial is the harness doing its job: the call never ran, the reason went back into the context, and the
model carried on (often by answering that it couldn't). That's why `run-stats` counts denials apart from failures,
and a run's outcome apart from its calls.

</details>

## 🚀 Going further
- Record a real run (it costs credits): `node scripts/run-stats.mjs --record "Which functions does grades.js
  export?"`, then summarise the file it saved in `runs/`.
- Who denied a call? A hook's message starts with `Denied by preToolUse hook:` (Lab 05); the permission system's with
  `Permission denied`. Count them apart.
- `copilot --usage-output-file usage.json -p …` writes the final usage as JSON too: compare it with your summary.
- Lab 00 hard+ records the same prompt many times and measures how much the runs differ.
