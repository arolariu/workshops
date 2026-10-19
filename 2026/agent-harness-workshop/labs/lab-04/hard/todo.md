# 🔴 Hard · A tool that changes things

> 🕐 1–1.5 h · 🏠 homework · 🆓 free checks · 🤖 optional agent check (about 1 prompt) · 🧱 builds on: Lab 04 · medium

## 🎯 Mission
Reading is easy. **Writing** is where tools get dangerous: a wrong write is a wrong record, and models (and clients)
retry. Add `mark_done`, so a student can say *"I finished A2"* and the portal remembers it. Give it an honest
contract: validate every input and report problems as results the model can read, say in its annotations what it
really does, make a repeat harmless, and save the state so a crash or a broken file can never lose anyone's
progress. Then prove the contract with tests that talk to the server through a real MCP client.

## 📋 Requirements
1. `mark_done` takes one required string, `id`, refuses any other input, and is annotated as a write that only adds
   and is safe to repeat (`readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: true`).
2. Bad input (no id, a number, an empty string, an unknown argument, an unknown id) is a result with `isError: true`
   that says what to do, and changes nothing. Only a request the protocol can't serve (an unknown tool) is a
   JSON-RPC error.
3. Marking an assignment that is already done (by you, or in the portal) succeeds with `changed: false` and writes
   nothing. Ids are trimmed and upper-cased.
4. Done ids are saved in `{ "done": [...] }`, in `mcp/state.json` or the file in `STUDYBUDDY_STATE`, survive a
   restart, and are written to a temp file that is then renamed over the state file. A state file that can't be read
   is never overwritten.
5. `mcp-contract.test.mjs` tests the contract through an MCP client and fails on a server that breaks it.

## 🧭 Milestones
### M1 · A write tool with an honest contract
- `mark_done` is listed with `inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"],
  additionalProperties: false }`
- `annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }`, and a description that says
  it marks an assignment as done, that the change is saved, and when to use it
- Every `get_*` tool is still `readOnlyHint: true`

### M2 · Validation and `isError`
- Marking A2 works, and `get_deadlines` stops listing it
- `A9` is an `isError` result that lists the valid ids; `{}`, `{ "id": 42 }`, `{ "id": "" }` and
  `{ "id": "A2", "force": true }` are `isError` results that name the input, and none of them writes the state file
- `tools/call` for a tool that doesn't exist is a JSON-RPC error `-32602`

### M3 · Safe to repeat
- Marking A2 returns `changed: true`; marking it again returns `changed: false`, says it was already done, and is not
  an error; the state file lists A2 once
- `" a4 "` marks A4; A3 (done in the portal data) returns `changed: false` and isn't written

### M4 · Persistent and atomic
- A server restarted with the same `STUDYBUDDY_STATE` still knows what is done
- `state.json` is never opened for writing: the server writes a temp file in the same folder and renames it over
  `state.json` (the checks watch your server's file calls)
- With a corrupt `state.json`, `mark_done` is an `isError` result that mentions the state file, the file stays byte
  for byte the same, and `get_deadlines` still answers

### M5 · A contract suite
- `node --test mcp-contract.test.mjs` passes with at least 6 tests of your own
- It passes on the reference server, and fails on each of six broken servers: one that marks an unknown id, one that
  errors on a repeat, one that forgets after a restart, one whose `get_deadlines` still lists done work, one that
  says `mark_done` is read-only, and one that reports bad input as a JSON-RPC error

## 📂 Work here
```bash
cd labs/lab-04/hard/src
code mcp/studybuddy-server.mjs mcp-contract.test.mjs
node --test mcp-contract.test.mjs     # your contract
node labs/start.mjs test lab-04 hard     # from the workshop folder
```
The medium level's `checkArgs()` already checks every call against its tool's schema. `mcp-contract.test.mjs` gives
you a small MCP client (`withServer(stateFile, fn)`, `freshState()`) and one example test; its first test fails until
`mark_done` exists. The checks use a temporary `STUDYBUDDY_STATE`, so your real `mcp/state.json` is never touched.

## 💡 Hints
### M1
<details><summary>What the annotations promise</summary>

They are hints to the client, not to the server. `readOnlyHint: false`: it changes something, so a careful client
asks first. `destructiveHint: false`: it only adds (the default is `true`, so say it). `idempotentHint: true`: the
same call twice has the effect of one. `openWorldHint: false`: it only touches the portal. A client may trust these
to skip a confirmation, so they must be true.

</details>

### M2
<details><summary>Let the schema do the work</summary>

With `required: ["id"]`, `minLength: 1` and `additionalProperties: false`, `checkArgs()` already turns `{}`,
`{ "id": 42 }`, `{ "id": "" }` and `{ "force": true }` into `isError` results before your handler runs. The handler
only checks what a schema can't: does this assignment exist? Then say which ones do.

</details>

### M3
<details><summary>Idempotent, not an error</summary>

If the model calls `mark_done("A2")`, the call times out, and it tries again, the first call may have worked. An
"already done" **error** tells the model that something went wrong; it may then apologise, or try something else.
Return a normal result with `changed: false` and a friendly message instead. Same input, same end state, no
surprise.

</details>

### M4
<details><summary>Write, then rename</summary>

```js
const temp = `${STATE_FILE}.${process.pid}.tmp`;
fs.writeFileSync(temp, JSON.stringify(state, null, 2));
fs.renameSync(temp, STATE_FILE);   // replaces it in one step
```
A reader sees the old file or the new one, never half of one. Keep the temp file in the **same folder**: a rename is
only atomic on one file system.

</details>

<details><summary>Missing is fine, broken is not</summary>

No state file yet means nothing is done: `ENOENT` → `{ done: [] }`. A file that exists but doesn't parse is someone's
progress you can't read: refuse to write (an `isError` result that names the file), and let reads go on without it.
If you treated it as empty, the next write would erase it.

</details>

### M5
<details><summary>Test the promise, not the wording</summary>

Assert on `isError`, `rpcError`, `data.changed`, the ids `get_deadlines` returns, and the annotations: things the
contract promises. Don't assert your exact messages: the checks also run your suite on the reference server, which
words them differently. For the restart, call `withServer(state, …)` twice with the same `freshState()`.

</details>

## 🧠 Takeaway
A write tool needs a contract a client can trust: validated input, honest annotations, safe retries, atomic state, and tests that prove it.

## ❓ Check yourself
`mark_done` saves with `fs.writeFileSync('mcp/state.json', …)`. Two Copilot sessions in two terminals use the portal
at the same time. What is the risk that a temp file plus a rename removes?
1. The two sessions can mark the same assignment twice.
2. The model can read `state.json` and see what was done.
3. A server can read `state.json` while the other one is halfway through writing it, see broken JSON, and fail.

<details><summary>Answer</summary>

**3.** `writeFileSync` truncates the file and then writes it, so for a moment it's empty or half-written. A rename
swaps in the complete new file in one step. (It doesn't stop two writers from overwriting each other's changes:
that needs a lock, or one writer.)

</details>

## 🚀 Going further
- Leave writes to a human in scripts: `copilot --allow-tool='studybuddy(get_deadlines)' -p "…"` allows the read tool
  only, so `mark_done` needs a person.
- Two servers, one file: start two servers on the same `STUDYBUDDY_STATE` and mark A1 and A2 at the same moment. Can a
  change get lost? Add a lock file (`fs.openSync(lock, 'wx')`) and retry.
- Add `undo_done`: which annotations does it need, and who should be allowed to call it?
- Log every write to stderr with a timestamp: a tiny audit trail (Lab 05 makes it a real one).
