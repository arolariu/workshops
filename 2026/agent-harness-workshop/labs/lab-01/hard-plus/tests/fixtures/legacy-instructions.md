# StudyBuddy: instructions for Copilot (and for humans)

> Maintained by the whole team since 2023. Add what you learn here; please don't delete anything.
> TODO(M4): this file goes on a diet. Every rule in it must survive the move (see RULES-INVENTORY.md).

## Why this file exists

This file started as a list of things we kept explaining to new people. Then we started using Copilot, and it
turned out that Copilot needed the same explanations, every single time. So we wrote everything down here. The
idea is simple: if it is in this file, nobody has to explain it again, and Copilot reads it before it does
anything.

Over time the file grew. Every time something went wrong, somebody added a rule. Every time somebody joined the
team, they added the things they wished they had known on their first day. Some rules were added twice, by two
different people, in two different places. That is fine. It is better to say something twice than to forget it.

If you are a human reading this: welcome! Please read the whole file before your first pull request. It takes
about fifteen minutes. If you are Copilot: please read the whole file before every answer.

## A short history of StudyBuddy

StudyBuddy started in October 2023 as a weekend project. Ana wanted a way to see which assignments were due in
the next week without opening four different course pages. Mihai joined two weeks later and added the grade
calculator, because he was tired of computing weighted averages in a spreadsheet.

The first version was a single file of about two hundred lines. It had no tests. It printed everything to the
console, and it read the assignments from a JSON file that everybody edited by hand. It worked, mostly.

In the spring of 2024 we split it into modules: `grades.js` for the grade maths and `deadlines.js` for the due
dates. Radu added the first tests, after a bug in the rounding code gave a friend of his a 4.99 instead of a 5.00
on a course he had actually passed. That bug is the reason we are so careful about rounding today.

In the autumn of 2024 Professor Ionescu started recommending StudyBuddy to her students. That was exciting, and a
little scary: suddenly people we had never met depended on our grade maths. Her teaching assistant sent us the
official rules for passing a course, and we wrote them down here and in the code.

In 2025 we moved to ES modules and dropped the build step. We also had a long discussion about TypeScript. The
short version: not now, maybe later, and if you want to bring it up again, please read the whole discussion in
the issue tracker first.

In 2026 we started using Copilot for most of our day-to-day work. This file is now mostly written for Copilot,
but humans are still welcome to read it.

## How to work with us

We are a small team of students, and we all have exams, so please be patient with reviews. We try to review
every pull request within two days. If nobody has looked at yours after three days, ping the team chat.

We prefer small pull requests that do one thing. A pull request that fixes a bug and also renames twelve
functions is hard to review, and it will probably sit there for a week.

We don't have a style guide document. This file is the style guide.

## Reviews

Every pull request needs one approval from somebody who did not write it. For changes to the grade code we would
like two, because a mistake there reaches students directly. A review is not a gate to get through; it is the
cheapest way we know to catch a bug before a student does.

When you review, run the code. Reading a diff is good, but running `npm test` on the branch is better, and trying
the change by hand is best. If you only read it, say so in your review, so the author knows what was checked.

When your pull request gets a review, answer every comment, even if the answer is "done". Unanswered comments are
how disagreements turn into surprises three weeks later.

## Our values

We build StudyBuddy for students like us: people who are busy, a little stressed, and who need a tool they can
trust without thinking about it. That shapes almost every decision we make.

Correctness comes first. A feature that is wrong is worse than a feature that is missing, because people make real
decisions based on what StudyBuddy tells them. When we are not sure, we ask, we check, and we write a test.

Simplicity comes second. Every line of code is a line somebody has to read, understand and maintain, usually at two
in the morning before a deadline. If something can be done with less code, we do it with less code.

Kindness comes third, but it is not less important. We review each other's code, not each other. We assume good
intentions. We explain why, not just what. And we remember that everybody on this team is also a student with
exams, deadlines and a life outside this repository.

## A note about Copilot

We started using Copilot in 2026, and it changed how we work. Most of our pull requests now start with a prompt.
Copilot writes the first draft, a human reads it, and then we iterate. This works well when Copilot knows our rules,
and it works badly when it doesn't. That is why this file exists in its current form.

