# 🔴 Hard · Prove it with data

> 🕐 25 min · 🆓 free checks · 🤖 optional agent check (about 2 prompts)

## 🎯 Mission
"Instructions make the agent better": nice claim. **Prove it.** Build a small experiment that asks Copilot
the same question with and without your custom instructions, several times, scores every answer and prints
the results side by side. Engineers measure; they don't guess.

## 📂 Work here
```bash
cd labs/lab-01/hard/src
node scripts/ab.mjs --dry-run
```
Finish the three `TODO`s in `scripts/ab.mjs`. The runner, the file output and the table are already there.

## ✅ Done when
- `buildArgs(variant, prompt)` builds a **read-only**, quiet (`-s`) prompt-mode run with a credit cap between 30
  and 50; the `without` variant also switches off custom instructions
- `score(answer)` says whether an answer shows the canary, the test command, and the exam rule (case-insensitive)
- `summarize(results)` counts runs and hits per variant (results with any other variant are ignored)
- The checks are green. Then run the real experiment: `node scripts/ab.mjs --runs 2`

## 💡 Hints
<details><summary>Which flags?</summary>

`copilot help` is your friend: you need `-p`, `-s`, a `--max-ai-credits` cap, a `--deny-tool` rule so nothing
gets written, and for the "without" variant a flag that disables custom instructions.

</details>

<details><summary>What counts as a hit?</summary>

Look at `AGENTS.md`: the canary is `Harness check`, the test command is `npm test` (or `node --test`), and the
exam rule talks about the exam and the number 5 (someone may write "five"). Regular expressions with the `i`
flag do the job.

</details>

<details><summary>The shape of the summary</summary>

```js
{ with:    { runs: 2, canary: 2, tests: 2, examRule: 1 },
  without: { runs: 2, canary: 0, tests: 1, examRule: 0 } }
```
Start from `{ with: empty(), without: empty() }`, then loop over the results and add up `score(answer)`.

</details>

## 🚀 Going further
- Run 5 times per variant. How stable are the answers?
- Remove one rule from AGENTS.md and rerun. Did that signal drop?
