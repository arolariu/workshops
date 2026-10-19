# 💎 Hard++ · A library that routes

> 🕐 2–3 h · 🏠 homework · 🆓 free checks · 🤖 optional agent check (about 2 prompts) · 🧱 builds on: Lab 02 · hard+

## 🎯 Mission
Your library has grown to six skills, and two new ones overlap the old: `write-tests` claims "a new module with
tests" (that's `new-module`'s job), and `write-docs` claims everything from READMEs to release notes to explaining
crashes. Only the descriptions sit in the context every turn, so a description is a routing prompt, and six of them
compete for every request. Measure it: give every skill a canary, build a routing eval with a free lexical pre-check
and an opt-in real run, report precision and recall, fix the descriptions, and split `write-docs` so it loads light.

## 📋 Requirements
1. The six skills in `.github/skills/` each end their answers with their own canary, `[skill:<name>]`, and no other.
2. `evals/routing/route.mjs` routes a request to one skill (or none) with the lexical pre-check below.
3. `evals/routing/metrics.mjs` reads canaries, computes precision and recall per skill, and writes the report.
4. `node evals/routing/run.mjs` runs the 24 requests through the pre-check; `--real --max-credits N` runs them through
   Copilot, read-only and capped, and refuses without a cap.
5. The descriptions route well: macro precision and recall of 0.85 or more, every skill at least 2 of 3, at least 5
   of the 6 no-skill requests left alone, and all six descriptions in 1,500 characters together.
6. `write-docs` is split: a short `SKILL.md` that says when to read each `references/*.md`, and nothing that belongs
   to another skill.

**The pre-check** (`route.mjs`; `tokens()`, `library()` and the constants are given):
```text
words(text)   lower-case words of 3+ letters/digits, minus STOPWORDS,
              one trailing "s" removed ("tests" -> "test")
skill words   words(name with spaces + description)
df(w)         how many skills have the word w
score(req, s) sum over the distinct words of req that s has:
              log(1 + skills / df(w))     (rare words weigh more)
route(req)    the best score, if >= MIN_SCORE (2) and not tied;
              else null (no skill)
```

**The metrics and the report** (`metrics.mjs`): for each skill, `precision = right / routed` and `recall = right /
expected` (0 when the denominator is 0); `macro` is the mean over the skills; `none` counts the requests that need no
skill and how many loaded none; a miss is a request whose `got` isn't exactly `[expect]` (or `[]`).
```markdown
# Routing eval · lexical pre-check          (or · real run)

| Skill | Expected | Routed | Right | Precision | Recall |
|---|---:|---:|---:|---:|---:|
| csv-export | 3 | 3 | 3 | 1.00 | 1.00 |
| **macro** | | | | **1.00** | **0.94** |

Requests that need no skill: 6 of 6 loaded none.

## Misses
- e1 · expected explain-error, got no skill · What does …
```

## 🧭 Milestones
### M1 · Six skills, six canaries
- `new-module`, `explain-error`, `release-notes`, `csv-export`, `write-tests` and `write-docs`, each named after its
  folder, with a what + when description
- Each `SKILL.md` has a line like "When you use this skill, end your answer with the line `[skill:<name>]`", and
  mentions no other skill's tag; `copilot skill list` shows all six

### M2 · The lexical pre-check
- `score()` gives the same numbers as the formula above on a three-skill toy library
- `route()` picks the best skill, and returns `null` below `MIN_SCORE` and on a tie for first place

### M3 · Precision and recall
- `canaries(answer)` returns the `[skill:name]` tags, unique, in order (not `[skill: x]`, `[Skill:x]` or `[skill:]`)
- `metrics()` matches the worked example in `tests/fixtures/routing-metrics.json`
- `report()` has a row per skill with its precision and recall, the macro row, the no-skill line and every miss

### M4 · The eval runner
- `node evals/routing/run.mjs` writes `evals/routing/results.json` and `report.md` for your six skills
- `realArgs()` has `-p <request>`, `--no-ask-user`, `--max-ai-credits=<n>`, `--deny-tool=write` and
  `--deny-tool=shell`, and never `--allow-all`, `--yolo` or `--dynamic-retrieval`
- `--real` without `--max-credits` returns 2 and asks nothing; with it, every request is asked once, the canaries are
  read, and `report-real.md` is written (the lexical report stays as it was)

### M5 · The right skill loads
- With the checks' own pre-check on your descriptions: macro precision and recall ≥ 0.85, every skill ≥ 0.67 on both,
  ≥ 5 of the 6 no-skill requests left alone
- The six descriptions together are at most 1,500 characters (they're in every turn's context)

### M6 · Split the broad skill
- `write-docs/SKILL.md` is under 2,000 characters (about 500 tokens) and links 3 or more `references/*.md` files that
  exist, each on a line that says when to read it
- The README, JSDoc and decision-record guidance each live in a reference (nothing lost)
- No changelog, release-notes, error or export sections in `write-docs` any more, and its description doesn't claim
  them

