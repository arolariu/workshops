# 🟢 Easy · The rules nobody wrote down

> 🕐 10 min · 🆓 free checks · 🤖 optional agent check (about 1 prompt)

## 🎯 Mission
The team's rules live in a messy chat dump (`team-notes.md`). The agent can't read minds, so every time
someone asks it to fix the red build, it "fixes" the test instead of the code. Turn the notes into an
`AGENTS.md` the agent will actually follow, prove that it's loaded, then let the agent fix the build.
The right way this time.

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
