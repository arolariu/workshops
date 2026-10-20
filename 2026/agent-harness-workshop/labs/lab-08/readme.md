# Lab 08 · 🏛️ Capstone: ship an enterprise-ready harness

> **Harness layer:** every layer · **Maturity:** L4 → L5 Governed · 🟢 🟡 🔴 🟣 💎 homework
>
> **Threads:** 🔴 The red build · 📏 Measurement · 🪙 Tokens and budget · 🔐 Least privilege · 🕵️ The reviewer · 💉 Prompt injection

## In one minute
The capstone adds no new layer. The university wants every course team to use StudyBuddy's harness, and **you are
its owner**: take what you built in Labs 00–07, make it one coherent system, attack it, measure it, put it under
change control, and finally roll it out to a second team's codebase. The **maturity model** (L0–L5) gives
"enterprise-ready" a concrete meaning, and the X-ray measures it on any folder, yours included.

## Why it matters
A harness grows one file at a time: a rule here, an agent there, a hook someone copied from another project. Without
an owner it rots in predictable ways: the same rule in three files, two rules that contradict each other, two agents
with one job, and always-on instructions that cost tokens on every turn and dilute the model's attention. An
enterprise also asks for **evidence**: who owns it, what it stops, how well it works, and how a change is reviewed and
rolled back. Each tier of this lab produces one piece of that evidence.

## 🔬 Under the hood
```text
 your harness ─ scanHarness ─▶ instructions · skills · agents · MCP
                │              hooks · APM · workflows · HARNESS.md
                ├─ scorecard ─▶ rules { id, layer, level, ok, message }
                │   └─ maturity: the highest level whose rules pass,
                │      together with every level below it
                └─ contextBudget ─▶ every turn: AGENTS.md, descriptions,
                                    MCP tool schemas (≈ characters ÷ 4)
```
The X-ray (`u` on any level) is three pure functions over your folder. `scanHarness` finds the files of every layer,
`scorecard` turns them into rules (`AGENTS.md` under 100 lines, an explicit `tools` list, `preToolUse` on both
shells, pinned dependencies, an owner in `HARNESS.md`…), and `maturity` climbs the ladder only while every rule of a
level and of every level below it holds. `contextBudget` adds up what goes into every turn. The capstone's checks
call the same functions, plus attack replays, contract tests and math on recorded runs, so they judge **your**
harness, not a copy of the reference.

## The maturity ladder
| Level | Name | Evidence | Taught in |
|---|---|---|---|
| L0 | Bare | the runtime only | Lab 00 |
| L1 | Instructed | a short `AGENTS.md`: commands, domain rules, boundaries, a definition of done | Lab 01 |
| L2 | Equipped | skills and MCP tools that say what they do and when to use them | Labs 02 and 04 |
| L3 | Scoped | custom agents with an explicit `tools` list, least-privilege runs | Lab 03 |
| L4 | Guarded | hooks that fail closed, an audit trail, a passing attack pack | Lab 05, Lab 08 medium |
| L5 | Governed | pinned and shared, a CI gate on harness changes, evals, an owner in `HARNESS.md` | Labs 06–07, Lab 08 hard and hard+ |

Easy, medium and hard end at **L4 Guarded**; hard+ and hard++ reach **L5 Governed**.

## The commands
```bash
node labs/start.mjs                        # the TUI: u = X-ray, i = bring
node labs/start.mjs bring lab-08 easy --dry-run   # what would come in
node labs/start.mjs xray lab-08 easy       # layers, budget, scorecard
node labs/start.mjs test lab-08 easy       # the level's checks
```
`bring` copies the harness files you changed in every level you passed (newest wins) into this level's `src/`, after
a backup. The starter's own new files stay, so the conflicts you have to resolve are real.

## 🏛️ In the enterprise
- **At scale:** one harness, owned by a platform team, installed in dozens of repositories through APM or a plugin,
  with an organisation policy on top and each repository's own layer underneath.
