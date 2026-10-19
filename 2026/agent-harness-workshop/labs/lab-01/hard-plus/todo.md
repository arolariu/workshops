# 🟣 Hard+ · The context diet

> 🕐 1.5–2 h · 🏠 homework · 🆓 free checks · 🧱 builds on: Lab 01 · hard

## 🎯 Mission
StudyBuddy ships a 300-line `.github/copilot-instructions.md` that five people wrote over three years. Copilot sends
all of it on **every turn**, about 3,800 tokens before anyone types a word, and the rules that matter drown in
history lessons, vague advice, duplicates, contradictions and commands that don't exist. Build `lint-instructions.mjs`
to find the noise and count the cost of every path, then put the file on a diet: a lean `AGENTS.md`, scoped files and
one skill, within a budget. Keep every rule: an inventory proves that nothing was lost on the way.

## 📋 Requirements
1. `findVague()`, `findDuplicates()`, `findContradictions()` and `findBadCommands()` find every planted problem of the
   legacy file, and nothing else.
2. `tokensPerPath()` says what each path costs in ≈tokens; the linter exits 1 on findings or over budget (every turn
   ≤ 600 tokens, any path ≤ 900).
3. The legacy file is gone. `AGENTS.md` stays lean and keeps the canary and the team's rules; scoped files carry the
   rules for tests, docs and the domain code; one skill holds the grade-appeal procedure.
4. The new files agree with each other, every command in them works, and your linter exits 0 on them.
5. `RULES-INVENTORY.md` accounts for every one of the 56 legacy rules: where it lives now, and how it got there.

## 🧭 Milestones
### M1 · Find the noise
- `findVague(rules)` returns the rules that use a `VAGUE` word and give nothing concrete to check (no `code`, no
  digit, no file name): the 8 in the legacy file, and not "Keep functions small (under 30 lines)"
- `findDuplicates(rules)` returns `{ a, b, similarity }` for every pair whose `words()` have a Jaccard similarity of
  at least 0.6 and that can meet in one context (`inContextTogether()`): the 9 pairs in the legacy file and
  `AGENTS.md`, and never two sibling scoped files

### M2 · Conflicts and wrong commands
- `findContradictions(rules)` returns `{ topic, values, rules }` for every `TOPICS` entry where two rules that can
  meet disagree: indentation (2 vs 4), quotes (single vs double), decimals (1 vs 2), the test runner (`jest` vs
  `node:test`)
- `findBadCommands(rules, scriptsOf)` returns `{ file, line, command, why }` for every `npm test` or `npm run x` that
  the nearest `package.json` can't run, and every `yarn` or `pnpm` command: 5 in the legacy file

### M3 · Count the cost
- `tokensPerPath(root, paths)` returns `{ path, files, tokens }` per path: the files that apply to it (your medium-level
  `which-instructions.mjs` knows), and their ≈tokens together (characters ÷ 4, rounded up, per file)
- `node scripts/lint-instructions.mjs` exits 1 on the starter: findings, ≈4,000 tokens on every turn, every path over
  900

### M4 · The diet
- `.github/copilot-instructions.md` is gone; the always-on files cost at most 600 tokens, and no path more than 900
- `AGENTS.md` (under 100 lines) keeps the canary, `npm test`, the exam rule, the three boundaries and its sections
- At least three scoped files, each matching real files: tests and docs were there already, so add one for the code
  that has rules of its own
- One skill, `.agents/skills/<name>/SKILL.md`, holds the 10-step grade-appeal procedure: its name matches its folder,
  and its description says when to use it
- The new files have one value per topic and no command that doesn't work, and `node scripts/lint-instructions.mjs`
  exits 0

### M5 · Nothing lost
- `RULES-INVENTORY.md` has a row per legacy rule, `L01` to `L56`, as `--inventory` prints them
- Every row has a status (`kept`, `moved`, `rewritten`, `fixed`, `resolved` or `merged`) and a `Where` that exists.
  `kept` and `moved` rules are in `Where` word for word; the others say what they read now (or, for `merged`, which row
  they joined), and that is in `Where` too
- Vague rules are rewritten or merged, never kept as they were; wrong commands are `fixed`; one side of every
  contradiction is `resolved`

## 📂 Work here
```bash
cd labs/lab-01/hard-plus/src
copilot instruction list            # what loads on every turn
code scripts/lint-instructions.mjs
node scripts/lint-instructions.mjs  # findings and ≈tokens per path
node scripts/lint-instructions.mjs --inventory   # the table, for M5
node labs/start.mjs test lab-01 hard+   # from the workshop folder
```
`lint-instructions.mjs` gives you the plumbing (`parseRules`, `words`, `tokens`, `inContextTogether`,
`nearestScripts`, `lint()` and the CLI) and the word lists (`VAGUE`, `STOPWORDS`, `TOPICS`); the five functions marked
`TODO` are yours. M1–M3 are checked on a copy of the legacy file in `tests/fixtures/`, so deleting it in M4 doesn't
break them. Print the inventory table **before** you delete it (or run `--inventory` on that copy).

