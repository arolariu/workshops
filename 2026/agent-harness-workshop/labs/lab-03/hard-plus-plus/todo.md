# 💎 Hard++ · An agent team

> 🕐 2–3 h · 🏠 homework · 🆓 free checks · 🧱 builds on: Lab 03 · hard+

## 🎯 Mission
The review loop had two agents and a script. A real team has more roles, and one old rule: **the one who does the
work isn't the one who approves it**. Build StudyBuddy's agent team: a planner writes `plan.json`, a **person**
approves it, an implementer changes exactly the planned files, a tester reports on the change, and the reviewer gives
a verdict. The script, not an agent, hands each artifact to the next stage, checks it against its contract, keeps
every stage within its credit cap, and resumes a stopped run without paying twice for work that's already done.

## 📋 Requirements
1. Every artifact has a contract: `plan.json`, `test-report.json` and `verdict.json` have JSON schemas, and
   `contractProblems()` adds the rules a schema can't express.
2. `scripts/team/pipeline.json` describes the team: five stages, one agent each (the gate is a person), with
   permissions and a credit cap per stage; the new agents only get what their job needs, never delegate, and only run
   from the script.
3. `advance()` runs the stages in order and writes each artifact into the run folder; it stops at the gate until a
   person approves, before a stage the budget can't pay for, and when an artifact breaks its contract or the
   implementer leaves the plan.
4. `approve()` records who approved which plan (its sha256); a changed plan needs a new approval.
5. A run resumes where it stopped: a stage runs again only if it never finished, its output is gone, or its inputs
   changed.

**The run folder** (`.agent-logs/team/<run>/`):
```text
state.json        { goal, budget, spent, stages: { <id>: { status,
                    output, sha256, inputs: { <file>: sha256 },
                    credits } } }
plan.json         the planner's JSON             (contract: plan)
approval.json     { by, at, plan: sha256 of plan.json }
baseline.json     the plan's files before the first implement
changes.patch     unifiedDiff() of each plan file, baseline → now
test-report.json  the tester's JSON              (contract: test-report)
verdict.json      the reviewer's JSON            (contract: verdict)
```

## 🧭 Milestones
### M1 · Stage contracts
- `scripts/team/contracts/{plan,test-report,verdict}.schema.json` accept the recorded run's artifacts and reject
  every broken artifact in `tests/fixtures/broken-artifacts.json` that a schema can catch: a plan without steps or
  files, a step without a file, a field nobody reads, `"failed": "0"`, an unknown decision or severity, …
- `checkSchema()` (given, in `team.mjs`) reads a JSON Schema subset: `type`, `enum`, `required`, `properties`,
  `additionalProperties: false`, `items`, `minItems`, `minimum`, `minLength`, `pattern`
- `contractProblems(kind, value)` adds what a schema can't say: every step's `file` is in `files`; step ids are
  unique; `failed` is the number of `failing` tests; an `approve` verdict has no `high` finding

### M2 · A team with separate duties
- `pipeline.json`: stages `plan → approve → implement → test → review`; `approve` is `"human": true`, with no agent;
  every other stage has its own agent, a `credits` cap (30+), `reads`, `writes` (`plan.json`, `changes.patch`,
  `test-report.json`, `verdict.json`), a `contract` where it has one, `allow` and `deny`, and a `prompt` (`{goal}` and
  `{run}` get filled in); `budget` pays for one pass
- `planner`, `implementer` and `tester` (the reviewer is yours, from the easy level): planner and reviewer only read
  and search; the implementer can edit and run, the tester can run; nobody has `agent`; the three new agents have
  `disable-model-invocation: true`. `roles.json` gives them roles, and the hard+ audit finds nothing
- `stageArgs(stage, runDir, goal)`: `--agent`, a prompt that names the stage's inputs in the run folder, `-s`,
  `--no-ask-user` and the stage's cap; plan and review get no write or shell permission; implement and test get
  `write` and `shell(npm:*)` but never `node`, and `git push` is denied

### M3 · Run the stages
- `advance(runDir, { pipeline, run, cwd })` calls Copilot only through `run(args)`, with `stageArgs()`: first the
  planner, then `{ status: "awaiting-approval" }`; once a person approved, the implementer, the tester and the
  reviewer, then `{ status: "done" }`. An artifact is the JSON of the agent's answer (`extractJson()`); implement's
  is the patch
- With the recorded answers, the artifacts equal the recording, and `state.json` records each stage's `status`,
  `output`, `sha256`, `inputs` and `credits`, and the `spent` total
- A stage whose cap would push `spent` past `budget` doesn't start (`stopped`, reason `budget: …`). An artifact that
  breaks its contract stops the run (`contract: …`) and isn't saved; so does an implementer that changes a file the
  plan doesn't list (the reason names it)

### M4 · The approval gate
- Without `approval.json`, `advance()` waits and calls nobody
- `approve(runDir, { by, pipeline, now })` writes and returns `{ by, at, plan }` (`plan` is the sha256 of
  `plan.json`); it refuses no name, the name of an agent of the team (in any case), and a plan that breaks its
  contract
