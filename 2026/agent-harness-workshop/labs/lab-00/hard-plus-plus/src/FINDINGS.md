# Findings: why the build is red

- **Failing test:** "hasPassed is false when the exam grade is below 5, even with a good final grade" (`grades.test.js`).
- **Where:** `hasPassed()` in `grades.js` only checks `finalGrade >= 5`.
- **Why:** the course rule says you pass only if the final grade is at least 5 **and** the exam grade is at least 5.
  The code forgets the exam part, so a student with a final grade of 7.5 and an exam grade of 4 "passes".
- **Fix (for Lab 01):** `return finalGrade >= 5 && examGrade >= 5;`