A few things we learned along the way. Copilot is very good at following clear rules, and very bad at guessing rules
that nobody wrote down. It does not remember anything between sessions: every session starts from this file and the
code. It sometimes "fixes" a failing test by changing the test, which is exactly what we don't want. And it is very
confident, even when it is wrong, so we always review what it writes.

If Copilot does something you didn't expect, the first question is: does this file say what we wanted? Very often
the answer is no, and the fix is a better rule here, not a longer prompt.

## General principles

- Write clean code.
- Always follow best practices.
- Keep functions small (under 30 lines).
- Prefer pure functions: no file or network access in `grades.js` or `deadlines.js`.
- Be careful when you change the grade logic.
- Name functions with a verb: `computeAverage`, not `average`.
- Make the code readable.
- Ask before you delete a file.

## Commands

All the commands you need are in this section. If a command is not here, we probably don't use it.

- Run the tests with `npm test`.
- Run one test file with `node --test grades.test.js`.
- Lint with `npm run lint` before every commit.
- Build with `npm run build` before you open a pull request.
- Use `npm run test:watch` while you work.
- Check the test coverage with `npm run coverage`.
- On CI the tests run with `yarn test`.

## Code style

We care a lot about consistent code. Code that looks the same everywhere is easier to read, easier to review and
easier to change. Please follow these rules even when you disagree with them, and open a discussion if you think
a rule should change.

- ES modules only (`import`/`export`), never `require()`.
- Use 2-space indentation.
- Strings use single quotes.
- Every exported function has a JSDoc comment.
- Throw a `RangeError` for out-of-range input and a `TypeError` for input of the wrong type.
- Prefer simple loops over long `reduce` chains.
- Indent with 4 spaces.
- Wrap strings in double quotes.
- Keep the code nice and simple.

A note on the indentation rules above: we changed our minds about this once or twice. The code is the source of
truth. If in doubt, look at the file you are editing and do what it does.

## Grades

This is the most important section. Grades matter to real students. A wrong grade can mean a wrong decision about
a scholarship, a resit or a place in next year's course. Please read every rule in this section twice.

- Grades use the 1-10 scale, and weighted averages are rounded to 2 decimals.
- Round weighted averages to one decimal.
- A student passes a course only with a final grade of at least 5 and an exam grade of at least 5.
- Weights can be percentages or relative weights: never assume they add up to 100.
- A grade below 1 or above 10 is invalid: throw a `RangeError`.
- Handle edge cases properly.

Some background on the pass rule: in 2024, a student with a great project and a failed exam was shown as
"passed" by StudyBuddy. The professor was not amused. The rule is now in the code, in the tests and in this file.
It must never be weakened, not even "temporarily".

## Deadlines

- Dates are `YYYY-MM-DD` strings.
- Never call `new Date()` without an argument in `deadlines.js`: pass `now` in, so the tests stay deterministic.
- An overdue assignment is never "upcoming".

## Tests

Tests are how we sleep at night. Every bug we ever fixed has a test now, and we want to keep it that way. If you
fix a bug without a test, somebody will ask you for one in the review.

- Tests use `node:test` and `node:assert/strict`.
- Write good tests.
- Never use random numbers in a test.
- Mock timers with `jest.useFakeTimers()`.
- Every function gets at least one error-case test.
- Never change a test just to make it pass: fix the code instead.

## Documentation

- Every module is listed in `README.md` with one line.
- Keep the docs up to date.
- Code examples in the docs use `import`, never `require()`.

## Boundaries

These are the things that have gone wrong before. Please don't let them go wrong again.

- Never add dependencies: no `npm install <package>`.
- Never read or print `.env` files.
- Never push to `main`: open a pull request.
- Never read or print `.env` files, not even to debug.

## Grade appeals

Sometimes a student thinks their final grade is wrong and asks us to check it. This happens about twice per term,
usually in the week after the exam results come out. It is always stressful for the student, so please be kind,
be precise, and follow these steps in order.

