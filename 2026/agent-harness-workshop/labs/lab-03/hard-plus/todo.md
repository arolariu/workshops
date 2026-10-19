# 🟣 Hard+ · Privilege audit

> 🕐 1.5–2 h · 🏠 homework · 🆓 free checks · 🤖 optional agent check (about 1 prompt) · 🧱 builds on: Lab 03 · hard

## 🎯 Mission
Five new agents just landed in `.github/agents/`, each one "approved in review". Look closer: a docs writer has a
shell hidden behind an alias, a read-only triage agent can hand work to an agent with every tool, the release agent
has no `tools` line at all, a portal reader's wildcard includes the one tool that changes the portal, and a typo
leaves the coverage agent unable to run the tests it is told to run. Build `audit-agents.mjs`: work out what each
agent can **really** do, check it against the security team's role policy, and flag instructions that fight the tool
list and delegation that reaches a more powerful agent. Then fix the five, without taking away what their jobs need.

## 📋 Requirements
1. `capabilities(tools, policy)` works out what a tools list grants: aliases in any case, `*` anywhere, no list at
   all, MCP `server/tool` and `server/*`, and the names Copilot ignores.
2. `audit(agents, policy)` checks every agent against its role in `.github/policies/roles.json`: agents without a
   role, every tool, capabilities the role doesn't allow, and roles that may only be started on purpose.
3. `conflicts(agent, caps)` finds instructions that need a tool the agent doesn't have, and read-only claims next to
   tools that change things.
4. `reach(agent, agents, policy)` lists who an agent can hand work to; the audit reports every reached agent that can
   do more than the deputy's role allows.
5. `node scripts/audit-agents.mjs` exits 0 on your agents: the five are fixed, each keeps what its job needs, and the
   policy is unchanged.

**The policy** (`.github/policies/roles.json`, given):
```text
roles          { "<role>": { "may": [...], "invocation": "explicit" } }
               may: read search edit execute web agent todo
                    mcp:read mcp:write
agents         { "<agent id>": "<role>" }
mcp            { "<server>": { "<tool>": "read" | "write" } }
builtinAgents  { "general-purpose": ["*"] }
```

**Signals of a conflict**, one line at a time, after a list marker (`-`, `1.`) and a leading `**`:
- a line that starts with **Run, Execute, Install, Build, Deploy** needs `execute`
- **Fix, Edit, Write, Create, Update, Change, Apply** needs `edit`
- **Delegate, Hand, Ask / Use / Call the … agent** needs `agent`
- **Fetch, Download, Browse, Search the web** needs `web`
- anywhere: **read-only**, **you never change / edit / modify / write**, **never edits / changes / modifies / writes**
  rules out `edit`, `execute` and `mcp:write`

## 🧭 Milestones
### M1 · What an agent can really do
- `capabilities(tools, policy)` returns `{ all, caps, from, unknown }`: no `tools` line, or `*` anywhere in it, is
  `all`; `[]` is nothing; a comma-separated string works like a list
