# 🟡 Medium · A specialist with a boundary

> 🕐 15 min · 🆓 free checks · 🤖 optional agent check (about 1 prompt)

## 🎯 Mission
Students say StudyBuddy shows assignments they already finished. Don't fix it yet: first **prove** it.
Create a `test-writer` agent that may write and run tests but must never touch library code. When a test
exposes a bug, it reports it in `BUGS.md` instead of quietly fixing it. Then let it prove the bug.

## 📂 Work here
```bash
cd labs/lab-03/medium/src
copilot
```

## ✅ Done when
- `.github/agents/test-writer.agent.md` has a description, and tools that let it **edit and run** tests
- Its instructions set the boundary (tests and `BUGS.md` only, never library code) and say to report, not fix
- `deadlines.test.js` has a new test about **done** assignments (say "done" in its name), and that test **fails**
  (yes, red on purpose 🔴)
- `deadlines.js` is unchanged, and `BUGS.md` has a bug report with expected vs actual

## 💡 Hints
<details><summary>Which tools?</summary>

To write tests it needs `edit`; to run them it needs `execute`; to understand the code, `read` and
`search`. The boundary on *which files* it may edit lives in its instructions.

</details>

<details><summary>Write the boundary like a contract</summary>

Name the files it may touch, and the ones it must never touch. Then describe the workflow: write test →
run `npm test` → if it fails because of a bug, keep it and write a bug report.

</details>

<details><summary>Run it</summary>

`copilot --agent test-writer`, then: *"Prove with a test that upcoming() wrongly includes assignments that
are already done."* A failing test that proves a bug is a *good* outcome here.

</details>

## 🚀 Going further
- Hand `BUGS.md` to the default agent: *"Fix the bug in BUGS.md and make the tests green."*
- Add `disable-model-invocation: true` if you only want to run this agent explicitly.
