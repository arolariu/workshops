# 🟡 Medium · A command you call by name

> 🕐 30–45 min · 🏠 homework · 🆓 free checks · 🤖 optional agent check (about 1 prompt) · 🧱 builds on: Lab 02 · easy

## 🎯 Mission
`node print-report.js` won't even start, and when it does, it crashes twice more. Stack traces scare beginners, and
pasting them into a chat gets a different kind of answer every time. Build `/explain-error`: a skill you call by name
with an error (or a file that holds one) that always answers in the same three sections: the **cause** in plain
words, **where** it happened as `file:line`, and a minimal **fix**. Decide whether the model may also call it on its
own, and write down why. Then use it on all three crashes in `fixtures/` and fix the bugs it finds.

## 📋 Requirements
1. `.github/skills/explain-error/SKILL.md` has `name`, a description that says what it does and when to use it, and
   an `argument-hint` that shows both ways to call it (an error message, or a file).
2. Its answer format is a contract: exactly `### Cause`, `### Where`, `### Fix`, in that order; `Where` is a
   `<file>:<line>` relative to the project root.
3. Its steps handle three shapes of crash: a normal stack trace, an error our own code threw on purpose, and a crash
   with no frame from the project at all.
4. `disable-model-invocation` is set explicitly, with a comment that says why, and the description matches the
   choice.
5. All three crashes are fixed (each in the right place), each fix has a regression test, and `npm test` is green.

## 🧭 Milestones
### M1 · Called by name
- `name: explain-error`, and a description with what it does and "Use when …"
- `argument-hint` names both forms, for example `"<error message, or a file with the stack trace>"`
- `copilot skill list` shows it as a project skill

### M2 · An output contract
- At least three numbered steps that find the stack frame and open the file at that line
- The answer has exactly `### Cause`, `### Where` and `### Fix`, in that order
- `Where` is `<file>:<line>`, relative to the project root
- One rule per crash shape: skip frames that aren't ours (`node:internal`, `node_modules`); an error our own
  validation threw on purpose means the bug is in the **caller**; no project frame at all (a `SyntaxError` before
  anything runs) means the `file:line` on the first line

### M3 · Who may call it
- `disable-model-invocation: true` or `false`, written out even if it's the default
- A YAML comment (`# …`, on that line or the line above) says why, in a sentence
- `false`: the description names what triggers it (a stack trace, a crash, an error message). `true`: the
  description or the steps tell people to type `/explain-error`

### M4 · Three crashes, three fixes
- `fixtures/crash-import.txt`: `print-report.js` imports something `deadlines.js` doesn't export
- `fixtures/crash.txt`: `summary()` says `no grades yet` for a course without grades
- `fixtures/crash-attendance.txt`: `attendanceLines()` says `no sessions yet` for a course without sessions, and
  `attendanceRate([])` **still** throws its `RangeError`
- `node print-report.js` prints the whole report, `report.test.js` has a test per crash, and `npm test` is green

## 📂 Work here
```bash
cd labs/lab-02/medium/src
copilot
# then, in the session:
/explain-error fixtures/crash-import.txt
```
`SKILL.md` is a skeleton: write the frontmatter and the steps first, start a **new** session (`/new`) so Copilot
reads it again, then use it on each crash, in this order: `crash-import.txt`, `crash.txt`, `crash-attendance.txt`.
Each fix makes `node print-report.js` get one step further. The line numbers in a crash file are from the moment it
crashed: once you fix `summary()`, `attendanceLines()` sits a few lines lower than `report.js:23`, so look for the
function, not only the number. Check from the workshop folder: `node labs/start.mjs test lab-02 medium`.

The optional agent check calls the skill the way a person does, with the prompt `/explain-error fixtures/crash.txt`,
so it should pass whichever invocation choice you make in M3 (the reference chooses `false`).

## 💡 Hints
### M1
<details><summary>What the argument does</summary>

Everything you type after `/explain-error` reaches the skill as its argument. `argument-hint` is only the grey
placeholder shown while you type, so make it say what to pass. Then tell the skill, in step 1, what to do when the
argument is a file path: open it first.

</details>

### M2
<details><summary>A contract, not a suggestion</summary>

Spell the exact headings out, in order, with one line under each that says what goes there. "Answer with exactly
these three sections" is a rule the model can follow and a reader can scan. A fixed format is also what makes an
answer testable: the agent check looks for these three words and a `file:line`.

</details>

<details><summary>Three shapes of crash</summary>

Open the three fixtures side by side. In `crash.txt` the first frame from the project is the bug. In
`crash-attendance.txt` the first project frame is a `throw new RangeError(…)`: that line is the *validation*
doing its job, so the bug is one frame further down, in the code that called it. `crash-import.txt` has no project
frame at all: the module never ran, and the only location is the `file:line` on the first line.

</details>

### M3
<details><summary>How to decide</summary>

Ask two questions: does it change anything (files, commits, deployments)? And would people want it without
remembering its name? `explain-error` only reads and answers, and people paste stack traces without typing a
command: letting the model use it is cheap and helpful. A skill that deploys or deletes is the opposite.

</details>

<details><summary>Where the reason goes</summary>

```yaml
# The model may call it on its own: it only reads, and …
disable-model-invocation: false
```
YAML comments stay in the file for the next reviewer, and they aren't part of the description that sits in every
turn's context.

</details>

### M4
<details><summary>Fix the caller, not the validation</summary>

`attendanceRate([])` throws on purpose: an attendance rate of an empty list means nothing. Deleting the `throw`
makes the crash go away and hides the next bug. The caller in `report.js` knows what to say instead ("no sessions
yet"), so the fix goes there.

</details>

<details><summary>A regression test per crash</summary>

Copy the shape of the test that's already in `report.test.js`: one `test()` for a course without grades and one for
a course without sessions, each with `assert.deepEqual` on the exact line. Try both a missing list and an empty one.

</details>

## 🧠 Takeaway
A skill you call by name is a command with a contract: a hint for its argument, a fixed answer format, and a written-down choice about who may call it.

## ❓ Check yourself
A teammate writes a `deploy-preview` skill that pushes the current branch to a preview server. It has a good
description and works well. What should its frontmatter say about model invocation?
1. Nothing: the default lets the model use it whenever a request matches, which is what makes skills useful.
2. `disable-model-invocation: true`: it has side effects, so only a person who types `/deploy-preview` starts it.
3. `disable-model-invocation: false` and a longer description, so the model only picks it when it's sure.

<details><summary>Answer</summary>

**2.** A skill with side effects should run only when a person asks for it by name. A better description makes a
wrong pick less likely, never impossible; `explain-error` can stay model-invocable because a wrong pick costs a
few tokens, not a deployment.

</details>

## 🚀 Going further
- Add a fourth section only when it helps: `### Prevent` (a lint rule or a type check that would have caught it).
- Make it handle a Python traceback too. Which rule changes? (Python prints the most recent call **last**.)
- Lab 02 hard puts a script inside a skill, so the exact part of the work is done by code, not by the model.
