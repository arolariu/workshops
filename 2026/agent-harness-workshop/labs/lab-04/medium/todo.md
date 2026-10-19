# 🟡 Medium · Add a tool

> 🕐 30–45 min · 🏠 homework · 🆓 free checks · 🤖 optional agent check (about 1 prompt) · 🧱 builds on: Lab 04 · easy

## 🎯 Mission
Students keep asking *"When is my next exam, and how much does it count?"*, and the portal has no tool for that.
Add `get_exam_dates` to the MCP server. The model never sees your code: it sees the tool's **name, description and
input schema**, and it reads every error you return. So design all three for a reader that is a language model:
say what the tool returns and when to use it, accept only inputs you can handle, and when a call is wrong, say
exactly what was wrong and how to fix it.

## 📋 Requirements
1. `get_exam_dates` is listed by `tools/list`, marked read-only, with a description of 60–500 characters that says
   what it returns (exam date or days left, and how much the exam counts) and when to use it.
2. Its input schema has two optional inputs, each with a description: `course` (a string) and `withinDays` (an
   integer from 1 to 365). Any other input is refused (`additionalProperties: false`).
3. Without inputs it returns every upcoming exam, soonest first, each with `course`, `name`, `examDate`, `daysLeft`
   and `examWeight`. `course` (any case) and `withinDays` filter that list; no match is an empty list.
4. Bad input comes back as a tool result with `isError: true` and a message that names the problem and the way out
   (the valid courses, the allowed range, the accepted inputs). It is never a JSON-RPC error, and the server keeps
   working afterwards.
5. The existing tools still work.

## 🧭 Milestones
### M1 · The tool and its schema
- `get_exam_dates` is listed with `annotations: { readOnlyHint: true }` and a description that says what it returns
  (exams, date or days left, weight) and when to use it, in 60–500 characters
- `inputSchema` is `{ type: "object", properties: { course, withinDays }, additionalProperties: false }`: `course`
  is a string, `withinDays` an integer with `minimum: 1` and `maximum: 365`, both described, neither required

### M2 · The right exams
- Without inputs: DB220, AI210, SE201, MA110, WEB230, with DB220 on 2026-11-02, 18 days away, counting 50%
- `course: "db220"` gives DB220 only; `withinDays: 30` gives DB220 and AI210; `withinDays: 18` still includes
  DB220; SE201 within 30 days is an empty list, not an error
- `get_deadlines` still returns A2 and A1

### M3 · Helpful errors
- `course: "XX999"` is an `isError` result that repeats `XX999` and lists the five real course codes
- `withinDays` 0, -3, 2.5, `"soon"` and 400 are `isError` results that name `withinDays` and the range 1 to 365
- `{ "when": "soon" }` is an `isError` result that names `when` and the inputs the tool accepts; none of these is a
  JSON-RPC error, and a good call still works afterwards

## 📂 Work here
```bash
cd labs/lab-04/medium/src
code mcp/studybuddy-server.mjs     # look for 👉
node labs/start.mjs test lab-04 medium     # from the workshop folder
```
The server is already registered in `.mcp.json`. The checks start it from there and talk to it through a real MCP
client, with the `initialize` handshake first, like Copilot does.

## 💡 Hints
### M1
<details><summary>Follow the pattern</summary>

Copy `get_courses` and change it. All the data is in `mcp/portal-data.json` (`courses[].examDate` and
`examWeight`), and `daysLeft(date)` already exists.

</details>

<details><summary>A description that sells the tool</summary>

The model picks tools by their descriptions, and every description is sent on every turn. Say what comes back
(dates, days left, weight), when it's useful ("questions about exams, revision and study planning"), and what the
inputs do. Vague: the model never calls your tool. Long: you pay for it on every turn.

</details>

<details><summary>integer, not number</summary>

JSON Schema's `"number"` accepts 2.5; `"integer"` doesn't. `minimum` and `maximum` tell the model the range before
it calls, and they let your server refuse anything outside it.

</details>

### M2
<details><summary>Test without Copilot</summary>

The checks talk JSON-RPC to your server directly. You can too (bash):
```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/call",
  "params":{"name":"get_exam_dates","arguments":{"withinDays":30}}}' |
  tr -d '\n' | node mcp/studybuddy-server.mjs
```
(One message per line: that's why the `tr`. The server answers on stdout.)

</details>

### M3
<details><summary>Check every call against its schema</summary>

The schema only *describes* the inputs: nothing enforces it unless your server does. Write a small `checkArgs(schema,
args)` that returns a list of problems (unknown keys when `additionalProperties` is `false`, wrong types, values
outside `minimum`/`maximum`), call it in the plumbing before **every** handler, and turn problems into an `isError`
result. Then every tool, now and later, is checked the same way.

</details>

<details><summary>Errors the model can act on</summary>

`Invalid input` makes the model guess. `withinDays must be a whole number between 1 and 365 (got 2.5).` makes it fix
the call. `Unknown course "XX999". Known courses: SE201, AI210, …` lets it retry with a real one. A JSON-RPC error
(`{ "error": … }`) is for broken requests, like a tool that doesn't exist: the model is less likely to see it or
recover from it.

</details>

## 🧠 Takeaway
A tool's name, description, schema and error messages are a prompt: write them for the model that reads them.

## ❓ Check yourself
The model calls `get_exam_dates` with `{ "withinDays": "two weeks" }`. Which answer helps it most?
1. A JSON-RPC error `-32602 Invalid params`, because the request broke the schema.
2. `isError: true` with "withinDays must be a whole number between 1 and 365 (got "two weeks")."
3. Ignore the bad input and return every exam, so the model gets something useful.

<details><summary>Answer</summary>

**2.** A tool result with `isError` goes back to the model as text it can read, and a message that names the input,
the rule and the bad value lets it fix the call (`14`). A protocol error is for requests that are broken beyond the
tool's own rules, and silently ignoring input hides the mistake and answers a different question.

</details>

## 🚀 Going further
- Ask Copilot *"Plan my study weeks from my exam dates and how much each exam counts"* and watch which tools it calls.
- Add an `outputSchema` and return `structuredContent` too (MCP 2025-06-18 and later): clients can then check your
  results, not only your inputs.
- Run `/context` in a session: how many tokens do the portal's tool schemas cost on every turn?
- Lab 04 hard adds a tool that **changes** something, where a vague contract costs more than a wrong answer.
