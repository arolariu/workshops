# Changelog · campus-standards

## 2.0.0 - 2026-10-12
### Breaking
- The `campus-grading-rules` skill is now `campus-grading` (its folder and its name). Agents, instructions and
  prompts that mention the old name must use the new one (`migrations` in `release.json`: rename
  `campus-grading-rules` → `campus-grading`). Copilot finds skills by name: an old mention now points at nothing.
- `campus.instructions.md` applies to `**/*.js` only, instead of every file.
### Added
- `campus-deadlines.instructions.md`: how late submissions are handled.

## 1.4.0 - 2026-09-01
### Added
- The `campus-grading-rules` skill: how the university computes final grades and pass marks.