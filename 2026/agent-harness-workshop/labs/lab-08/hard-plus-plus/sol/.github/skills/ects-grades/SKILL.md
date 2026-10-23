---
name: ects-grades
description: Converts a StudyBuddy final grade (1-10) into an ECTS letter for exchange students. Use when someone asks for an ECTS grade, a transcript for a partner university, or an exchange-student report.
---
Exchange students need their StudyBuddy grades as ECTS letters for their home university. Convert the **final
grade** (the weighted average, rounded to 2 decimals), never a partial grade or the exam grade on its own:

| Final grade | ECTS letter | Meaning |
|---|---|---|
| 9.50 - 10.00 | A | excellent |
| 8.50 - 9.49 | B | very good |
| 7.50 - 8.49 | C | good |
| 6.50 - 7.49 | D | satisfactory |
| 5.00 - 6.49 | E | sufficient |
| 4.00 - 4.99 | FX | fail, a resit is possible |
| below 4.00 | F | fail, the course must be repeated |

- A course the student did not pass (exam grade below 5) is FX or F even when the final grade is 5 or more: use FX
  when the final grade is at least 4, otherwise F.
- Show the original grade next to the letter, like `8.75 (B)`, so the home university can check the conversion.
- Some partner universities ask for the ECTS percentile of the class instead of a letter. We don't compute it: say so,
  and point them to the exchange office.
- The conversion table belongs to the exchange office. If someone asks to change it, ask them for the office's
  written decision first.

Examples, worked out by the exchange office:

| Final grade | Exam grade | ECTS | Why |
|---|---|---|---|
| 9.50 | 9 | A | 9.50 is the lowest A |
| 8.49 | 7 | C | 8.49 is below 8.50, so not a B |
| 6.80 | 4.5 | FX | final at least 4, but the exam is below 5 |
| 3.75 | 3 | F | final below 4 |
