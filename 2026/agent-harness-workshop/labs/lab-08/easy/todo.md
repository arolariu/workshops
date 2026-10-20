# 🟢 Easy · Assemble and own it

> 🕐 about 1 h · 🏠 homework · 🆓 free checks · 🧱 builds on: Lab 07 · easy

## 🎯 Mission
The university wants every course team to use StudyBuddy's harness, and you are its owner now. Before anyone else
installs it, it has to be one system, and right now it's a pile: the grading team's rules were merged into yours,
someone added a second reviewer "just in case", the always-on context grew past its 2,500-token budget, and the guard only
runs for bash. Bring your own work in, resolve the conflicts, write down who owns what, audit the harness up to
**L4 Guarded**, and put it on a diet. (Your brought `AGENTS.md` and hook config replace the starter's, so some of this
mess may be gone already: the checks judge whatever is in the folder.)

## 📋 Requirements
1. No two custom agents do the same job.
2. Every rule lives in one instruction file, once.
3. No two rules contradict each other about the test runner, the module style or what to do with a failing test, and
   the rule that stays matches the project (`package.json`).
4. `HARNESS.md` has six filled-in sections: Owner, Layers, Trust boundaries, Budget, Changing the harness and
   Rollback, and the X-ray's governance rule (`harness-owner`) passes.
5. The X-ray shows at least **L4 Guarded**, and every scorecard rule of the instructions, skills, MCP, agents and
   hooks layers is green; the guard runs for both shells.
6. The always-on context is at most 2,500 ≈tokens per turn, and the rarely needed rules (the ECTS conversion and the
   release checklist) live in skills.

## 🧭 Milestones
### M1 · Bring
- If you passed earlier levels, press `i` on this level first: your harness comes in on top of the starter, and the
  plan shows every file and where it comes from. The starter's new files stay; your own `AGENTS.md` and
  `.github/hooks/guardrails.json` replace the starter's, so the "Testing" section and the bash-only hook may be gone
- One agent per job: `reviewer` and `code-reviewer` overlap, so one of them goes, after you keep what is useful
- No rule twice across `AGENTS.md`, `.github/copilot-instructions.md` and `.github/instructions/*.instructions.md`
- No contradictions: one test runner (`node --test`), one module style (ES modules), one rule for a failing test
  (fix the code, never skip it)

### M2 · Own
- `HARNESS.md` names the owner (a person and a team), lists every layer with its files, draws the trust boundaries
  with the threat model, gives the budget in numbers, and says how the harness changes and how it rolls back
- The X-ray's governance rule `harness-owner` is green (its other two rules, a CI gate and evals, stay red until hard
  and hard+ add them)

### M3 · Audit
- The X-ray (`u` on this level) shows **L4 Guarded** or better, with the MCP tools measured
- Every rule of the instructions, skills, MCP, agents and hooks layers is green
- `preToolUse` runs the guard for bash **and** powershell, and both deny a recursive delete (already true if your
  brought hook config covers both shells)

### M4 · Diet
- The X-ray's "every turn" total is at most 2,500 ≈tokens, MCP tool schemas included
- The ECTS conversion and the release checklist are out of the always-on files and in skills whose descriptions say
  when to use them

## 📂 Work here
```bash
cd labs/lab-08/easy/src
code AGENTS.md HARNESS.md .github
node labs/start.mjs test lab-08 easy      # from the workshop folder
```
The starter is Lab 07 · easy's solution plus what a careless merge brought in: a second reviewer, the grading
team's test rules (`.github/instructions/testing.instructions.md`), a long `.github/copilot-instructions.md`, a
"Testing" section in `AGENTS.md`, a hook config for bash only, and a `HARNESS.md` skeleton. If you pressed `i`, your
own `AGENTS.md` and `.github/hooks/guardrails.json` replaced the starter's two, so those two messes may not be there
(the others stay). The checks read whatever harness is in the folder, so they work on your own brought work too.

## 💡 Hints
### M1
<details><summary>Which reviewer stays?</summary>

Compare the two files. `reviewer` has a `tools` list (read-only) and the report format that Lab 03's scripts read
(the table and the `VERDICT` line); `code-reviewer` has neither. Keep `reviewer`, copy anything you like from the
other one into it, and delete `.github/agents/code-reviewer.agent.md`. Two agents with one job make the model's
choice a coin toss.

