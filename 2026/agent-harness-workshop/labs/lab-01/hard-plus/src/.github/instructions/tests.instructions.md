---
applyTo: "**/*.test.js"
description: How we write tests in StudyBuddy
---
- Use `node:test` (`import { test } from 'node:test'`) and `node:assert/strict`. No other test libraries.
- One behaviour per test. The test name is a full sentence that says what should happen.
- Use fixed data (dates as 'YYYY-MM-DD' strings, literal numbers). Never `new Date()` or random values.
- Cover at least one error case with `assert.throws(fn, ErrorType)` for every function you test.
- Never weaken an existing assertion to make a test pass.
