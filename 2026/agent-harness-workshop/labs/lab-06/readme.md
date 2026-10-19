# Lab 06 · 📦 Plugins, extensions & APM — Extend and share

> **Harness layer:** Distribution · **Maturity:** L5 Governed · 🟢 together · 🟡 🔴 🟣 💎 homework
>
> **Threads:** 🕵️ The reviewer

## In one minute
So far you built harness pieces by hand, in one project. This lab is about **sharing and extending**:
- **Plugins** bundle agents, skills, hooks and MCP servers into one installable unit: `copilot plugin install`.
- **APM** (Agent Package Manager, by Microsoft) is "npm for agent context": a manifest (`apm.yml`), versioned
  dependencies from GitHub, a lockfile, and one command to set up a project's whole harness.
- **Extensions** are your own code inside Copilot CLI: new slash commands and tools written in JavaScript.
  They run locally, so a slash command costs **zero AI credits**.

## Why it matters
A great harness that lives in one person's folder helps one person. Teams need the same agents, skills and
guardrails everywhere, kept up to date like any other dependency. And some jobs don't need an AI at all:
a deterministic slash command is faster, cheaper and always right.

## 🔬 Under the hood
```text
 apm.yml ─▶ apm install ─▶ .github/: agents · skills · instructions ─▶ every teammate's context
                 └──▶ apm.lock.yaml: the exact versions, so everyone gets the same files
```
Everything a package deploys ends up where the harness reads it, so it ends up **in the model's context**:
instructions on every turn, skill descriptions on every turn, agents and hooks whenever they apply. Two people
with the same lockfile give their agents the same context, which is what makes a team's results comparable and
a bug reproducible.
That also means a skill or plugin is a **dependency made of prompts and code**. An upstream change to one
sentence of an instruction can change how your agent behaves, without a single line of your code changing. Pin
it, lock it, and review upgrades like you'd review a library upgrade.
An extension is the other way round: deterministic code the harness runs itself, so a slash command spends no
tokens at all.

## Plugins
```text
studybuddy-plugin/
├── plugin.json        { "name", "description", "version", "author": { "name" },
│                        "hooks": "hooks/hooks.json", "mcpServers": "mcp/servers.json" }
├── agents/sb-reviewer.agent.md
├── skills/sb-explain-error/SKILL.md
├── hooks/hooks.json   + hooks/scripts/sb-guard.mjs
└── mcp/servers.json   + mcp/sb-portal.mjs
```
| You want to… | Do this |
|---|---|
| Browse the default marketplace | `copilot plugin marketplace browse awesome-copilot` |
| Install from a marketplace | `copilot plugin install <name>@awesome-copilot` |
| Install from GitHub | `copilot plugin install owner/repo` or `owner/repo:path/to/plugin` |
| Try a local plugin without installing | `copilot --plugin-dir ./studybuddy-plugin` |
| See what's installed | `copilot plugin list` or `/plugin` |
| Add your own marketplace | `copilot plugin marketplace add owner/repo` or an **absolute** local path |

If a project and a plugin both define an agent or skill with the same name, the **project's wins**, so
give plugin items their own names.

Good to know (Copilot CLI 1.0.101):
- A plugin's hook command and its stdio MCP servers run **from the plugin's folder**: point them at files inside the
  plugin, and use the payload's `cwd` to find the project.
- `--plugin-dir … plugin list` and `skill list` show a plugin's version and skills; `mcp list` doesn't show its MCP
  servers until it's installed. `COPILOT_HOME=<a new folder>` gives you a throwaway setup to install into.
- Direct installs (`copilot plugin install ./path`, `owner/repo`) still work but are deprecated: only
  `plugin@marketplace` will stay.
- `copilot plugin marketplace add ./folder` is read as a GitHub `owner/repo`: give a local marketplace as an absolute
  path. The CLI checks the catalog's schema, not that each entry's name and version match its `plugin.json`.

## APM: dependencies for your harness
```yaml
# apm.yml
name: studybuddy
version: 1.0.0
dependencies:
  apm:
    - microsoft/apm-sample-package#v1.0.0      # owner/repo#tag: pinned!
```
```bash
apm init -y                                                        # create apm.yml
apm install microsoft/apm-sample-package#v1.0.0 --target copilot   # fetch, deploy to .github/, lock
apm deps list                                                      # what's installed
```
APM deploys each package's instructions, agents and skills into the folders Copilot reads, and records
exact versions in `apm.lock.yaml`. A new teammate runs `apm install` and gets the same harness.
Install APM from [github.com/microsoft/apm](https://github.com/microsoft/apm).

## Extensions (experimental)
```js
// .github/extensions/studybuddy/extension.mjs
import { joinSession } from '@github/copilot-sdk/extension';   // provided by the CLI, nothing to install

const session = await joinSession({
  commands: [{
    name: 'due',
    description: 'What is due in the next 7 days (no AI, no credits)',
    handler: async (ctx) => { await session.log(`You typed: /due ${ctx.args}`); },
  }],
});
```
Start Copilot with `copilot --experimental`, then `/extensions` lists them. Extensions can also register
tools for the model and listen to session events.

## 🏛️ In the enterprise
- **At scale:** an internal marketplace or APM registry: the platform team publishes the approved agents, skills,
  hooks and MCP servers, and every project installs them pinned.
- **The risk:** supply-chain attacks and silent drift: an unpinned package changes under you, a malicious skill
  ships a script, or a project file quietly shadows the approved plugin item.
- **The control:** pinned versions and a lockfile in every repo, review of every upgrade, a verified marketplace,
  and prefixed names so nothing shadows the shared items by accident.

## Exercises
| Level | Mission | You practise |
|---|---|---|
| 🟢 easy | **Install, don't copy**: a shared harness via APM, plus a marketplace plugin | `apm.yml`, lockfiles, plugin installs |
| 🟡 medium | **A zero-credit command**: `/grades` and `/due` with argument parsing and errors that help | extensions, `joinSession`, commands |
| 🔴 hard | **Ship it as a plugin**: your agents, skills, guard hook and MCP server, prefixed and versioned | `plugin.json`, `--plugin-dir`, naming |
| 🟣 hard+ | **Supply chain**: pin everything, a lock verifier, a shadow detector, and a breaking upgrade done by a codemod | pinning, drift, upgrades |
| 💎 hard++ | **An internal marketplace**: two versioned plugins, a gatekeeper, a release script, and a tool the model can trust | distribution at org scale |

## Common pitfalls
- **Unpinned dependencies** (`owner/repo` without `#tag`): your harness changes under your feet.
- **Name clashes**: a project agent shadows a plugin agent with the same name.
- **Doing deterministic work with AI**: if the answer is a formula, write a command, not a prompt.

## Learn more
- [About plugins for Copilot CLI](https://docs.github.com/copilot/concepts/agents/copilot-cli/about-cli-plugins)
- [CLI plugin reference](https://docs.github.com/copilot/reference/copilot-cli-reference/cli-plugin-reference): `plugin.json`, `marketplace.json`, load order
- [Creating a plugin marketplace](https://docs.github.com/copilot/how-tos/copilot-cli/customize-copilot/plugins-marketplace)
- [Creating extensions for Copilot CLI](https://docs.github.com/copilot/tutorials/create-an-extension): commands and tools
- [Agent Package Manager (APM)](https://github.com/microsoft/apm)
- [awesome-copilot](https://github.com/github/awesome-copilot): the default plugin marketplace