## 📂 Work here
```bash
cd labs/lab-02/hard-plus-plus/src
node evals/routing/run.mjs          # free: the lexical pre-check
cat evals/routing/report.md
node labs/start.mjs test lab-02 hard++    # from the workshop folder
```
`evals/routing/requests.json` holds the 24 requests (3 per skill, and 6 that need no skill); the checks grade your
descriptions with their own copy of it. When the pre-check looks good, try the real thing **once** (it spends about 24
to 48 AI credits): `node evals/routing/run.mjs --real --max-credits 2`, from this folder, so the skills load.

## 💡 Hints
### M1
<details><summary>A canary per skill</summary>

Add one line at the end of each `SKILL.md`: "When you use this skill, end your answer with the line
`` `[skill:release-notes]` ``." It only reaches the model when the skill's body loads, so the tag in an answer means
that skill was used. Keep the tag out of the description: that part is in every turn.

</details>

### M2
<details><summary>Why log(1 + skills / df)</summary>

A word that six skills share ("code", "file") says nothing about which one to pick: `log(1 + 6/6) ≈ 0.69`. A word
only one skill has ("changelog") says a lot: `log(1 + 6/1) ≈ 1.95`. With `MIN_SCORE = 2`, a request needs one rare
word and something more, or several shared ones, before any skill loads.

</details>

<details><summary>route() in three lines</summary>

Map `lib.skills` to `{ name, score }`, sort by score, highest first. Return `null` when the best is under
`MIN_SCORE`, or when the second has the same score (`Math.abs(a - b) < 1e-9`); otherwise the best name.

</details>

### M3
<details><summary>Counting per skill</summary>

For one skill: `expected` = requests whose `expect` is it; `routed` = requests whose `got` includes it; `right` = both.
A request that loads two skills is right for one and wrong for the other. Check yourself against the working in
`tests/fixtures/routing-metrics.json`.

</details>

### M4
<details><summary>Testing a runner that costs money</summary>

`main(argv, { ask })` takes `ask` as a parameter, so the checks pass a fake one and never start Copilot. Keep the
cap check before the first `ask()`, and pass `{ credits, cwd: root }` on every call.

</details>

<details><summary>Why run it in place</summary>

Skills only load in a folder you trust. A temp copy elsewhere would route nothing at all, so the real run works in
this folder, and `--deny-tool=write --deny-tool=shell` keeps it read-only. Never add `--dynamic-retrieval`: it changes
your Copilot settings for good.

</details>

### M5
<details><summary>Reading the misses</summary>

Run the pre-check and read `## Misses`. A request that went to the wrong skill: the wrong skill's description has
the request's rare words; take them out, or give the right skill a better trigger. A request that went nowhere: no
description has its words ("timetable", "Excel", "coverage"). Write triggers the way people ask.

</details>

<details><summary>Don't overfit</summary>

Pasting the 24 requests into the descriptions would score 1.00 and route badly tomorrow. The 1,500-character budget
keeps you honest: name the job and the situations, in the words a user would use.

</details>

### M6
<details><summary>Progressive disclosure, level 3</summary>

Name and description: always loaded. `SKILL.md` body: loaded when the skill is picked. `references/*.md`: read only
when a step says so. Make the body a short router: "read `references/jsdoc.md` when you document functions".

</details>

<details><summary>Whose job is it?</summary>

Changelogs and release notes: `release-notes` (it has a tested script). Explaining errors: `explain-error`. Exports:
`csv-export`. Delete those sections from `write-docs` and say so in one line, so the model knows where to go.

</details>

## 🧠 Takeaway
A skill's description is a routing prompt that every request pays for, so measure routing like any classifier and load the rest only on demand.

## ❓ Check yourself
Your lexical pre-check scores 1.00 / 1.00, but the real run shows `write-docs` loading for "Update the changelog for
the next release". How can both be true?
1. The pre-check has a bug: a correct pre-check always agrees with the real run.
2. The canary lied: `write-docs` printed its tag without its body being loaded.
3. The real run is unreliable, so the pre-check's numbers are the ones to report.
4. The real router reads meaning, the conversation and other skills, not just shared words: the pre-check is only a proxy.

<details><summary>Answer</summary>

**4.** The model (and an embeddings retriever, when it's on) picks by meaning, with the whole context in view; your
pre-check counts words. Use the cheap check to catch the obvious, and the real run, with its variance, as the truth.

</details>

## 🚀 Going further
- Run the real eval three times. How much do the numbers move? (Lab 00 hard+ measured the same variance.)
- Cross-check the canaries against the JSON events: `--output-format json` logs each skill load as a `skill` tool
  call. Does every canary match a real load?
- Write 12 new requests the descriptions have never seen. Did you overfit?
- Vet your library with hard+'s `scripts/vet-skill.mjs .github/skills`, and think about which skill should be
  `disable-model-invocation: true`.
