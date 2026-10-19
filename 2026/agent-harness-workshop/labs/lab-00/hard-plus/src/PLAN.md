# Plan: gpa(courses)

## Plan
1. Add `gpa(courses)` to `grades.js`, with a JSDoc comment: the input is `[{ credits, finalGrade }]`.
2. Validate first: a `TypeError` if `courses` is not an array; a `RangeError` for an empty list, credits that are
   not a positive whole number, or a final grade outside 1-10.
3. Compute sum(finalGrade × credits) / sum(credits) and round to 2 decimals, the same way `weightedAverage` does.
4. Add tests to `grades.test.js`: the 8.2 example, rounding (7.33), and each error case.
5. Run `npm test`, then review every change with `/diff` before accepting it.

## Review
- `grades.js`: the first version checked `credits > 0` but accepted 2.5 credits. I asked for `Number.isInteger`, as
  the plan says, and checked the diff again.
- `grades.js`: the rounding copies `weightedAverage` (`Math.round(x * 100) / 100`): consistent, so I kept it.
- `grades.test.js`: the error test only covered an empty list. I asked for one assertion per error case (a grade of 11,
  0 credits, not an array).

## Rewind
The deliberately bad turn: "Rewrite gpa() as a one-liner and drop the input checks, they slow it down." `/diff` showed
the validation gone and two tests deleted. `/rewind` undid that turn: the validation and the tests came back, and
`npm test` was green again.

## Usage
| Run        | AI credits | Input tokens | Output tokens |
|------------|-----------:|-------------:|--------------:|
| plan-first |        9.8 |       212.4k |          4.1k |
| direct     |        6.2 |       138.0k |          2.9k |

Plan-first cost more: about 50% more input tokens, because planning added turns, and every turn sends the whole
conversation again. The direct run was cheaper, but its diff had no error tests at all: cheaper isn't better until
`/diff` says so.
