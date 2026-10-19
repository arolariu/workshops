# 🔴 Hard · Defense in depth

> 🕐 1–1.5 h · 🏠 homework · 🆓 free checks · 🤖 optional agent check (about 1 prompt) · 🧱 builds on: Lab 05 · medium

## 🎯 Mission
Every single guardrail can be bypassed; layers make bypasses expensive. Add a secret scanner and tests that run
after every edit, then **prove** the guard works: a table-driven test suite that passes on a good guard and fails on
broken ones. Only then let the agent work unattended, on a leash with exactly the permissions the job needs. A guard
nobody tests is a guard that quietly stopped working three commits ago.

## 📋 Requirements
1. The guard blocks any write or command that contains a secret (GitHub tokens, AWS keys, private keys, API keys),
   without repeating the secret, and neither log ever contains one.
2. A `postToolUse` hook runs the tests after every change to a `.js` file and logs the result.
3. `guard-cases.json` describes the guard's behaviour as a table (30+ rows), and `guard.test.mjs` turns every row into
   a test.
4. The suite agrees with the reference guard and fails on each of six broken guards (mutants).
5. `scripts/leash.mjs` runs Copilot unattended with least privilege and a credit cap.

## 🧭 Milestones
### M1 · Secret scanner
- Writes and commands containing `ghp_…` (36 chars), `github_pat_…`, `AKIA…` (16 chars), a `-----BEGIN … PRIVATE KEY-----`
  block or `sk-…` (32+ chars) are denied, and the reason does **not** repeat the secret. `process.env.GITHUB_TOKEN` is fine
- `.agent-logs/guard.jsonl` and `.agent-logs/audit.jsonl` never contain a secret (mask it, e.g. `[REDACTED]`)

### M2 · Tests after every edit
- `.github/hooks/scripts/run-tests-after-edit.mjs` is a registered `postToolUse` hook: after an edit to a `.js` file it
  runs the tests and appends `{ at, file, result: "pass" | "fail", pass, fail }` to `.agent-logs/tests.jsonl` (nothing
  for other files)

### M3 · A suite that catches regressions
- `.github/hooks/scripts/guard-cases.json` has 30+ rows `{ tool, args, expect: "allow" | "deny", why }`, at least 8 of
  them allowed, and at least two denied rows for each rule: rm -rf, dependencies, `.env`, `.github/hooks`, secrets
  (write a secret as `{{secret:ghp}}`, `{{secret:aws}}`, … and the runner fills it in)
- `node --test .github/hooks/scripts/guard.test.mjs` runs one test per row and passes on your guard
- It also passes on the reference guard, and **fails** on each of the six mutants in `labs/lab-05/hard/tests/mutants/`
  (one rule removed each, and one rule that blocks too much)

### M4 · A leash
- `leashArgs(prompt)` in `scripts/leash.mjs`: prompt mode, a credit cap (30–60), may write files and run `npm`/`node`,
  may **not** `git push` or `rm`. No `--allow-all`, no bare `shell` permission

## 📂 Work here
```bash
cd labs/lab-05/hard/src
node --test .github/hooks/scripts/guard.test.mjs     # your suite
node scripts/leash.mjs --dry-run                     # the leash's arguments
```

## 💡 Hints
### M1
<details><summary>Matching secrets</summary>

`/\bghp_[A-Za-z0-9]{36}\b/` is the shape of a classic GitHub token. Build similar patterns for the others. Scan
`JSON.stringify(args)` for write tools and shell calls, and name the kind of secret in the reason, never its value.

</details>

<details><summary>Logs are a leak too</summary>

The plumbing logs the arguments. Add a `redact(text)` that replaces every secret pattern (with the `g` flag) before
anything is logged, in the guard **and** in the audit hook.

</details>

### M2
<details><summary>Run the tests from a hook</summary>

The payload has `toolName` and `toolArgs` (an object from Copilot, a JSON string from the checks: handle both).
Only `.js` files count. Run `node --test` with `spawnSync`, and read the `# pass` and `# fail` lines of
`--test-reporter=tap`.

</details>

### M3
<details><summary>What makes a row worth having</summary>

A row earns its place when some broken guard gets it wrong. Pair every denied spelling with an allowed neighbour:
`rm -rf build` (deny) next to `rm -r empty-folder` (allow), `npm install lodash` next to `npm install`. The allowed
rows are what catch a guard that blocks too much.

</details>

<details><summary>The runner</summary>

```js
const reason = decide(c.tool, expand(c.args));
assert.equal(reason ? 'deny' : 'allow', c.expect, reason ?? 'the guard allowed it');
```
Import `decide` from `./guard.mjs` (not a copy of it): the check swaps that file for each mutant.

</details>

<details><summary>Trying the mutants yourself</summary>

Copy a mutant over your guard in a scratch copy of `src/`, run the suite, and read which rows fail. If none do, the
table has no row about that rule, or none that a broken guard gets wrong.

</details>

### M4
<details><summary>Least privilege for the leash</summary>

Think about the job: edit files (`write`), run tests (`shell(npm:*)`, `shell(node:*)`). Then the denials that must
win even if someone widens the allow list later: `shell(git push)`, `shell(rm)`.

</details>

## 🧠 Takeaway
A guard is code, so test it like code: a table of calls and a suite that fails when a rule goes missing.

## ❓ Check yourself
Your guard suite has 40 rows, all `"expect": "deny"`, and it passes. A teammate's change makes the guard deny every
shell command. What happens?
1. The suite fails, because 40 rows are plenty to notice any change.
2. The suite still passes: without allowed rows, a guard that blocks everything looks perfect.
3. The suite fails, because `node --test` reports guards that block too much.

<details><summary>Answer</summary>

**2.** A deny-only table can't tell a precise guard from a wall. The allowed rows (normal work that must keep
working) are what catch over-blocking, which is why the check needs some and why one mutant blocks every `npm` call.

</details>

## 🚀 Going further
- Run the leash on a real task and read `.agent-logs/` afterwards: every call, every test run, every denial.
- Write your own mutant (say, the guard forgets `Remove-Item`) and check that your suite catches it.
- Try `/sandbox` to restrict file paths and network at the OS level too: a layer that doesn't depend on your regexes.
