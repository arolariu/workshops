# 🟡 Medium · Think first

> 🕐 15 min · 🆓 free checks · 🤖 optional agent check (about 1 prompt)

## 🎯 Mission
Students keep asking "what's my GPA?". Add a `gpa(courses)` function to `grades.js`, but this time
**plan before you build**: have Copilot write a plan into `PLAN.md`, read it, push back if something is
missing, then let it implement the plan. Before you accept anything, review the diff like a code reviewer.

## 📂 Work here
```bash
cd labs/lab-00/medium/src
copilot
```

## ✅ Done when
- `gpa(courses)` takes `[{ credits, finalGrade }]` and returns the credit-weighted average, rounded to 2 decimals
- It throws a `TypeError` if `courses` is not an array, and a `RangeError` for an empty list, a grade outside
  1–10, or credits that are not a positive whole number
- `PLAN.md` holds the plan (at least 3 steps), `grades.test.js` has tests for `gpa`, and `npm test` is green

## 💡 Hints
<details><summary>Plan mode</summary>

Type `/plan` followed by what you want (or press **Shift+Tab** until you're in plan mode). In plan mode
Copilot asks clarifying questions and writes a plan instead of code. Ask it to save the plan to `PLAN.md`.

</details>

<details><summary>Be the reviewer</summary>

When the plan is good, ask Copilot to implement it. Then type `/diff` to review every change. Don't like
it? `/rewind` undoes the last turn, including its file changes.

</details>

<details><summary>Example to anchor the plan</summary>

`gpa([{ credits: 6, finalGrade: 9 }, { credits: 4, finalGrade: 7 }])` → `8.2` because (6×9 + 4×7) / 10 = 8.2.
Paste this example into your plan prompt: concrete examples make plans much better.

</details>

## 🚀 Going further
- Compare: run the same request once without planning (in a copy) and compare the diffs.
- Try `/review` for a second opinion on your change.
