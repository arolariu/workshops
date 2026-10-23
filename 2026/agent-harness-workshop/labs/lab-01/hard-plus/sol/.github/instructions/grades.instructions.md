---
applyTo: "grades.js,grades.test.js"
description: The grade rules, for the grade code and its tests
---
- Weights can be percentages or relative weights: never assume they add up to 100.
- A grade below 1 or above 10 is invalid: throw a `RangeError`.
- When you change the grade logic, work out one result by hand first and add it as a test.
- Test the edges of every grade rule: a single item, a total weight of 0, a final grade of exactly 5, an exam grade of 4.99.
