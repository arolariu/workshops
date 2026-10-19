# Bugs found by the test-writer

## upcoming() includes assignments that are already done
- **Steps:** call `upcoming()` with a list that contains an item with `done: true` that is due inside the window.
- **Expected:** finished assignments are left out (`['A2', 'A1']`).
- **Actual:** the finished assignment is included (`['A4', 'A2', 'A1']`).
- **Failing test:** "upcoming leaves out assignments that are already done" in `deadlines.test.js`.