1. Ask for the student's id, the course and the grade they dispute.
2. Find the grades on file for every graded item of that course, with their weights.
3. Recompute the final grade with `weightedAverage()` from the grades on file.
4. Check the exam grade on its own: below 5 means the course is failed, whatever the final grade.
5. Compare your result with the grade the student received, to 2 decimals.
6. If they differ, write down which item or weight explains the difference.
7. Never change a grade on file yourself: only the course's professor can do that.
8. Draft a reply that shows the calculation step by step, in plain language.
9. Send the draft to the professor, not to the student.
10. Log the appeal in the team's appeals spreadsheet with the date, the course and the outcome.

We know this procedure is long. It used to be shorter, and then we had an appeal where three of us gave the
student three different answers. Following the steps is how we avoid that.

## Frequently asked questions

**Can I use lodash?** No. We have zero dependencies, and we want to keep it that way. If you think you need a
library, you probably need a small helper function instead. Write it, test it, and put it next to the code that
uses it.

**Why no TypeScript?** See the history section above. Short version: not now.

**Why do the tests use `node:test` and not something more popular?** Because it comes with Node, so it is one
less thing to install, update and argue about.

**What do I do when the build is red?** Run the tests, read the name of the failing test, and find the rule it
checks. Nine times out of ten, the code forgot a rule, and the test is right.

**Can Copilot push to main?** No. Nobody pushes to main. Everything goes through a pull request.

**Where do the grades come from?** From the course pages. We never store real student data in this repository:
the examples in the tests are made up.

**Who owns this file?** Everybody. That is a feature, not a bug. Well, mostly.

**Why is this file so long?** Because a lot happened. Every section is here for a reason, even if the reason is
three years old. If you think a section is no longer needed, open a discussion first.

**Can I write rules in my own words?** Yes, as long as they don't contradict anything else in this file. If they
do, the newer rule wins. Probably.

**Does Copilot really read all of this?** Every word, on every turn. That is what makes it useful.

**What if two rules disagree?** Then somebody forgot to read the whole file before adding one. Please fix it when
you notice, and tell the team chat which rule you kept.

## Known issues

The deadline code assumes that every date is in the same time zone. That has never been a problem, because all our
courses are in the same city, but it will be if we ever add online courses from somewhere else.

The grade code trusts its input. If a course page has a typo in a weight, StudyBuddy will happily compute a wrong
average. We have talked about validating the weights against the course description, but nobody has had the time.

The README is out of date more often than it is up to date. Sorry.

## Tips and tricks

When you work on the grade code, keep a calculator open and check at least one result by hand. It sounds old
fashioned, but it has caught more bugs than any tool we have.

When you write a test for a date, write the date out in full. A test that says "in three days" is a test that
fails on the last day of the month.

When you are stuck, explain the problem to somebody else, or to Copilot. Half of the time you will find the answer
while you are still typing the question.

When a review comment makes you angry, wait an hour before you answer it. It is almost always a misunderstanding.

## Glossary

**Final grade:** the weighted average of every graded item in a course, rounded as described in the Grades
section.

**Exam grade:** the grade of the final exam on its own, on the same 1-10 scale.

**Weight:** how much one graded item counts towards the final grade. Weights are relative: 60 and 40 mean the same
as 3 and 2.

**Upcoming:** due within the next seven days, today included, and not overdue.

**Overdue:** due before today.

## Changes to this file

2023-10: first version (Ana).
2024-03: added the Grades section after the rounding bug (Radu).
2024-09: added the pass rule from Professor Ionescu's assistant (Mihai).
2025-02: moved to ES modules; updated the Code style section (Ana).
2025-06: added Grade appeals after the three-answers incident (Ioana).
2025-11: added the Boundaries section (Radu).
2026-02: rewrote the intro for Copilot (Mihai).
2026-05: added the Tests section; added the FAQ (Ana).
2026-09: added the Glossary (Ioana).
2026-10: added Our values, A note about Copilot, Known issues and Tips and tricks (Radu).

## Contact

Questions about the code: the team chat, channel #studybuddy-dev. Questions about the grade rules: Professor
Ionescu's teaching assistant, by email, never by chat. Questions about this file: anybody on the team, because
everybody owns it.

## Final notes

If you made it this far: thank you. Please remember that this file is read before every single answer, so every
line in it matters. If you add something, add it to the right section, and check that it doesn't contradict
anything above.
