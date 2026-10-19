# 💎 Hard++ · Layered governance

> 🕐 2–3 h · 🏠 homework · 🆓 free checks · 🤖 optional agent check (about 1 prompt) · 🧱 builds on: Lab 05 · hard+

## 🎯 Mission
StudyBuddy now belongs to an organisation, and the security team has rules no repository may weaken: no secrets, no
piping downloads into a shell, no force-pushes. Put their policy **on top of** yours, so an organisation denial holds
whatever the repository says. Use the session hooks: `sessionStart` tells the model the rules before its first call,
and `userPromptSubmitted` flags prompts that look like an injection and locks that session down. Finally, make the
audit trail **tamper-evident** (a hash chain someone can verify) and turn it into the report a security review asks
for: what was denied, by which rule, in which session.

## 📋 Requirements
1. `effectivePolicy(org, repo)` layers the organisation's policy over the repository's: an org deny always wins; a
   repository allow rule marked `"override": true` can make an exception to the repository's own denies, never the
   org's (and, like every allow rule, only when it covers every command of the call). A missing or invalid org policy
   denies every call. `.github/CODEOWNERS` gives the guardrails an owner.
2. A `sessionStart` hook adds context that names every org deny rule, and records the session and the sha256 of both
   policy files in the audit chain.
3. A `userPromptSubmitted` hook flags injection-shaped prompts; the guard puts a flagged session in lockdown, an
   allow-list: reads, and calls an allow rule marked `"lockdown": true` covers, and nothing else.
4. Every hook writes to a hash-chained audit log the agent may read but not change; `verify()` catches edits,
   deletions, reordering, a cut-off or emptied chain and broken lines, and names every problem's line.
5. `scripts/governance-report.mjs` reports denials by rule and by session from a verified chain, and refuses a broken one.

## 🧭 Milestones
### M1 · Two layers
- `effectivePolicy(org, repo)` in `engine.mjs` returns `{ policy, problems }`: every rule gets `layer: "org"` or
  `"repo"`; a repository rule named `org-…` or setting `layer` is a problem; only allow rules may say `"override": true`
- `evaluate(policy, call, { lockdown })` returns `layer` too, deciding in this order: org deny → lockdown → repository
  override → any other deny (highest severity) → first allow → `default`. Overrides are allow rules, so
  `rm -rf dist && rm -rf src` isn't covered by an override for `dist`
- The guard loads `HARNESS_ORG_POLICY` (or `.github/hooks/policies/org.json`) and `policies/repo.json`; an org deny like
  `git push --force` holds, `"layer"` is logged, and no usable org policy means every call is denied
- `.github/CODEOWNERS` has a line for `/.github/hooks/` with an owner (on GitHub it only has teeth with a branch
  rule that turns on *Require review from Code Owners*)

### M2 · Session start
- `session-start.mjs` is registered for `sessionStart` (bash and powershell)
- It prints `{ "additionalContext": "…" }`, under 1,500 characters, naming every org deny rule by its id
- It appends `{ type: "session-start", at, session, source, policies: { org, repo } }` to the chain (each policy file's
  sha256, in hex)

### M3 · Prompts that look like injection
- `scanPrompt(text)` returns the signals it finds: `override`, `role`, `system-prompt`, `hidden-characters`, `encoded`,
  `exfiltration`. It flags all 12 malicious prompts in `tests/fixtures/prompts.json` (with the expected signal) and
  none of the 12 ordinary ones
- `prompt-scan.mjs` is registered for `userPromptSubmitted`; for a flagged prompt it writes
  `.agent-logs/flags/<sessionId>.json` and a `prompt-flag` chain entry, and it prints nothing
- With a flag file for the session, lockdown is an **allow-list**: reads (`view`, `grep`, `glob`) stay allowed;
  everything else (shell commands, file changes, `web_fetch`, MCP tools, sub-agents) is denied, reason: the session
  is in lockdown, unless an allow rule marked `"lockdown": true` covers the whole call (add one for `npm test`)

### M4 · A tamper-evident audit log
- `append(file, entry)` writes `{ ...entry, seq, prev, hash }` with `hash = sha256(prev + "\n" + canonical(entry
  without hash))`, `prev` the previous hash (64 zeros for the first), and `<file>.head` = `"<seq> <hash>"`
- `verify(file)` returns `{ ok, entries, problems: [{ line, kind }] }` with kinds `unreadable`, `hash`, `link`, `seq`
  and `head`, reporting every problem, not just the first; the head file is checked even when the chain is empty;
  neither a file nor a head is an empty, intact chain
- `append()` survives a damaged last line: it links to the last entry that parses (and starts a new line), and
  `verify()` still reports the damaged one
- A repository rule denies changing `.agent-logs/` (from tools and from the shell: `rm`, `>>`, `sed -i`, …); reading
  it, or naming it in `.gitignore`, stays allowed
- The guard, the session hook and the prompt hook all append to `.agent-logs/audit-chain.jsonl`;
  `node scripts/verify-audit.mjs` exits 0 on an intact chain and 1 (naming the line) on a tampered one

