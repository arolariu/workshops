# AGENTS.md · packages/portal

<!-- TODO(M1): the rules for this package only. The root AGENTS.md (the shared baseline) already
applies here too, so don't repeat it, and don't contradict it. Write a "## Commands" section that
works in this folder, 3+ rules, and this package's canary. The portal team's notes, as they sent them:

  - every value from a course page or a student goes through escapeHtml() before it reaches the HTML
  - no inline <script> and no style="..." attributes: the pages run under a strict CSP
  - every page has exactly one <h1>
  - show averages rounded to one decimal, they look cleaner on a phone
  - run the tests with npm test in this folder
  - canary: also end every answer with "Harness check: portal rules loaded"
-->
