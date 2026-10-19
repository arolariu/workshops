# 💎 Hard++ · Build the loop

> 🕐 2–3 h · 🏠 homework · 🆓 free checks · 🧱 builds on: Lab 00 · hard+

## 🎯 Mission
Every lab plugs something into Copilot's agent loop. Now build the loop itself. `agent/mini-agent.mjs` talks to a
scripted fake model: it sends the whole conversation and the tool schemas every turn, parses the tool calls the model
writes, asks a permission gate, runs the tools, feeds the results back, and stops when the model answers, when the
turns run out or when the budget is spent. It logs every step in Copilot's JSON format, so the `run-stats.mjs` you
built in hard reads your runs like Copilot's. The fake model is stateless and strict: forget the history, and it
starts over.

## 📋 Requirements
1. Every request carries the whole history (system prompt, user prompt, every assistant message and every tool
   result) and the tool schemas.
2. The loop parses the tool calls the model writes (JSON text), runs the tools and sends every result back, also
   when the arguments are broken.
3. A permission gate with Copilot's rules decides every call before it runs, and a denial goes back to the model.
4. The loop stops when the model answers (exit 0), after `maxTurns` turns, or once the tokens reach the budget
   (exit 1).
5. Every step is logged as a JSON event in Copilot's format, and your `scripts/run-stats.mjs` reads the run.

**What goes to the model, and what comes back** (`agent/fake-model.mjs`):
```text
request   { messages: [
              { role: 'system', content },
              { role: 'user', content },
              { role: 'assistant', content, tool_calls: [{ id,
                type: 'function', function: { name, arguments } }] },
              { role: 'tool', tool_call_id, content }, … ],
            tools: [{ type: 'function',
                      function: { name, description, parameters } }] }
response  { message: { role: 'assistant', content, tool_calls },
            usage: { inputTokens, outputTokens } }
```
`arguments` is JSON **text** the model wrote, like `'{"path":"grades.js"}'`, and it can be broken.

