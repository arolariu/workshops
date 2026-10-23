# AGENTS.md · packages/planner

Study plans from the deadlines. The root `AGENTS.md` applies here too: these rules come on top of it.

## Commands
- Run this package's tests: `npm test` (in `packages/planner`)

## Rules
- A plan skips assignments that are done.
- `studyPlan()` starts an assignment 2 days before it is due, or today if that is sooner.
- A plan never calls `new Date()` without an argument: `today` comes in as a parameter.
- In this package, also end every answer with the line: `Harness check: planner rules loaded`
