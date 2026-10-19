# 🔴 Hard · A skill with a script

> 🕐 1–1.5 h · 🏠 homework · 🆓 free checks · 🤖 optional agent check (about 1 prompt) · 🧱 builds on: Lab 02 · medium

## 🎯 Mission
Release notes written by a model from memory are dangerous: it will happily invent a feature, forget a breaking
change, or announce something that was reverted last week. Build a `release-notes` skill that **bundles a script**.
The script does the exact part (read the git history since the last tag, parse every Conventional Commit, cancel
reverted work, find the breaking changes, render the Markdown), and it's tested. The model does the human part:
put the notes in `CHANGELOG.md` and say what matters most, without adding a single entry of its own.

## 📋 Requirements
1. `parseCommit(hash, message)` reads type, scope, subject, breaking changes (`!` and `BREAKING CHANGE:` footers)
   and reverts, following the rules below.
2. `group(commits)` groups by type, cancels a revert together with the commit it reverts, and lists the breaking
   changes.
3. `render(data, { version, date })` prints the release-notes section in exactly the format below.
4. `changes.test.mjs` tests every rule, and fails when any rule breaks.
5. `SKILL.md` runs the script and puts its output in `CHANGELOG.md` verbatim: the model never writes an entry.

**The rules** (the script's header and the checks say the same):
```text
header = the message's first line; body = the rest
  type(scope)!: subject   type lower-cased; scope and ! optional
  Revert "<header>"       type "revert", subject = the quoted header
  anything else           type "other", subject = the whole header
note      = the text after a body line that starts with
            "BREAKING CHANGE:" or "BREAKING-CHANGE:", else null
breaking  = a "!" or a note
revertOf  = for reverts, the hash in "This reverts commit <sha>."
            or "Refs: <sha>" in the body, else null
```
`group()` returns `{ total, groups, breaking, reverted }`: `groups.<type>` holds `{ hash, scope, subject }` entries
in log order (newest first); `breaking` holds `{ hash, type, scope, subject, note }`; a revert whose target is in the
list (short and full hashes match when one starts with the other) removes both from `groups` and `breaking`, and adds
`{ hash, scope, subject, by }` for the target to `reverted`. A revert of an older commit stays in `groups.revert`.

**The format** (`--format md`; empty sections are left out; breaking changes appear only under their heading, with the
note on the next line, indented two spaces):
```markdown
## [2.0.0] - 2026-10-19

### 💥 Breaking changes
- **grades:** remove average() (c3d4e5f)
  average() is gone, use weightedAverage() instead.

### ✨ Features
- **grades:** add gpa() with credit weighting (a1b2c3d)

### 🐛 Fixes
- use local dates instead of UTC (8e7d6c5)

### ⏪ Reverted
- fix(deadlines): round days up (7d6c5b4)
```
Without `--version` the title is `## [Unreleased]`. Nothing to list: the title, a blank line, `No user-facing
changes.`. Only `feat` and `fix` get a section of their own; tests, chores, docs and the rest stay in the JSON.

## 🧭 Milestones
### M1 · Read one commit
- `parseCommit()` gives the expected `{ type, scope, subject, breaking, note, revertOf }` for the 13 commits in
  `tests/fixtures/commits.json`: scopes, an upper-case type, `!`, both footer spellings, a footer mentioned in the
  middle of a sentence (not a footer), `Revert "…"` with a full sha, `revert:` with `Refs:`, a non-conventional one

### M2 · Group the history
- `--from fixtures/git-log.txt` still gives 2 `feat`, 2 `fix`, 1 `docs`, 1 `test`, 1 `chore`, 1 `other`, and the
  Node 18 breaking change
- `group()` on the 13 commits cancels the dark-mode pair, keeps the older revert in `groups.revert`, and lists three
  breaking changes in log order
- From git (a throwaway repository the checks build): only the commits since the last tag; a `BREAKING CHANGE:` in a
  commit body is found; a real `git revert` pair cancels

### M3 · Tests that catch mistakes
- `.github/skills/release-notes/scripts/changes.test.mjs` has at least 6 tests and they pass
- They pass on the reference script too (so they test the rules, not your implementation), and each of five broken
  versions fails at least one of them: the scope dropped, `!` ignored, footers ignored, reverts never cancelled,
  breaking changes listed twice

### M4 · Notes nobody invented
- `--from tests/fixtures/commits.json --format md --version 2.0.0 --date 2026-10-19` prints exactly
  `tests/fixtures/release-notes.golden.md` (the path is in the lab folder, next to `src/`)
- `SKILL.md`: a what + when description; run the script with `--format md`; put the output in `CHANGELOG.md`
  verbatim, under `## [Unreleased]` unless a version is given; never add, drop or reword an entry
- `copilot skill list` shows it

## 📂 Work here
```bash
cd labs/lab-02/hard/src
code .github/skills/release-notes/scripts/changes.mjs
cd .github/skills/release-notes/scripts
node changes.mjs --from ../../../../fixtures/git-log.txt
node --test changes.test.mjs
cd ../../../..
node labs/start.mjs test lab-02 hard     # from the workshop folder
```
`changes.mjs` already reads git (full messages, since the last tag), reads `--from` files, and parses the command
line: you write `parseCommit`, `group` and `render`. `npm test` skips the dot folder `.github/`, so name the test
file to run it.

## 💡 Hints
### M1
<details><summary>One regex for the header</summary>

`/^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/` gives type, scope, the `!` and the subject. Try `Revert "…"` first
(`/^Revert "(.+)"$/`): it doesn't match the conventional pattern, and it isn't "other" either.

</details>

<details><summary>Footers live at the start of a line</summary>

With the `m` flag, `^` matches at the start of every line: `/^BREAKING[ -]CHANGE:\s*(.+)$/m` finds a footer
anywhere in the body, but not "mentioned BREAKING CHANGE: in passing" in the middle of a sentence.

</details>

### M2
<details><summary>Cancelling a revert pair</summary>

First pass: for each revert with a `revertOf`, find its target in the list (`a.startsWith(b) || b.startsWith(a)`:
`git log --format=%h` gives short hashes, `git revert` writes the full one) and remember both. Second pass: build
`groups` and `breaking`, skipping everything you remembered, and push the target to `reverted`.

</details>

<details><summary>Try it on a real history</summary>

```bash
git init demo && cd demo
git commit --allow-empty -m "chore: start" && git tag v1.0.0
git commit --allow-empty -m "feat(ui): x" -m "BREAKING CHANGE: y"
node ../.github/skills/release-notes/scripts/changes.mjs
```

</details>

### M3
<details><summary>What a mutant is</summary>

The check takes the reference script, breaks one rule (for example: the scope is always `null`), and runs your tests
against it. If they all still pass, nothing in your suite looks at that rule. One focused test per rule kills them
all; the M1 list is a good checklist.

</details>

<details><summary>Test render() on the whole string</summary>

Build a tiny history with `group([...])`, then `assert.equal(render(data, { version: '2.0.0', date: '…' }), [ …lines…
].join('\n'))`. Comparing the whole section catches a duplicated entry or a section in the wrong order, which
`includes()` never would.

</details>

### M4
<details><summary>Where the golden comes from</summary>

The golden was made by running the reference script once and reading every line by hand. Diff yours: run the
command from M4 and compare with `tests/fixtures/release-notes.golden.md`; the check names the first line that
differs.

</details>

<details><summary>What's left for the model</summary>

Running the script, placing the section (first under `# Changelog`, creating the file if needed), and one sentence
for the user about the most important change. Say what to do when something looks wrong: tell the user, never "fix"
an entry by hand.

</details>

## 🧠 Takeaway
Give exact, repeatable work to a tested script inside the skill, and let the model do only the part that needs judgment.

## ❓ Check yourself
Your teammate's `release-notes` skill says "read `git log` and write nice release notes". Last release, the notes
announced dark mode, which had been reverted two days before. What fixes this for good?
1. Move the parsing into the skill's script, test the revert rule, and have the model paste the script's output.
2. Add "check for reverted commits" to the skill's steps, in bold, so the model can't miss it.
3. Switch to a larger model for release notes, since a stronger model reads `git log` more carefully.

<details><summary>Answer</summary>

**1.** A rule in prose is a wish the model weighs against everything else; a tested function gives the same answer
every time. The model still has a job, but not the exact one.

</details>

## 🚀 Going further
- Add `--bump`: print the next version from the last tag (a breaking change → major, a feature → minor, else patch).
- Add `references/style.md` with examples of great notes, and point the skill to it for the one-sentence summary.
- Lab 02 hard+ asks the uncomfortable question: a skill can run code on your machine. Would you run this script if a
  stranger had written it?
