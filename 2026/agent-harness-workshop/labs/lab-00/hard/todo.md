# 🔴 Hard · Agent in a script

> 🕐 25 min · 🆓 free checks · 🤖 optional agent check (about 1 prompt)

## 🎯 Mission
Copilot isn't only a chat: `copilot -p` turns it into a command-line tool you can script, and
`--output-format json` makes it print every step as a JSON event. Build a mini dashboard for agent runs:
`scripts/run-stats.mjs` should summarise a recorded run (events by type, tools used, tokens spent) and be
able to record a new run safely: read-only, with a credit cap.

## 📂 Work here
```bash
cd labs/lab-00/hard/src
node scripts/run-stats.mjs fixtures/sample-run.jsonl
```
Finish the two `TODO`s in `scripts/run-stats.mjs`. Use Copilot to help, or write it yourself.

## ✅ Done when
- `summarize(lines)` returns the number of events and skipped (non-JSON) lines, counts per event `type`,
  tool calls per tool name, and the total input/output tokens. Blank lines are ignored.
- `recordArgs(prompt)` returns arguments for a prompt-mode run with JSON output, a credit cap between 30 and 50
  (30 is the CLI's minimum), and file writes denied. No `--allow-all` or `--yolo`.
- `node scripts/run-stats.mjs fixtures/sample-run.jsonl` prints the summary, and the checks are green

## 💡 Hints
<details><summary>Look at the data first</summary>

Open `fixtures/sample-run.jsonl`. Each line is `{ "type": "...", "data": { ... } }`. Tool calls are
`tool.execution_start` events (`data.toolName`); token usage comes in `assistant.usage` events
(`data.inputTokens`, `data.outputTokens`). One line is broken on purpose.

</details>

<details><summary>The flags you need</summary>

`copilot help` lists them all. You want `-p <prompt>`, `--output-format json`, `--max-ai-credits` and a
`--deny-tool` rule for file writes. Remember: deny always wins over allow.

</details>

<details><summary>Shape of the answer</summary>

`summarize` is a loop: trim each line, skip blanks, `JSON.parse` inside `try/catch` (count failures as
skipped), then `byType[type] = (byType[type] ?? 0) + 1`. Same pattern for tools. Add tokens with `?? 0`.

</details>

## 🚀 Going further
- Record a real run: `node scripts/run-stats.mjs --record "Which functions does grades.js export?"`
- Compare two models with `--model` and look at the token counts.
