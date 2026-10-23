# JSDoc comments and code comments

## JSDoc

Every exported function has a JSDoc block. It is read by people and by editors (hover help), so it must be exact.

1. The first sentence says what the function returns, not how: "Weighted average of graded items, rounded to 2
   decimals."
2. One `@param` per parameter, with its type in braces and its meaning: `@param {{ grade: number, weight: number }[]}
   items - weights are percentages or relative weights`.
3. One `@returns` with the type, and the unit or range when there is one (`a value between 0 and 100`).
4. Document every error the function throws on purpose: `@throws {RangeError} when items is empty`.
5. Add `@example` for anything that isn't obvious, with the output in a comment.
6. Never document what the code doesn't do. If the code and the comment disagree, the code wins: say so to the user.

## Code comments

1. Comment why, not what: the code already says what it does.
2. Keep a comment next to the line it explains, and delete comments that no longer match the code.
3. A `TODO:` comment names who or what it waits for.
