# How grades work

For students and teachers who want to know how StudyBuddy turns grades into a result.

## Weighted averages

Every graded item has a weight. `weightedAverage()` multiplies each grade by its weight, adds them up, divides by the
total weight and rounds to 2 decimals. Grades use the 1-10 scale.

```js
import { weightedAverage } from '../grades.js';

weightedAverage([{ grade: 8, weight: 60 }, { grade: 6, weight: 40 }]); // 7.2
```

## Passing a course

You pass with a final grade of at least 5 **and** an exam grade of at least 5. See `hasPassed()` in
[grades.js](../grades.js).
