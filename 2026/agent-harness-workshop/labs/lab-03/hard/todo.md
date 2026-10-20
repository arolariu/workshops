# 🔴 Hard · Two agents, one loop

> 🕐 1–1.5 h · 🏠 homework · 🆓 free checks · 🤖 optional agent check (about 2 prompts) · 🧱 builds on: Lab 03 · medium

## 🎯 Mission
One agent finds problems, another fixes them, and a script runs the loop: **review → fix → test → review again**.
The handoff is the weak spot. A Markdown table is for people, so the reviewer hands over **JSON findings** that the
script checks before the fixer ever sees them. Each agent gets exactly the permissions its job needs, every round
has a credit budget, and the loop knows when to stop: clean, out of rounds, or when the fixes stop helping. Every
run leaves a report, so you can see what the loop did and what it could have cost.

## 📋 Requirements
1. `parseReview(text)` turns the reviewer's answer into `{ verdict, findings }`, and refuses anything else.
2. The reviewer runs read-only and answers in JSON; the fixer may edit files and run `npm`, and never push. Every
   call is capped.
3. `roundBudget(n)` splits a round's credits between its two calls, at least 30 each (Copilot's minimum).
4. `reviewLoop()` loops until the code is clean, `maxRounds` is reached or nothing improves; it never passes an
   unreadable review on, and it hands the fixer a findings file per round.
5. Every run leaves `report.json` and `report.md` in `.agent-logs/review-loop/`.

