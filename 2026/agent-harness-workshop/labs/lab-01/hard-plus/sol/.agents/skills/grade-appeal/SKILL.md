---
name: grade-appeal
description: Re-check a final grade when a student appeals it - recompute the weighted average, apply the exam rule and draft a reply for the professor. Use when someone asks to appeal, re-check or explain a final grade.
---
# Grade appeal

A student thinks their final grade is wrong. It is stressful for them: be kind, be precise, and follow these steps
in order. (Three of us once gave one student three different answers; the steps are how we avoid that.)

1. Ask for the student's id, the course and the grade they dispute.
2. Find the grades on file for every graded item of that course, with their weights.
3. Recompute the final grade with `weightedAverage()` from the grades on file.
4. Check the exam grade on its own: below 5 means the course is failed, whatever the final grade.
5. Compare your result with the grade the student received, to 2 decimals.
6. If they differ, write down which item or weight explains the difference.
7. Never change a grade on file yourself: only the course's professor can do that.
8. Draft a reply that shows the calculation step by step, in plain language.
9. Send the draft to the professor, not to the student.
10. Log the appeal in the team's appeals spreadsheet with the date, the course and the outcome.
