# GitHub Copilot CLI, Under the Hood — Module Quiz Bank (v2, internals edition)

Companion to the deck *GitHub Copilot CLI Deep Dive v2 - Alexandru-Razvan Olariu*. 9 modules · 45 live questions + 27 bonus questions. Facts are current to 25 October 2026 (Copilot CLI v1.0.103). Questions test mechanics, not definitions: what is sent, what wins, what fails and why. Every answer cites its source; a few cite behaviour observed on Copilot CLI v1.0.95 during our research and say so.

## How to run the quizzes

- **Live set:** 5 questions per module, played on the module's *Quiz time* slide (about 4–5 minutes with 20–30 second timers).
- **Bonus set:** 3 extra questions per module for async play, a longer game, or as a warm-up for the TUI lab.
- **Limits:** every question is ≤ 120 characters and every answer ≤ 75 characters, with 2–4 answers (Kahoot's quiz limits). True/false items are written as two-answer quiz questions so they import cleanly.
- **Answer order** is already shuffled; the correct answer is marked in each question and in the import rows.

### Kahoot
1. In Kahoot, go to **Create → Add → Import → Import spreadsheet** and download the official template.
2. Copy a module's **Kahoot import rows** into the template: question, answers 1–4, time limit, correct answer number(s). Leave unused answer cells empty.
3. Import, then check the preview. Time limits used here are 20 s and 30 s, both accepted by the import template. Images and special formatting do not import.

### Mentimeter
1. Add one **Select answer** quiz slide per question (quiz slides allow up to 6 options; mark the correct one).
2. Paste the question and options from the readable section below and set the timer under the slide's quiz settings.
3. No spreadsheet import for Mentimeter quiz questions is documented, so build the slides manually or with Mentimeter's AI assistant from this file. Its character limits for quiz text are not documented; the Kahoot limits used here are a safe guide.

## Module 1 — Anatomy of a turn (slides 5–15)

### Live set (5 questions)

**Q1. In Copilot CLI, one iteration of the agent loop equals how many LLM API calls?**  
*Quiz · 20 s · Live*

- A. None if tools are cached
- B. Exactly one **(correct)**
- C. Two: plan, then act
- D. One per tool call

**Answer:** B — Exactly one  
**Why:** Each loop iteration is exactly one LLM API call: one assistant.turn_start/turn_end pair in events.jsonl.  
**Source:** <https://github.com/github/copilot-sdk/blob/main/docs/features/agent-loop.md>

**Q2. At roughly what fill level does Copilot CLI start compacting the context in the background?**  
*Quiz · 20 s · Live*

- A. Only when you run /compact
- B. About 80% **(correct)**
- C. About 50%
- D. About 95%

**Answer:** B — About 80%  
**Why:** Background compaction starts at ~80%; if it has not finished by ~95%, the CLI pauses until it completes.  
**Source:** <https://docs.github.com/en/copilot/concepts/prompting-and-context/context-management>

**Q3. Tool output above what size is saved to a temp file instead of going into the context?**  
*Quiz · 20 s · Live*

- A. 20 KiB **(correct)**
- B. 2 KiB
- C. 2 MiB
- D. 200 KiB

**Answer:** A — 20 KiB  
**Why:** Output over 20 KiB (COPILOT_LARGE_OUTPUT_THRESHOLD_BYTES=20480) is written to a file; the model gets the path and a preview.  
**Source:** <https://docs.github.com/en/copilot/concepts/prompting-and-context/context-management>

**Q4. A completed compaction can be undone with /undo.**  
*True or false · 20 s · Live*

- A. True
- B. False **(correct)**

**Answer:** B — False  
**Why:** A completed compaction cannot be reversed. A numbered checkpoint of the summary is saved instead.  
**Source:** <https://docs.github.com/en/copilot/concepts/prompting-and-context/context-management>

**Q5. Which file holds the full record of a session, including every tool call?**  
*Quiz · 20 s · Live*

- A. session-store.db
- B. `session-state/<id>/events.jsonl` **(correct)**
- C. `config.json`
- D. `settings.json`

**Answer:** B — `session-state/<id>/events.jsonl`  
**Why:** session-store.db only indexes prompts and answers for search; tool calls, outputs and reasoning live in events.jsonl.  
**Source:** <https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference>

### Bonus set (3 questions, async)

**Q6. Which change mid-session usually invalidates the provider's cached prompt prefix?**  
*Quiz · 20 s · Bonus*

- A. Changing the tool definitions **(correct)**
- B. Waiting 30 seconds
- C. Appending a new message
- D. Asking a shorter question

**Answer:** A — Changing the tool definitions  
**Why:** Caching needs an identical prefix (tools, system, messages). Changing tools changes the prefix; appending does not.  
**Source:** <https://platform.claude.com/docs/en/build-with-claude/prompt-caching>

**Q7. In "Lost in the Middle", facts placed mid-context scored…**  
*Quiz · 20 s · Bonus*

- A. The same as at the end
- B. Better than at the start
- C. Below the no-documents baseline **(correct)**
- D. Perfectly with 30 documents

**Answer:** C — Below the no-documents baseline  
**Why:** GPT-3.5-Turbo scored below its closed-book 56.1% when the relevant document sat in the middle of 20-30.  
**Source:** <https://arxiv.org/abs/2307.03172>

**Q8. Which /context category is capacity reserved for the reply and headroom?**  
*Quiz · 20 s · Bonus*

- A. System Tools
- B. Buffer **(correct)**
- C. Free Space
- D. Messages

**Answer:** B — Buffer  
**Why:** /context lists System Prompt, Custom Instructions, System Tools, MCP Tools, Messages, Free Space and Buffer.  
**Source:** <https://docs.github.com/en/copilot/concepts/prompting-and-context/context-management>

### Kahoot import rows — Module 1

| # | Set | Question (max 120 characters) | Answer 1 | Answer 2 | Answer 3 | Answer 4 | Time limit (sec) | Correct answer(s) |
|---|---|---|---|---|---|---|---|---|
| 1 | Live | In Copilot CLI, one iteration of the agent loop equals how many LLM API calls? | None if tools are cached | Exactly one | Two: plan, then act | One per tool call | 20 | 2 |
| 2 | Live | At roughly what fill level does Copilot CLI start compacting the context in the background? | Only when you run /compact | About 80% | About 50% | About 95% | 20 | 2 |
| 3 | Live | Tool output above what size is saved to a temp file instead of going into the context? | 20 KiB | 2 KiB | 2 MiB | 200 KiB | 20 | 1 |
| 4 | Live | A completed compaction can be undone with /undo. | True | False |  |  | 20 | 2 |
| 5 | Live | Which file holds the full record of a session, including every tool call? | session-store.db | session-state/<id>/events.jsonl | config.json | settings.json | 20 | 2 |
| 6 | Bonus | Which change mid-session usually invalidates the provider's cached prompt prefix? | Changing the tool definitions | Waiting 30 seconds | Appending a new message | Asking a shorter question | 20 | 1 |
| 7 | Bonus | In "Lost in the Middle", facts placed mid-context scored… | The same as at the end | Better than at the start | Below the no-documents baseline | Perfectly with 30 documents | 20 | 3 |
| 8 | Bonus | Which /context category is capacity reserved for the reply and headroom? | System Tools | Buffer | Free Space | Messages | 20 | 2 |

## Module 2 — Driving the CLI (slides 16–23)

### Live set (5 questions)

**Q1. How does autopilot keep going after the model stops calling tools?**  
*Quiz · 20 s · Live*

- A. It switches to a bigger model
- B. It restarts the session
- C. It runs /compact and retries
- D. It injects a "not complete yet" user message **(correct)**

**Answer:** D — It injects a "not complete yet" user message  
**Why:** Until the model calls task_complete, autopilot injects a synthetic nudge message and loops again.  
**Source:** <https://github.com/github/copilot-sdk/blob/main/docs/features/agent-loop.md>

**Q2. You press Enter while the agent is busy. When does your message reach the model?**  
*Quiz · 20 s · Live*

- A. After the turn, as a new turn
- B. Never: it is discarded
- C. Before the next model call in this turn **(correct)**
- D. Only after you press Esc

**Answer:** C — Before the next model call in this turn  
**Why:** Steering is injected before the next LLM request of the current turn. Ctrl+Q queues a full new turn instead.  
**Source:** <https://github.com/github/copilot-sdk/blob/main/docs/features/steering-and-queueing.md>

**Q3. Which model setting wins in Copilot CLI?**  
*Quiz · 20 s · Live*

- A. model in settings.json
- B. The --model flag
- C. The custom agent's model **(correct)**
- D. COPILOT_MODEL

**Answer:** C — The custom agent's model  
**Why:** Precedence: custom agent model > --model > COPILOT_MODEL > settings.json model > default.  
**Source:** <https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-programmatic-reference>

**Q4. In copilot -p mode, what happens to a tool call that is not pre-approved?**  
*Quiz · 20 s · Live*

- A. It is denied automatically **(correct)**
- B. It runs in the sandbox
- C. It is approved after 30 s
- D. The CLI waits for input

**Answer:** A — It is denied automatically  
**Why:** -p cannot show an approval prompt, so anything not pre-approved is denied.  
**Source:** <https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli-in-actions>

**Q5. Several tokens are set. Which one does Copilot CLI use first?**  
*Quiz · 20 s · Live*

- A. Your gh CLI login
- B. GITHUB_TOKEN
- C. COPILOT_GITHUB_TOKEN **(correct)**
- D. GH_TOKEN

**Answer:** C — COPILOT_GITHUB_TOKEN  
**Why:** Order: COPILOT_GITHUB_TOKEN, then GH_TOKEN, then GITHUB_TOKEN, then the keychain, then gh.  
**Source:** <https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference>

### Bonus set (3 questions, async)

**Q6. /fleet sub-agents share one filesystem with no file locking.**  
*True or false · 20 s · Bonus*

- A. True **(correct)**
- B. False

**Answer:** A — True  
**Why:** Workers can't talk to each other; if two edit the same file, the last one to finish wins, silently.  
**Source:** <https://github.blog/ai-and-ml/github-copilot/run-multiple-agents-at-once-with-fleet-in-copilot-cli/>

**Q7. Where does plan mode keep the plan it writes?**  
*Quiz · 20 s · Bonus*

- A. plan.md in the session folder **(correct)**
- B. PLAN.md in the repo root
- C. Nowhere: it stays in chat
- D. `.github/plan.md`

**Answer:** A — plan.md in the session folder  
**Why:** The plan lives in the session state as plan.md; /session plan shows it.  
**Source:** <https://github.com/github/copilot-sdk/blob/main/docs/features/session-persistence.md>

**Q8. Since CLI 1.0.93, where must your user settings live?**  
*Quiz · 20 s · Bonus*

- A. `~/.copilot/config.json`
- B. `.github/copilot/settings.json`
- C. `~/.copilot/settings.json` **(correct)**
- D. `~/.config/copilot.yml`

**Answer:** C — `~/.copilot/settings.json`  
**Why:** User keys in config.json are ignored since 1.0.93; config.json now holds internal state.  
**Source:** <https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference>

### Kahoot import rows — Module 2

| # | Set | Question (max 120 characters) | Answer 1 | Answer 2 | Answer 3 | Answer 4 | Time limit (sec) | Correct answer(s) |
|---|---|---|---|---|---|---|---|---|
| 1 | Live | How does autopilot keep going after the model stops calling tools? | It switches to a bigger model | It restarts the session | It runs /compact and retries | It injects a "not complete yet" user message | 20 | 4 |
| 2 | Live | You press Enter while the agent is busy. When does your message reach the model? | After the turn, as a new turn | Never: it is discarded | Before the next model call in this turn | Only after you press Esc | 20 | 3 |
| 3 | Live | Which model setting wins in Copilot CLI? | model in settings.json | The --model flag | The custom agent's model | COPILOT_MODEL | 20 | 3 |
| 4 | Live | In copilot -p mode, what happens to a tool call that is not pre-approved? | It is denied automatically | It runs in the sandbox | It is approved after 30 s | The CLI waits for input | 20 | 1 |
| 5 | Live | Several tokens are set. Which one does Copilot CLI use first? | Your gh CLI login | GITHUB_TOKEN | COPILOT_GITHUB_TOKEN | GH_TOKEN | 20 | 3 |
| 6 | Bonus | /fleet sub-agents share one filesystem with no file locking. | True | False |  |  | 20 | 1 |
| 7 | Bonus | Where does plan mode keep the plan it writes? | plan.md in the session folder | PLAN.md in the repo root | Nowhere: it stays in chat | .github/plan.md | 20 | 1 |
| 8 | Bonus | Since CLI 1.0.93, where must your user settings live? | ~/.copilot/config.json | .github/copilot/settings.json | ~/.copilot/settings.json | ~/.config/copilot.yml | 20 | 3 |

## Module 3 — Tools & the permission engine (slides 24–32)

### Live set (5 questions)

**Q1. Which rule matches "git push" but not "gitea"?**  
*Quiz · 20 s · Live*

- A. url(git)
- B. write(git)
- C. `shell(git*)`
- D. `shell(git:*)` **(correct)**

**Answer:** D — `shell(git:*)`  
**Why:** The :* suffix matches the stem alone or followed by a space, so git push matches and gitea does not.  
**Source:** <https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-programmatic-reference>

**Q2. You approve "rm ./tmp.txt" with "Yes, for this session". What else is now approved?**  
*Quiz · 20 s · Live*

- A. Only that exact command
- B. rm inside temp only
- C. Nothing: it asks again next time
- D. Any rm command, e.g. rm -rf ./\* **(correct)**

**Answer:** D — Any rm command, e.g. rm -rf ./\*  
**Why:** Session approval grants the command name, not the exact command line.  
**Source:** <https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/configure-copilot-cli>

**Q3. Which flag removes a tool's schema from the model's context?**  
*Quiz · 20 s · Live*

- A. `--disallow-temp-dir`
- B. `--no-ask-user`
- C. `--deny-tool`
- D. `--excluded-tools` **(correct)**

**Answer:** D — `--excluded-tools`  
**Why:** --deny-tool only blocks the call; the schema is still sent. --excluded-tools hides the tool. (Observed on Copilot CLI v1.0.95 in our research run.)  
**Source:** <https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/allowing-tools>

**Q4. With the local sandbox on, which of these is NOT OS-sandboxed?**  
*Quiz · 20 s · Live*

- A. Local MCP servers
- B. grep and glob
- C. Shell commands
- D. The built-in file read and edit tools **(correct)**

**Answer:** D — The built-in file read and edit tools  
**Why:** Built-in file tools run in-process; they enforce the policy themselves on a best-effort basis.  
**Source:** <https://docs.github.com/en/copilot/concepts/security-governance-and-network-settings/about-cloud-and-local-sandboxes>

**Q5. The "lethal trifecta" is private data + untrusted content + what?**  
*Quiz · 20 s · Live*

- A. A big context window
- B. A small model
- C. A way to send data out **(correct)**
- D. Autopilot mode

**Answer:** C — A way to send data out  
**Why:** Private data, exposure to untrusted content and external communication together make exfiltration easy.  
**Source:** <https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/>

### Bonus set (3 questions, async)

**Q6. --deny-tool rules still win when --allow-all is set.**  
*True or false · 20 s · Bonus*

- A. True **(correct)**
- B. False

**Answer:** A — True  
**Why:** Deny rules take precedence over allow rules, even with --allow-all or saved approvals.  
**Source:** <https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/allowing-tools>

**Q7. How is "npm test && git push" checked against your rules?**  
*Quiz · 20 s · Bonus*

- A. Every command in it is checked **(correct)**
- B. Only the last command
- C. Only the first command
- D. Shell commands are never checked

**Answer:** A — Every command in it is checked  
**Why:** GitHub staff: "We parse the entire script and detect all the commands inside it."  
**Source:** <https://github.com/github/copilot-cli/issues/66>

**Q8. What does the edit tool return if old_str differs from the file by one byte?**  
*Quiz · 20 s · Bonus*

- A. No match found **(correct)**
- B. It edits the closest match
- C. It rewrites the file
- D. It appends new_str

**Answer:** A — No match found  
**Why:** edit needs an exact byte match; curly quotes vs straight quotes is a classic cause.  
**Source:** <https://github.com/github/copilot-cli/issues/3254>

### Kahoot import rows — Module 3

| # | Set | Question (max 120 characters) | Answer 1 | Answer 2 | Answer 3 | Answer 4 | Time limit (sec) | Correct answer(s) |
|---|---|---|---|---|---|---|---|---|
| 1 | Live | Which rule matches "git push" but not "gitea"? | url(git) | write(git) | shell(git\*) | shell(git:\*) | 20 | 4 |
| 2 | Live | You approve "rm ./tmp.txt" with "Yes, for this session". What else is now approved? | Only that exact command | rm inside temp only | Nothing: it asks again next time | Any rm command, e.g. rm -rf ./\* | 20 | 4 |
| 3 | Live | Which flag removes a tool's schema from the model's context? | --disallow-temp-dir | --no-ask-user | --deny-tool | --excluded-tools | 20 | 4 |
| 4 | Live | With the local sandbox on, which of these is NOT OS-sandboxed? | Local MCP servers | grep and glob | Shell commands | The built-in file read and edit tools | 20 | 4 |
| 5 | Live | The "lethal trifecta" is private data + untrusted content + what? | A big context window | A small model | A way to send data out | Autopilot mode | 20 | 3 |
| 6 | Bonus | --deny-tool rules still win when --allow-all is set. | True | False |  |  | 20 | 1 |
| 7 | Bonus | How is "npm test && git push" checked against your rules? | Every command in it is checked | Only the last command | Only the first command | Shell commands are never checked | 20 | 1 |
| 8 | Bonus | What does the edit tool return if old_str differs from the file by one byte? | No match found | It edits the closest match | It rewrites the file | It appends new_str | 20 | 1 |

## Module 4 — MCP on the wire (slides 34–48)

### Live set (5 questions)

**Q1. In MCP 2026-07-28, which method replaces the initialize handshake?**  
*Quiz · 20 s · Live*

- A. `notifications/initialized`
- B. `server/discover` **(correct)**
- C. `session/new`
- D. `tools/list`

**Answer:** B — `server/discover`  
**Why:** 2026-07-28 is stateless: initialize and sessions are gone; servers must implement server/discover.  
**Source:** <https://modelcontextprotocol.io/specification/2026-07-28/changelog>

**Q2. From an MCP tool definition, what does Copilot CLI pass to the model?**  
*Quiz · 20 s · Live*

- A. Only the tool name
- B. The whole tools/list result
- C. Also title and annotations
- D. Name, description, input schema **(correct)**

**Answer:** D — Name, description, input schema  
**Why:** title, annotations, icons and outputSchema are dropped before the model request. (Observed on Copilot CLI v1.0.95 in our research run.)  
**Source:** <https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers>

**Q3. Server "jira" exposes tool "search". What name does the model see?**  
*Quiz · 20 s · Live*

- A. `jira/search`
- B. jira-search **(correct)**
- C. search
- D. jira(search)

**Answer:** B — jira-search  
**Why:** Model-facing names are <server>-<tool>. Permission rules use jira(search); agents use jira/search. (Observed on Copilot CLI v1.0.95 in our research run.)  
**Source:** <https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers>

**Q4. In MCP 2026-07-28, servers keep a session per client (Mcp-Session-Id).**  
*True or false · 20 s · Live*

- A. True
- B. False **(correct)**

**Answer:** B — False  
**Why:** Protocol sessions and Mcp-Session-Id were removed; state must travel in explicit handles.  
**Source:** <https://modelcontextprotocol.io/specification/2026-07-28/changelog>

**Q5. Which MCP feature does Copilot CLI's client actually use?**  
*Quiz · 20 s · Live*

- A. Prompts
- B. Roots
- C. Tools **(correct)**
- D. Resources

**Answer:** C — Tools  
**Why:** The CLI only calls tools/list and tools/call; it never calls resources or prompts and declares no roots. (Observed on Copilot CLI v1.0.95 in our research run.)  
**Source:** <https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers>

### Bonus set (3 questions, async)

**Q6. In MCP OAuth, which PKCE method must clients use?**  
*Quiz · 20 s · Bonus*

- A. plain
- B. S256 **(correct)**
- C. None: PKCE is optional
- D. HS256

**Answer:** B — S256  
**Why:** Clients MUST use PKCE with S256 and refuse if the server does not advertise support.  
**Source:** <https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization>

**Q7. How does a 2026-07-28 server ask the user something mid-call?**  
*Quiz · 20 s · Bonus*

- A. It returns resultType input_required **(correct)**
- B. It sends elicitation/create
- C. It opens a GET stream
- D. It returns HTTP 401

**Answer:** A — It returns resultType input_required  
**Why:** Multi round-trip requests: the client answers and retries the call with a new id.  
**Source:** <https://modelcontextprotocol.io/specification/2026-07-28/changelog>

**Q8. A server changes its tool descriptions after you approved it. This attack is…**  
*Quiz · 20 s · Bonus*

- A. Tool shadowing
- B. A confused deputy
- C. Token passthrough
- D. A rug pull **(correct)**

**Answer:** D — A rug pull  
**Why:** Invariant Labs named it: definitions change after approval, e.g. on a later tools/list.  
**Source:** <https://invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks>

### Kahoot import rows — Module 4

| # | Set | Question (max 120 characters) | Answer 1 | Answer 2 | Answer 3 | Answer 4 | Time limit (sec) | Correct answer(s) |
|---|---|---|---|---|---|---|---|---|
| 1 | Live | In MCP 2026-07-28, which method replaces the initialize handshake? | notifications/initialized | server/discover | session/new | tools/list | 20 | 2 |
| 2 | Live | From an MCP tool definition, what does Copilot CLI pass to the model? | Only the tool name | The whole tools/list result | Also title and annotations | Name, description, input schema | 20 | 4 |
| 3 | Live | Server "jira" exposes tool "search". What name does the model see? | jira/search | jira-search | search | jira(search) | 20 | 2 |
| 4 | Live | In MCP 2026-07-28, servers keep a session per client (Mcp-Session-Id). | True | False |  |  | 20 | 2 |
| 5 | Live | Which MCP feature does Copilot CLI's client actually use? | Prompts | Roots | Tools | Resources | 20 | 3 |
| 6 | Bonus | In MCP OAuth, which PKCE method must clients use? | plain | S256 | None: PKCE is optional | HS256 | 20 | 2 |
| 7 | Bonus | How does a 2026-07-28 server ask the user something mid-call? | It returns resultType input_required | It sends elicitation/create | It opens a GET stream | It returns HTTP 401 | 20 | 1 |
| 8 | Bonus | A server changes its tool descriptions after you approved it. This attack is… | Tool shadowing | A confused deputy | Token passthrough | A rug pull | 20 | 4 |

## Module 5 — Instructions as context (slides 49–54)

### Live set (5 questions)

**Q1. Two instruction files conflict. Which one wins in Copilot CLI?**  
*Quiz · 20 s · Live*

- A. Neither: they are merged **(correct)**
- B. Your user-level file
- C. The nearest AGENTS.md
- D. `.github/copilot-instructions.md`

**Answer:** A — Neither: they are merged  
**Why:** The CLI combines all applicable files with no precedence order; avoid conflicting instructions.  
**Source:** <https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-custom-instructions>

**Q2. When does a path-specific *.instructions.md body enter the context (CLI 1.0.100+)?**  
*Quiz · 20 s · Live*

- A. When the agent reads or edits a match **(correct)**
- B. At session start, always
- C. Only if you @mention it
- D. Only in plan mode

**Answer:** A — When the agent reads or edits a match  
**Why:** Path-specific files are applied when the agent reads or edits a file matching applyTo.  
**Source:** <https://github.com/github/copilot-cli/blob/main/changelog.md>

**Q3. Which of these does Copilot CLI NOT read?**  
*Quiz · 20 s · Live*

- A. Organization custom instructions **(correct)**
- B. `.github/copilot-instructions.md`
- C. `AGENTS.md`
- D. `CLAUDE.md`

**Answer:** A — Organization custom instructions  
**Why:** Organization instructions apply to GitHub.com chat, code review and the cloud agent, not the CLI.  
**Source:** <https://docs.github.com/en/copilot/concepts/prompting-and-context/custom-instructions>

**Q4. A custom agent run as a sub-agent gets repo instructions only if…**  
*Quiz · 20 s · Live*

- A. it sets a model
- B. infer: true
- C. include-custom-instructions: true **(correct)**
- D. it lives in ~/.copilot/agents

**Answer:** C — include-custom-instructions: true  
**Why:** Repository instructions go to the session agent, not to custom sub-agents, unless they opt in.  
**Source:** <https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-custom-agents-for-cli>

**Q5. Which flag skips instruction files, e.g. for an A/B test?**  
*Quiz · 20 s · Live*

- A. `--disable-builtin-mcps`
- B. `--no-custom-instructions` **(correct)**
- C. `--no-ask-user`
- D. `--excluded-tools`

**Answer:** B — `--no-custom-instructions`  
**Why:** It disables loading AGENTS.md and related instruction files.  
**Source:** <https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference>

### Bonus set (3 questions, async)

**Q6. Which /context category shows what your instruction files cost?**  
*Quiz · 20 s · Bonus*

- A. Messages
- B. System Prompt
- C. MCP Tools
- D. Custom Instructions **(correct)**

**Answer:** D — Custom Instructions  
**Why:** Instructions are reported as their own category, separate from the system prompt.  
**Source:** <https://docs.github.com/en/copilot/concepts/prompting-and-context/context-management>

**Q7. An @path line in AGENTS.md inlines that file into the instructions.**  
*True or false · 20 s · Bonus*

- A. True **(correct)**
- B. False

**Answer:** A — True  
**Why:** @ imports (CLI 1.0.66) resolve recursively, with depth and size limits.  
**Source:** <https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-custom-instructions>

**Q8. Where should a rule that must ALWAYS hold live?**  
*Quiz · 20 s · Bonus*

- A. `copilot-instructions.md`
- B. A hook or a deny rule **(correct)**
- C. AGENTS.md in every folder
- D. A skill description

**Answer:** B — A hook or a deny rule  
**Why:** Instructions are advice the model may not follow; hooks and rules are enforced by code.  
**Source:** <https://docs.github.com/en/copilot/concepts/customizations/comparing-customizations>

### Kahoot import rows — Module 5

| # | Set | Question (max 120 characters) | Answer 1 | Answer 2 | Answer 3 | Answer 4 | Time limit (sec) | Correct answer(s) |
|---|---|---|---|---|---|---|---|---|
| 1 | Live | Two instruction files conflict. Which one wins in Copilot CLI? | Neither: they are merged | Your user-level file | The nearest AGENTS.md | .github/copilot-instructions.md | 20 | 1 |
| 2 | Live | When does a path-specific \*.instructions.md body enter the context (CLI 1.0.100+)? | When the agent reads or edits a match | At session start, always | Only if you @mention it | Only in plan mode | 20 | 1 |
| 3 | Live | Which of these does Copilot CLI NOT read? | Organization custom instructions | .github/copilot-instructions.md | AGENTS.md | CLAUDE.md | 20 | 1 |
| 4 | Live | A custom agent run as a sub-agent gets repo instructions only if… | it sets a model | infer: true | include-custom-instructions: true | it lives in ~/.copilot/agents | 20 | 3 |
| 5 | Live | Which flag skips instruction files, e.g. for an A/B test? | --disable-builtin-mcps | --no-custom-instructions | --no-ask-user | --excluded-tools | 20 | 2 |
| 6 | Bonus | Which /context category shows what your instruction files cost? | Messages | System Prompt | MCP Tools | Custom Instructions | 20 | 4 |
| 7 | Bonus | An @path line in AGENTS.md inlines that file into the instructions. | True | False |  |  | 20 | 1 |
| 8 | Bonus | Where should a rule that must ALWAYS hold live? | copilot-instructions.md | A hook or a deny rule | AGENTS.md in every folder | A skill description | 20 | 2 |

## Module 6 — Skills internals (slides 55–61)

### Live set (5 questions)

**Q1. About how many tokens does an installed but unused skill cost?**  
*Quiz · 20 s · Live*

- A. ~100 (name + description) **(correct)**
- B. ~50,000
- C. 0
- D. ~5,000 (the full SKILL.md)

**Answer:** A — ~100 (name + description)  
**Why:** Only metadata is loaded at startup; the body loads on activation.  
**Source:** <https://agentskills.io/specification>

**Q2. Which SKILL.md field decides whether the model picks the skill?**  
*Quiz · 20 s · Live*

- A. description **(correct)**
- B. license
- C. compatibility
- D. metadata

**Answer:** A — description  
**Why:** The description says what the skill does and when to use it: it is the router.  
**Source:** <https://agentskills.io/specification>

**Q3. What does disable-model-invocation: true do?**  
*Quiz · 20 s · Live*

- A. The model runs it every turn
- B. It is hidden from /skills
- C. It cannot use any tools
- D. Only you can start it, by typing /name **(correct)**

**Answer:** D — Only you can start it, by typing /name  
**Why:** The skill is hidden from the model and runs only from its slash command (honoured since CLI 1.0.74).  
**Source:** <https://github.com/github/copilot-cli/blob/main/changelog.md>

**Q4. A skill with the same name exists in .github/skills and ~/.copilot/skills. Which loads?**  
*Quiz · 20 s · Live*

- A. Both, merged
- B. The project one **(correct)**
- C. Neither: it errors
- D. The personal one

**Answer:** B — The project one  
**Why:** First found wins and project directories load first. (For agents it is the opposite.)  
**Source:** <https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference>

**Q5. How does a script bundled in a skill run?**  
*Quiz · 20 s · Live*

- A. In a separate skill VM
- B. Through the normal shell tool **(correct)**
- C. Only on the cloud agent
- D. Inside the model

**Answer:** B — Through the normal shell tool  
**Why:** SKILL.md tells the agent to run it; permissions, deny rules and hooks apply as usual.  
**Source:** <https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-skills>

### Bonus set (3 questions, async)

**Q6. When a skill runs a bundled script, the script's source enters the context.**  
*True or false · 20 s · Bonus*

- A. True
- B. False **(correct)**

**Answer:** B — False  
**Why:** Scripts are executed, so only their output enters the context.  
**Source:** <https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills>

**Q7. What is the maximum length of a skill description in the spec?**  
*Quiz · 20 s · Bonus*

- A. 64 characters
- B. 500 characters
- C. 5,000 characters
- D. 1,024 characters **(correct)**

**Answer:** D — 1,024 characters  
**Why:** name is up to 64 characters, description up to 1,024, compatibility up to 500.  
**Source:** <https://agentskills.io/specification>

**Q8. Which built-in tool loads a skill's SKILL.md body?**  
*Quiz · 20 s · Bonus*

- A. web_fetch
- B. skill **(correct)**
- C. task
- D. view

**Answer:** B — skill  
**Why:** The model loads skills on demand through the skill tool.  
**Source:** <https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference>

### Kahoot import rows — Module 6

| # | Set | Question (max 120 characters) | Answer 1 | Answer 2 | Answer 3 | Answer 4 | Time limit (sec) | Correct answer(s) |
|---|---|---|---|---|---|---|---|---|
| 1 | Live | About how many tokens does an installed but unused skill cost? | ~100 (name + description) | ~50,000 | 0 | ~5,000 (the full SKILL.md) | 20 | 1 |
| 2 | Live | Which SKILL.md field decides whether the model picks the skill? | description | license | compatibility | metadata | 20 | 1 |
| 3 | Live | What does disable-model-invocation: true do? | The model runs it every turn | It is hidden from /skills | It cannot use any tools | Only you can start it, by typing /name | 20 | 4 |
| 4 | Live | A skill with the same name exists in .github/skills and ~/.copilot/skills. Which loads? | Both, merged | The project one | Neither: it errors | The personal one | 20 | 2 |
| 5 | Live | How does a script bundled in a skill run? | In a separate skill VM | Through the normal shell tool | Only on the cloud agent | Inside the model | 20 | 2 |
| 6 | Bonus | When a skill runs a bundled script, the script's source enters the context. | True | False |  |  | 20 | 2 |
| 7 | Bonus | What is the maximum length of a skill description in the spec? | 64 characters | 500 characters | 5,000 characters | 1,024 characters | 20 | 4 |
| 8 | Bonus | Which built-in tool loads a skill's SKILL.md body? | web_fetch | skill | task | view | 20 | 2 |

## Module 7 — Agents & sub-agents (slides 63–69)

### Live set (5 questions)

**Q1. What does a sub-agent NOT receive from its parent?**  
*Quiz · 20 s · Live*

- A. Its own agent prompt
- B. Environment context
- C. The dispatch prompt
- D. The parent's conversation history **(correct)**

**Answer:** D — The parent's conversation history  
**Why:** Each sub-agent has its own context window; dispatch prompts must be self-contained.  
**Source:** <https://github.com/github/copilot-sdk/blob/main/docs/features/fleet-mode.md>

**Q2. Which tool does the main agent call to delegate to a sub-agent?**  
*Quiz · 20 s · Live*

- A. task **(correct)**
- B. skill
- C. delegate
- D. ask_user

**Answer:** A — task  
**Why:** Delegation goes through the task tool, e.g. task(agent_type="security-review").  
**Source:** <https://github.com/github/copilot-sdk/blob/main/docs/features/fleet-mode.md>

**Q3. agents/security/auditor.agent.md gets which agent ID?**  
*Quiz · 20 s · Live*

- A. auditor
- B. `security/auditor`
- C. security.auditor
- D. `security--auditor` **(correct)**

**Answer:** D — `security--auditor`  
**Why:** The ID is the file path without the extension, with folders joined by two hyphens.  
**Source:** <https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-custom-agents-for-cli>

**Q4. In an agent's tools list, what happens to an unknown tool name?**  
*Quiz · 20 s · Live*

- A. The agent fails to load
- B. It grants every tool
- C. You get a prompt
- D. It is silently ignored **(correct)**

**Answer:** D — It is silently ignored  
**Why:** Unrecognised names are ignored, so a typo quietly removes that tool.  
**Source:** <https://docs.github.com/en/copilot/reference/custom-agents-configuration>

**Q5. Which built-in agent deliberately uses a different model family?**  
*Quiz · 20 s · Live*

- A. explore
- B. task
- C. rubber-duck **(correct)**
- D. general-purpose

**Answer:** C — rubber-duck  
**Why:** Rubber duck is a read-only critic on a different model family for a second opinion.  
**Source:** <https://docs.github.com/en/copilot/concepts/agents/copilot-cli/rubber-duck>

### Bonus set (3 questions, async)

**Q6. The same agent ID is in ~/.copilot/agents and .github/agents. Which wins?**  
*Quiz · 20 s · Bonus*

- A. The organization one
- B. The personal one **(correct)**
- C. Both run
- D. The repository one

**Answer:** B — The personal one  
**Why:** For agents: user > repository > organization > enterprise. Skills are the other way round.  
**Source:** <https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/invoke-custom-agents>

**Q7. What is the maximum length of a custom agent's prompt body?**  
*Quiz · 20 s · Bonus*

- A. There is no limit
- B. 1,024 characters
- C. 4,000 characters
- D. 30,000 characters **(correct)**

**Answer:** D — 30,000 characters  
**Why:** The agent profile body (its prompt) can be up to 30,000 characters.  
**Source:** <https://docs.github.com/en/copilot/reference/custom-agents-configuration>

**Q8. The built-in task agent returns the full output when a build succeeds.**  
*True or false · 20 s · Bonus*

- A. True
- B. False **(correct)**

**Answer:** B — False  
**Why:** It returns a brief summary on success and the full output only on failure.  
**Source:** <https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/invoke-custom-agents>

### Kahoot import rows — Module 7

| # | Set | Question (max 120 characters) | Answer 1 | Answer 2 | Answer 3 | Answer 4 | Time limit (sec) | Correct answer(s) |
|---|---|---|---|---|---|---|---|---|
| 1 | Live | What does a sub-agent NOT receive from its parent? | Its own agent prompt | Environment context | The dispatch prompt | The parent's conversation history | 20 | 4 |
| 2 | Live | Which tool does the main agent call to delegate to a sub-agent? | task | skill | delegate | ask_user | 20 | 1 |
| 3 | Live | agents/security/auditor.agent.md gets which agent ID? | auditor | security/auditor | security.auditor | security--auditor | 20 | 4 |
| 4 | Live | In an agent's tools list, what happens to an unknown tool name? | The agent fails to load | It grants every tool | You get a prompt | It is silently ignored | 20 | 4 |
| 5 | Live | Which built-in agent deliberately uses a different model family? | explore | task | rubber-duck | general-purpose | 20 | 3 |
| 6 | Bonus | The same agent ID is in ~/.copilot/agents and .github/agents. Which wins? | The organization one | The personal one | Both run | The repository one | 20 | 2 |
| 7 | Bonus | What is the maximum length of a custom agent's prompt body? | There is no limit | 1,024 characters | 4,000 characters | 30,000 characters | 20 | 4 |
| 8 | Bonus | The built-in task agent returns the full output when a build succeeds. | True | False |  |  | 20 | 2 |

## Module 8 — Hooks & plugins (slides 70–76)

### Live set (5 questions)

**Q1. A command preToolUse hook exits with code 2. What happens to the tool call?**  
*Quiz · 20 s · Live*

- A. The hook is retried
- B. It is allowed
- C. The session ends
- D. It is denied **(correct)**

**Answer:** D — It is denied  
**Why:** Exit 2 means deny for preToolUse, even if stdout says allow.  
**Source:** <https://docs.github.com/en/copilot/reference/hooks-reference>

**Q2. A preToolUse hook hits its timeout (default 30 s). What happens?**  
*Quiz · 20 s · Live*

- A. Fail-closed: denied
- B. It waits forever
- C. Fail-open: the normal flow continues **(correct)**
- D. The agent stops

**Answer:** C — Fail-open: the normal flow continues  
**Why:** Timeouts fail open for every event, even admin policy hooks. Keep enforcement hooks fast.  
**Source:** <https://docs.github.com/en/copilot/reference/hooks-reference>

**Q3. Which event can force the agent to take another turn?**  
*Quiz · 20 s · Live*

- A. preCompact
- B. errorOccurred
- C. sessionEnd
- D. agentStop with decision "block" **(correct)**

**Answer:** D — agentStop with decision "block"  
**Why:** A block decision forces another turn; after 8 consecutive blocks the CLI ends the turn anyway.  
**Source:** <https://docs.github.com/en/copilot/reference/hooks-reference>

**Q4. Agent Plugins 1.0 standardizes which two component types?**  
*Quiz · 20 s · Live*

- A. Commands and LSP
- B. Skills and MCP servers **(correct)**
- C. Agents and hooks
- D. Hooks and rules

**Answer:** B — Skills and MCP servers  
**Why:** Everything else (agents, hooks, rules, LSP) lives in client namespaces such as com.github.copilot/.  
**Source:** <https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference>

**Q5. A plugin and your user config both define MCP server "db". Which one wins?**  
*Quiz · 20 s · Live*

- A. The first alphabetically
- B. Yours
- C. The plugin's **(correct)**
- D. Neither loads

**Answer:** C — The plugin's  
**Why:** For MCP servers the last loaded wins: user config, then plugins, then --additional-mcp-config.  
**Source:** <https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference>

### Bonus set (3 questions, async)

**Q6. A plugin can override a project skill that has the same name.**  
*True or false · 20 s · Bonus*

- A. True
- B. False **(correct)**

**Answer:** B — False  
**Why:** Agents and skills are first-found-wins and plugins load after project and personal folders.  
**Source:** <https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference>

**Q7. Your hook prints two JSON decision objects on stdout. What happens?**  
*Quiz · 20 s · Bonus*

- A. Invalid JSON: treated as no output **(correct)**
- B. The last one wins
- C. Both apply in order
- D. The first one wins

**Answer:** A — Invalid JSON: treated as no output  
**Why:** stdout gets a single JSON.parse; print exactly one final object.  
**Source:** <https://docs.github.com/en/copilot/reference/hooks-reference>

**Q8. Which plugin marketplace is built into Copilot CLI?**  
*Quiz · 20 s · Bonus*

- A. copilot-plugins
- B. The VS Code Marketplace
- C. awesome-copilot **(correct)**
- D. npm

**Answer:** C — awesome-copilot  
**Why:** awesome-copilot is built in and cannot be removed; copilot-plugins is now opt-in.  
**Source:** <https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference>

### Kahoot import rows — Module 8

| # | Set | Question (max 120 characters) | Answer 1 | Answer 2 | Answer 3 | Answer 4 | Time limit (sec) | Correct answer(s) |
|---|---|---|---|---|---|---|---|---|
| 1 | Live | A command preToolUse hook exits with code 2. What happens to the tool call? | The hook is retried | It is allowed | The session ends | It is denied | 20 | 4 |
| 2 | Live | A preToolUse hook hits its timeout (default 30 s). What happens? | Fail-closed: denied | It waits forever | Fail-open: the normal flow continues | The agent stops | 20 | 3 |
| 3 | Live | Which event can force the agent to take another turn? | preCompact | errorOccurred | sessionEnd | agentStop with decision "block" | 20 | 4 |
| 4 | Live | Agent Plugins 1.0 standardizes which two component types? | Commands and LSP | Skills and MCP servers | Agents and hooks | Hooks and rules | 20 | 2 |
| 5 | Live | A plugin and your user config both define MCP server "db". Which one wins? | The first alphabetically | Yours | The plugin's | Neither loads | 20 | 3 |
| 6 | Bonus | A plugin can override a project skill that has the same name. | True | False |  |  | 20 | 2 |
| 7 | Bonus | Your hook prints two JSON decision objects on stdout. What happens? | Invalid JSON: treated as no output | The last one wins | Both apply in order | The first one wins | 20 | 1 |
| 8 | Bonus | Which plugin marketplace is built into Copilot CLI? | copilot-plugins | The VS Code Marketplace | awesome-copilot | npm | 20 | 3 |

## Module 9 — Beyond the terminal (slides 77–85)

### Live set (5 questions)

**Q1. What must the job in copilot-setup-steps.yml be called?**  
*Quiz · 20 s · Live*

- A. copilot
- B. agent-setup
- C. copilot-setup-steps **(correct)**
- D. setup

**Answer:** C — copilot-setup-steps  
**Why:** Any other name is ignored, and the file only counts on the default branch.  
**Source:** <https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/customize-the-agent-environment>

**Q2. What is the cloud agent's hard time limit per session?**  
*Quiz · 20 s · Live*

- A. 6 hours
- B. 10 minutes
- C. 24 hours
- D. 59 minutes **(correct)**

**Answer:** D — 59 minutes  
**Why:** 59 minutes is a hard limit; timeout-minutes in setup steps can only shorten it.  
**Source:** <https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent>

**Q3. In a compiled gh aw workflow, which job gets write permissions?**  
*Quiz · 20 s · Live*

- A. activation
- B. detection
- C. safe_outputs **(correct)**
- D. agent

**Answer:** C — safe_outputs  
**Why:** The agent job runs read-only; declared writes are applied later by safe_outputs if detection passes.  
**Source:** <https://github.github.com/gh-aw/reference/compilation-process/>

**Q4. By default, how does a Copilot SDK app talk to the agent runtime?**  
*Quiz · 20 s · Live*

- A. JSON-RPC over stdio to the CLI **(correct)**
- B. gRPC to a cloud service
- C. REST calls to api.github.com
- D. WebSockets to VS Code

**Answer:** A — JSON-RPC over stdio to the CLI  
**Why:** The SDK spawns the Copilot CLI runtime in server mode and speaks JSON-RPC (TCP and in-process also exist).  
**Source:** <https://github.com/github/copilot-sdk>

**Q5. Since June 2026, Copilot CLI usage is billed by…**  
*Quiz · 20 s · Live*

- A. Minutes of session time
- B. A flat monthly fee only
- C. Tokens at model rates, as AI credits **(correct)**
- D. Requests × a model multiplier

**Answer:** C — Tokens at model rates, as AI credits  
**Why:** Input, cached and output tokens are priced per model and converted at 1 AI credit = $0.01.  
**Source:** <https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing>

### Bonus set (3 questions, async)

**Q6. The cloud agent's firewall covers processes started by…**  
*Quiz · 20 s · Bonus*

- A. MCP servers
- B. Setup steps
- C. Everything in the VM
- D. The agent's Bash tool **(correct)**

**Answer:** D — The agent's Bash tool  
**Why:** Documented limit: MCP servers and setup-step processes are not covered.  
**Source:** <https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-the-firewall>

**Q7. Which flag starts Copilot CLI as an ACP server for editors?**  
*Quiz · 20 s · Bonus*

- A. `--ide`
- B. `--server`
- C. `--acp` **(correct)**
- D. `--lsp`

**Answer:** C — `--acp`  
**Why:** copilot --acp speaks NDJSON over stdio by default, or TCP with --port.  
**Source:** <https://docs.github.com/en/copilot/reference/copilot-cli-reference/acp-server>

**Q8. Who cannot approve a PR the cloud agent opened for them?**  
*Quiz · 20 s · Bonus*

- A. Code owners
- B. Repository admins
- C. The person who asked for it **(correct)**
- D. Anyone with write access

**Answer:** C — The person who asked for it  
**Why:** Separation of duties: the requester cannot approve the PR Copilot created for them.  
**Source:** <https://docs.github.com/en/copilot/concepts/security-governance-and-network-settings/risks-and-mitigations>

### Kahoot import rows — Module 9

| # | Set | Question (max 120 characters) | Answer 1 | Answer 2 | Answer 3 | Answer 4 | Time limit (sec) | Correct answer(s) |
|---|---|---|---|---|---|---|---|---|
| 1 | Live | What must the job in copilot-setup-steps.yml be called? | copilot | agent-setup | copilot-setup-steps | setup | 20 | 3 |
| 2 | Live | What is the cloud agent's hard time limit per session? | 6 hours | 10 minutes | 24 hours | 59 minutes | 20 | 4 |
| 3 | Live | In a compiled gh aw workflow, which job gets write permissions? | activation | detection | safe_outputs | agent | 20 | 3 |
| 4 | Live | By default, how does a Copilot SDK app talk to the agent runtime? | JSON-RPC over stdio to the CLI | gRPC to a cloud service | REST calls to api.github.com | WebSockets to VS Code | 20 | 1 |
| 5 | Live | Since June 2026, Copilot CLI usage is billed by… | Minutes of session time | A flat monthly fee only | Tokens at model rates, as AI credits | Requests × a model multiplier | 20 | 3 |
| 6 | Bonus | The cloud agent's firewall covers processes started by… | MCP servers | Setup steps | Everything in the VM | The agent's Bash tool | 20 | 4 |
| 7 | Bonus | Which flag starts Copilot CLI as an ACP server for editors? | --ide | --server | --acp | --lsp | 20 | 3 |
| 8 | Bonus | Who cannot approve a PR the cloud agent opened for them? | Code owners | Repository admins | The person who asked for it | Anyone with write access | 20 | 3 |

---

*45 live and 27 bonus questions. Quiz platform rules checked against the Kahoot and Mentimeter help centres (October 2026): Kahoot quiz questions up to 120 characters, answers up to 75, spreadsheet time limits of 5, 10, 20, 30, 60 or 120 seconds; Mentimeter quiz slides allow up to 6 options.*

Sources for the platform rules: <https://support.kahoot.com/hc/en-us/articles/115002308428-Kahoot-question-types>, <https://support.kahoot.com/hc/en-us/articles/115002812547-How-to-import-questions-from-a-spreadsheet-to-your-kahoot>, <https://help.mentimeter.com/en/articles/2968106-select-answer-quiz-competition-slide>.
