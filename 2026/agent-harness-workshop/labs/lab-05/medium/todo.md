# 🟡 Medium · Soft rules → hard rules

> 🕐 30–45 min · 🏠 homework · 🆓 free checks · 🤖 optional agent check (about 2 prompts) · 🧱 builds on: Lab 05 · easy

## 🎯 Mission
`AGENTS.md` says: no new dependencies, never touch `.env`, never change the guardrails. The agent *mostly* listens,
and "mostly" is not a security property. Turn those three soft rules into hard ones in the guard, with denial
messages that tell the model what to do instead. Then give the team a paper trail: an audit hook that logs every
call, and a small report that answers "what did the agent do, and what did we stop?"

## 📋 Requirements
1. The guard denies new dependencies from every angle: `npm`/`yarn`/`pnpm` installs of a package, `npm pkg set`, and
   writes to `package.json` from the shell or from a file tool. Plain `npm install`, `npm ci` and `npm test` still work.
2. The guard denies any call that touches `.env` or `.env.local` (reading or writing), but not `.env.example` or
   `process.env`.
3. The guard denies changes to anything in `.github/hooks/` (file tools and shell commands); reading is fine.
4. Every denial says what to do instead, or to ask the human.
5. `audit.mjs` logs every call, successful or failed, as one JSON line in `.agent-logs/audit.jsonl`, and never breaks
   the session.
6. `scripts/audit-report.mjs` summarises the guard's log: calls per tool, and every denial.

## 🧭 Milestones
### M1 · No new dependencies
- `npm install lodash`, `npm i -D jest`, `npm add`, `yarn add`, `pnpm add`, `npm pkg set …`, `echo {} > package.json`,
  `Set-Content package.json …` and any edit or creation of `package.json` are denied
- `npm install`, `npm ci`, `npm i`, `npm test`, `npm install --no-audit`, viewing or `cat`-ing `package.json` are allowed
- The denials say what to do instead ("write a small helper instead, or ask the human")

### M2 · Off-limits files
- `.env` and `.env.local` are off-limits to every tool (`view`, `cat`, `Get-Content`, edits); `.env.example`,
  `process.env.HOME` and `echo $HOME` are fine
- Editing, creating, deleting, moving or overwriting anything in `.github/hooks/` is denied; reading it is fine
- Both denials say what to do instead

### M3 · An audit trail
- `.github/hooks/scripts/audit.mjs` is registered for `postToolUse` **and** `postToolUseFailure` (bash and powershell)
- It appends `{ at, tool, args, result }` per call to `.agent-logs/audit.jsonl`: `result` is `success`, or `failure`
  with the `error`
- On bad input it exits 0 and prints nothing

### M4 · The audit report
- `summarize(lines)` in `scripts/audit-report.mjs` returns `{ calls, unreadable, perTool, denials }`: calls per tool
  (most first, then by name) with how many were denied, and every denial (`at`, `tool`, `reason`) in log order. Blank
  lines don't count; broken lines count as `unreadable`
- `node scripts/audit-report.mjs [file]` prints the Markdown report for `.agent-logs/guard.jsonl` (or the file you
  give it), and exits 1 with a clear message when the file does not exist

## 📂 Work here
```bash
cd labs/lab-05/medium/src
code .github/hooks/scripts/guard.mjs scripts/audit-report.mjs
node labs/start.mjs test lab-05 medium      # from the workshop folder
```
The `rm -rf` rule from the easy level is already there. The checks feed fake tool calls to your guard, like Copilot does.

## 💡 Hints
### M1
<details><summary>Install vs. install a package</summary>

The difference between `npm install` and installing a package is a package name after the verb (flags like `-D` start
with `-`). One regex handles npm, pnpm and yarn: `/\b(npm|pnpm|yarn)\s+(install|i|add)\b(\s+-\S+)*\s+[^-\s]/`.

</details>

<details><summary>The shell can write files too</summary>

`echo {} > package.json`, `tee package.json`, `sed -i … package.json`, `Set-Content package.json …`: look for
`package.json` in a segment whose command writes (or that has a `>` redirect into it). `npm pkg set` is an editor in
disguise.

</details>

### M2
<details><summary>Where to look in a tool call</summary>

Shell calls have `args.command`; file tools (`view`, `edit`, `create`, …) have a path somewhere in their arguments.
Searching `JSON.stringify(args)` catches every field at once. For `.env`, match the file name, not the word: `.env`
followed by the end, a quote, a slash or a space, and not `.example`.

</details>

### M3
<details><summary>Success and failure are two events</summary>

`postToolUse` fires after a call **succeeds** (`toolResult.resultType` is `"success"`). A failed call fires
`postToolUseFailure` instead, with an `error` string and no `toolResult`. Register the same script for both and
tell them apart by the fields. Denied calls never reach either: the guard's own log has them.

</details>

<details><summary>Never break the session</summary>

Wrap everything in `try { … } catch {}`, print nothing, and append with `fs.appendFileSync` (one line per call:
`JSON.stringify(entry) + '\n'`).

</details>

### M4
<details><summary>Counting with a Map</summary>

Split into lines, skip blank ones, `JSON.parse` the rest inside `try` (a broken line is `unreadable++`). Keep a
`Map` of tool → `{ tool, calls, denied }`; push `{ at, tool, reason }` to `denials` when `decision === 'deny'`.
Sort with `b.calls - a.calls || a.tool.localeCompare(b.tool)`.

</details>

## 🧠 Takeaway
A rule only counts when code enforces it, and a good denial tells the model what to do next.

## ❓ Check yourself
Your guard blocks `npm install lodash`. The model then runs `echo '{"dependencies":{"lodash":"4"}}' > package.json`.
What does that tell you about your rules?
1. Nothing: the model is misbehaving, and `AGENTS.md` should say "don't do that" more firmly.
2. A rule about *one command* protects nothing: protect the *outcome* (package.json changes) from every tool.
3. The hook should switch off the shell tool, because shell commands can't be checked.

<details><summary>Answer</summary>

**2.** The model looks for another way to reach its goal, so guard the thing you care about (the file), not the
first spelling of the attempt. A denial reason that offers an alternative ("write a small helper") makes the next
attempt a good one instead of a workaround.

</details>

## 🚀 Going further
- Run `copilot` here, ask it to "add lodash", then run `node scripts/audit-report.mjs`: every call and every denial.
- Add a `--json` flag to the report, and a "denials per rule" count by grouping on the reason.
- Your guard reads `JSON.stringify(args)`: what would a tool with a base64-encoded argument get past it? (Lab 05 hard+
  normalises calls before deciding.)
- In a real run, the agent listed the folder with `Get-ChildItem | Where-Object { $_ -ne '.env' }`, carefully *avoiding*
  `.env`, and your text rule denied it anyway. Is that the right call? What would a rule that looks at paths instead of
  text allow, and what would it miss?
