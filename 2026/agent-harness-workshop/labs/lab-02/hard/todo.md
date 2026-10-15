# 🔴 Hard · A skill with a script

> 🕐 25 min · 🆓 free checks · 🤖 optional agent check (about 1 prompt)

## 🎯 Mission
Release notes written by an AI from memory are dangerous: it will happily invent a feature. Build a
`release-notes` skill that **bundles a script**. The script does the deterministic part (read the git
history, group commits) and the model does the human part (write nice notes from that data only).

## 📂 Work here
```bash
cd labs/lab-02/hard/src
copilot
```

## ✅ Done when
- `.github/skills/release-notes/scripts/changes.mjs` prints JSON: `since` (last tag or `null`), `total`,
  `groups` (by Conventional Commit type; non-conventional subjects go to `other`) and `breaking`
  (commits with `!`). Each entry is `{ hash, scope, subject }` with the `type(scope):` prefix removed
  (`scope` is `null` when there is none).
- It reads commits **since the last tag** from git, or from a file with `--from <file>` (one
  `<hash><TAB><subject>` per line, like `fixtures/git-log.txt`)
- `.github/skills/release-notes/SKILL.md` tells the agent to run the script, use only its data, leave out
  tests and chores, and add an `## [Unreleased]` section to `CHANGELOG.md`
- `copilot skill list` shows it, and the checks are green

## 💡 Hints
<details><summary>Getting the commits</summary>

`git describe --tags --abbrev=0` gives the last tag (it fails when there is none). `git log --pretty=format:%h%x09%s v1.0.0..HEAD`
prints `<short hash><TAB><subject>` lines since that tag. Use `execFileSync` from `node:child_process`.

</details>

<details><summary>Parsing Conventional Commits</summary>

One regular expression does it: type, optional `(scope)`, optional `!`, a colon, the subject:
`/^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/`. No match → group `other`, keep the whole subject.

</details>

<details><summary>Test it like the checks do</summary>

`node .github/skills/release-notes/scripts/changes.mjs --from fixtures/git-log.txt` should give 2 `feat`, 2 `fix`,
1 `docs`, 1 `test`, 1 `chore`, 1 `other` and 1 breaking change.

</details>

## 🚀 Going further
- Make the skill propose the next version number (semver: breaking → major, feat → minor, fix → patch).
- Add a `references/style.md` with examples of great release notes and point the skill to it.