- A `plan.json` that changed after the approval sends the run back to `awaiting-approval`, with a reason about the
  plan

### M5 · Runs that resume
- A stage is skipped when it's `done`, its output exists, and every input still has the hash it saw: a deleted
  `verdict.json` re-runs only the reviewer; an approved change to `plan.json` re-runs implement, test and review; an
  implement that gives the same patch doesn't ask the tester again
- A stage left `running` (a crash) or `failed` runs again, and `spent` keeps counting across resumes

## 📂 Work here
```bash
cd labs/lab-03/hard-plus-plus/src
code scripts/team.mjs scripts/team/pipeline.json scripts/team/contracts
node scripts/team.mjs --dry-run            # every stage's command
node labs/start.mjs test lab-03 hard++     # from the workshop folder
```
`team.mjs` is one file, so it travels to later labs in one piece. Its plumbing is given (at the bottom: hashes,
`extractJson`, `checkSchema`, `snapshot`, `unifiedDiff`, and the command line: `start "<goal>"`, `approve <run> --by
<you>`, `resume <run>`, `status <run>`); you write the parts marked TODO. A real run costs up to the pipeline's
budget in credits. The free checks replay a recorded run instead (`tests/fixtures/run/`), in which the team fixes the
three bugs your test-writer proved in medium.

## 💡 Hints
### M1
<details><summary>A schema is a contract you can run</summary>

Start from the recorded `plan.json` and write down what every plan must have: `"required": ["goal", "files",
"steps"]`, `"minItems": 1`, step ids that match `"^S\\d+$"`, and `"additionalProperties": false`, so a model can't
slip in a field nobody reads.

</details>

<details><summary>Rules across fields</summary>

A schema checks each value on its own. "Every step's file is in `files`" compares two fields: that's code, in
`contractProblems()`, after the schema passed.

</details>

### M2
<details><summary>Who may do what</summary>

The planner and the reviewer judge, so they never touch the code: `read`, `search`. The implementer and the tester
work: `edit`, `execute`. Nobody gets `agent`: the script hands the work on, so no agent can reach a more powerful
one. Add the three roles to `roles.json`, and run `node scripts/audit-agents.mjs`.

</details>

<details><summary>Why no node for the agents</summary>

`node scripts/team.mjs approve run-1 --by Ana` is one shell command away. `shell(npm:*)` lets them run the tests;
without `shell(node:*)` (and with it denied), no agent can approve its own plan.

</details>

### M3
<details><summary>The loop over the stages</summary>

```js
for (const stage of pipeline.stages) {
  if (stage.human) { /* approved? if not, return */ }
  if (/* done, output there, inputs unchanged */) continue;
  if (state.spent + stage.credits > state.budget) { /* stop */ }
  // running + spent, save → run → artifact → contract → done, save
}
```
Save `state.json` before each call: a run that crashes mid-stage leaves `running` behind, and resume looks for it.

</details>

<details><summary>The patch belongs to the script</summary>

Before the first implement, keep the plan's files as they are (`baseline.json`), and take a `snapshot(cwd)` before
every implement call. After the call, a file whose hash changed but isn't in the plan's `files` breaks the contract.
The patch is `unifiedDiff(file, baseline, now)` for each file of the plan, in order, joined.

</details>

### M4
<details><summary>Binding the approval</summary>

`approval.json` stores `sha256File(plan.json)`. At the gate, compare it with the hash now: change one character and
the approval is about a different plan.

</details>

### M5
<details><summary>Inputs decide</summary>

When a stage finishes, record `inputs: { <file>: sha256File(…) }` for each file it `reads`. On resume: done, output
there, and every input still has that hash → skip. A deleted output, a crash or a changed input → run it again, and
the stages after it then see their own inputs change.

</details>

## 🧠 Takeaway
A team of agents is a pipeline of contracts: separate duties, checked handoffs, a person at the gate, and a budget per stage.

## ❓ Check yourself
The test stage has `--allow-tool=write` and `--allow-tool=shell(node:*)`. What can go wrong that the contracts and
the reviewer won't catch?
1. Nothing: the reviewer reads every patch, so any problem shows up in the verdict.
2. The tester's report turns into invalid JSON, because node's output gets mixed into it.
3. The budget breaks, because node commands don't count towards `--max-ai-credits`.
4. The tester can run `node scripts/team.mjs approve <run> --by Ana` and approve a plan itself.

<details><summary>Answer</summary>

**4.** Separation of duties only holds when the permissions match the roles: one shell command turns the tester into
the approver. Give `npm`, deny `node`, and keep the gate out of the agents' reach.

</details>

## 🚀 Going further
- Run it for real: `node scripts/team.mjs start "Fix the three bugs in BUGS.md"`, read `plan.json`, approve it, and
  `resume`. Compare what it cost with the review loop.
- Let a `request-changes` verdict send the run back to implement with the findings, at most twice.
- Don't take the tester's word for it: run `node --test` yourself after the test stage and compare with its report.
- Move the gate into CI: a GitHub environment with required reviewers (Lab 07).
