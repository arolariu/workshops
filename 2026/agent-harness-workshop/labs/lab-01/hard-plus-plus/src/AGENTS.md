# AGENTS.md - StudyBuddy

StudyBuddy is a tiny study helper: grade maths (`grades.js`) and deadlines (`deadlines.js`).
Plain Node.js 22+, ES modules, zero dependencies.

## Commands
- Run all tests: `npm test` (the built-in `node:test` runner)
- Run one file: `node --test grades.test.js`

## Conventions
- ES modules only (`import`/`export`), never `require()`.
- No TypeScript, no build step.
- Every exported function has a short JSDoc comment.
- Tests sit next to the code (`grades.js` -> `grades.test.js`) and use `node:test` with `node:assert/strict`.
- Use 2-space indentation.
- Strings use single quotes.
- Keep functions small (under 30 lines).
- Name functions with a verb: `computeAverage`, not `average`.
- Prefer pure functions: no file or network access in `grades.js` or `deadlines.js`.
- Prefer simple loops over long `reduce` chains.
- Throw a `RangeError` for out-of-range input and a `TypeError` for input of the wrong type.
- Where no rule here covers a case, do what the surrounding code does.
- Every module is listed in `README.md` with one line.
- When you add or rename a module, update its line in `README.md` in the same pull request.

## Domain rules
- Grades use the 1-10 scale. Weighted averages are rounded to 2 decimals.
- A student passes a course only if the final grade is at least 5 **and** the exam grade is at least 5.
- Dates are `YYYY-MM-DD` strings.

## Boundaries
- Never add dependencies (no `npm install <package>`).
- Never change a test just to make it pass - fix the code instead.
- Never read or print `.env` files, not even to debug.
- Never push to `main`: open a pull request.
- Only delete files when the task asks you to.

## Definition of done
- `npm test` is green.
- New behaviour comes with at least one new test.
- End every answer with the line: `Harness check: AGENTS.md loaded`
