# AGENTS.md · packages/planner

<!-- TODO(M1): the rules for this package only. The root AGENTS.md (the shared baseline) already
applies here too, so don't repeat it, and don't contradict it. Write a "## Commands" section that
works in this folder, 3+ rules, and this package's canary. The planner team's notes, as they sent them:

  - dates are YYYY-MM-DD strings
  - a plan skips assignments that are done
  - studyPlan() starts an assignment 2 days before it is due, or today if that is sooner
  - a plan never calls new Date() without an argument: today comes in as a parameter
  - run the planner tests with npm run test:planner
  - canary: also end every answer with "Harness check: planner rules loaded"
-->