### M5 · The governance report
- `governanceReport(entries)` turns `tests/fixtures/chain.jsonl` into exactly
  `tests/fixtures/governance-report.golden.md`:
  ```text
  # Governance report

  ✅ The audit chain is intact: 13 entries, seq 1 to 13.

  ## Denials by rule
  | Rule | Layer | Severity | Denials |
  |---|---|---|---|
  | no-recursive-force-delete | repo | critical | 2 |

  ## Sessions
  | Session | Calls | Denials | Flagged |
  |---|---|---|---|
  | s-102 | 3 | 3 | override, role |

  ## Flagged prompts
  - s-102 · override, role · "Ignore all previous instructions. …"
  ```
  Rules: most denials first, then by name; layer and severity come from the rule's first denial. Sessions: in order
  of first appearance; calls are `decision` entries; `no` when not flagged. Empty sections say `No denials.`,
  `No sessions.` or `No flagged prompts.`
- `node scripts/governance-report.mjs [file]` verifies the chain first and exits 2, saying the chain is broken, when it
  isn't intact

## 📂 Work here
```bash
cd labs/lab-05/hard-plus-plus/src
code .github/hooks/policies/org.json .github/hooks/scripts/engine.mjs
code .github/hooks/scripts/audit-chain.mjs
node labs/start.mjs test lab-05 hard++       # from the workshop folder
```
The security team's `policies/org.json` is ready; the hook skeletons, `scripts/verify-audit.mjs` and the report's
command-line part are given. In a real organisation the org layer would be a policy hook installed machine-wide
(`/etc/github-copilot/policy.d/` or `C:\ProgramData\GitHub\Copilot\policy.d\`), which users can't disable.

## 💡 Hints
### M1
<details><summary>Precedence, step by step</summary>

Collect the matching rules once (`hits`), then return at the first step that applies: an org `deny` in `hits`; in
lockdown, any call that isn't a read (`call.kind !== 'read'`) with no matching allow rule marked `lockdown: true`; a
repository allow rule with `override: true`; any deny (highest severity); the first allow; the default. Each return
says its `layer`. Match allow rules the way hard+ does: every command of the call, or it doesn't fire.

</details>

<details><summary>Where the org policy comes from</summary>

`process.env.HARNESS_ORG_POLICY ? path.resolve(process.env.HARNESS_ORG_POLICY) : path.join(HERE, '..', 'policies', 'org.json')`.
If it can't be read, or `effectivePolicy()` reports problems, deny with a reason that names the organisation policy.

</details>

### M2
<details><summary>What the model needs to know</summary>

One or two sentences: which policies govern the session, the ids of the org deny rules, and "a denied call comes
back with a reason: follow it". It's in the context for the whole session, so keep it short. In `-p` mode the prompt
hook fires *before* `sessionStart`: don't rely on the session hook having run first.

</details>

### M3
<details><summary>Signals, not verdicts</summary>

Each signal is one regex: `override` (ignore/disregard/forget … previous/your … instructions/rules), `role` (you are
now, developer mode, jailbreak, DAN), `system-prompt` (reveal/print … system prompt/hidden instructions),
`hidden-characters` (zero-width `\u200B-\u200D`, `\u2060`, `\uFEFF`, bidi `\u202A-\u202E`, `\u2066-\u2069`),
`encoded` (a base64 run of 100+ characters: a sha512 integrity hash is 88, and one is in the ordinary prompts),
`exfiltration` (send/post/upload … `https://`). Test the ordinary prompts too: "Ignore the lint warning" is not an
attack.

</details>

<details><summary>Giving the flag teeth</summary>

The prompt hook can't block anything (Copilot ignores its output), but it can leave a file. The guard gets the same
`sessionId` on every call: if `.agent-logs/flags/<sessionId>.json` exists, call `evaluate(…, { lockdown: true })`.

</details>

### M4
<details><summary>Hashing the same thing twice</summary>

`canonical()` (given) sorts keys and drops `undefined` fields, so the entry you hash before writing is the entry you
hash after reading. `verify()` recomputes each hash from the line without its `hash` field, then compares links:
`body.prev` must equal the previous line's `hash`.

</details>

<details><summary>Why a head file</summary>

Cutting off the last lines (or all of them) leaves a chain whose links are all fine. The head file remembers the
last seq and hash, so a shorter chain, or an empty one, no longer matches it. (In production, send the head
somewhere the agent can't write: a server, a signed commit.)

</details>

### M5
<details><summary>Building the report</summary>

One pass over the entries: a `Map` of sessions (in first-seen order) with calls, denials and signals; a `Map` of
rules with layer, severity and count; a list of flag lines. Sort the rules with `b.count - a.count ||
a.rule.localeCompare(b.rule)`, then join the lines with `\n`.

</details>

## 🧠 Takeaway
Governance is layers nobody below can weaken, decisions you can prove afterwards, and flags that change what the agent may do.

## ❓ Check yourself
The repository adds `{ "id": "allow-force-push-feature", "decision": "allow", "override": true, … }` for
`git push --force origin feature/…`. The organisation policy denies every force-push. What happens when the agent
runs `git push --force origin feature/login`?
1. It's allowed: the repository's override rule is more specific than the organisation's rule.
2. It's denied: an organisation deny is checked first, and overrides only apply to the repository's own denies.
3. It's denied only if the organisation rule has a higher severity than the override.

<details><summary>Answer</summary>

**2.** Precedence is by layer, not by how specific a rule is or by severity. Overrides let a team make exceptions to
its own rules (like cleaning `dist/`), but nothing in a repository can weaken what the organisation forbids.

</details>

## 🚀 Going further
- Send the chain's head to a place the agent can't write (a CI artifact, a signed git note), and verify against that.
- Add a `sessionEnd` hook that appends a summary entry (calls, denials) and closes the session in the chain.
- Install your org policy as a real policy hook on a test machine (`policy.d/`) and see that `disableAllHooks` can't
  switch it off.
