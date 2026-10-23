# AGENTS.md - StudyBuddy

StudyBuddy is a tiny study helper: grade maths (`grades.js`) and deadlines (`deadlines.js`).
Plain Node.js 22+, ES modules, zero dependencies.

## Commands
- Run all tests: `npm test` (the built-in `node:test` runner)
- Run one file: `node --test grades.test.js`

## Conventions
- ES modules only (`import`/`export`). No TypeScript, no build step.
- Every exported function has a short JSDoc comment.
- Tests sit next to the code (`grades.js` -> `grades.test.js`) and use `node:test` with `node:assert/strict`.
- Commit messages: `<module>: <what changed>`, in the imperative, e.g. `grades: round weighted averages to 2 decimals`.

## Domain rules
- Grades use the 1-10 scale. Weighted averages are rounded to 2 decimals.
- A student passes a course only if the final grade is at least 5 **and** the exam grade is at least 5.

## Boundaries
- Never add dependencies (no `npm install <package>`).
- Never change a test just to make it pass - fix the code instead.
- Never read or print `.env` files.
- Never change the guardrails in `.github/hooks/`.
- Changes to the harness itself (this file, `.github/`, `mcp/`) follow `HARNESS.md`: ask its owner.

## Definition of done
- `npm test` is green.
- New behaviour comes with at least one new test.
- End every answer with the line: `Harness check: AGENTS.md loaded`