## 💡 Hints
### M1
<details><summary>Concrete beats vague</summary>

"Write clean code" gives the model nothing to check; "Keep functions small (under 30 lines)" does, even though "small"
is on the list. So skip a rule as soon as it has a backtick, a digit or a file name, then look for the first `VAGUE`
word at the start of a word (`\b` before it, not after: `careful` also catches `carefully`).

</details>

<details><summary>Jaccard in four lines</summary>

`a = words(x.text)`, `b = words(y.text)`; count the words in both; similarity = both ÷ (a.size + b.size − both).
Compare each pair once (`j > i`), and skip the pairs `inContextTogether()` rules out: two scoped files for different
folders never meet in one context, so a rule repeated there costs nothing.

</details>

### M2
<details><summary>A table beats free text</summary>

Nobody can find every contradiction in prose. But most conflicts are about a handful of topics with a value: how many
spaces, which quotes, how many decimals, which test runner. `TOPICS` gives each one a regex and a `value()`: collect
the rules that match a topic and look for two that can meet and differ. When you meet a new kind of conflict, add a
topic.

</details>

<details><summary>What does npm actually run?</summary>

`npm test` and `npm t` run the "test" script, `npm run lint` the "lint" script; `npm install`, `npm ci` and
`npm install <package>` are npm's own commands, not scripts. `scriptsOf(rule.file)` gives you the "scripts" of the
`package.json` nearest to the rule's file (in hard++ every package has its own).

</details>

### M3
<details><summary>Reuse, don't rewrite</summary>

`instructionSources(root)` and `applicable(sources, path)` from your medium level already know which files apply
where. Read each source once, `tokens()` it, then add up per path.

</details>

### M4
<details><summary>Where does each rule go?</summary>

Ask of every rule: does it matter on every turn? Commands, boundaries, the domain rules and the canary do: they stay
in `AGENTS.md`. Rules that only matter when the agent touches some files go to a scoped file with a tight `applyTo`.
A long procedure needed twice a term goes into a skill: only its name and description are always in the context.
Copilot reads project skills from `.github/skills/`, `.agents/skills/` and `.claude/skills/`; use `.agents/skills/`
here. Lab 02 is all about `.github/skills/`, and this skill belongs to StudyBuddy's grading, so it shouldn't follow
you there. History, FAQ and changelog hold no rules: they go.

</details>

<details><summary>Deciding a contradiction</summary>

The code is the tie-breaker: it uses 2 spaces, single quotes, 2 decimals and `node:test`. Keep the rule that matches
it, and mark the other one `resolved`, with the winner in "Now reads".

</details>

### M5
<details><summary>Fill it in as you go</summary>

Paste the `--inventory` table into `RULES-INVENTORY.md` first. Then, every time you move a rule, write its status and
its new file next to it. For `merged`, "Now reads" can name the row that survived (`L03`) or quote the rule that
already said it (`AGENTS.md` had a few of them).

</details>

## 🧠 Takeaway
Every always-on line is paid for on every turn and competes for the model's attention: keep the root lean, scope the rest, load procedures on demand, and prove that nothing got lost.

## ❓ Check yourself
Before the diet, every turn carried about 4,000 tokens of instructions; after it, about 450. A session has 30 turns.
What did the diet save in that session?
1. Nothing that matters: Copilot caches instruction files, so their size never counts.
2. About 3,450 tokens: the file is sent once, at the start of the session.
3. About 100,000 tokens, and more: the instructions go along on every turn, and a long file buries the rules that
   matter.

<details><summary>Answer</summary>

**3.** (4,000 − 450) × 30 ≈ 106,500 tokens. Instructions are context, not memory: they are sent again on every turn.
Caching can make repeated tokens cheaper, but they still fill the context window and compete for the model's
attention, so the one rule that matters is easier to miss.

</details>

## 🚀 Going further
- Skills cost something on every turn too: their name and description are always in the context (Lab 02). Add them
  to the "every turn" line.
- Add a topic to `TOPICS` (semicolons? `async`/`await` versus `.then()`?) with a planted conflict to test it.
- Run the A/B experiment from the hard level before and after the diet: did a signal drop when the file got smaller?
- Lab 01 hard++ turns this linter into a CI gate for a whole workspace.
