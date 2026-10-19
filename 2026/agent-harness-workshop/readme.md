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
1. **Get the labs**: clone this repository (or unzip it) and open a terminal in its folder.
2. **Start the launcher**: it checks your setup, prepares anything missing in a private folder (Node.js 22+,
   GitHub Copilot CLI, and on Windows PowerShell 7), then starts the lab companion. No admin rights, no global
   changes. Details and options: [SETUP.md](SETUP.md).
   ```text
   Windows:        start.cmd
   macOS / Linux:  sh ./start.sh
   ```
   Prefer to install yourself? Install [Node.js 22+](https://nodejs.org), git and
   [GitHub Copilot CLI](https://docs.github.com/copilot/how-tos/set-up/install-copilot-cli), then run
   `node labs/start.mjs`. You need a GitHub account with Copilot. The free plan for verified students works.
3. **Trust the folder and sign in, once**: run `copilot` in this folder, choose **Yes, and remember this folder**,
   type `/login` if asked, then `/exit`. Copilot only loads a project's MCP servers, hooks and agents from
   folders you trust, and trusting this one covers every lab inside it. The launcher never does this for you.
4. **Work through the labs**: use the arrow keys to pick a lab and a level, read the mission, press **c** to start
   Copilot right in that level's folder, and press **t** to run the checks.

## ⌨️ The lab companion
A green-on-dark terminal app that guides you through every level. On a level you can press:

| Key | What it does |
|---|---|
| **t** | run the free checks: ✅ or ❌, each with a reason; select one and press **⏎** for the requirement, the files involved, expected and actual values when the check provides them, and its full output |
| **c** | start Copilot in the level's folder; type `/exit` to come back, and your checks run automatically |
| **h** | reveal the next hint (on long levels: a hint for the milestone you are on) |
| **a** | 🤖 agent check: the real Copilot on a copy of your folder (uses AI credits; shows the credit cap, or says when it cannot be known; **c** cancels) |
| **i** | 🧳 bring your own harness forward: the harness files you changed in earlier levels that pass (your files are backed up first) |
| **v** | 📝 view your changes since your latest commit, file by file (needs git) |
| **l** | 🧠 learn: the level's takeaway and a check-yourself question, once your checks pass (answer with **1**–**4**) |
| **u** | 🔬 under the hood: X-ray your harness: what it adds to every turn of the model's context, what you added, and its maturity level (L0–L5); **s** there switches to the reference |
| **m** | more: watch, guide, compare, bring, your changes, bookmark, start over, run history, doctor, export |
| **w** | watch: the checks run again every time you save a file |
| **g** / **r** | read the lab guide: concepts, under the hood, in the enterprise, examples, links |
| **s** | compare your work with the reference solution (a real diff; the reference is one possible answer) |
| **x** | start over: restore the original starter, a checkpoint or a backup, or discard changes since your latest commit |
| **f** / **H** | bookmark the level / agent run history |
| **o** / **y** | open the folder (VS Code or your file manager) / copy its `cd` command |
| **1 2 3 4 5** | switch tier: easy, medium, hard, hard+, hard++ |
| **n** | next up: on an easy level, the next lab's easy level (finished or not, so you keep up with the room); elsewhere your next unfinished level |
| **?** | every key, and the glossary |

Everywhere: **/** searches every exercise (and filters by level, status, time and bookmarks), **p** picks a learning
path, **d** opens the setup doctor, **e** exports a learning summary and **?** shows every key and the glossary. On the
home screen, **u** replays an agent run turn by turn (**←**/**→** step, **tab** switches between the run without and
with a harness).

**Under the hood.** The 🔬 X-ray (**u** on a level, or `node labs/start.mjs xray lab-04 easy`) shows your harness as
a tree, marks what you added (🆕), changed (✏️) or brought in (🧳), estimates what it adds to every turn of the
model's context (≈ characters ÷ 4; MCP servers get 5 seconds to list their tools, or show "not measured"), and scores
it against the rules the labs teach, with a maturity level from L0 (bare) to L5 (governed). After every check run on a
level, 🧱 *Your harness so far* re-runs the earlier labs' rules on your folder: it's advisory, so it never changes
whether the level passes. And every 🤖 agent check keeps a 🧭 timeline of the run: each tool call, whether a hook or
the permission system denied it, and the tokens Copilot reported.

On a level, ⏱ shows how long you have been on it against the suggested time (time away from the keyboard counts at
most 45 minutes at a stretch); past one and a half times the suggestion, the app offers a hint once. After your checks
pass, the level's 🧠 takeaway and a ❓ check-yourself question appear: the point is learning, not grading, so a wrong
answer shows the explanation too. The lab screen shows a 🗺️ map of the harness with that lab's layer marked, and the
home screen shows 💳 how many agent-check runs you started this month and the most their credit caps allowed (never an
estimate: `/usage` in Copilot has the real number). The words the workshop uses are in [labs/glossary.md](labs/glossary.md)
(or `node labs/start.mjs glossary`).

Statuses are honest: ✅ means the checks passed **on your current files**. 🕓 means you (or the checks) changed
something since, 🚧 means a tool is missing (not your fault), ⏩ means required checks were skipped, ⚠️ means a run
stopped early and ⛔ that you cancelled it. None of those count as done.

It remembers where you were, shows what you changed and which check to fix next, and celebrates when a level goes
green. Prefer a calmer screen? `--no-anim` keeps it still, `--no-intro` skips the welcome screen, `--ascii` uses
plain characters, and `--linear` works one line at a time without any screen control (for screen readers and
simple terminals). `NO_COLOR=1` turns colors off.

## 🗺️ How the labs work
```text
start.cmd / start.sh       ← 🚀 the launchers: prepare what is missing, then start the lab companion (SETUP.md)
setup.mjs, setup-tools.mjs ← what the launchers run, and the reviewed tool versions
labs/
├── start.mjs              ← 🧠 the lab companion: run this
├── lab-00 … lab-07/
│   ├── readme.md          ← the concept: why it matters, how it works, examples, links
│   ├── easy/              ← 🟢 Use it: we do it together
│   ├── medium/            ← 🟡 Shape it: homework, optional
│   ├── hard/              ← 🔴 Prove it: homework, optional
│   ├── hard-plus/         ← 🟣 Break it: homework, optional (when a lab has it)
│   └── hard-plus-plus/    ← 💎 Scale it: homework, optional (when a lab has it)
│       ├── todo.md        ← your mission: long levels are split into milestones, each with its checks and hints
│       ├── src/           ← where you work: start `copilot` in here
│       ├── tests/         ← the checks
│       └── sol/           ← a reference solution, for when you're really stuck
└── _harness/              ← the engine behind start.mjs (no need to touch it; its tests: node --test "labs/_harness/tests/*.test.mjs")
```
The labs **build on each other**. Every level's `src/` starts from the reference result of the level before it:
down the easy column for the live session (Lab 02 easy starts where Lab 01 easy ended), and along each lab's row for
the homework (Lab 05 hard starts where Lab 05 medium ended). Because every start is the *reference* result, you can
skip a level or start anywhere. Want your **own** harness to grow instead? Press **i** on a level (or run
`node labs/start.mjs bring lab-05 hard`): the harness files you changed in earlier levels that pass (`AGENTS.md`,
`.github/…`, `.mcp.json`, `mcp/…`, `apm.yml`, `scripts/…`) come with you; app code never does. Files a level gave
you that your work relies on (an organisation policy, a role policy) come along too, but only where the level you
bring them into doesn't have them. Your work stays in `src/`. Commit early (`git add -A && git commit -m "lab 01 easy"`).

### ♻️ Starting over (with or without git)
Press **x** in the app, or use the commands below. Your current files are always backed up first (to
`labs/.recovery/`), and `node_modules` and git data are left alone.
- **The original starter**: as the workshop published it, restored from git. If you downloaded the zip, the lab app
  keeps a copy of each level the first time it checks or opens it, and restores that (it tells you which one it used).
- **Your checkpoints**: save one before a risky change (`checkpoint lab-01 easy before-refactor`), go back to it later.
- **Backups**: one is made automatically before every restore, so a restore can be undone too.
- **Discard changes since your latest commit** (git only): a separate command, because your commit may not be the starter.

## 🧪 Two kinds of checks
| | 🆓 Checks (press **t**) | 🤖 Agent checks (press **a**) |
|---|---|---|
| What | read your files, run your code, unit tests, hook and MCP calls, `copilot … list` | run the real agent with `copilot -p "…"` on a copy of your folder, then check what it said and did |
| Cost | free, instant | uses AI credits (about 1–4 prompts each) |
| When | all the time | when the free checks are green and you want proof |

Agent checks run on a throwaway copy in `labs/.runs/`, with explicit `--allow-tool` / `--deny-tool` flags
and a credit cap, so they never touch your `src/`. Only one suite runs at a time, and cancelling stops it before the
next check starts. Every run keeps its own folder (what the agent wrote and said) so you can look back with **H** or
`history`; those folders stay on your computer and can contain generated or sensitive output, so they are never
uploaded or attached to exports. The 🧭 timeline shows every tool call of the run, including skills and plugins from
your **personal** Copilot setup (a `skill` step you installed yourself, for example): learners without them won't see
those steps.

Without the app:
```bash
node labs/start.mjs list                          # your progress (--path= --status= --level= --query= --max-minutes= --bookmarked)
node labs/start.mjs next --path=security          # the next unfinished exercise on a learning path
node labs/start.mjs test lab-01 easy              # free checks
node labs/start.mjs test lab-01 easy --watch      # free checks, again on every save
node labs/start.mjs test lab-01 easy --agent      # + agent checks
node labs/start.mjs hint lab-01 easy              # next hint
node labs/start.mjs diff lab-01 easy              # compare with the reference solution
node labs/start.mjs bring lab-05 hard --dry-run   # what bringing your own harness forward would do (drop --dry-run to do it)
node labs/start.mjs checkpoint lab-01 easy NAME   # save a checkpoint
node labs/start.mjs recovery lab-01 easy          # starter, checkpoints and backups
node labs/start.mjs restore lab-01 easy --starter --yes        # back to the original starter (or --checkpoint=NAME)
node labs/start.mjs reset lab-01 easy --yes       # discard changes since your latest commit (git)
node labs/start.mjs history lab-01 easy           # agent check runs kept for this level, and this month's 💳 line
node labs/start.mjs glossary hook                 # the words the workshop uses (all of them without a word)
node labs/start.mjs xray lab-04 easy [--sol]      # 🔬 X-ray a harness: what it adds to every turn, its maturity level
node labs/start.mjs replay [harnessed]            # 🎬 an agent run turn by turn, without (or with) a harness; no credits
node labs/start.mjs bookmark lab-01 easy          # bookmark a level
node labs/start.mjs export --format=json          # a learning summary in labs/.reports/ (stays local)
node labs/start.mjs doctor                        # what is installed, what is missing (read-only)
node labs/start.mjs open lab-01 easy              # the app, straight into one level
node labs/start.mjs --linear                      # the app one line at a time (screen readers)
node labs/start.mjs help                          # every command
```
Difficulty names: `easy`, `medium`, `hard` (or `e`, `m`, `h`), and `hard+` / `hard++` (`h+`, `h++`, `hard-plus`,
`hard-plus-plus`) for the deeper homework levels, which appear automatically when a lab has them. `1`–`5` work too.

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
Only the 🟢 easy levels are done live, together. Everything above easy is optional homework.

| Time | What |
|---|---|
| 0–10 | Welcome and why a harness matters, then clone the repo, trust the folder and start the app |
| 10–98 | Labs 00–07, 11 minutes each: the idea (2), under the hood (2; for Lab 00, the 🎬 replay of an agent run without and with a harness), the easy level together (6), and the takeaway with its check-yourself question (1) |
| 98–110 | Lab 08 kickoff (when it ships): bring a finished harness together and look at its maturity. Then walk through the homework map: tiers, times and paths |

Anyone who falls behind presses **n**: on an easy level it moves to the next lab's easy level, which starts from the
reference result, so they keep up with the room.

## 🏠 Homework
Every level above easy is optional and goes deeper. Doing all of them takes many hours, so the homework is a menu, not
a mandate: every level starts from its own reference starting point, so you can skip levels or start anywhere.

| Tier | Theme | Time | Where |
|---|---|---|---|
| 🟢 easy | **Use it.** Apply the layer once, with guidance. | 8–10 min | 👥 together, live |
| 🟡 medium | **Shape it.** Design the layer well for a real need. | 30–45 min | 🏠 homework |
| 🔴 hard | **Prove it.** Automate it, test it and measure it. | 1–1.5 h | 🏠 homework |
| 🟣 hard-plus (hard+) | **Break it.** Attacks, failure modes and edge cases. | 1.5–2 h | 🏠 homework |
| 💎 hard-plus-plus (hard++) | **Scale it.** Make it work at org scale, or build the mechanism yourself. | 2–3 h | 🏠 homework |

Labs 00–07 have all five tiers (Lab 08, the capstone, comes next); each level's own 🕐 says how long it takes.
Suggested paths (press **p** in the app, or use
`--path=`; **n** always goes to the path's next unfinished level, and `node labs/start.mjs path` shows each path's time):

| Path | Levels |
|---|---|
| **One level deeper** (`deeper`) | every 🟡 medium level, Lab 00 to Lab 07 |
| **Security** (`security`) | 🟡 🔴 🟣 Lab 05 (guardrails, then policy as code), 🟣 Lab 04 (untrusted tool output) and 🟣 Lab 07 (hostile input in CI); Lab 08's red team joins it when it ships |
| **Platform** (`platform`) | 🔴 🟣 Lab 02 (a skill with a script, then vetting other people's skills) and 🔴 🟣 Lab 06 (ship it as a plugin, then the supply chain) |
| **Internals** (`internals`) | 🔴 🟣 💎 Lab 00 (the agent in a script, the flight recorder, your own agent loop) and 💎 Lab 04 (MCP from the protocol up) |

**Done early?** Harness your own project with what you built.

## 💳 AI credits
Every prompt costs AI credits, and student plans have a monthly budget. The free checks never spend any.
In Copilot, use `!command` for things that don't need AI, keep prompts focused, check `/usage`, and cap
scripted runs with `--max-ai-credits` (minimum 30). Before an agent check runs, the app shows the cap passed to
Copilot, or says plainly that the bound is unknown when a check runs a script that may call Copilot several times.
It never guesses what you actually spent: `/usage` and your GitHub billing page know that. The home screen's 💳 line
counts the agent-check runs you started this month and adds up their caps, as an upper bound.

## 🧑‍🏫 For facilitators
```bash
node labs/start.mjs verify          # every src/ must fail its checks, every sol/ must pass them, starters.json must be current
node labs/start.mjs verify --chain --bring   # …and the seeded chain is in sync, and bringing work forward breaks nothing
node labs/start.mjs sync-seeds --dry-run     # after changing a level: what the chain would update in every later level
node labs/start.mjs test lab-03 easy --sol --agent   # try a reference solution with the real agent
node labs/start.mjs open lab-03 easy --no-intro      # jump straight to a level during the live demo
node labs/start.mjs replay                           # Lab 00's under-the-hood demo: ←/→ step, tab compares with a harness
node labs/start.mjs xray lab-05 easy --sol           # show a finished harness: its tree, context budget and maturity
node labs/start.mjs --path=deeper --no-intro         # start everyone on a learning path
node labs/start.mjs starters        # is labs/_harness/starters.json (the published starters) up to date?
start.cmd --full --setup-only       # prepare a classroom machine (see SETUP.md for shared offline caches)
```
Each lab's `readme.md` is the script for its 11-minute slot: *In one minute* is the idea, *🔬 Under the hood* shows
what the layer does to the model's context or loop, then the 🟢 easy level together, and its takeaway and question
to close. *🏛️ In the enterprise* is there for the questions. After changing a
level's `src/` or `sol/`, run `node labs/start.mjs sync-seeds`: it carries the change down the chain (every later
level that starts from it), refuses to overwrite anything it can't merge safely, backs up what it replaces, and
updates `labs/_harness/starters.json`. Commit everything together, so "restore the starter" keeps giving students
the published version. The chain's rules (which files travel with `bring`, and per-level exceptions) are in
`labs/_harness/course.json`.

Everything the companion stores stays in the workshop folder and is ignored by git: `labs/.progress.json`
(progress, bound to fingerprints of the work and the checks), `labs/.recovery/` (starters, checkpoints, backups),
`labs/.runs/` (agent runs), `labs/.reports/` (exports) and `.workshop/` (private tools). Nothing is sent anywhere.

## 🛟 Troubleshooting
| Problem | Fix |
|---|---|
| "Copilot only loads … from folders you trust" | Run `copilot` once in the workshop root and choose *Yes, and remember this folder*. |
| Copilot doesn't see my AGENTS.md / skill / agent | Start `copilot` **inside** the level's `src/` folder, and start a new session after editing. |
| An agent check says "Are you logged in?" | Run `copilot`, type `/login`, then try again. |
| `node labs/start.mjs` shows plain text | Use a real terminal (Windows Terminal, macOS Terminal, iTerm, a Linux terminal), or add `--linear`. |
| Something is missing or too old | Press **d** (or run `node labs/start.mjs doctor`); `start.cmd` / `sh ./start.sh` prepare tools privately. See [SETUP.md](SETUP.md). |
| A check says 🚧 blocked | A tool it needs is missing: it is your setup, not your solution. Lab 06 needs `apm` (`--install=apm`); Lab 07's `gh aw` checks are optional. |
| A level I passed shows 🕓 | Its files (or its checks) changed since the last run. Press **t** to check it again. |
| I broke a level and want to start over | Press **x**: restore the starter (works without git), a checkpoint or a backup. |
| "Your progress file could not be read" | It was kept as `labs/.progress.corrupt-….json` and the app started fresh; nothing was deleted. |
| Copying the `cd` command (**y**) does nothing | Your terminal may block clipboard access; the command is also shown at the bottom of the screen. |

## ✨ About
Created by **Alexandru-Razvan Olariu** · Software Architect at Microsoft · 2026.
Questions, ideas or feedback? Reach out: **aolariu@microsoft.com**
