---
applyTo: "deadlines.js,deadlines.test.js"
description: The deadline rules, for the deadline code and its tests
---
- Never call `new Date()` without an argument in `deadlines.js`: pass `now` in, so the tests stay deterministic.
- An overdue assignment is never "upcoming".
