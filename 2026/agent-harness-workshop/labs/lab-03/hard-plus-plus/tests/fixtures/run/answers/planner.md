I read BUGS.md, deadlines.js and deadlines.test.js. Three bugs, all in deadlines.js; the red tests already prove them.

```json
{
  "goal": "Fix the three bugs in BUGS.md so that the red tests in deadlines.test.js pass",
  "files": ["deadlines.js"],
  "steps": [
    { "id": "S1", "file": "deadlines.js", "change": "upcoming() leaves out assignments that are already done" },
    { "id": "S2", "file": "deadlines.js", "change": "today() formats the local date instead of the UTC date" },
    { "id": "S3", "file": "deadlines.js", "change": "daysBetween() throws a RangeError for a date that is not a real YYYY-MM-DD" }
  ],
  "tests": ["npm test"]
}
```
