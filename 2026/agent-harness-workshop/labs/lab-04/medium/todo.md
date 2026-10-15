# 🟡 Medium · Add a tool

> 🕐 15 min · 🆓 free checks · 🤖 optional agent check (about 1 prompt)

## 🎯 Mission
Students keep asking *"When is my next exam, and how much does it count?"*, and the portal has no tool for
that. Add a `get_exam_dates` tool to the MCP server. Its description matters as much as its code: the model
reads it to decide when to call the tool.

## 📂 Work here
```bash
cd labs/lab-04/medium/src
code mcp/studybuddy-server.mjs     # or ask Copilot to help
```
The server is already registered in `.mcp.json`.

## ✅ Done when
- `tools/list` shows `get_exam_dates` with a helpful description (what it returns + when to use it), an
  object input schema and `readOnlyHint: true`
- Calling it returns every upcoming exam, **soonest first**, each with `course`, `name`, `examDate`,
  `daysLeft` and `examWeight`
- The existing tools still work

## 💡 Hints
<details><summary>Follow the pattern</summary>

Copy `get_courses` and change it. All the data is in `mcp/portal-data.json` (`courses[].examDate` and
`examWeight`), and `daysLeft(date)` already exists.

</details>

<details><summary>Test without Copilot</summary>

The checks talk JSON-RPC to your server directly. You can too:
```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_exam_dates","arguments":{}}}' | node mcp/studybuddy-server.mjs
```

</details>

<details><summary>A description that sells the tool</summary>

Say what comes back (dates, days left, weight) and when it's useful ("questions about exams and study
planning"). Vague descriptions mean the model never calls your tool.

</details>

## 🚀 Going further
- Add an optional `withinDays` input to limit the list.
- Ask Copilot to plan your study weeks from the exam dates and weights.
