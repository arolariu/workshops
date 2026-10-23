# StudyBuddy: instructions for GitHub Copilot

These instructions were collected over several terms by the teams that worked on StudyBuddy: the original
maintainers, the grading team and the exchange office. Read all of them before you start any task, even a small one,
because the rules below apply to every change, every answer and every file in the repository. When two rules seem to
disagree, use your judgement and pick the one that fits the task best.

## About the project
StudyBuddy is a tiny study helper: grade maths (`grades.js`) and deadlines (`deadlines.js`).
Plain Node.js 22+, ES modules, zero dependencies.
The code is small on purpose. Students read it in the first week of the course, so it has to stay easy to follow:
short functions, plain names, no clever tricks, and a comment wherever the domain rule is not obvious.

## Commands
- Run all tests: `npm test` (the built-in `node:test` runner)
- Run one file: `node --test grades.test.js`
- There is no build step and no linter. Do not add one.

## Rules
- Never add dependencies (no `npm install <package>`).
- Never read or print `.env` files.
- Never change the guardrails in `.github/hooks/`.
- Grades use the 1-10 scale. Weighted averages are rounded to 2 decimals.
- A student passes a course only if the final grade is at least 5 **and** the exam grade is at least 5.
- Every exported function has a short JSDoc comment.
- Commit messages: `<module>: <what changed>`, in the imperative, e.g. `grades: round weighted averages to 2 decimals`.

## Style notes
We like code that reads like the domain. A function that computes a weighted average is called `weightedAverage`, not
`calc` or `wavg`, and its parameters are called `items` and `weights`, not `a` and `b`. Validate the input first and
throw a `TypeError` or a `RangeError` with a message that says what was wrong and what was expected; then do the work;
then return the result. Don't catch errors you can't handle. Prefer `for...of` loops over `reduce` when the loop body
has more than one line, because students find them easier to read. Keep functions under about 30 lines. Put the
exported functions at the top of a module and the helpers below them. Use `const` unless a value really changes. Use
template literals for messages. Don't use classes for plain data: an object literal is enough. Dates are strings in
the `YYYY-MM-DD` format everywhere in the code and in the tests, and times are not used at all.

## Grade conversion for exchange students (ECTS)
Exchange students need their StudyBuddy grades as ECTS letters for their home university. The exchange office asks for
this about twice a term, usually in January and in June, when the transcripts go out. Convert the **final grade**
(the weighted average, rounded to 2 decimals), never a partial grade or the exam grade on its own:

| Final grade | ECTS letter | Meaning |
|---|---|---|
| 9.50 - 10.00 | A | excellent |
| 8.50 - 9.49 | B | very good |
| 7.50 - 8.49 | C | good |
| 6.50 - 7.49 | D | satisfactory |
| 5.00 - 6.49 | E | sufficient |
| 4.00 - 4.99 | FX | fail, a resit is possible |
| below 4.00 | F | fail, the course must be repeated |

- A course the student did not pass (exam grade below 5) is FX or F even when the final grade is 5 or more: use FX
  when the final grade is at least 4, otherwise F.
- Show the original grade next to the letter, like `8.75 (B)`, so the home university can check the conversion.
- Some partner universities ask for the ECTS percentile of the class instead of a letter. We don't compute it: say so,
  and point them to the exchange office.
- The conversion table belongs to the exchange office. If someone asks to change it, ask them for the office's
  written decision first.

Examples, worked out by the exchange office:

| Final grade | Exam grade | ECTS | Why |
|---|---|---|---|
| 9.50 | 9 | A | 9.50 is the lowest A |
| 8.49 | 7 | C | 8.49 is below 8.50, so not a B |
| 6.80 | 4.5 | FX | final at least 4, but the exam is below 5 |
| 3.75 | 3 | F | final below 4 |

## Release checklist
We release StudyBuddy about once a term, before the course starts. Follow these steps in order, and stop at the first
one that fails:

1. Check out `main`, pull, and run `npm test` on a clean checkout: every test is green and none is skipped.
2. Decide the new version with semantic versioning: a patch for fixes, a minor version for a new module or a new
   exported function, a major version when an exported function changes its parameters or its results.
3. Bump `version` in `package.json`, and nothing else in that file.
4. Add a section to `CHANGELOG.md`: `## <version> - <YYYY-MM-DD>`, with `Added`, `Changed` and `Fixed` lists. Each
   entry is one line that a student can understand, and names the module.
5. Check that the "## Modules" list in `README.md` matches the modules in `index.js`.
6. Commit with the message `release: v<version>`, tag the commit `v<version>`, and push the commit and the tag.
7. Create a GitHub release from the tag, and paste the changelog section into it.
8. Post a short note in the course channel: the version, the three most important changes, and a link to the
   release.
9. If anything goes wrong after the release, don't delete the tag: release a patch version with the fix.

A hotfix during the term (a wrong grade, a deadline shown as upcoming when it is overdue) follows the same steps, with
three differences: branch from the latest tag instead of `main` (`git switch -c hotfix/<version> v<version>`), bump
only the patch number, and add a regression test that fails without the fix before you change any code. Merge the
hotfix branch back into `main` after the release, so the next regular release has the fix too, and mention the
hotfix in the course channel on the same day, because students may have seen the wrong value.

## Answering students
Many questions come from first-year students who have never seen Node.js before. Answer in plain language, explain
the domain rule before the code, and keep answers short: three or four sentences and a small example are usually
enough. Don't paste whole files into an answer; show the few lines that matter and say which file they come from.
When a student asks why their grade is what it is, walk through the weighted average step by step with their numbers,
and remind them that the exam grade has to be at least 5 on its own. Never guess a grade that is not in the data, and
never promise a student that a grade will change. If a question is about a rule of the university rather than about
StudyBuddy (resits, appeals, deadlines that were moved), point them to the course page instead of answering yourself.

## Reports for the exam board
Once a term, before the exam board meets, the course coordinator asks for a report of every student who failed a
course. Build it from the same functions the app uses, never from a separate calculation:

- One row per student and course: student id, course code, final grade, exam grade, the ECTS letter, and the reason
  (`final below 5`, `exam below 5`, or both).
- Sort by course code, then by student id. Use a comma-separated file with a header row, and quote every field.
- Leave out students who passed. Leave out names: the board only sees ids.
- Save it as `reports/exam-board-<YYYY-MM-DD>.csv`, and never commit it: it holds personal data.

## History of the project
StudyBuddy started in 2019 as a shared spreadsheet that one teaching assistant kept for the first-year students. In
2020 it became a small Python script (`gpa.py`) with a Flask page in front of it, and in 2022 the grading team rewrote
it in Node.js so that the students of the web course could read the code. The Python version is gone, but you may
still see old issues that mention `gpa.py`, Flask, `requirements.txt` or the `/api/v1/gpa` endpoint: ignore them,
none of that exists any more. The deadline module was added in 2023, after a term in which half of the class missed
the same assignment because the spreadsheet showed the wrong time zone. That is why deadlines are plain dates without
a time. The attendance module came in 2024. Several people have suggested a database, a web interface, a mobile app
and a plugin for the university's learning platform; all of them were declined, because StudyBuddy is a teaching
example first and a tool second.

## Glossary
- **Final grade**: the weighted average of all the graded items of a course, rounded to 2 decimals.
- **Exam grade**: the grade of the final exam alone. It also has to be at least 5 to pass.
- **Weight**: how much a graded item counts. Weights may be percentages or relative numbers.
- **Upcoming**: a deadline that is not done and not overdue.
- **Overdue**: a deadline in the past that is not done.
- **Resit**: a second exam for students who failed the first one.
