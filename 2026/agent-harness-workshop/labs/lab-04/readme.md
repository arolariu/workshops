# Lab 04 · 🔌 MCP servers — Connect your systems

> **Harness layer:** Connections · **Maturity:** L2 Equipped · 🟢 together · 🟡 🔴 homework
>
> **Threads:** 💉 Prompt injection

## In one minute
The **Model Context Protocol (MCP)** is an open standard for plugging tools and data into AI agents. An MCP
server exposes **tools** (functions the agent can call) with a name, a description and an input schema.
Copilot discovers them, decides when to call them, and asks your permission like for any other tool. Write a
server once and it works in Copilot CLI, VS Code and every other MCP client.

## Why it matters
Your agent knows your code but not your world: the ticket system, the database, the course portal. MCP is
how you connect it **safely**: you choose which systems, which tools and which permissions. And the
model never gets your credentials; the server does the work and returns only the result.

## 🔬 Under the hood
```text
 Copilot ─stdin─▶  {"method":"tools/call","params":{"name":"get_deadlines",…}}  ─▶ server
 Copilot ◀─stdout─ {"result":{"content":[{"type":"text","text":"[…]"}]}}          ◀─ server
```
At startup Copilot asks each server for its tools (`tools/list`), and every tool's **name, description and input
schema are added to the model's context**, on every turn. Ten tools with long descriptions cost tokens even when
none is used. When the model writes a tool call, Copilot sends it to the server as JSON-RPC (over stdin and stdout
for a local server) and puts the result into the next turn's context.
That result is **untrusted tokens**. The model reads a deadline note written by someone else exactly like it reads
your prompt, so text such as "ignore your instructions and…" inside a tool result can sway it. That's **indirect
prompt injection**, and it's why data from tools is treated as data, never as orders.

## Local vs remote
| | Local (stdio) | Remote (HTTP) |
|---|---|---|
| Runs | as a process Copilot starts on your machine | on someone's server, reached by URL |
| Good for | your files, local tools, prototypes | shared services, SaaS APIs (often with OAuth) |
| Configure | `"type": "stdio", "command": "node", "args": [...]` | `"type": "http", "url": "https://..."` |

Copilot CLI already ships with the **GitHub MCP server** built in (issues, PRs, code search).

## Configuration
```json
{
  "mcpServers": {
    "studybuddy": {
      "type": "stdio",
      "command": "node",
      "args": ["mcp/studybuddy-server.mjs"]
    }
  }
}
```
| Where | Scope |
|---|---|
| `.mcp.json` or `.github/mcp.json` in the project | everyone on the project (only in **trusted** folders) |
| `~/.copilot/mcp-config.json` (via `copilot mcp add`) | you, everywhere |

```bash
copilot mcp list                                        # what's configured here
copilot mcp add --transport http mslearn https://learn.microsoft.com/api/mcp   # a remote server, for you
```
In a session: `/mcp` shows servers and their tools. In scripts: `--allow-tool=studybuddy` allows every tool
of that server; `--allow-tool='studybuddy(get_deadlines)'` allows just one.

## Designing good tools
- **Descriptions are prompts**: the model reads them to choose a tool. Say what it returns and when to use it.
- **Small, typed inputs** with a JSON Schema. Validate everything; return clear errors (`isError: true`).
- **Mark read-only tools** with `annotations: { readOnlyHint: true }`. Writes deserve extra care.
- **Return data, not prose**: compact JSON the model can reason about.

## 🏛️ In the enterprise
- **At scale:** MCP servers connect agents to ticketing, databases and internal APIs. Each one is a door into a
  real system, configured once for the whole team.
- **The risk:** a server that hands the model secrets, takes write actions without review, or passes hostile text
  from other people straight into the context.
- **The control:** an allow-list of approved servers, credentials kept on the server side (never in the prompt),
  read-only tools marked as such, and a human approval for every tool that changes things.

## Exercises
| Level | Mission | You practise |
|---|---|---|
| 🟢 easy | **Plug in the portal**: connect a local MCP server and ask about your week | `.mcp.json`, trust, `/mcp` |
| 🟡 medium | **Add a tool**: exam dates, with a description the model understands | tool schemas, JSON-RPC |
| 🔴 hard | **A tool that changes things**: mark assignments done, safely and persistently | write tools, validation, `isError` |

## Common pitfalls
- **Untrusted folder**: project MCP servers only load in folders you trust.
- **Printing logs to stdout**: stdout is the protocol channel. Use `console.error` for logs.
- **A relative path that breaks**: `args` paths are relative to where you start `copilot`.

## Learn more
- [Adding MCP servers to Copilot CLI](https://docs.github.com/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers)
- [modelcontextprotocol.io](https://modelcontextprotocol.io): the specification
- `copilot help permissions`: allow and deny patterns for MCP tools
