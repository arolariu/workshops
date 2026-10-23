The patch does what the plan says and nothing else, and the test report is green.

```json
{
  "decision": "approve",
  "findings": [
    {
      "severity": "low",
      "location": "deadlines.js:14",
      "problem": "daysBetween() parses each date twice: once to check it and once to count.",
      "suggestion": "Keep the parsed values from the check and reuse them."
    }
  ]
}
```
