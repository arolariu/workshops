# 🧠 Build Your Agent Harness

**A hands-on workshop on AI-native development with GitHub Copilot CLI.**
An AI agent is a model plus a *harness*: the instructions, skills, roles, connections, guardrails and
automation around it. In this workshop you build that harness, layer by layer, on a tiny project called
StudyBuddy, and every step is checked by tests (and, if you like, by the real agent).

```text
🧠 model  +  🧰 harness  =  🤖 an agent you can trust
              ├── 📜 instructions   what it knows          (Lab 01)
              ├── 🧩 skills         know-how on demand     (Lab 02)
              ├── 🎭 custom agents  roles, least privilege (Lab 03)
              ├── 🔌 MCP servers    your systems           (Lab 04)
              ├── 🔒 hooks          guardrails             (Lab 05)
              ├── 📦 plugins & APM  sharing                (Lab 06)
              └── 🚀 workflows      agents in CI           (Lab 07)
```

## ⚡ Quick start
1. **Install** [Node.js 22+](https://nodejs.org), git and GitHub Copilot CLI:
   ```bash
   npm install -g @github/copilot
   ```
   You need a GitHub account with Copilot. The free plan for verified students works.
2. **Get the labs**: clone this repository (or unzip it) and open a terminal in its folder.
3. **Trust the folder, once**: run `copilot` in this folder, choose **Yes, and remember this folder**,
   type `/login` if asked, then `/exit`. Copilot only loads a project's MCP servers, hooks and agents from
   folders you trust, and trusting this one covers every lab inside it.
4. **Start the lab companion**:
   ```bash
   node labs/start.mjs
   ```
   Use the arrow keys to pick a lab and a level, read the mission, press **c** to start Copilot right in
   that level's folder, and press **t** to run the checks.

## ⌨️ The lab companion
A green-on-dark terminal app that guides you through every level. On a level you can press:

| Key | What it does |
|---|---|
| **t** | run the free checks: ✅ or ❌, each with a reason |
| **w** | watch: the checks run again every time you save a file |
| **h** | reveal the next hint (there are three per level) |
| **c** | start Copilot in the level's folder; type `/exit` to come back, and your checks run automatically |
| **o** / **y** | open the folder (VS Code or your file manager) / copy its `cd` command |
| **g** | read the lab guide: concepts, examples, links |
| **a** | 🤖 agent check: the real Copilot on a copy of your folder (uses AI credits) |
| **s** | peek at the reference solution |
| **x** | start the level over (your files are backed up to `labs/.backups/` first; needs git) |
| **1 2 3** | switch between easy, medium and hard · **n** next unfinished level · **?** all keys |

It remembers where you were, shows what you changed and which check to fix next, and celebrates when a level
goes green. Prefer a calmer screen? Start it with `--no-anim` (no animations) or `--no-intro` (no welcome screen).

## 🗺️ How the labs work
```text
labs/
├── start.mjs              ← 🧠 the lab companion: run this
├── lab-00 … lab-07/
│   ├── readme.md          ← the concept: why it matters, how it works, examples, links
│   ├── easy/              ← 🟢 we do it together
│   ├── medium/            ← 🟡 on your own
│   └── hard/              ← 🔴 on your own
│       ├── todo.md        ← your mission: short on purpose, with hints you reveal one by one
│       ├── src/           ← where you work: start `copilot` in here
│       ├── tests/         ← the checks
│       └── sol/           ← a reference solution, for when you're really stuck
└── _harness/              ← the engine behind start.mjs (no need to touch it)
```
Every level is a **standalone mini-project**: it doesn't depend on any other lab, so you can start
anywhere. Your work stays in `src/`. Commit early (`git add -A && git commit -m "lab 01 easy"`); to start a
level over, press **x** in the app (or run `node labs/start.mjs reset lab-01 easy --yes`).

## 🧪 Two kinds of checks
| | 🆓 Checks (press **t**) | 🤖 Agent checks (press **a**) |
|---|---|---|
| What | read your files, run your code, unit tests, hook and MCP calls, `copilot … list` | run the real agent with `copilot -p "…"` on a copy of your folder, then check what it said and did |
| Cost | free, instant | uses AI credits (about 1–4 prompts each) |
| When | all the time | when the free checks are green and you want proof |

Agent checks run on a throwaway copy in `labs/.runs/`, with explicit `--allow-tool` / `--deny-tool` flags
and a credit cap, so they never touch your `src/`.

Without the app:
```bash
node labs/start.mjs list                          # your progress
node labs/start.mjs test lab-01 easy              # free checks
node labs/start.mjs test lab-01 easy --watch      # free checks, again on every save
node labs/start.mjs test lab-01 easy --agent      # + agent checks
node labs/start.mjs hint lab-01 easy              # next hint
node labs/start.mjs reset lab-01 easy --yes       # start a level over (backs up your files first)
node labs/start.mjs open lab-01 easy              # the app, straight into one level
```

## 📚 The labs
| Lab | Topic | 🟢 Easy (together) | 🟡 Medium | 🔴 Hard |
|---|---|---|---|---|
| [00](labs/lab-00/readme.md) | 💻 **Copilot CLI**<br>Your agent runtime | First contact | Think first | Agent in a script |
| [01](labs/lab-01/readme.md) | 📜 **Instructions**<br>What the agent knows | The rules nobody wrote down | Rules for one folder | Prove it with data |
| [02](labs/lab-02/readme.md) | 🧩 **Skills**<br>Know-how on demand | Teach a recipe once | A command you call by name | A skill with a script |
| [03](labs/lab-03/readme.md) | 🎭 **Custom agents**<br>Roles with least privilege | Eyes, not hands | A specialist with a boundary | Two agents, one loop |
| [04](labs/lab-04/readme.md) | 🔌 **MCP servers**<br>Connect your systems | Plug in the portal | Add a tool | A tool that changes things |
| [05](labs/lab-05/readme.md) | 🔒 **Guardrails & hooks**<br>What the agent may do | A hook that says no | Soft rules → hard rules | Defense in depth |
| [06](labs/lab-06/readme.md) | 📦 **Plugins, extensions & APM**<br>Extend and share | Install, don't copy | A zero-credit command | Ship it as a plugin |
| [07](labs/lab-07/readme.md) | 🚀 **Agentic workflows**<br>Agents in CI | Make it safe | Two kinds of change | A reviewer in CI |

## 🕐 The workshop (110 minutes)
| Time | What |
|---|---|
| 0–10 | Welcome, why a harness, and setup together: clone, trust the folder, `node labs/start.mjs` |
| 10–50 | Eight labs, 5 minutes each: the idea in one slide, then the 🟢 easy level together |
| 50–110 | Lab time: pick 🟡 medium and 🔴 hard levels; the facilitator walks around and helps |

Suggested paths for lab time (about an hour each):
- **Foundations**: 🟡 01 → 🟡 02 → 🟡 03 → 🟡 05
- **Security**: 🟡 05 → 🔴 05 → 🟡 03 (free checks, few credits)
- **Builder**: 🟡 04 → 🔴 04 → 🟡 06
- **Automation**: 🔴 00 → 🟡 07 → 🔴 07
- **Done early?** Harness your own project with what you built, and finish the other levels at home.

## 💳 AI credits
Every prompt costs AI credits, and student plans have a monthly budget. The free checks never spend any.
In Copilot, use `!command` for things that don't need AI, keep prompts focused, check `/usage`, and cap
scripted runs with `--max-ai-credits` (minimum 30).

## 🧑‍🏫 For facilitators
```bash
node labs/start.mjs verify          # every src/ must fail its checks, every sol/ must pass them
node labs/start.mjs test lab-03 easy --sol --agent   # try a reference solution with the real agent
node labs/start.mjs open lab-03 easy --no-intro      # jump straight to a level during the live demo
```
Each lab's `readme.md` is the script for its 5-minute slot: the concept, a demo, the easy level.

## 🛟 Troubleshooting
| Problem | Fix |
|---|---|
| "Copilot only loads … from folders you trust" | Run `copilot` once in the workshop root and choose *Yes, and remember this folder*. |
| Copilot doesn't see my AGENTS.md / skill / agent | Start `copilot` **inside** the level's `src/` folder, and start a new session after editing. |
| An agent check says "Are you logged in?" | Run `copilot`, type `/login`, then try again. |
| `node labs/start.mjs` shows plain text | Use a real terminal (Windows Terminal, macOS Terminal, iTerm, a Linux terminal). |
| Lab 06 needs `apm`, Lab 07 needs `gh aw` | Install them as the lab's guide explains. Lab 07's `gh aw` checks are optional. |
| I broke a level and want to start over | Press **x** on the level. Without git, extract that level's `src/` again from the zip. |
| Copying the `cd` command (**y**) does nothing | Your terminal may block clipboard access; the command is also shown at the bottom of the screen. |

## ✨ About
Created by **Alexandru-Razvan Olariu** · Software Architect at Microsoft · 2026.
Questions, ideas or feedback? Reach out: **aolariu@microsoft.com**
