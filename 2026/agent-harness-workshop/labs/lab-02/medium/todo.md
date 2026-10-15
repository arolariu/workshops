# 🟡 Medium · A command you call by name

> 🕐 15 min · 🆓 free checks · 🤖 optional agent check (about 1 prompt)

## 🎯 Mission
Stack traces scare beginners. Build `/explain-error`: a skill you call by name with an error (or a file
that contains one) that answers in a fixed, friendly format: the **cause** in plain words, **where** it
happened (`file:line`), and a minimal **fix**. Then use it on the real crash in `fixtures/crash.txt` and fix
the bug it finds.

## 📂 Work here
```bash
cd labs/lab-02/medium/src
copilot
```

## ✅ Done when
- `.github/skills/explain-error/SKILL.md` exists with `name`, a "what + when" `description` and an `argument-hint`
- Its numbered steps say how to find the right stack frame and line, and the answer format has three
  sections: **Cause**, **Where**, **Fix**
- `copilot skill list` shows it
- `summary()` in `report.js` no longer crashes on a course without grades (it says `no grades yet`), and
  `report.test.js` has a regression test for it. `npm test` is green.

## 💡 Hints
<details><summary>Arguments</summary>

Type `/explain-error fixtures/crash.txt` in a session: everything after the name is passed to the skill.
`argument-hint` is the grey placeholder shown while you type. Tell the skill what to do when the argument
is a file path.

</details>

<details><summary>A fixed output format</summary>

Spell the format out in the skill, with the exact headings you want (`### Cause`, `### Where`, `### Fix`).
Fixed formats make answers easy to scan, and easy to test.

</details>

<details><summary>Stack-trace reading tip</summary>

The first frame from *your* project is usually the interesting one. Frames from `node:internal` or
`<anonymous>` rarely are. Put that rule in your steps.

</details>

## 🚀 Going further
- Add `disable-model-invocation: true` so the skill runs **only** when you call it, never on its own.
- Make it handle Python tracebacks too. What would you change?
