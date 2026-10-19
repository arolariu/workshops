# 🟡 Medium · A zero-credit command

> 🕐 30–45 min · 🏠 homework · 🆓 free checks (this level never spends AI credits) · 🧱 builds on: Lab 06 · easy

## 🎯 Mission
*"What do I need on the exam?"* is a formula, not a question for an AI. *"What's due for SE201 this month?"* is a
filter. Both deserve an answer that is instant, always the same and free, so they become **slash commands** in the
StudyBuddy extension: code that runs inside Copilot CLI without ever reaching the model. A command people type by
hand also gets typed wrong, so yours parse their arguments properly and answer mistakes with an error that says
what went wrong and what to type instead.

## 📋 Requirements
1. `/grades <course>` shows the grades so far and the exam grade needed **to pass** and **for an 8**, rounded **up**
   to 2 decimals; passing always needs at least 5 on the exam (the rule from Lab 01).
2. `/due [days] [--course <code>]` lists what's due in the next `days` (1–60, default 7), optionally for one course
   (`--course SE201` or `--course=SE201`), soonest first.
3. Course codes are case-insensitive. An unknown code is named, the courses are listed, and a code one character
   off gets a suggestion ("Did you mean SE201?").
4. Every mistake is logged as an **error** (`session.log(text, { level: 'error' })`) with the command's `Usage:`
   line; normal answers stay normal output. Nothing ever prints `undefined`, `NaN` or a stack trace.

## 🧭 Milestones
### M1 · /grades does the maths
- `/grades` is registered with a description (the command menu shows it)
- `/grades SE201` shows the course name, `To pass: at least 5 on the exam` and `For an 8: at least 7.25 on the exam`
- AI210 needs exactly 6.8 for an 8 (no floating-point noise), DB220 needs 8.4
- `/grades ma110` needs 5.67 to pass, and an 8 is `not reachable` (it would need 10.67)

### M2 · Errors that help
- `/grades` alone: `Usage: /grades <course>` and every course code, logged as an error; also when the CLI sends no
  `args` field at all
- `/grades XYZ999` names the code, lists the courses and ends with the usage line; `SE21`, `se2011` and `SE301` get "Did you mean SE201?"
- `/grades SE201 AI210` asks for one course at a time (with the usage line, as an error)
- `/grades WEB230` says there are no grades yet: that's an answer, not an error

### M3 · /due takes arguments
- `/due` still lists the next 7 days; `/due 14` adds the Portfolio page (13 days) but not the Code review (19 days)
- `/due --course se201` lists only SE201; `/due 30 --course=SE201` lists both SE201 items, soonest first
- `/due 1` says "Nothing due in the next 1 day"
- `abc`, `0`, `61`, `2.5`, `-5`, `3 4`, `--course` (no code), `--course XYZ999` and `--soon` are errors with
  `Usage: /due [days] [--course <code>]`, and list nothing

## 📂 Work here
```bash
cd labs/lab-06/medium/src
code .github/extensions/studybuddy/extension.mjs
copilot --experimental     # then /due 14 and /grades SE201
node labs/start.mjs test lab-06 medium     # from the workshop folder
```
The extension already has `/due` (always 7 days) and two helpers: `say(text)` for answers and `fail(text)` for
problems. The checks load your extension with a stand-in for the Copilot SDK and type the commands for you, so they
never spend a credit either.

## 💡 Hints
### M1
<details><summary>The maths</summary>

final = (Σ grade × weight + exam × examWeight) / 100, so the exam you need for a target T is
(T × 100 − Σ grade × weight) / examWeight. For SE201: (800 − 510) / 40 = 7.25. Passing needs the larger of that
(with T = 5) and 5.

</details>

<details><summary>Rounding up without surprises</summary>

`9.2 * 50` is `459.99999999999994` in JavaScript. Round the sum to 2 decimals first, then round the result **up**:
`Math.ceil(x * 100) / 100` (and careful with floating-point noise there too: round `x * 100` to a few decimals
before `Math.ceil`).

</details>

### M2
<details><summary>Where the arguments are</summary>

The handler gets a context object: `ctx.args` is the raw text after the command name (`" se201 "`), and it may be
missing. `String(ctx?.args ?? '').trim().split(/\s+/).filter(Boolean)` gives you a list of words, empty when there
is nothing.

</details>

<details><summary>One character off</summary>

The edit distance (Levenshtein) between two codes counts the insertions, deletions and changes that turn one into
the other. `SE21` → `SE201` is 1 (insert `0`). Compute it with one row of a table, and suggest a course only when
exactly one code is at distance 1.

</details>

### M3
<details><summary>A tiny parser</summary>

Walk the words once. `--course=X` and `--course X` set the course; anything else starting with `-` (and not a
negative number) is an unknown option; the rest must be one whole number from 1 to 60. Return
`{ days, course }` or `{ error }`, and let the handler turn an error into `fail(error + '\n' + USAGE)`.

</details>

## 🧠 Takeaway
When the answer is a formula or a filter, write a command: it's instant, free and always right, and its errors can teach.

## ❓ Check yourself
A student types `/grades SE201` fifty times this semester. What does that cost in AI credits?
1. Fifty small requests: the command still asks the model to format the answer.
2. Nothing: the handler runs locally in the extension's Node.js process, and the model never sees the command.
3. One request: the first call is cached and the rest come from the cache.

<details><summary>Answer</summary>

**2.** A slash command from an extension is plain code in a process next to Copilot CLI. It logs its answer to the
timeline without a model turn, so it costs nothing, and the same input always gives the same output.

</details>

## 🚀 Going further
- Register a **tool** (`tools: [...]` in `joinSession`) so the model can call the same calculation when someone asks
  *"Can I still get an 8 in SE201?"* in plain words. Lab 06 hard++ ships one in a plugin.
- Add `/due --overdue`: items whose date has passed and that aren't done.
- Listen to `session.on('tool.execution_start', …)` and count tool calls per session.