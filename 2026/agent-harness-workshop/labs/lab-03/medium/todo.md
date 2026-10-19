# 🟡 Medium · A specialist with a boundary

> 🕐 30–45 min · 🏠 homework · 🆓 free checks · 🤖 optional agent check (about 1 prompt) · 🧱 builds on: Lab 03 · easy

## 🎯 Mission
The reviewer left three findings in `REVIEW.md`. Before anyone fixes anything, **prove** them: a finding is an
opinion, a red test is evidence. Create a `test-writer` agent that may write and run tests but must never touch
library code, and let it turn every finding into a test that fails *because of that bug*. It reports what it proved
in `BUGS.md` instead of quietly fixing it, so whoever fixes the bugs next (the fixer, in Lab 03 hard) works from
evidence, not from opinions.

## 📋 Requirements
1. `.github/agents/test-writer.agent.md` can read, edit and run, and nothing more: no delegation, no web, no `*`.
2. Its instructions draw the boundary: test files and `BUGS.md` only, never library code; report, don't fix; start
   from the findings in `REVIEW.md`.
3. Every finding in `REVIEW.md` has a test that fails now and passes once that bug is fixed the way the review
   suggests.
4. No test is red for any other reason, the existing tests stay green, and `deadlines.js` doesn't change.
5. `BUGS.md` has one report per finding: its location, steps, expected, actual, and the name of the red test.

## 🧭 Milestones
### M1 · A test-writer with a boundary
- A description that says what it does and when to use it, and `tools` with read, edit and execute
- None of `agent` (or `custom-agent`, `Task`), `web` or `*`: a test-writer that can delegate can ask another agent to
  "just fix it"
- Its instructions name the files it may edit, what it must never touch, that it reports bugs in `BUGS.md` instead of
  fixing them, and that it starts from the findings in `REVIEW.md`

### M2 · One red test per finding
- At least three tests fail on today's `deadlines.js`, and each expects what the review suggests:
  `upcoming()` leaves out assignments with `done: true`; `today(now)` returns the **local** date of `now`
  (`YYYY-MM-DD`); `daysBetween()` throws a `RangeError` for a date that isn't a real `YYYY-MM-DD`
- Each finding has a red test that turns green when **only that** bug is fixed (the checks apply the review's three
  fixes one at a time), and every test passes when all three are fixed
- The checks run in UTC, so a time-zone test pins its own zone
- `deadlines.js` and the existing tests are unchanged

### M3 · Bug reports that point at the proof
- `BUGS.md` has one `## ` report per finding, each with the finding's location from `REVIEW.md` (`deadlines.js:23`,
  `deadlines.js:7`, `deadlines.js:12`), the steps, **Expected** and **Actual**
- Each report names its red test exactly, and every red test is in a report

## 📂 Work here
```bash
cd labs/lab-03/medium/src
copilot --agent test-writer
node labs/start.mjs test lab-03 medium      # from the workshop folder
```
`test-writer.agent.md` and `BUGS.md` are skeletons; `REVIEW.md` (the reviewer's work from the easy level) is your
input. When you're done, `npm test` is red **on purpose**: three tests prove three bugs. Lab 03 hard fixes them.

## 💡 Hints
### M1
<details><summary>Which tools?</summary>

To write tests it needs `edit`; to run them, `execute`; to understand the code, `read` and `search`. The boundary on
*which files* it may edit lives in its instructions: a tool list can't say "only `*.test.js`".

</details>

<details><summary>Why not `agent`?</summary>

An agent that can delegate can ask another agent, one with `edit`, to change `deadlines.js` for it. Its boundary
then leaks through a deputy that never agreed to it. Lab 03 hard+ audits exactly this.

</details>

### M2
<details><summary>Red for the right reason</summary>

Write each test as the behaviour you expect, then run it. It must fail on its assertion (the `expected`/`actual`
lines in the output), not crash on an import or a typo. One behaviour per test, so each one can turn green on its
own.

</details>

<details><summary>The time-zone test</summary>

```js
process.env.TZ = 'Europe/Bucharest'; // at the top of the test file
// 00:30 on 20 October in Bucharest is 21:30 UTC on the 19th
assert.equal(today(new Date('2026-10-19T21:30:00Z')), '2026-10-20');
```
Node picks up a new `TZ` straight away. Without it, the test is red in Bucharest and green on a UTC build server.

</details>

<details><summary>Let the agent do it</summary>

`copilot --agent test-writer`, then: *"Turn each finding in REVIEW.md into a red test, and report them in
BUGS.md."* Watch it run `npm test`. Then ask it to fix one of the bugs: what does it answer?

</details>

### M3
<details><summary>A report someone can act on</summary>

A title that says what's wrong, the finding's location, the steps, Expected, Actual, and the failing test. Copy the
test name from the `✖` line of `npm test`, so the next person (or agent) can run exactly that test.

</details>

## 🧠 Takeaway
A finding is an opinion; a test that is red now and turns green when exactly that bug is fixed is evidence.

## ❓ Check yourself
Your test-writer has `tools: ['read', 'search', 'edit', 'execute']` and the instruction "never change library code".
What actually stops it from editing `deadlines.js`?
1. The tool list: `edit` only works on files whose name ends in `.test.js` for an agent called test-writer.
2. Only its instructions: `edit` can change any file, so "which files" is a wish the model usually follows.
3. Copilot's permission prompt, which only offers test files to a test-writer.

<details><summary>Answer</summary>

**2.** The tool list decides *which tools* reach the model, not which files they may touch. For a hard boundary on
paths you need permissions (`--deny-tool='write(deadlines.js)'`) or a hook (Lab 05), and a check on the outcome:
`deadlines.js` is unchanged.

</details>

## 🚀 Going further
- Make the boundary hard: `copilot --agent test-writer --deny-tool='write(deadlines.js)'`, then ask it to fix a bug.
- Hand `BUGS.md` to the default agent: *"Fix the bugs in BUGS.md and make the tests green."* Then read the diff: did
  it change only `deadlines.js`, or did it "fix" a test too?
- Add `include-custom-instructions: true`: run as a subagent, a custom agent doesn't read `AGENTS.md` unless it asks to.
- Add `disable-model-invocation: true` if this agent should only run when you pick it by name.
