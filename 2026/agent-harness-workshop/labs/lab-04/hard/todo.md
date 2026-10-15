# 🔴 Hard · A tool that changes things

> 🕐 25 min · 🆓 free checks · 🤖 optional agent check (about 1 prompt)

## 🎯 Mission
Reading is easy. **Writing** is where tools get dangerous. Add a `mark_done` tool so a student can say
*"I finished A2"* and the portal remembers it. Validate everything, report problems as tool errors the
model can read, mark it clearly as a write tool, and make the change survive a restart.

## 📂 Work here
```bash
cd labs/lab-04/hard/src
code mcp/studybuddy-server.mjs
```

## ✅ Done when
- `mark_done` takes `{ id }` (required, string) and is annotated as **not** read-only
- Marking an open assignment succeeds; `get_deadlines` stops listing it
- Unknown ids, missing ids and assignments that are already done return a result with **`isError: true`**
  and a helpful message (for unknown ids, list the valid ones)
- Done ids are saved to a JSON file: `mcp/state.json` by default, or the path in the `STUDYBUDDY_STATE`
  environment variable. A restarted server still knows them.

## 💡 Hints
<details><summary>Errors the model can read</summary>

Throwing inside a handler already becomes `{ content: [...], isError: true }` in the plumbing at the bottom
of the file. Write messages a model (and a human) can act on: *"Unknown assignment "A9". Valid ids: A1, A2, …"*

</details>

<details><summary>State</summary>

Keep it simple: `{ "done": ["A2"] }`. Read it whenever you need it, write it after every change. Then make
`get_deadlines` skip ids in the state file too.

</details>

<details><summary>Permissions</summary>

In a session Copilot asks before calling `mark_done`. In scripts you can allow only the safe tools:
`--allow-tool='studybuddy(get_deadlines)'`, and leave writes to a human.

</details>

## 🚀 Going further
- Add `undo_done` and think about who should be allowed to call it.
- Log every write to stderr with a timestamp: a tiny audit trail.
