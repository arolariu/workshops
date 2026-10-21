# 🟡 Medium · Think first

> 🕐 30–45 min · 🏠 homework · 🆓 free checks · 🤖 optional agent check (about 1 prompt) · 🧱 builds on: Lab 00 · easy

## 🎯 Mission
Students keep asking "what's my GPA?". Add a `gpa(courses)` function to `grades.js`, but this time **think first**:
let Copilot plan before it types, read the plan like a tech lead, build it, then review the diff like a code reviewer.
Then break something on purpose and undo it with `/rewind`, so you know the safety net works before you need it.
Last, perform each interactive step honestly, and measure: is planning worth its tokens? Do the same request once without a plan and compare `/usage`.
`PLAN.md` separates automated checks from live-step evidence: the plan, review, rewind, and bill entries are
completed only by actions you actually performed. Text mentioning a command is not proof of a live interaction.

## 📋 Requirements
1. `PLAN.md` holds the plan (3+ numbered steps) that names `gpa`, how it handles bad input, and how it's tested.
2. `gpa(courses)` takes `[{ credits, finalGrade }]` and returns the credit-weighted average, rounded to 2 decimals.
   It throws a `TypeError` if `courses` is not an array, and a `RangeError` for an empty list, a grade outside 1–10,
   or credits that are not a positive whole number.
3. `grades.test.js` tests `gpa`: the normal case and the errors. `npm test` is green.
4. `PLAN.md` records the evidence template for live `/diff` and `/rewind` steps, separately from automated checks.
5. `PLAN.md` compares actual `/usage` numbers for a plan-first run and a direct run, with numbers, and says which cost more and why.

## 🧭 Milestones
### M1 · The plan
- `## Plan` in `PLAN.md` has 3+ numbered steps
- The plan names `gpa`, says what happens with bad input (which error), and how you'll test it

### M2 · Build it
- `gpa()` is exported, weights by credits and rounds: `[{6, 9}, {4, 7}]` → `8.2`
- Bad input throws the right error type (`TypeError` for a non-array, `RangeError` for the rest)
- `grades.test.js` tests `gpa` and uses `assert.throws(() => gpa(…), …)` for the errors; `npm test` is green

### M3 · Review and rewind
- `## Review` has 2+ findings from `/diff`, one bullet each, at least one naming the file (`grades.js` or
  `grades.test.js`)
- `## Rewind` says which bad request you undid, that `/rewind` undid it, and what came back

### M4 · What it cost
- `## Usage` has numbers from `/usage` in the table for both runs: `plan-first` and `direct` (AI credits, or premium
  requests on the old billing, and input and output tokens; `45,300` and `45.3k` both work)
- Below the table, one or two sentences: which run cost more, and why

## 📂 Work here
```bash
mkdir -p labs/.runs                    # from the workshop folder
cp -r labs/lab-00/medium/src labs/.runs/direct
cd labs/lab-00/medium/src
copilot
node labs/start.mjs test lab-00 medium     # from the workshop folder
```
The copy in `labs/.runs/direct/` is for M4's run without a plan: make it now, while there's no `gpa` yet. In
PowerShell: `mkdir -Force labs/.runs` and `Copy-Item -Recurse labs/lab-00/medium/src labs/.runs/direct`. `labs/.runs/`
is ignored by git, but delete the copy when you're done. `PLAN.md` is already in `src/` with its four headings and an
empty usage table: fill it in as you go. This level uses AI credits for two short sessions.

## 💡 Hints
### M1
<details><summary>Plan mode</summary>

Type `/plan` followed by what you want (or press **Shift+Tab** until you're in plan mode). Copilot asks clarifying
questions and writes a plan instead of code. Push back before you accept it: "what happens with 2.5 credits?"

</details>

<details><summary>Anchor the plan with an example</summary>

`gpa([{ credits: 6, finalGrade: 9 }, { credits: 4, finalGrade: 7 }])` → `8.2`, because (6×9 + 4×7) / 10 = 8.2.
Concrete examples make plans much better. Then ask Copilot to save the plan under `## Plan` in `PLAN.md`.

</details>

### M2
<details><summary>Let the plan drive</summary>

"Implement the plan in PLAN.md, step by step, and run npm test at the end." Use `!npm test` yourself (no AI, no
credits) to see the result. Testing an error: `assert.throws(() => gpa([]), RangeError);`

</details>

### M3
<details><summary>Be the reviewer</summary>

`/diff` shows every change Copilot made in this folder. Read it like a pull request: does it match the plan? Is
every error case tested? Write each thing you noticed as a bullet, with the file name, and what you did about it.

</details>

<details><summary>A bad turn on purpose</summary>

Once the tests are green, ask: "Rewrite gpa() as a one-liner and drop the input checks, they slow it down." Look at
`/diff`, then `/rewind`: it undoes the last turn **and** its file changes. Run `!npm test` to confirm.

</details>

### M4
<details><summary>Two runs, two bills</summary>

`/usage` shows this session's AI credits and tokens: copy them into the `plan-first` row now. For `direct`, start
`copilot` in `labs/.runs/direct/`, ask for the same feature in one prompt without planning, run `/usage`, copy the
numbers, then delete the copy. Same feature, two prices.

</details>

## 🧠 Takeaway
Plan, review, undo, measure: the agent types fast, but you decide what gets kept, and every turn has a price.

## ❓ Check yourself
Your plan-first run used about 50% more input tokens than the direct run, though both wrote almost the same code.
Where did the extra tokens most likely go?
1. Into the extra turns: every turn sends the whole conversation again, the plan and your questions included.
2. Into the plan itself: Copilot charges for plan mode at a higher rate than for normal turns.
3. Into memory: the model stores the plan between turns, and storing it costs tokens.

<details><summary>Answer</summary>

**1.** The model is stateless: each turn re-sends the system prompt, the tools, the whole history and every tool
result. More turns means the same context paid for again. That's the price of planning; a better first diff is what
you buy with it.

</details>

## 🚀 Going further
- `/review` gives you a second opinion on your change; compare it with your own findings.
- `/context` shows what fills the context window right now; `/compact` summarises the history to make it smaller.
- Plan mode outside the TUI: `copilot --help` lists `--plan` and `--mode plan`. Try them on a throwaway copy; Lab 00
  hard scripts Copilot.
