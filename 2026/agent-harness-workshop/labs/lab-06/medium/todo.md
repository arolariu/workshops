# 🟡 Medium · A zero-credit command

> 🕐 20 min · 🆓 free checks (this level never spends AI credits)

## 🎯 Mission
*"What do I need on the exam?"* is a formula, not a question for an AI. The StudyBuddy extension already has
a `/due` command. Add `/grades <course>`: it shows the grades so far and the exam grade needed **to pass**
and **to get an 8**. It runs locally, instantly, for free.

## 📂 Work here
```bash
cd labs/lab-06/medium/src
code .github/extensions/studybuddy/extension.mjs
copilot --experimental        # then try /due and, later, /grades SE201
```

## ✅ Done when
- `/grades SE201` prints the course, its grades, `To pass: at least <x> on the exam` and
  `For an 8: at least <y> on the exam`, with needed grades **rounded up** to 2 decimals
- If an 8 needs more than 10, it says `not reachable` (and shows the number)
- Passing always needs at least 5 on the exam (the rule from Lab 01)
- No argument → a usage line listing your courses; unknown course → a friendly message with the course list;
  no grades yet → it says so. Course codes are case-insensitive.

## 💡 Hints
<details><summary>The maths</summary>

final = (Σ grade × weight + exam × examWeight) / 100, so the exam you need for a target T is
(T × 100 − Σ grade × weight) / examWeight. For SE201: (800 − 510) / 40 = 7.25.

</details>

<details><summary>Rounding up without surprises</summary>

`9.2 * 50` is `459.99999999999994` in JavaScript. Round the sum to 2 decimals first, then round the result
**up**: `Math.ceil(x * 100) / 100` (careful with floating-point noise here too).

</details>

<details><summary>Arguments</summary>

The handler gets a context object: `ctx.args` is the raw text after the command name (`" se201 "`).
Trim it and upper-case it. Print with `await session.log(text)`.

</details>

## 🚀 Going further
- Register a **tool** (`tools: [...]` in `joinSession`) so the model can call the same calculation when
  you ask *"Can I still get an 8 in SE201?"* in plain language.
- Listen to `session.on('tool.execution_start', …)` and count tool calls per session.
