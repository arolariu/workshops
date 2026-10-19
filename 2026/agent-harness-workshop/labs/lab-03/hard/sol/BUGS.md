# Bugs found by the test-writer

One report per finding in `REVIEW.md`. Each red test proves its bug; none of the bugs is fixed here.

## upcoming() includes assignments that are already done
- **Finding:** 🔴 high · `deadlines.js:23`
- **Steps:** call `upcoming()` with a list that contains an item with `done: true` that is due inside the window.
- **Expected:** finished assignments are left out (`['A2', 'A1']`).
- **Actual:** the finished assignment is included (`['A4', 'A2', 'A1']`).
- **Failing test:** "upcoming leaves out assignments that are already done" in `deadlines.test.js`.

## today() returns the UTC date instead of the local one
- **Finding:** 🟡 medium · `deadlines.js:7`
- **Steps:** in Europe/Bucharest, call `today(new Date('2026-10-19T21:30:00Z'))`: 00:30 local time on 20 October.
- **Expected:** `'2026-10-20'`, the local date.
- **Actual:** `'2026-10-19'`, because `toISOString()` is UTC.
- **Failing test:** "today gives the local date, not the UTC date, just after midnight" in `deadlines.test.js`.

## daysBetween() returns NaN for invalid dates
- **Finding:** 🟢 low · `deadlines.js:12`
- **Steps:** call `daysBetween('2026-10-15', 'next friday')`, or `daysBetween('2026-02-30', '2026-10-20')`.
- **Expected:** a `RangeError` that names the bad date.
- **Actual:** `NaN` (or a count for 2 March), so `upcoming()` silently drops or misplaces the assignment.
- **Failing test:** "daysBetween throws a RangeError for a date that is not a real YYYY-MM-DD" in `deadlines.test.js`.
