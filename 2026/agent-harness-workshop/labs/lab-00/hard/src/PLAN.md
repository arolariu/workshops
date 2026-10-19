# Plan: gpa(courses)

1. Add `gpa(courses)` to `grades.js` with a JSDoc comment: input `[{ credits, finalGrade }]`.
2. Validate: `TypeError` if not an array; `RangeError` for an empty list, credits that are not a positive
   whole number, or a final grade outside 1-10.
3. Compute sum(finalGrade × credits) / sum(credits) and round to 2 decimals (same rounding as weightedAverage).
4. Add tests in `grades.test.js`: the 8.2 example, rounding (7.33), and each error case.
5. Run `npm test` and review the diff with `/diff`.
