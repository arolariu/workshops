# Rules inventory: the legacy instructions file

Every rule of the old `.github/copilot-instructions.md`, and where it lives now. Status: **kept** (same words, new
home), **moved** (same words, scoped file or skill), **rewritten** (a vague rule made checkable), **fixed** (a
command that didn't work), **resolved** (the losing side of a contradiction), **merged** (said already: the row or
rule it joined).

| ID | Legacy rule | Status | Where | Now reads |
|---|---|---|---|---|
| L01 | Write clean code. | merged | AGENTS.md | L03 |
| L02 | Always follow best practices. | rewritten | AGENTS.md | Where no rule here covers a case, do what the surrounding code does. |
| L03 | Keep functions small (under 30 lines). | kept | AGENTS.md | |
| L04 | Prefer pure functions: no file or network access in `grades.js` or `deadlines.js`. | kept | AGENTS.md | |
| L05 | Be careful when you change the grade logic. | rewritten | .github/instructions/grades.instructions.md | When you change the grade logic, work out one result by hand first and add it as a test. |
| L06 | Name functions with a verb: `computeAverage`, not `average`. | kept | AGENTS.md | |
| L07 | Make the code readable. | merged | AGENTS.md | L06 |
| L08 | Ask before you delete a file. | kept | AGENTS.md | |
| L09 | Run the tests with `npm test`. | merged | AGENTS.md | Run all tests: `npm test` |
| L10 | Run one test file with `node --test grades.test.js`. | merged | AGENTS.md | Run one file: `node --test grades.test.js` |
| L11 | Lint with `npm run lint` before every commit. | fixed | AGENTS.md | `npm test` is green. |
| L12 | Build with `npm run build` before you open a pull request. | fixed | AGENTS.md | No TypeScript, no build step. |
| L13 | Use `npm run test:watch` while you work. | fixed | AGENTS.md | Run one file: `node --test grades.test.js` |
| L14 | Check the test coverage with `npm run coverage`. | fixed | AGENTS.md | New behaviour comes with at least one new test. |
| L15 | On CI the tests run with `yarn test`. | fixed | AGENTS.md | Run all tests: `npm test` |
| L16 | ES modules only (`import`/`export`), never `require()`. | kept | AGENTS.md | |
| L17 | Use 2-space indentation. | kept | AGENTS.md | |
| L18 | Strings use single quotes. | kept | AGENTS.md | |
| L19 | Every exported function has a JSDoc comment. | merged | AGENTS.md | Every exported function has a short JSDoc comment. |
| L20 | Throw a `RangeError` for out-of-range input and a `TypeError` for input of the wrong type. | kept | AGENTS.md | |
| L21 | Prefer simple loops over long `reduce` chains. | kept | AGENTS.md | |
| L22 | Indent with 4 spaces. | resolved | AGENTS.md | Use 2-space indentation. |
| L23 | Wrap strings in double quotes. | resolved | AGENTS.md | Strings use single quotes. |
| L24 | Keep the code nice and simple. | merged | AGENTS.md | L21 |
| L25 | Grades use the 1-10 scale, and weighted averages are rounded to 2 decimals. | merged | AGENTS.md | Grades use the 1-10 scale. Weighted averages are rounded to 2 decimals. |
| L26 | Round weighted averages to one decimal. | resolved | AGENTS.md | Weighted averages are rounded to 2 decimals. |
| L27 | A student passes a course only with a final grade of at least 5 and an exam grade of at least 5. | merged | AGENTS.md | A student passes a course only if the final grade is at least 5 **and** the exam grade is at least 5. |
| L28 | Weights can be percentages or relative weights: never assume they add up to 100. | moved | .github/instructions/grades.instructions.md | |
| L29 | A grade below 1 or above 10 is invalid: throw a `RangeError`. | moved | .github/instructions/grades.instructions.md | |
| L30 | Handle edge cases properly. | rewritten | .github/instructions/grades.instructions.md | Test the edges of every grade rule: a single item, a total weight of 0, a final grade of exactly 5, an exam grade of 4.99. |
| L31 | Dates are `YYYY-MM-DD` strings. | kept | AGENTS.md | |
| L32 | Never call `new Date()` without an argument in `deadlines.js`: pass `now` in, so the tests stay deterministic. | moved | .github/instructions/deadlines.instructions.md | |
| L33 | An overdue assignment is never "upcoming". | moved | .github/instructions/deadlines.instructions.md | |
| L34 | Tests use `node:test` and `node:assert/strict`. | merged | .github/instructions/tests.instructions.md | Use `node:test` (`import { test } from 'node:test'`) and `node:assert/strict`. |
| L35 | Write good tests. | merged | .github/instructions/tests.instructions.md | One behaviour per test. The test name is a full sentence that says what should happen. |
| L36 | Never use random numbers in a test. | merged | .github/instructions/tests.instructions.md | Never `new Date()` or random values. |
| L37 | Mock timers with `jest.useFakeTimers()`. | resolved | .github/instructions/tests.instructions.md | Pass `now` in instead of mocking timers |
| L38 | Every function gets at least one error-case test. | merged | .github/instructions/tests.instructions.md | Cover at least one error case with `assert.throws(fn, ErrorType)` for every function you test. |
| L39 | Never change a test just to make it pass: fix the code instead. | merged | AGENTS.md | Never change a test just to make it pass - fix the code instead. |
| L40 | Every module is listed in `README.md` with one line. | kept | AGENTS.md | |
| L41 | Keep the docs up to date. | rewritten | AGENTS.md | add or update it in the same pull request. |
| L42 | Code examples in the docs use `import`, never `require()`. | merged | .github/instructions/docs.instructions.md | Code examples use ES modules, like the code |
| L43 | Never add dependencies: no `npm install <package>`. | merged | AGENTS.md | Never add dependencies (no `npm install <package>`). |
| L44 | Never read or print `.env` files. | merged | AGENTS.md | L46 |
| L45 | Never push to `main`: open a pull request. | kept | AGENTS.md | |
| L46 | Never read or print `.env` files, not even to debug. | kept | AGENTS.md | |
| L47 | Ask for the student's id, the course and the grade they dispute. | moved | .agents/skills/grade-appeal/SKILL.md | |
| L48 | Find the grades on file for every graded item of that course, with their weights. | moved | .agents/skills/grade-appeal/SKILL.md | |
| L49 | Recompute the final grade with `weightedAverage()` from the grades on file. | moved | .agents/skills/grade-appeal/SKILL.md | |
| L50 | Check the exam grade on its own: below 5 means the course is failed, whatever the final grade. | moved | .agents/skills/grade-appeal/SKILL.md | |
| L51 | Compare your result with the grade the student received, to 2 decimals. | moved | .agents/skills/grade-appeal/SKILL.md | |
| L52 | If they differ, write down which item or weight explains the difference. | moved | .agents/skills/grade-appeal/SKILL.md | |
| L53 | Never change a grade on file yourself: only the course's professor can do that. | moved | .agents/skills/grade-appeal/SKILL.md | |
| L54 | Draft a reply that shows the calculation step by step, in plain language. | moved | .agents/skills/grade-appeal/SKILL.md | |
| L55 | Send the draft to the professor, not to the student. | moved | .agents/skills/grade-appeal/SKILL.md | |
| L56 | Log the appeal in the team's appeals spreadsheet with the date, the course and the outcome. | moved | .agents/skills/grade-appeal/SKILL.md | |

The prose (the history, the FAQ, the glossary, the changelog) held no rules: it went. The glossary's definitions live
in the code's JSDoc and in `docs/grading.md`.
