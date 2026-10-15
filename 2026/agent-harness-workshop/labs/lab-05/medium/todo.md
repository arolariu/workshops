# 🟡 Medium · Soft rules → hard rules

> 🕐 20 min · 🆓 free checks · 🤖 optional agent check (about 2 prompts)

## 🎯 Mission
`AGENTS.md` says: no new dependencies, never touch `.env`, never change the guardrails. The agent *mostly*
listens. Turn those three soft rules into hard ones in the guard, then add an audit trail: a
`postToolUse` hook that logs every tool call to `.agent-logs/audit.jsonl`.

## 📂 Work here
```bash
cd labs/lab-05/medium/src
code .github/hooks/scripts/guard.mjs
```
The `rm -rf` rule from the easy level is already there.

## ✅ Done when
- **Dependencies**: `npm install <pkg>`, `npm i -D <pkg>`, `npm add`, `yarn add`, `pnpm add` and any edit of
  `package.json` are denied. Plain `npm install`, `npm ci` and `npm test` still work.
- **Secrets**: any tool call that touches `.env` or `.env.local` is denied (reading, `cat`, editing).
  `.env.example` is fine, and so is `process.env.HOME` in code.
- **Guardrails**: editing or creating anything in `.github/hooks/`, or deleting/overwriting it from the
  shell, is denied. *Reading* it is fine.
- **Audit**: `.github/hooks/scripts/audit.mjs` runs as a `postToolUse` hook and appends one JSON line per call
  (time, tool, arguments, result) to `.agent-logs/audit.jsonl`

## 💡 Hints
<details><summary>Where to look in a tool call</summary>

Shell calls have `args.command`. File tools (`view`, `edit`, `create`, …) have a path somewhere in their
arguments. Searching `JSON.stringify(args)` catches every field at once.

</details>

<details><summary>The dependency rule</summary>

The difference between a plain install and installing a package is a package name after the verb (flags
like `-D` start with `-`). One careful regex handles npm, pnpm and yarn.

</details>

<details><summary>The audit hook</summary>

`postToolUse` gets the same input plus `toolResult` (`resultType`: `success`, `failure`, `denied`). Append
with `fs.appendFileSync`, wrap everything in `try/catch`, and print nothing. Then register it in
`.github/hooks/guardrails.json` next to `preToolUse`.

</details>

## 🚀 Going further
- Give the agent a hint in the denial: *"No new dependencies: write a small helper function instead."*
- Write `scripts/audit-report.mjs` that counts calls per tool and lists every denial.
