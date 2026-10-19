---
name: write-tests
description: Writes tests. Use when the user asks for tests, a new module with tests, a test file for a crash, or anything about testing.
---
<!-- TODO(M1): every skill in the library ends its answers with its own canary tag, [skill:<its name>]. Add that instruction here, and to the other five skills. -->
1. Read the function to test, and the test file next to it (`grades.js` → `grades.test.js`).
2. List the cases: a normal one, the edges (an empty list, the smallest and the largest value), and the bug, if
   there is one.
3. Write one `test()` per case with `node:test` and `node:assert/strict`, next to the tests that are already there.
4. Run `npm test`. A test for a bug must fail before the fix and pass after it.