</details>

<details><summary>Finding the repeats</summary>

The check prints `file:line` for every repeat. To look yourself, search for a few words of a rule (or use
`Select-String` in PowerShell):

```bash
grep -rn "Never add dependencies" AGENTS.md .github
```

Keep project-wide rules in `AGENTS.md`, rules about tests in the scoped file, and delete the copies.

</details>

<details><summary>Which side of a contradiction wins?</summary>

The project decides: `package.json` runs `node --test` and says `"type": "module"`, and the boundaries in
`AGENTS.md` say a failing test is fixed in the code. Delete the Jest, `require` and `test.skip` lines (the
`test.skip` one is in the starter's `AGENTS.md`, so it's gone if you brought your own). The scoped file also has two
good rules (sentence names, fixed dates): keep those.

</details>

### M2
<details><summary>The threat model in three lines</summary>

Trust boundaries: what is untrusted (the portal's MCP data, the text of an issue in the triage workflow, any file the
agent reads), what each part may do (the reviewer is read-only, the triage bot writes only through safe outputs), and
what stops an attack (the guard, on both shells). Call it the threat model, so the scorecard finds it. Medium turns
it into a full table.

</details>

<details><summary>Numbers, not adjectives</summary>

Budget: "at most 2,500 ≈tokens always on (the X-ray says ≈700 today)", "issue triage: max-ai-credits 50 and a
10-minute timeout". Changing the harness: a pull request, reviewed by the owner, with the checks and the X-ray green.
Rollback: `git revert` the change, or go back to the last tag.

</details>

### M3
<details><summary>Let the X-ray tell you</summary>

Press `u` on this level: the scorecard lists every red rule with its file, and the last line says what the next
maturity level needs. Fix M1 first; the second reviewer is one of the red rules.

</details>

<details><summary>Both shells</summary>

Copilot runs shell commands with `powershell` on Windows and `bash` elsewhere. One `preToolUse` entry can serve both:
give it a `bash` and a `powershell` key with the same command, and keep the `timeoutSec`. (A hook config you brought
from Lab 05 probably has both already.)

</details>

### M4
<details><summary>What the X-ray counts on every turn</summary>

`AGENTS.md` and `.github/copilot-instructions.md` in full, every skill's name and description (the body only when
the model picks the skill), every agent's description, and the MCP tool schemas. Scoped instructions count only
when their `applyTo` matches; hooks cost nothing. Repeats, history and once-a-term checklists are the fat.

</details>

<details><summary>A skill for the rare rules</summary>

Make `.github/skills/ects-grades/SKILL.md` with a frontmatter `name: ects-grades` (the folder's name) and a
description that says what it does and when to use it ("Use when …"). Move the ECTS section into it as it is. Do the
same for the release checklist. The project history can go (git remembers it); the commit-message rule is needed
every day, so it moves into `AGENTS.md`.

</details>

## 🧠 Takeaway
A harness is one system, with an owner and a budget.

## ❓ Check yourself
After the diet, a teammate wants to put the ECTS table back into `AGENTS.md`, "so the agent never forgets it". What
do you answer?
1. Fine: the more the agent sees on every turn, the better every answer gets.
2. Put it in `.github/copilot-instructions.md` instead, so that `AGENTS.md` stays under 100 lines.
3. Keep it in the skill: its description brings the table in when it's needed.

<details><summary>Answer</summary>

**3.** Everything always on is paid for on every turn and competes for the model's attention, even when it has
nothing to do with the task. Option 2 only moves the cost to another always-on file. A skill costs a line of
description per turn, and the full text only when it's needed.

</details>

## 🚀 Going further
- Open the X-ray (`u`) on the starter and on your solution, and put the two "every turn" totals in `HARNESS.md`'s
  Budget section.
- Ask Copilot here "What is 8.75 in ECTS?" (one premium request) and look for the skill in its tool calls: does the
  description bring it in?
- Bring a harness from another project of yours into a fresh copy of the starter: which of the M1 conflicts does it
  have?
- The closing demo of the workshop does this live: a finished harness, brought into a fresh StudyBuddy, and its
  maturity in the X-ray.
