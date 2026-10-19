# 🔴 Hard · Defense in depth

> 🕐 30 min · 🆓 free checks · 🤖 optional agent check (about 2–4 prompts)

## 🎯 Mission
Every single guardrail can be bypassed. Layers make bypasses expensive. Add three more layers to this
project, then let the agent work **autonomously** inside them.

## 📋 Requirements
1. **Secret scanner**: the guard blocks any write or command containing a secret (GitHub tokens, AWS keys,
   private keys, API keys), and your logs never contain the secret itself.
2. **Tests after every edit**: a `postToolUse` hook runs the tests whenever the agent changes a `.js` file
   and logs the result.
3. **A leash**: `scripts/leash.mjs` runs Copilot unattended with exactly the permissions a
   "change code + run tests" job needs, and a budget.

## 🧭 Milestones
### M1 · Secret scanner
- Writes/commands containing `ghp_…` (36 chars), `github_pat_…`, `AKIA…` (16 chars), a `-----BEGIN … PRIVATE KEY-----`
  block or `sk-…` (32+ chars) are denied, and the reason does **not** repeat the secret.
  `process.env.GITHUB_TOKEN` is fine.
- `.agent-logs/guard.jsonl` and `.agent-logs/audit.jsonl` never contain a secret (mask it, e.g. `[REDACTED]`)

### M2 · Tests after every edit
- `.github/hooks/scripts/run-tests-after-edit.mjs` is a registered `postToolUse` hook: after an edit to a `.js`
  file it runs the tests and appends `{ at, file, result: "pass" | "fail", pass, fail }` to `.agent-logs/tests.jsonl`
  (nothing for other files)

### M3 · A leash
- `leashArgs(prompt)`: prompt mode, a credit cap (30–60), may write files and run `npm`/`node`, may **not**
  `git push` or `rm`. No `--allow-all`, no bare `shell` permission.

## 📂 Work here
```bash
cd labs/lab-05/hard/src
node scripts/leash.mjs --dry-run
```

## 💡 Hints
### M1
<details><summary>Matching secrets</summary>

`/\bghp_[A-Za-z0-9]{36}\b/` is the shape of a classic GitHub token. Build similar patterns for the others.
Scan `JSON.stringify(args)` for write tools and shell calls.

</details>

<details><summary>Logs are a leak too</summary>

The plumbing logs the arguments. Add a `redact(text)` that replaces every secret pattern (with the `g` flag)
before anything is logged, in the guard **and** in the audit hook.

</details>

### M2
<details><summary>Run the tests from a hook</summary>

The payload has `toolName` and `toolArgs` (a JSON string: parse it and read `path`). Only `.js` files count.
Run `node --test` with `spawnSync`, and read the `# pass` and `# fail` lines from its output.

</details>

### M3
<details><summary>Least privilege for the leash</summary>

Think about the job: edit files (`write`), run tests (`shell(npm:*)`, `shell(node:*)`). Then the denials
that must win even if someone widens the allow list later: `shell(git push)`, `shell(rm)`.

</details>

## 🚀 Going further
- Run the leash on a real task and read `.agent-logs/` afterwards: every call, every test run.
- Try `/sandbox` to restrict file paths and network at the OS level too.
