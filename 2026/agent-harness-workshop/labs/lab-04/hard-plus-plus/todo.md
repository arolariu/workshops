# 💎 Hard++ · MCP from the protocol up

> 🕐 2–3 h · 🏠 homework · 🆓 free checks · 🤖 optional agent check (about 1 prompt) · 🧱 builds on: Lab 04 · hard+

## 🎯 Mission
So far the portal's plumbing did the protocol for you: one `tools` array, a dozen lines of JSON-RPC. Now build the
university's second server, the **library** (the course catalogue), from the protocol up: no SDK, no helper plumbing.
Shake hands and negotiate a version, offer tools, resources and prompts, hand out a long list page by page, stop work
when the client cancels or the deadline passes, serve it over HTTP behind a bearer token, and change a tool's schema
without breaking the clients that use the old one. Then prove all of it with a conformance suite that fails on a server
that breaks the rules.

## 📋 Requirements
1. `initialize` negotiates the version (the client's if supported, else the server's newest), declares only the
   capabilities the server implements, and nothing but `ping` is served before it (stdio). JSON-RPC errors use the
   right codes; notifications are never answered; stdout carries only JSON-RPC.
2. Four read-only tools, resources (`library://courses/{code}`) and the `study_plan` prompt, each with its own error
   rules: input problems are tool results with `isError`; unknown tools and bad prompt arguments are `-32602`; an
   unknown resource is `-32002`.
3. `resources/list` comes in pages with opaque cursors; a cursor the server didn't make is `-32602`.
4. A cancelled call is stopped and never answered; every call has a deadline (`LIBRARY_TIMEOUT_MS`); a slow call never
   blocks other requests.
5. `--http` serves Streamable HTTP on 127.0.0.1 behind `Authorization: Bearer $LIBRARY_TOKEN`, checks `Origin` and
   `MCP-Protocol-Version`, and refuses to start without a token.
6. `search_courses` is schema version 2; the v1 tool `find_courses` stays, deprecated and working; and
   `mcp-conformance.test.mjs` tests the server over both transports and fails on each broken server listed in M6.

## 🧭 Milestones
### M1 · The handshake
- `initialize` with `2025-11-25` (what Copilot asks for) or `2025-06-18` answers that version; with `1999-01-01` it
  answers one the server supports (`2025-11-25`), not an echo
- The result has `capabilities` for `tools`, `resources` and `prompts` and nothing else, and `serverInfo` (name,
  version)
- Before `initialize`, `tools/list` is an error that says to initialize first, and `ping` answers `{}`; notifications
  (`notifications/initialized`, `notifications/cancelled`, anything without an id) never get a response
- A line that isn't JSON → `-32700` with `id: null`; no `"jsonrpc": "2.0"` → `-32600`; an unknown method → `-32601`;
  every line on stdout is a JSON-RPC message (logs go to stderr)

### M2 · Tools, resources and prompts
- `tools/list`: `search_courses`, `get_course`, `plan_study_weeks` and `find_courses`, each with a description, an
  object `inputSchema` and `readOnlyHint: true`
- `tools/call`: `search_courses { query: "database" }` → `{ courses: [...] }` (DB110 … DB410); a query under 2
  characters and an unknown course code are results with `isError: true`; an unknown tool is `-32602`
- `resources/templates/list` offers `library://courses/{code}`; `resources/read` returns the course as
  `application/json`; an unknown course is `-32002`
- `prompts/get study_plan { course: "DB220", weeks: "4" }` returns a `user` message naming the course and the weeks;
  a missing `course` or an unknown prompt is `-32602`

### M3 · Pages
- `resources/list` serves at most 10 courses per page (5 pages for the 45), with `nextCursor` until the last;
  following the cursors gives every course exactly once, the same way twice
- The cursor is opaque (not a page number), and `garbage`, a changed cursor or a made-up one is `-32602`

### M4 · Cancel and time out
- `plan_study_weeks` cancelled after 200 ms (`notifications/cancelled` with its `requestId`) never answers, and the
  server still answers `ping`
