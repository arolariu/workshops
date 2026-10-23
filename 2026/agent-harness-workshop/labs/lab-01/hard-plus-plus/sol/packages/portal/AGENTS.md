# AGENTS.md · packages/portal

The HTML pages students see. The root `AGENTS.md` applies here too: these rules come on top of it.

## Commands
- Run this package's tests: `npm test` (in `packages/portal`)

## Rules
- Every value from a course page or a student goes through `escapeHtml()` before it reaches the HTML.
- No inline `<script>` and no `style="..."` attributes: the pages run under a strict Content Security Policy.
- Every page has exactly one `<h1>`.
- Show grades with `toFixed(2)`, like everywhere else in StudyBuddy.
- In this package, also end every answer with the line: `Harness check: portal rules loaded`
