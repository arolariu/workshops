# 🟢 Easy · Plug in the portal

> 🕐 10 min · 🆓 free checks · 🤖 optional agent check (about 1 prompt)

## 🎯 Mission
Your agent knows your code but not your life. There's a (mock) university portal MCP server in
`mcp/studybuddy-server.mjs`. Connect it to Copilot for this project, check that Copilot sees its tools,
then ask Copilot what's due this week, in plain language.

## 📂 Work here
```bash
cd labs/lab-04/easy/src
copilot
```

## ✅ Done when
- `.mcp.json` registers the server as a **local (stdio)** server named with a simple id (e.g. `studybuddy`)
- The checks can start it from your config and it lists its tools
- `copilot mcp list` shows it (the folder must be trusted)
- You asked Copilot about your deadlines and it called the portal

## 💡 Hints
<details><summary>The config file</summary>

The lab guide (`labs/lab-04/readme.md`) shows the shape: `mcpServers` → a name → `type`, `command`, `args`.
Paths in `args` are relative to the folder where you start `copilot`.

</details>

<details><summary>Is it loaded?</summary>

Run `copilot mcp list` in the terminal, or `/mcp` in a session. Nothing there? Project MCP servers only load
in **trusted** folders: restart `copilot` here and trust the folder.

</details>

<details><summary>Use it</summary>

Ask *"What do I have due in the next 7 days?"*. Copilot asks permission to call `get_deadlines`. Allow it
and look at the answer. Bonus: *"How am I doing in SE201?"*

</details>

## 🚀 Going further
- Add a **remote** server just for you: `copilot mcp add --transport http mslearn https://learn.microsoft.com/api/mcp`,
  then ask a question about Azure or .NET docs.
- Try `copilot --allow-tool=studybuddy -p "What is due this week?" -s`: no permission prompt this time.
