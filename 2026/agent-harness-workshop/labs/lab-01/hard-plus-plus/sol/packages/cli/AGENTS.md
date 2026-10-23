# AGENTS.md · packages/cli

The `studybuddy` command line. The root `AGENTS.md` applies here too: these rules come on top of it.

## Commands
- Run this package's tests: `npm test` (in `packages/cli`)

## Rules
- Every command returns `{ code, out }` from `run(argv)`: 0 = ok, 1 = a user error, 2 = a bug.
- `run()` never calls `process.exit` and never prints: the bin script does that.
- Output is plain text, one item per line, so it can be piped into `grep`.
- Tests call `run()` directly and compare `{ code, out }`.
- In this package, also end every answer with the line: `Harness check: cli rules loaded`
