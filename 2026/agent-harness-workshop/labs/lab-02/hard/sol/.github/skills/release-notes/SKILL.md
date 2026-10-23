---
name: release-notes
description: Write release notes for the next version from the git history, grouped into features, fixes and breaking changes. Use when the user asks for release notes, a changelog entry, or "what changed since the last release".
argument-hint: "[version, e.g. 1.2.0]"
---
The notes come from a script, so every entry is a real commit. Your job: run it, put its output in the right place,
and tell the user what matters most.

1. Run `node .github/skills/release-notes/scripts/changes.mjs --format md` from the project root. If the user gave a
   version, add `--version <version> --date <today as YYYY-MM-DD>`; without one, the section is `## [Unreleased]`.
2. Put the output into `CHANGELOG.md` verbatim, as the first section under the `# Changelog` title (create the file
   with that title if it doesn't exist).
3. Never add, drop, merge or reword an entry, and never write one from memory. If an entry looks wrong, tell the user
   instead of fixing it by hand. If the output says "No user-facing changes.", keep exactly that.
4. Show the user the new section and one sentence about the most important change (a breaking change first). Ask
   whether to commit it.

Without `--format md`, the script prints JSON with every commit (tests and chores too), for questions about the history.
