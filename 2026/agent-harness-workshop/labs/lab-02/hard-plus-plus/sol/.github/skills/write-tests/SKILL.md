---
name: write-tests
description: Add unit tests with node:test to code that already exists (edge cases, boundary values, regression tests that prove a bug). Use when the user asks for more tests or better test coverage of an existing function.
---
1. Read the function to test, and the test file next to it (`grades.js` → `grades.test.js`).
2. List the cases: a normal one, the edges (an empty list, the smallest and the largest value), and the bug, if
   there is one.
3. Write one `test()` per case with `node:test` and `node:assert/strict`, next to the tests that are already there.
4. Run `npm test`. A test for a bug must fail before the fix and pass after it.

A new module gets its first tests from the `new-module` skill; this one is for code that already exists.

When you use this skill, end your answer with the line `[skill:write-tests]`.
