# 🔴 Hard · Ship it as a plugin

> 🕐 1–1.5 h · 🏠 homework · 🆓 free checks (some run `copilot … list`, never a prompt) · 🤖 optional agent check (about 1 prompt) · 🧱 builds on: Lab 06 · medium

## 🎯 Mission
Other teams keep asking for StudyBuddy's harness: the read-only reviewer from Lab 03, the skills from Lab 02, the
guard from Lab 05 and the portal MCP server from Lab 04. Copy-pasting them into every repository means a dozen
versions that drift apart. Package the whole harness as **one Copilot CLI plugin** in `studybuddy-plugin/`: one
version, one install command, every item behind the same prefix so nothing collides with a project's own files.
Then prove it loads without installing anything, and that its hook and its server work from wherever the plugin
ends up.

## 📋 Requirements
1. `studybuddy-plugin/plugin.json` has a kebab-case `name`, a `description`, a semver `version` and `author.name`;
   every path it gives (`agents`, `skills`, `hooks`, `mcpServers`, …) is inside the plugin.
2. The plugin ships the reviewer agent (read-only tools) and the `explain-error` and `new-module` skills, with
   `new-module`'s templates inside the plugin.
3. Every agent, skill and MCP server name starts with the same prefix (like `sb-`), and none clashes with the
   project's own.
4. The plugin's `preToolUse` hook runs a guard shipped **inside** the plugin, on both shells, with a timeout; the
   guard blocks recursive force-deletes and logs to the session's `.agent-logs/`, never into the plugin.
5. The plugin's MCP config starts the portal server shipped inside the plugin, and that server finds its own data.
6. `studybuddy-plugin/README.md` names every item and shows the version, the install command and how to try it.

## 🧭 Milestones
### M1 · The manifest
- `plugin.json`: kebab-case `name` (the CLI rejects anything else), a `description` of 20+ characters, a semver
  `version`, and `author.name`
- Every path field points at something that exists inside the plugin
- `copilot --plugin-dir ./studybuddy-plugin plugin list --json` shows your plugin with that version

### M2 · Agents and skills, prefixed
- `agents/` has the reviewer, with a description and an explicit read-only tools list
- `skills/` has `explain-error` and `new-module` (prefixed), each named after its folder, with a description that
  says when to use it; `new-module` ships `templates/` and its `SKILL.md` points there, not into `.github/skills/`
- Every agent, skill and MCP server shares one prefix, and none has the name of a project agent, skill or server
- `copilot --plugin-dir … skill list --json` lists the plugin's skills with `"source": "plugin"`

### M3 · Guardrails that travel
- `hooks/hooks.json` (named in `plugin.json`) has a `preToolUse` hook with `bash`, `powershell` and `timeoutSec`,
  and **no** `cwd`; both commands run `node <a script inside the plugin>`
- Run from the plugin's folder, the guard denies `rm -rf build`, `Remove-Item -Recurse build` and
  `cd src && rm -fr ../dist`, and allows `npm test`