**The events to log**, with `log(type, data)` (`emitter()` adds `id`, `timestamp` and `parentId`):
```text
user.message             { content }
assistant.turn_start     { turnId: "0" }
assistant.message        { content, toolRequests: [{ toolCallId, name,
                           arguments }], model, turnId }
session.usage_checkpoint { accountingSnapshot: { modelMetrics:
                           { [model]: { usage: { inputTokens,
                           outputTokens } } } } }   (running totals)
tool.execution_start     { toolCallId, toolName, arguments, turnId }
tool.execution_complete  { toolCallId, turnId, success: true,
                           result: { content } }
                         { toolCallId, turnId, success: false,
                           error: { message, code } }
assistant.turn_end       { turnId }
session.error            { errorType, message }
result                   { exitCode, usage: { premiumRequests: 0 } }
```
In events, `arguments` is an **object** (parsed; `{}` when it didn't parse). `code` is `denied` or `failure`.
`errorType` is `max_turns` or `budget`. `result` is flat: `emitter()` puts its data next to `type`. This loop logs a
`session.usage_checkpoint` after every model call (running totals), so the budget shows; Copilot logs one, at the end.

**The permission rules** (like `--allow-tool` and `--deny-tool` in Copilot):
```text
"shell"             every shell command
"shell(npm test)"   npm test, npm test …
"shell(git:*)"      any git command
"read", "write"     every read tool, every write tool
"read(.env)"        a read of .env (* inside a folder, ** across)
"write(build)"      a write to build/ or anything in it
"view", "view(…)"   one tool by name: this lab's extension
1. a deny rule covers the call, or one part of it   → denied
2. allow rules cover every part of the call         → allowed
3. a read tool                                      → allowed
4. anything else → denied: "Permission denied because no interactive
   user response was available."
```
The parts of a shell command are what's between `&&`, `||`, `;` and `|`; `read(…)` and `write(…)` match the
call's `path`. A deny rule the gate can't read (`read(` with no closing bracket) denies **every** call: a guard that
doesn't understand its rules fails closed. Copilot's own kinds are `shell`, `read`, `write`, `url`, `memory` and
MCP server names; this lab's tools only have the first three, and naming a tool (`view`) is our extension.

## 🧭 Milestones
### M1 · One turn
- `toolSchemas(TOOLS)` turns each tool into `{ type: 'function', function: { name, description, parameters } }`
  (never `kind` or `run`)
- On the `answer` scenario, `runAgent()` sends `[system, user]` and the schemas, adds up the usage, and returns
  `{ stop: 'done', turns: 1, answer, usage, exitCode: 0 }`
- `node --test agent/fake-model.test.mjs` passes: the scenarios are fixtures with their own tests

### M2 · Tool calls and results
- `parseArguments(text)` returns `{ ok: true, value }` for a JSON object, else `{ ok: false, error: 'Invalid
  arguments: …' }`
- `tool-call`: both calls of the turn run, both results go back as `tool` messages (`tool_call_id` = the call's
  `id`), and the second request starts with everything the first one had
- `malformed`: the broken call doesn't run, its error goes back, the model tries again, and the run ends in 3 turns

### M3 · The permission gate
- `gate(call, { allow, deny })` returns `{ allowed, rule, reason }` with the rules above, where `call` is
  `{ name, kind, arguments }` and `rule` is the rule that decided (for a command allowed part by part, the first
  part's rule), or `null`
- `deny: ['read(.env)']` stops `view .env`, `deny: ['write(grades.js)']` stops editing it, and an unreadable deny
  rule denies everything
- `denied` (it allows `shell(npm test)`): `npm test` runs, `rm -rf build` is denied, the model reads why, and
  `build/app.js` is still there

### M4 · Stop rules
- `loop` with `maxTurns: 4`: 4 model calls, then `stop: 'max-turns'` and exit code 1
- `budget`: the run stops right after the model call that brings input + output tokens to the budget, and that
  reply's tool calls never run (`stop: 'budget'`, exit code 1)
- Without `maxTurns` and `budget`, default limits still stop a runaway loop

### M5 · Copilot's format, read by your run-stats
- `node agent/mini-agent.mjs agent/scenarios/<name>.json` prints the events in the order and shape above for all six
  scenarios, and exits 0 when the model answered, 1 when a limit stopped it
- Your `scripts/run-stats.mjs` reads every run: the tools and their outcomes, the turns, the model, the tokens, the
  exit code, and one error for a run a limit stopped

## 📂 Work here
```bash
cd labs/lab-00/hard-plus-plus/src
node agent/mini-agent.mjs agent/scenarios/answer.json
node agent/mini-agent.mjs agent/scenarios/denied.json --out run.jsonl
node scripts/run-stats.mjs run.jsonl
node --test agent/fake-model.test.mjs
```
You write `toolSchemas()`, `parseArguments()`, `gate()` and `runAgent()` in `agent/mini-agent.mjs`. The CLI,
`emitter()` and `checkpoint()` are given. `agent/fake-model.mjs`, `agent/tools.mjs` (a pretend workspace: no tool
touches your disk) and the six scenarios in `agent/scenarios/` are complete: read them, they're short. Nothing here
calls a real model, so it's free, and a scenario takes the same path every time. Save runs with `--out`, not `>`
(Windows PowerShell 5.1 writes `>` as UTF-16).

## 💡 Hints
### M1
<details><summary>The shape of a turn</summary>

```js
const messages = [{ role: 'system', content: system },
                  { role: 'user', content: prompt }];
const { message, usage: used } = await model.complete({
  messages, tools: toolSchemas(tools) });
messages.push(message);
```
No `message.tool_calls` (or an empty list) means the model answered: that's the end of the run.

</details>

<details><summary>Stateless, for real</summary>

The fake model counts the assistant messages in the history you send to find its step, like a real model reads the
transcript to know where it is. Send it a new array with only the last message, and it starts from step 0 again.
`[fake model] …` answers are the model telling you what your loop got wrong.

</details>

### M2
<details><summary>Results go back in order</summary>

For each `call` of `message.tool_calls`: parse `call.function.arguments`, find the tool by `call.function.name`, run
it, then `messages.push({ role: 'tool', tool_call_id: call.id, content })`. A failure is a result too: its `content`
is the error, so the model can react to it. Only then call the model again.

</details>

### M3
<details><summary>Parts, then rules</summary>

Split the command (`split(/\s*(?:&&|\|\||;|\|)\s*/)`). A rule is `head` or `head(arg)`: `head` must be the call's
`kind` or its tool name; for a shell call, `arg` ending in `:*` compares the first word of a part, otherwise the part
must equal `arg` or start with `arg` and a space; for other calls, `arg` is a path pattern for `arguments.path`.
Read every deny rule first: one you can't parse means deny. Then deny if any deny rule covers any part, and allow if
every part has an allow rule.

</details>

### M4
<details><summary>Where each check goes</summary>

Check the turns **before** you call the model (4 turns means 4 calls). Check the budget **after** you add up the
usage of a call: you only know what a call cost once it's done, which is why `--max-ai-credits` is a soft cap too.
When the budget is reached, stop without running that reply's tool calls.

</details>

### M5
<details><summary>The order of the events</summary>

`user.message` once; per turn `assistant.turn_start`, `assistant.message`, `session.usage_checkpoint`, a
`tool.execution_start` and `tool.execution_complete` per call, `assistant.turn_end`; at the end `session.error` if a
limit stopped the run, then `result`. One difference from Copilot, on purpose: a real run logs a single
`session.usage_checkpoint`, at the end (see `fixtures/ok.jsonl`); this loop logs one after every model call (running
totals), so you can see the budget fill up. Your `run-stats.mjs` reads the last one either way.

</details>

<details><summary>Debug with your own tools</summary>

`node scripts/run-stats.mjs run.jsonl` prints your loop's timeline and token use. Keep `console.log` off stdout
while you debug (`console.error` is fine): stdout is the event stream.

</details>

## 🧠 Takeaway
A harness is a loop around a stateless model: resend the context, run only what's allowed, feed back the result, and know when to stop.

## ❓ Check yourself
To save tokens, your loop sends the model only the newest tool result each turn, not the whole history. What happens?
1. It carries on fine: the model remembers the earlier turns of the same session.
2. It loses its place: without the history it can't know what it already did, so it starts over, and only the turn
   limit stops it.
3. It saves tokens and answers the same, because the newest tool result holds everything the model needs.

<details><summary>Answer</summary>

**2.** The model keeps nothing between calls: the request is all it knows. That's why every turn costs more input
tokens than the one before, and why real harnesses summarise (`/compact`) instead of forgetting.

</details>

## 🚀 Going further
- Stream: split the model's text into pieces and log `assistant.message_delta` events before the message, like Copilot.
- Put a hook in your loop: before each tool runs, pipe the call as JSON to a script and obey its deny (Lab 05).
- Compare your loop's events with Copilot's (`fixtures/ok.jsonl`): what does the real harness do that yours doesn't
  (compaction, retries, a skill tool, sub-agents)?
- Put a real model behind the same `complete()` (an API you're allowed to use), and keep the budget.
