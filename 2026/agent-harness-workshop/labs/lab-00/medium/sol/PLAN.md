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
Reference sample only: this section shows what an authentic learner rewind entry could contain. It is not evidence
that this reference run performed the interaction: "Rewrite gpa() as a one-liner..." could be checked in `/diff`,
undone with `/rewind`, and confirmed with `npm test`.

## Live steps
- [ ] `/plan` live evidence not fabricated.
- [ ] `/diff` live evidence not fabricated.
- [ ] `/rewind` live evidence not fabricated.
- [ ] `/usage` live evidence not fabricated.

## Automated checks
- [x] Free checks run locally; these checks cover code and artifacts, not the live-interaction evidence above.

## Usage
| Run        | AI credits | Input tokens | Output tokens |
|------------|-----------:|-------------:|--------------:|
| plan-first | N/A - live run not performed | N/A | N/A |
| direct     | N/A - live run not performed | N/A | N/A |

No usage claim is made: no live run was performed for this reference artifact, so no authentic numbers were
fabricated. This reference passes the artifact and code checks while the live interaction remains explicitly unclaimed.