- **The risk:** a harness that nobody owns: rules that contradict each other, agents with more tools than their job
  needs, a guard that misses one shell, a context bill nobody measures, and changes that go live without review.
- **The control:** an owner and a budget in `HARNESS.md`, the scorecard and an attack pack in CI on every harness
  change, evals with a baseline, versioned releases with a rollback, and one governance report across repositories.

## Exercises
| Level | Time | Mission | You practise |
|---|---|---|---|
| 🟢 easy | about 1 h | **Assemble and own it**: bring your work in, resolve twin agents, repeated and contradicting rules, write `HARNESS.md`, audit to L4, and keep the always-on context under ≈2,500 tokens | ownership, the scorecard, context budgets |
| 🟡 medium | 1.5–2 h | **Red-team it**: about 30 attacks in six families plus injection chains and about 12 allowed calls against your guard, five attacks of your own, and a threat model | attack packs, false positives |
| 🔴 hard | 2–2.5 h | **Measure it**: eight golden cases, an eval runner with pass rate, pass@k and variance, a baseline that fails on regressions, and a layer ablation | evals, statistics, budgets |
| 🟣 hard+ | about 3 h | **Change control**: a CI gate on harness paths, CODEOWNERS, versioned releases with a changelog, an AI review of harness pull requests, and a rollback runbook | change management, L5 |
| 💎 hard++ | 3–4 h | **Roll it out**: install your packaged harness into CampusHub, merge an org and a repo policy, add the repo layer, test portability, and write the governance report and review | rollout, governance at scale |

Every tier is homework, and each one starts from the tier before it.

## 🎤 The live closing demo
The workshop ends with about 10 minutes of the capstone, live. The facilitator brings a finished harness into a fresh
StudyBuddy and shows its maturity in the X-ray.

1. **Before the session:** on the demo machine, pass the levels whose work you want to bring (your own homework
   harness is best), and keep your Lab 08 · easy solution at hand. Restore the level's starter (`x`) so the copy
   is fresh.
2. **The starting point (2 min):** open Lab 08 · easy and press `u`. The merged starter is at **L2 Equipped**, puts
   ≈2,850 tokens into every turn, and the scorecard shows the red rules: an agent with every tool, a guard for bash
   only.
3. **Bring (2 min):** press `i`. Walk through the plan: every file, the level it comes from, and the starter files
   that stay. Apply it.
4. **Resolve and own (3 min):** remove the twin reviewer, the repeats and the contradictions, move the ECTS table
   into a skill, and drop in `HARNESS.md` (prepared). Run the checks with `t`.
5. **The verdict (3 min):** press `u` again: **L4 Guarded**, the every-turn total under budget, and the two
   governance rules still red (a CI gate and evals). Say which tier turns each one green, and what **L5 Governed**
   takes. Optionally, ask Copilot to `rm -rf` a folder (one premium request) and show the guard's denial.

## Common pitfalls
- **Merging by appending:** a second copy of a rule is not a backup, it's a future contradiction. Keep each rule in
  one place.
- **Always-on by default:** procedures used once a term belong in a skill, loaded only when they're needed.
- **A `HARNESS.md` nobody reads:** give numbers (tokens, credits, versions) and commands, and update them with every
  harness change.

## Learn more
- Spec §5.5 (the maturity model and the scorecard) and §5.6 (this lab) in `docs/superpowers/specs/`
- `labs/_harness/scorecard.mjs` and `labs/_harness/xray.mjs`: the rules, the maturity ladder and the context budget
- [Add custom instructions](https://docs.github.com/copilot/how-tos/copilot-cli/add-custom-instructions) and
  [create skills](https://docs.github.com/copilot/how-tos/copilot-cli/customize-copilot/create-skills) for the
  Copilot CLI: what loads on every turn, and what only when it's needed
- [About code owners](https://docs.github.com/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners):
  the ownership layer of hard+
