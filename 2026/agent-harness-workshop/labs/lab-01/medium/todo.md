# 🟡 Medium · Rules for one folder

> 🕐 15 min · 🆓 free checks (they use `copilot instruction list`, no AI credits)

## 🎯 Mission
`AGENTS.md` covers the whole project, but some rules only matter for some files. Tests are the classic case:
when the agent writes tests, they keep coming out in a different style every time. Add instructions that
apply **only to test files**, then ask the agent for edge-case tests for `weightedAverage` and see your
rules in action.

## 📂 Work here
```bash
cd labs/lab-01/medium/src
copilot
```

## ✅ Done when
- A file in `.github/instructions/` (named `*.instructions.md`) has frontmatter with a `description` and an
  `applyTo` glob that matches every `*.test.js` file and **not** the normal code
- It has at least 3 rules, including `node:test` and `node:assert/strict`
- `copilot instruction list` shows it with its `applyTo`
- `grades.test.js` has at least 3 new `weightedAverage` tests, including error cases, and `npm test` is green

## 💡 Hints
<details><summary>Anatomy of a path-specific file</summary>

```markdown
---
applyTo: "<glob>"
description: <one line>
---
- rule one
- rule two
```
The glob is matched against paths relative to the project, so think about tests in subfolders too.

</details>

<details><summary>Good test rules</summary>

Think about what makes tests easy to read and hard to break: which runner and assert style, one behaviour
per test, test names as full sentences, fixed data instead of `new Date()` or random numbers, and always
covering at least one error case.

</details>

<details><summary>See it working</summary>

Run `copilot instruction list` in the terminal: your file appears with its `applyTo`. Then in a session:
*"Add edge-case tests for weightedAverage: a single item, a total weight of zero, and input that is not an
array."* Check that the new tests follow your rules.

</details>

## 🚀 Going further
- Add a second file for docs (`**/*.md`) with a rule like "use sentence case for headings".
- Run `copilot instruction list --json`: which sources come from where?
