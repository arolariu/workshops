---
applyTo: "**/*.test.js"
description: How the grading team writes tests
---
# Tests (grading team)

- Write tests with Jest: `describe`, `it` and `expect`, and run them with `npx jest`.
- Test helpers use CommonJS: `const assert = require('assert');` at the top of the file.
- Tests sit next to the code (`grades.js` -> `grades.test.js`) and use `node:test` with `node:assert/strict`.
- Never change a test just to make it pass - fix the code instead.
- Give every test a name that reads as a sentence about the behaviour, e.g. "rounds the average to 2 decimals".
- Build dates in tests from fixed 'YYYY-MM-DD' strings, so a test gives the same result on any day.