- With `LIBRARY_TIMEOUT_MS=300`, a 3-second plan ends after about 300 ms with an `isError` result that says it timed out
- While a slow call runs, `ping` answers at once, and the slow call still finishes

### M5 · HTTP with a bearer token
- `--http --port 0` listens on 127.0.0.1 (any free port) and prints `http://127.0.0.1:<port>/mcp` on stderr; without
  `LIBRARY_TOKEN` it exits with an error that names the variable; `GET` → 405
- No token or a wrong one → 401 with `WWW-Authenticate: Bearer` (the token never echoed); `Origin:
  https://evil.example.invalid` → 403; `Origin: http://localhost:3000` is served
- `POST` initialize → 200 with JSON; a notification → 202 with no body; `MCP-Protocol-Version: 1999-01-01` → 400; a
  path other than `/mcp` → 404; broken JSON → 400 with `-32700`
- No sessions: the server hands out no `Mcp-Session-Id` (2025-11-25 makes them optional), so every POST stands alone

### M6 · A versioned schema and a conformance suite
- `search_courses` has `_meta["dev.studybuddy/schema-version"]: 2`; `find_courses({ q })` is listed with a
  description that starts with "Deprecated" and names `search_courses`, and `_meta["dev.studybuddy/deprecated"]: {
  replacedBy: "search_courses", removeAfter: "2027-01-31" }`; it returns what `search_courses` does, and says it's
  deprecated in every result; `search_courses` refuses `q` (an `isError` result that points to `query`)
- `node --test mcp-conformance.test.mjs` passes with 12 or more tests, named `stdio: …` and `http: …`
- It passes on the reference server and fails on each of six broken ones: one that echoes any version, one whose pages
  overlap, one that answers cancelled calls, one that serves HTTP without a token, one whose `tools/list` drops
  `_meta["dev.studybuddy/deprecated"]` from `find_courses`, and one that serves `tools/list` before `initialize`

## 📂 Work here
```bash
cd labs/lab-04/hard-plus-plus/src
code mcp/library-server.mjs mcp-conformance.test.mjs
node --test mcp-conformance.test.mjs     # your suite
node labs/start.mjs test lab-04 hard++     # from the workshop folder
```
`mcp/library-server.mjs` gives you the data, the tools' own logic, `checkArgs()`, the JSON-RPC message builders and
the raw transports (lines on stdin and stdout, an HTTP listener); `handle()` and the protocol are yours (one
`TODO(Mn)` per milestone). `mcp-conformance.test.mjs` gives you two raw clients (`withStdio`, `withHttp`) and one
example. Talk to the server by hand (bash):
```bash
node mcp/library-server.mjs <<'EOF'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
{"jsonrpc":"2.0","id":2,"method":"resources/list"}
EOF
```
The library is **not** in `.mcp.json`: the checks and your suite start it themselves. The agent check gives it to
Copilot for one session with `--additional-mcp-config`, records the JSON-RPC messages it gets (it passes only when your
server answered a `tools/call`), and hides the file tools, so the answer can't come from reading the data file.

## 💡 Hints
### M1
<details><summary>Requests, notifications, responses</summary>

A message with a `method` and an `id` is a request: it gets exactly one response with the same `id`. A `method`
without an `id` is a notification: never answer it, not even with an error. A message with `result` or `error` is a
response (your server never asks, so ignore it). Check `msg.jsonrpc === '2.0'` and that `id` is a string or a number.

</details>

<details><summary>Negotiating the version</summary>

