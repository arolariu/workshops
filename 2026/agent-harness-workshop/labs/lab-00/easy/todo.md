# 🟢 Easy · First contact

> 🕐 8 min · 👥 together · 🆓 free checks · 🤖 optional agent check (about 1 prompt) · 🧱 starts the chain

## 🎯 Mission
StudyBuddy's build is red and nobody knows why. Don't read the code yourself: make **Copilot** investigate.
Which test fails, where does the bug live, and which rule does the code forget? Write the answer in
`FINDINGS.md`. Don't fix anything yet. Today you're the detective, not the surgeon 🔎

## 📂 Work here
```bash
cd labs/lab-00/easy/src
copilot
```

## ✅ Done when
- `FINDINGS.md` names the failing test, the guilty file and the rule the code forgets
- `grades.js` and `grades.test.js` are unchanged
- The checks are green: press **t** in the lab app, or run `node labs/start.mjs test lab-00 easy`

## 🧠 Takeaway
The model is stateless: every turn, the harness sends the whole context again and runs the tool calls the model writes.

## ❓ Check yourself
You ask Copilot a follow-up question in the same session. What does the model receive?
1. Only your new prompt: the model still remembers the earlier turns from before.
2. A short summary of the earlier turns that the model wrote for itself, plus your new prompt.
3. The whole conversation so far (instructions, turns, tool results), plus your new prompt.

<details><summary>Answer</summary>

**3.** The model keeps no memory between calls, so the harness resends the context on every turn. That's why long
sessions cost more tokens, and why `/context` and `/compact` exist.

</details>

## 💡 Hints
<details><summary>Getting in</summary>

Start `copilot` inside `src/`. The first time, it asks whether you trust the folder: choose **Yes, and remember
this folder**. Even better: trust the whole workshop folder once by starting `copilot` in the repo root.

</details>

<details><summary>Let the tools talk</summary>

Inside Copilot, `!npm test` runs the command yourself (no AI, no credits) and its output lands in the
conversation. `@grades.js` attaches a file to your next prompt.

</details>

<details><summary>Ask like a detective</summary>

Try: *"The last test fails. Explain why in plain words, show the exact line, and don't change any file."*
Happy with the answer? *"Write that explanation to FINDINGS.md: the failing test, the file, and the rule."*

</details>

## 🚀 Going further
- `/usage` shows what this cost you; `/context` shows what fills the context window.
- `/env` lists everything Copilot loaded for this folder. It's almost empty now; you'll fill it in the next labs.
