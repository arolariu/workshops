# 🟣 Hard+ · Policy as code

> 🕐 1.5–2 h · 🏠 homework · 🆓 free checks · 🤖 optional agent check (about 1 prompt) · 🧱 builds on: Lab 05 · hard

## 🎯 Mission
Your guard works, but its rules are buried in code: the security team can't read them, and every new spelling of
`rm -rf` means another regex in another `if`. Attackers (and models) are creative: `rd /s /q`, `Remove-Item -rec`,
`bash -c "…"`. Turn the guard into a small **policy engine**: the rules move to `policy.json` (what to match, the
decision, the reason, the severity), commands are normalised before any rule sees them, deny always wins, and the
guard fails **closed** when the policy is broken or slow. Then add the rules for the calls a prompt injection would
make.

## 📋 Requirements
1. `.github/hooks/policy.json` holds every rule of the old guard, in the format below; `validatePolicy()` explains
   what is wrong with a broken one.
2. `evaluate()` decides: deny wins over allow, the highest severity names the rule, and the policy's `default`
   applies when nothing matches. The guard logs which rule decided.
3. `normalize()` turns every spelling of a recursive force-delete (bash, PowerShell, cmd, wrapped in `sudo`,
   `bash -c`, `cmd /c`, `powershell -Command`, …) into one canonical form, and leaves look-alikes alone.
4. A missing, invalid or slow policy denies every call, and `evaluate()` stays under 50 ms a call.
5. The policy denies piping downloads into a shell, running downloaded or encoded code, and uploading local files,
   as `critical`.

**The policy format** (`engine.mjs` says the same at the top):
```text
{ "version": 1, "default": "allow" | "deny", "rules": [
  { "id": "no-recursive-force-delete", "decision": "deny", "severity": "critical",
    "reason": "Recursive force-deletes … Delete specific files instead, or ask the human.",
    "match": { "tool": "shell", "command": "^delete --force --recursive\\b" } } ] }

match (every key given must match; regexes are case-insensitive):
  tool         "shell" | "write" | "read" | a tool name, or a list of those
  command      each normalised command, e.g. "delete --force --recursive build" or "npm install lodash"
  commandLine  the whole shell command, whitespace collapsed (pipes and $(…) live here)
  path         each path the call touches (a file tool's path; a shell command's arguments)
  text         JSON.stringify(args)
```