- It logs every decision to `<session folder>/.agent-logs/*.jsonl` (the payload's `cwd`), and writes nothing into
  the plugin

### M4 · The portal, packaged
- `mcp/servers.json` (named in `plugin.json` as `"mcpServers"`) has one prefixed stdio server: `node` and a script
  inside the plugin
- Started from the plugin's folder, the server lists `get_deadlines` and `get_grades`, and answers
  `get_grades { course: "SE201" }`
- Installed into a scratch Copilot home, `copilot mcp list --json` shows the server with your plugin as its source

### M5 · Ready to share
- `README.md` names every agent, skill and MCP server, says there's a guard hook, shows the version from
  `plugin.json`, the `copilot plugin install …` command and the `--plugin-dir` way to try it

## 📂 Work here
```bash
cd labs/lab-06/hard/src
code studybuddy-plugin/plugin.json studybuddy-plugin/README.md
copilot --plugin-dir ./studybuddy-plugin plugin list
node labs/start.mjs test lab-06 hard       # from the workshop folder
```
The harness pieces you're packaging live in `.github/agents/`, `.github/skills/`, `.github/hooks/` and `mcp/`.
**Copy** them into the plugin; the project keeps its own. The checks that call Copilot use a scratch `COPILOT_HOME`,
so your own plugins and settings never interfere, and they never send a prompt.

## 💡 Hints
### M1
<details><summary>The smallest manifest</summary>

```json
{
  "name": "studybuddy-harness",
  "description": "StudyBuddy's agent harness: …",
  "version": "1.0.0",
  "author": { "name": "StudyBuddy team" }
}
```
Agents in `agents/` and skills in `skills/` are found without path fields. Hooks and MCP servers need one (M3, M4).

</details>

### M2
<details><summary>Renaming, everywhere</summary>

An agent's ID is its **file name** (`sb-reviewer.agent.md`), and a skill's name is the `name:` in its frontmatter,
which must match its folder. Rename the file or folder **and** the frontmatter. Copilot names a plugin's agents
after the plugin (`studybuddy-harness:sb-reviewer`), but a plugin's skills keep their own names next to the
project's (`copilot --plugin-dir ./studybuddy-plugin skill list` shows both): that's why plugins prefix.

</details>

<details><summary>Templates that travel</summary>

The project's skill says "create it from `.github/skills/new-module/templates/…`". Where the plugin is installed,
that folder doesn't exist. Copy `templates/` next to the plugin's `SKILL.md` and say "the templates are in the
`templates/` folder next to this SKILL.md".

</details>

### M3
<details><summary>Where does a plugin hook run?</summary>

From the plugin's own folder: GitHub's own plugins run `./scripts/…` from `hooks/hooks.json` without a `cwd`. So
`node hooks/scripts/sb-guard.mjs` finds the script, and the project is somewhere else: the payload's `cwd` says
where. Log to `path.join(input.cwd, '.agent-logs', 'sb-guard.jsonl')`, not to `.agent-logs/` (that would be
inside the plugin).

</details>

<details><summary>The hook file</summary>

```json
{ "version": 1, "hooks": { "preToolUse": [ {
  "type": "command",
  "bash": "node hooks/scripts/sb-guard.mjs",
  "powershell": "node hooks/scripts/sb-guard.mjs",
  "timeoutSec": 10 } ] } }
```

</details>

### M4
<details><summary>Not .mcp.json</summary>

A plugin can keep its MCP config in any file: `"mcpServers": "mcp/servers.json"` in `plugin.json`. A plugin's stdio
server starts in the plugin's folder, so `"args": ["mcp/sb-portal.mjs"]` works. The Lab 04 server already reads
`portal-data.json` from its own folder (`import.meta.url`): copy both files.

</details>

<details><summary>Why install it in the check?</summary>

`copilot --plugin-dir … mcp list` doesn't show a plugin's MCP servers (a CLI quirk), so the check installs a copy of
your plugin into a throwaway `COPILOT_HOME` and lists the servers there.

</details>

### M5
<details><summary>Install commands</summary>

Push the repository to GitHub and anyone can install the folder:
`copilot plugin install <owner>/<repo>:path/to/studybuddy-plugin`. To try it without installing:
`copilot --plugin-dir ./studybuddy-plugin`.

</details>

## 🧠 Takeaway
A plugin is your harness as one versioned dependency: prefix every name, keep every path inside it, and never assume where it will run.

## ❓ Check yourself
A team installs your plugin, and their repository already has `.github/agents/sb-reviewer.agent.md`, an older copy
someone pasted in last year. Which reviewer do they get when they run `/agent sb-reviewer`?
1. Yours: an installed plugin overrides the project, so updates reach everyone.
2. Copilot refuses to start until the clash is fixed.
3. The project's old copy: agents are first-found-wins, project before plugins, and the plugin's is silently
   ignored.
4. Both: Copilot merges the two instructions into one agent.

<details><summary>Answer</summary>

**3.** Project agents and skills load before plugin ones, and the first name wins without a warning. A prefix only
helps if nobody copies the plugin's files into a project, which is why Lab 06 hard+ builds a detector for exactly
this shadowing.

</details>

## 🚀 Going further
- Run `copilot --plugin-dir ./studybuddy-plugin --agent studybuddy-harness:sb-reviewer` (a plugin's agents are
  named `<plugin>:<agent>`) and review `report.js`. Then look at
  `.agent-logs/sb-guard.jsonl`: every call the reviewer made went past your packaged guard.
- `copilot plugin install ./studybuddy-plugin` works, but warns that direct installs are deprecated: only
  `plugin@marketplace` installs will stay. Lab 06 hard++ builds the marketplace.
- Should a harness plugin ship guardrails at all? A plugin hook runs in **every** project of everyone who enables
  it. Who decides what it blocks?