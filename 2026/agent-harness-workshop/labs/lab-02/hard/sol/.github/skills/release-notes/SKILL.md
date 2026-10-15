---
name: release-notes
description: Write release notes for the next version from the git history, grouped into features, fixes and breaking changes. Use when the user asks for release notes, a changelog entry, or "what changed since the last release".
argument-hint: "[version, e.g. 1.2.0]"
---
1. Run `node .github/skills/release-notes/scripts/changes.mjs`. It prints JSON with the commits since the last
   tag, grouped by type (`feat`, `fix`, ...), plus a `breaking` list.
2. Use **only** the commits in that JSON. Never invent, merge or reword entries beyond light cleanup.
3. Write the notes for **users**: features, fixes and breaking changes. Leave out `test`, `chore`, `ci`,
   `refactor`, `style` and `docs` commits.
4. Add a new section at the top of `CHANGELOG.md` (create the file if needed):

   ## [Unreleased]
   ### 💥 Breaking changes
   - <subject> (<short hash>)
   ### ✨ Features
   - **<scope>:** <subject> (<short hash>)
   ### 🐛 Fixes
   - <subject> (<short hash>)

   Leave out empty sections. Use the version from the argument instead of "Unreleased" if one is given.
5. Show the new section to the user and ask whether to commit it.
