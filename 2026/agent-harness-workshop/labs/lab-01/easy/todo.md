# 🟢 Easy · The rules nobody wrote down

> 🕐 10 min · 👥 together · 🆓 free checks · 🤖 optional agent check (about 1 prompt) · 🧱 builds on: Lab 00 · easy

## 🎯 Mission
The team's rules live in a messy chat dump (`team-notes.md`), and your Lab 00 `FINDINGS.md` says which rule the
code forgets. The agent can't read minds, so every time someone asks it to fix the red build, it "fixes" the test
instead of the code. Turn the notes into an `AGENTS.md` the agent will actually follow, prove that it's loaded,
then let the agent fix the build. The right way this time.

## 📂 Work here
```bash
cd labs/lab-01/easy/src
copilot
```

## ✅ Done when
- `AGENTS.md` has sections for **commands, conventions, domain rules, boundaries** and **definition of done**,
  and stays short (under 100 lines)
- It contains a canary rule: every answer ends with `Harness check: AGENTS.md loaded`
- Copilot lists it (`/instructions` or `copilot instruction list`)
- `npm test` is green and `grades.test.js` is untouched

## 🧠 Takeaway
Instructions are always in the context: keep them short and specific, and prove they load with a canary.

## ❓ Check yourself
Your `AGENTS.md` grows from 40 to 400 lines. What happens?
1. All 400 lines go along with every turn: more tokens, and the rules that matter get diluted.
2. Nothing much: the agent reads the file once at the start of a session and remembers it.
3. Copilot reads only the first 100 lines of an instruction file and silently skips the rest.

<details><summary>Answer</summary>

**1.** Instructions are context, not memory: the harness sends them on every turn. Long files cost more and make
the important rules easier to miss. Keep the root file short, and scope the rest with `applyTo`.

</details>

## 💡 Hints
<details><summary>Let Copilot draft, you edit</summary>

*"Read @team-notes.md and turn it into an AGENTS.md with these sections: Commands, Conventions, Domain
rules, Boundaries, Definition of done. Under 50 lines."* Then read it critically: you own this file, not the AI.

</details>

<details><summary>Prove it's loaded</summary>

Instructions are read when a session starts, so type `/new` (or restart). Then `/instructions` shows the
active files. Ask *"What rules do you follow here?"*: your canary line should appear at the end.

</details>

<details><summary>The right fix</summary>

Now ask *"Fix the failing test."* With clear rules, the agent changes `hasPassed` in `grades.js` (exam grade
at least 5 too) and leaves the test alone. If it touches the test, your boundary rule isn't clear enough.

</details>

## 🚀 Going further
- Compare: `copilot --no-custom-instructions`, then ask the same question. Notice the difference?
- `/init` generates an instructions file from your code. How does it compare to yours?