## 🧭 Milestones
### M1 · The policy file
- `validatePolicy(policy)` returns `[]` for a valid policy and at least one readable problem for each of the seven
  broken policies in `tests/fixtures/policies.json` (wrong version, unknown decision, duplicate id, deny without a
  reason, a regex that doesn't compile, an unknown match key, an empty match)
- `policy.json` is valid and has at least 8 deny rules: rm -rf, dependencies (installs; `package.json` from tools and
  from the shell), `.env`, `.github/hooks` (tools and shell) and the five kinds of secret

### M2 · The engine
- `evaluate(policy, call)` returns `{ decision, rule, severity, reason, matched }`: deny wins, the highest severity
  decides (the first on a tie), then the first matching allow rule, then `default`
- `guard.mjs` reads `policy.json` and asks the engine; the old decisions still hold; a rule added to `policy.json`
  changes what the guard does; `.agent-logs/guard.jsonl` records `"rule"` and `"severity"`

### M3 · One command, many spellings
- `normalize()` gives `delete --force --recursive build` for `rm -r -fo build` (PowerShell), `sudo -E bash -c "rm -Rf
  build"`, `cmd /c "rd /s /q build"` and `Remove-Item build -Recurse`, and `delete --recursive empty-folder` for
  `rm -r empty-folder`
- All 26 spellings in `tests/fixtures/spellings.json` are denied; its 14 look-alikes (`git rm -r --cached`,
  `grep -rf`, `cp -rf`, `echo "rm -rf …"`, …) are allowed
- Your hard-level suite (`node --test .github/hooks/scripts/guard.test.mjs`) still passes: keep `decide(toolName,
  args)` returning a reason or `null`

### M4 · Fail closed, fast
- Broken JSON, an invalid policy or no policy file: every call is denied, and the reason names the policy
- A rule with a catastrophic regex can't make the guard hang: it denies within 5 seconds, saying it ran out of time
- `guard.mjs` exports `DEADLINE_MS`, at least a second shorter than the hook's `timeoutSec`
- `evaluate()` takes under 50 ms for 95% of calls

### M5 · Calls an injection would make
- The 13 calls in `tests/fixtures/injection.json` are denied with severity `critical` (`curl … | sh`, `iwr … | iex`,
  `iex (iwr …)`, `powershell -EncodedCommand …`, `curl -d @.env …`, `Invoke-WebRequest … -InFile .env`,
  `bash -c "$(curl …)"`, …); its 6 normal network calls are allowed

## 📂 Work here
```bash
cd labs/lab-05/hard-plus/src
code .github/hooks/policy.json .github/hooks/scripts/engine.mjs .github/hooks/scripts/guard.mjs
node labs/start.mjs test lab-05 hard+        # from the workshop folder
```
`engine.mjs` gives you the plumbing (`segments`, `tokens`, `base`, `compile`) and a working `normalize()` that calls
your `canonical()` and `unwrap()`. `guard.mjs` is still the hard level's guard: you'll turn it into a thin client.

## 💡 Hints
### M1
<details><summary>Collect problems, don't throw</summary>

Walk the rules with `forEach((r, i) => …)` and push one sentence per problem: `Rule 3 (no-env-files): a deny rule
needs a "reason"`. `compile(m.command)` inside `try/catch` tells you whether a regex is valid. An empty `match`
would match every call: that's a problem too.

</details>

<details><summary>Porting the old rules</summary>

Read `decide()` in the hard guard and write one rule per `if`. Secrets become `text` rules (one per kind, so the
reason can name it). The `.env` rule is a `text` rule with a negative lookahead for `.example`. JSON needs every
backslash twice: `"\\.env"`.

</details>

### M2
<details><summary>Matching a rule</summary>

A rule matches when **every** key it has matches: `tool` (the call's `kind` or its tool name), `command` (any of
`call.commands[].line`), `commandLine`, `path` (any of `call.paths`), `text`. Then: `denies.reduce((a, b) =>
SEVERITY.indexOf(b.severity) > SEVERITY.indexOf(a.severity) ? b : a)`.

</details>

<details><summary>A thin guard</summary>

Keep the plumbing (read stdin, parse `toolArgs`, log, print the deny JSON). Replace the rules with: load and
validate `policy.json` (next to the `scripts/` folder: `path.join(HERE, '..', 'policy.json')`), then
`evaluate(policy, normalize(tool, args))`. Keep exporting `decide()` for your hard-level suite.

</details>

### M3
<details><summary>One family, three dialects</summary>

`rm`, `Remove-Item`, `ri`, `del`, `erase`, `rd` and `rmdir` all delete. Bash flags: `-r`/`-R`/`--recursive`,
`-f`/`--force`, combined (`-rfv`). PowerShell parameters are case-insensitive prefixes (`-rec`, `-fo`), and
`-Recurse` never asks, so it counts as force too. cmd uses `/s` (recursive) and `/q` (quiet = force).

</details>

<details><summary>Shells inside shells</summary>

`unwrap()` returns `{ command, dialect }` for the inner command, and `normalize()` calls it again on the result (up
to three levels). Prefixes (`sudo -E`, `env A=1`, `VAR=1`, `xargs`) just drop words. `bash -c`, `cmd /c`,
`powershell -Command` (or `-c`) and `Invoke-Expression` hand over the rest of the words.

</details>

### M4
<details><summary>Why your own deadline</summary>

When a `preToolUse` hook **crashes**, Copilot denies the call. When it **times out**, Copilot lets the call through
(timeouts fail open). A regex like `(a+)+$` on a long input can take minutes, so the guard must stop itself: run the
decision in a `Worker`, start a timer, and if the timer fires first, `worker.terminate()` and deny.

</details>

<details><summary>The worker pattern</summary>

```js
const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { guardWorker: true, tool, args } });
// and at the top level of the same file:
if (!isMainThread && workerData?.guardWorker) parentPort.postMessage(decision(workerData.tool, workerData.args));
```
Guard the stdin-reading part with `isMainThread`, or the worker will try to read stdin too.

</details>

### M5
<details><summary>Where the danger is</summary>

Most of these hide in the **whole** command line, not in one segment: a pipe (`curl … | sh`), a substitution
(`$(curl …)`), or a flag that sends a file (`-d @file`, `-F x=@file`, `-T`, `-InFile`). Use `commandLine` rules, and
test the allowed ones too: `curl -o page.html …` downloads, it doesn't run anything.

</details>

## 🧠 Takeaway
Rules people can read, normalised input, deny wins, and fail closed: that's what makes a guard a policy engine.

## ❓ Check yourself
Your guard's hook entry has `"timeoutSec": 10`. A new policy rule has a regex that takes 40 seconds on one unlucky
command. Without a deadline of your own, what happens to that call?
1. Copilot denies it, because a hook that doesn't answer in time is treated like a crash.
2. Copilot waits the full 40 seconds, then follows the guard's decision.
3. Copilot lets it run: a timed-out hook is skipped, so the call goes through the normal permission flow.

<details><summary>Answer</summary>

**3.** A crash or a non-zero exit denies (fail closed), but a **timeout** fails open: the hook is skipped. That's why
the guard decides in a worker with its own, shorter deadline, and denies when that runs out.

</details>

## 🚀 Going further
- Add `"decision": "ask"` (Copilot supports `permissionDecision: "ask"` in interactive sessions) for medium-severity
  rules, and keep `deny` for the rest.
- Write a policy linter: rules that can never match, allow rules hidden behind a broader deny, regexes with nested
  quantifiers.
- Lab 05 hard++ puts an organisation's policy on top of this one, and makes some of its rules impossible to override.