**The handoff** (the reviewer's answer, and the findings file the fixer reads):
```text
{ "verdict": "CLEAN" | "ISSUES",
  "findings": [ { "severity": "high" | "medium" | "low",
                  "location": "deadlines.js:23",
                  "problem": "…", "suggestion": "…" } ] }

CLEAN means no findings · score = high 3, medium 2, low 1
```

## 🧭 Milestones
### M1 · Findings as JSON
- `parseReview(text)` returns `{ ok: true, verdict, findings }` for a fenced `json` block, bare JSON, or JSON with
  chatter around it; when the answer quotes the format first, the **last** block wins
- It returns `{ ok: false, error }` for no JSON, broken JSON, an unknown severity, a finding without a `file.js:12`
  location, `CLEAN` with findings and `ISSUES` without any
- The reviewer's instructions give the JSON format for when a script asks for it, and its tools stay read-only;
  `reviewerArgs()`'s prompt asks for JSON and names the file

### M2 · Two roles, two permission sets
- `.github/agents/fixer.agent.md` can read, edit and run; it fixes **only** the findings in the JSON file it gets,
  adds a test per fix, runs `npm test`, and never pushes
- `reviewerArgs(file, { credits })`: `--agent reviewer`, `-s`, no write or shell permission, and
  `--max-ai-credits` set to `credits` (30 by default)
- `fixerArgs(file, findingsPath, { credits })`: `--agent fixer`, the findings file in the prompt, `write` and
  `shell(npm:*)`, `git push` denied, no `--allow-all`, and its cap
- `roundBudget(n)` returns `{ reviewer, fixer }`: whole credits, each at least 30, together at most `n`; it throws a
  `RangeError` below 60

### M3 · The loop and its stop rules
- `reviewLoop({ file, maxRounds, creditsPerRound, dir, run, runTests })` calls Copilot only through `run(args)` (the
  checks pass a fake that replays recorded answers) and the tests only through `runTests()`
- Each round: review → stop if the answer is `unreadable`, the code is `clean`, or there's `no-progress` (the score
  isn't lower than the round before: the score, not the number of findings) → write `<dir>/round-<n>.findings.json`
  → fix → tests. After `maxRounds`: `max-rounds`
- A round that can't be paid for stops with `budget` before any call; a call that throws stops with `error`

### M4 · The run report
- `report.json` in `dir`: `{ file, maxRounds, creditsPerRound, rounds, stop, reason }`, each round `{ round, verdict,
  findings, score, credits: { reviewer, fixer }, findingsFile, tests }` (`fixer` and `tests` are `null` when there
  was no fix); `reviewLoop()` returns the same object
- `report.md` is `renderReport(report)`: a `| Round | Verdict | Findings | Score | Credits | Tests |` table with one
  row per round, then `Stopped: <stop>. <reason>`, even when the loop never started
- `--dry-run` prints both commands with their caps

## 📂 Work here
```bash
cd labs/lab-03/hard/src
code scripts/review-loop.mjs .github/agents/fixer.agent.md
node scripts/review-loop.mjs deadlines.js --dry-run
node labs/start.mjs test lab-03 hard        # from the workshop folder
```
`review-loop.mjs` gives you the plumbing: the real Copilot call, the test runner, writing the report, and the command
line. A real run costs credits: `node scripts/review-loop.mjs deadlines.js --max-rounds 1` is one review and one fix,
with 60 credits of cap. The free checks never call Copilot.

## 💡 Hints
### M1
<details><summary>Finding the JSON</summary>

```js
const blocks = [...text.matchAll(/`{3}json[^\n]*\n([\s\S]*?)`{3}/g)];
```
gives every fenced block: take the last one. Without one, try the text from the first `{` to the last `}`. Wrap
`JSON.parse` in `try`: a model's JSON can be broken, and the parser's message makes a good `error`.

</details>

<details><summary>Check before you trust</summary>

Check every finding: a severity in `WEIGHT`, a location like `/^[\w./-]+:\d+$/`, a problem that isn't empty.
Normalise as you go (`toLowerCase()`, strip backticks) and return the cleaned findings: the fixer gets exactly what
you checked.

</details>

### M2
<details><summary>Least privilege, call by call</summary>

The agent's `tools` decide what the model can do at all; the permission flags decide what runs without asking. In
`-p` mode nobody can answer a question, so anything not allowed is refused. The reviewer needs no permissions
(`--deny-tool=write` makes that explicit); the fixer needs `--allow-tool=write` and `--allow-tool=shell(npm:*)`,
and `--deny-tool=shell(git push)` wins over every allow. The reference fixer also has
`disable-model-invocation: true`: an agent that edits and runs starts only when you (or the loop) pick it.

</details>

<details><summary>Why 60 credits a round</summary>

`copilot help limits`: `--max-ai-credits` is at least 30, and it counts per session. A round is two sessions, so it
needs at least 60 credits of cap. The cap is soft: usage is known only after a response, so a call can go a little
over.

</details>

### M3
<details><summary>When does it stop?</summary>

Start with `previous = Infinity`. After each review: `CLEAN` → stop; `score(findings) >= previous` → `no-progress`
(a fixer that made nothing better won't do better on the next try, and every try costs credits); otherwise
`previous = score` and on to the fix.

</details>

<details><summary>Testable by design</summary>

Never call `copilotRun` directly inside the loop: use the `run` you're given, and `await` it (it may return a
promise). The checks pass a fake that replays recorded answers and records every call. It's the same trick as
`leashArgs()` in Lab 05: build the arguments in a function, and test the function.

</details>

### M4
<details><summary>A report for a loop that stopped half-way</summary>

Push the round's entry to `report.rounds` before the first call of the round, then fill it in, so a loop that stops
in the middle still reports that round. Call `finish(stop, reason)` at every exit: it writes both files.

</details>

## 🧠 Takeaway
Agents should hand over checked data, not prose, and a loop around them needs a budget and a reason to stop.

## ❓ Check yourself
Round 1 finds three issues (score 6). After the fix, round 2 finds three different issues, also with score 6. What
should the loop do?
1. Run the fixer again: the findings changed, so it is making progress.
2. Review again with a bigger credit cap, to be sure about the score.
3. Stop with `no-progress`: the code isn't getting better, and every extra round costs credits.

<details><summary>Answer</summary>

**3.** Progress is measured, not hoped for. The same score means the fixes trade one problem for another (or the
reviewer moved the goalposts): a person should look before more credits go in.

</details>

## 🚀 Going further
- Record what a round really cost: `--usage-output-file` writes a session's usage as JSON; put it in `report.json`
  next to the cap.
- Make "the tests are red after a fix" a stop rule too, and roll the change back.
- Add a third agent after the fixer, a `tester` that only reports coverage gaps (Lab 03 hard++ builds a whole team).
- Lab 07 hard runs your reviewer on every pull request, in CI.
