# Review of deadlines.js (by the reviewer agent)

| Severity | Location | Problem | Suggestion |
|---|---|---|---|
| 🔴 high | `deadlines.js:23` | `upcoming()` also returns assignments that are already `done`. | Filter out `a.done` before checking the window. |
| 🟡 medium | `deadlines.js:7` | `today()` uses `toISOString()`, which is UTC: around midnight it returns the wrong day in Romania. | Build the date from local `getFullYear()`, `getMonth()` and `getDate()`. |
| 🟢 low | `deadlines.js:12` | `daysBetween()` returns `NaN` for invalid dates, so bad data silently disappears from `upcoming()`. | Validate the YYYY-MM-DD format and throw a `RangeError`. |

VERDICT: ISSUES