The client sends the newest version it speaks. If you speak it too, answer the same; if not, answer **your** newest,
and the client decides whether it can live with that. Copilot CLI asks for `2025-11-25`. (The current MCP revision,
2026-07-28, drops `initialize` and puts the version in every request's `_meta`: see Going further.)

</details>

### M2
<details><summary>Two kinds of error</summary>

The spec splits them: a request the protocol can't serve (an unknown tool, a missing prompt argument, a resource that
doesn't exist) is a JSON-RPC error (`-32602`, `-32002`); a tool call that runs but can't do its job (a query too
short, a course that doesn't exist) is a **result** with `isError: true`, because the model can read it and try
again. `throw new RpcError(-32602, '…')` for the first kind, `return { content: […], isError: true }` for the second.

</details>

### M3
<details><summary>An opaque, signed cursor</summary>

```js
const body = Buffer.from(JSON.stringify({ o: 10 })).toString('base64url');
const mac = crypto.createHmac('sha256', KEY).update(body)
  .digest('base64url').slice(0, 16);
const cursor = `${body}.${mac}`;   // check the mac before you trust o
```
A client must not build or change a cursor; signing it (with a random `KEY` per process) makes that a rule you can
enforce, and a cursor from another process an error, not a wrong page.

</details>

### M4
<details><summary>A map of running requests</summary>

Before you run a request, `inflight.set(id, new AbortController())`; delete it when it's done. On
`notifications/cancelled`, `inflight.get(params.requestId)?.abort()`. When the work ends, check
`controller.signal.aborted`: if it is, return `null` (no response). `run()` gets
`{ signal: AbortSignal.any([controller.signal, AbortSignal.timeout(TIMEOUT_MS)]) }`, and `plan_study_weeks` already
stops when that signal aborts.

</details>

<details><summary>Why the slow call doesn't block</summary>

The stdio transport calls `handle()` for each line as it arrives, and `handle()` is `async`: while one call awaits
`sleep()`, the next line is read and answered. Don't put the calls in a queue, or a cancellation would wait behind
the call it cancels.

</details>

### M5
<details><summary>The order of the door checks</summary>

Path (404), then `Origin` (403: a web page in your browser can reach `127.0.0.1`, which is how DNS-rebinding attacks
work), then the token (401, before you reveal anything else), then the method (405), the version header (400), the
body (413, 400). Compare tokens with `crypto.timingSafeEqual` on two SHA-256 digests: equal lengths, no early exit.

</details>

### M6
<details><summary>Changing a schema without breaking anyone</summary>

Clients cache tool lists (Copilot keeps a snapshot of each local server's tools), and models remember a schema from
earlier in a conversation. Renaming `q` to `query` in place breaks both. Keep the old tool under its old name, mark it
deprecated where people and models will see it (the description, `_meta`, every result), give it a removal date, and
make the new one strict (`additionalProperties: false`, so `q` is an error that points to `query`).

</details>

<details><summary>A suite that catches broken servers</summary>

Write one test per promise in M6's list, and assert on protocol facts (codes, ids, versions, statuses, counts), not on
your messages: the checks run the suite on the reference server too. For "pages don't overlap", collect every `uri`
while you follow `nextCursor`, then compare the count with the size of a `Set`.

</details>

## 🧠 Takeaway
MCP is JSON-RPC plus promises: a handshake, two kinds of error, pages, cancellation and a guarded door, and a conformance suite is how you keep them.

## ❓ Check yourself
Your server renamed `search_courses`' input from `q` to `query` and shipped it. Copilot sessions that started before
the change keep sending `{ "q": "database" }`. What should the new server do?
1. Accept both silently: the model will learn the new name eventually.
2. Return a JSON-RPC error `-32602`, because `q` is no longer in the schema.
3. Keep the old shape working for a while (an old tool or an alias), and say in its description, `_meta` and results
   that it is deprecated, what replaces it and until when.

<details><summary>Answer</summary>

**3.** Clients and models hold on to old schemas (cached tool lists, earlier turns), so a breaking change needs a
transition: the old shape keeps working, and every place a client or a model looks says what to use instead and when
the old one goes. Silently accepting both never ends the transition; a hard error breaks every running session.

</details>

## 🚀 Going further
- Answer `server/discover` and read `_meta["io.modelcontextprotocol/protocolVersion"]` on each request: the stateless
  MCP revision 2026-07-28, side by side with `initialize`.
- Register the library in Copilot over HTTP for yourself: `copilot mcp add --transport http --header "Authorization:
  Bearer …" library http://127.0.0.1:8123/mcp`, start it with `--http --port 8123`, and ask Copilot about courses.
- Add `notifications/progress` for `plan_study_weeks` when the request carries a `progressToken`.
- Run the suite against a server built with the official MCP SDK: does it pass? What does that tell you about your
  suite, and about the SDK?