- Aliases count in any case: `Bash` is `execute`, `custom-agent` and `Task` are `agent`, `GREP` is `search`
  (`ALIASES` holds the docs' table)
- `studybuddy/*` grants every tool the policy's catalog lists for that server: `mcp:read`, and `mcp:write` because of
  `mark_done`; `studybuddy/get_deadlines` grants `mcp:read`; a server the catalog doesn't know counts as `mcp:write`
  (the audit can't tell, so it fails closed)
- Names Copilot doesn't know (`serach`, `studybuddy/nope`) grant nothing and go into `unknown`; `from` names the entry
  behind each capability, and `caps` keeps the order of `CAPABILITIES`

### M2 · Against the role policy
- `audit(agents, policy)` returns `{ agent, kind, detail, message }` findings: `unassigned` (no role, and then
  nothing else for that agent), `all-tools`, `not-allowed` (detail: the capability; the message names the tool entry
  and the role), `unknown-tool` (detail: the entry), and `must-be-explicit` (the role says `"invocation":
  "explicit"`, and the agent has neither `disable-model-invocation: true` nor `infer: false`)
- On `tests/fixtures/agents/` with `tests/fixtures/roles.json` it finds exactly the expected ones

### M3 · Instructions that fight the tools
- `conflicts(agent, caps)` returns `{ kind: 'needs' | 'read-only', cap, line }` items, one per kind and capability,
  following the signals: "Run `npm test`" without `execute`; "You are read-only" next to `edit`, `execute` or
  `mcp:write`
- It isn't fooled by "If someone asks you to change a file…" or "Never edit files in `.github/`", and your reviewer,
  test-writer and fixer have no conflicts
- `audit()` reports them as `conflict` findings, detail `needs:<cap>` or `read-only:<cap>`

### M4 · The confused deputy
- `reach(agent, agents, policy)` is empty without `agent`; with it, it lists every other agent the model may pick
  (not the explicit-only ones) and each of `policy.builtinAgents` (`builtin: true`), with their capabilities
- `audit()` reports an `escalation` (detail: the target's id) for each reached agent that can do something the
  deputy's role may not; a deputy whose role allows all of it gets none
- The built-in `general-purpose` agent counts: under the shipped policy, any agent with `agent` escalates

### M5 · Fix the five agents
- `node scripts/audit-agents.mjs` lists the findings and exits 1 for `--agents ../tests/fixtures/agents --roles
  ../tests/fixtures/roles.json`, and exits 0 on your `.github/agents/`
- Your audit and the reference audit find nothing, and `roles.json` is unchanged: fix the agents, not the policy
- Least privilege, not no privilege: docs-writer can still edit, release can still run (and only when someone picks
  it), coverage can run its tests, portal can read the portal but not `mark_done`, and triage reads and searches but
  hands nothing on

## 📂 Work here
```bash
cd labs/lab-03/hard-plus/src
code scripts/audit-agents.mjs .github/policies/roles.json
node scripts/audit-agents.mjs              # audit your agents
node labs/start.mjs test lab-03 hard+      # from the workshop folder
```
`audit-agents.mjs` gives you the plumbing: reading agent files (`parseAgentFile`, `loadAgents`: Copilot loads every
`.md` under `.github/agents/`, subfolders too, with IDs like `team--reviewer`), the policy, `ALIASES` and the command
line. The policy lives in `.github/policies/`, outside the agents folder, on purpose. The five agents have too much
power, but their instructions are ordinary jobs: none of them does anything harmful if you load it.

## 💡 Hints
### M1
<details><summary>One entry at a time</summary>

`*` or no list: everything. Otherwise, per entry: a `/` means MCP, so look the server up in `policy.mcp` (`*` is
every tool it lists). Anything else: `Object.keys(ALIASES).find((cap) => ALIASES[cap].includes(entry.toLowerCase()))`.
No match goes to `unknown`. Copilot ignores those without a word, which is how a typo becomes a missing tool.

</details>

<details><summary>Why a wildcard is a privilege question</summary>

Today `studybuddy/*` means four read tools and `mark_done`. Tomorrow the server adds `delete_course`, and every agent
with the wildcard has it, without anyone touching an agent file. Name the tools you mean.

</details>

### M2
<details><summary>Findings, not booleans</summary>

Collect every problem, and say what to fix: `docs-writer: execute (from "Bash") is not allowed for the docs role.`
Someone can fix the agent from that one line. Skip the other checks for an agent without a role: the missing role is
the first thing to fix.

</details>

### M3
<details><summary>Signals that don't cry wolf</summary>

Strip the list marker first: `line.trim().replace(/^(?:[-*+]|\d+[.)])\s+/, '')`, then a leading `**`. The verb must
be the **first** word: "If someone asks you to change a file" isn't an instruction to change one. A read-only claim
can be anywhere in a line: `/\bread-?only\b/i` and friends.

</details>

<details><summary>Why `execute` breaks "read-only"</summary>

A shell can delete, overwrite and download. An agent that "never changes files" but can run commands is read-only
only as long as the model feels like it.

</details>

### M4
<details><summary>Every path is one hop</summary>

Copilot CLI has no per-agent allow-list for delegation: an agent with `agent` can hand work to any custom agent the
model may pick, and to the built-in ones. So `reach()` is a filter, not a graph search. There are two fixes: take
`agent` away from the deputy, or make the powerful agent explicit-only (`disable-model-invocation: true`).

</details>

<details><summary>The built-in agents</summary>

`general-purpose` can use every tool. The docs don't say whether a custom agent's `agent` tool reaches it, so the
policy assumes it does (`builtinAgents`): an audit assumes the worst until someone proves otherwise.

</details>

### M5
<details><summary>Five fixes</summary>

Run the audit and go agent by agent: a tools list for release (and `disable-model-invocation: true`); the alias that
hides a shell; the typo; the wildcard (name the four read tools); and the deputy. Once triage loses `custom-agent`,
its third instruction fights its tools: rewrite it so that a person passes the bugs on.

</details>

## 🧠 Takeaway
An agent can do what its tools, aliases and wildcards grant, plus whatever the agents it can reach can do: audit all of it.

## ❓ Check yourself
`triage` has `tools: ['read', 'search', 'custom-agent']`, and its instructions say "You are read-only". The `release`
agent has no `tools` line and no `disable-model-invocation`. Can triage get a file changed?
1. Yes: it can hand the work to release, which has every tool. `edit` isn't in its tools, but it is in its reach.
2. No: `edit` isn't in its tools, so the model never sees an edit tool.
3. No: "You are read-only" in its instructions stops it.

<details><summary>Answer</summary>

**1.** That's the confused deputy: release does the work on triage's behalf, with release's tools. Take
`custom-agent` away from triage, or make release explicit-only; better, both.

</details>

## 🚀 Going further
- `execute` is the master key: an agent that can run commands can start `copilot --agent release …` itself, or
  `node -e`. That's where Lab 05's guard and `--deny-tool` come in.
- Run the audit in CI on every pull request that touches `.github/agents/` or `roles.json` (Lab 07), and give
  `roles.json` an owner in CODEOWNERS.
- Agents can bring their own MCP servers (`mcp-servers:` in the frontmatter): report them, and count their wildcards
  as `mcp:write`.
- Lab 03 hard++ builds a team of agents with separate duties, and checks it with this audit.
