# AGENTS.md - jobs/

The nightly digest for Facilities: tomorrow's bookings and events, per room.
Owner: Data team, radu.matei. He reviews every change here.

## Commands
- Tests: `npm run test:jobs` (from the repository root)
- Try it: `npm run digest -- --date 2026-11-03` (a day of the demo week; prints, writes nothing)

## Conventions
- `buildDigest()` is pure; `renderDigest()` turns it into text.
- The CLI's `main(argv, io)` takes the clock, the console and the files as arguments, so tests never touch the
  real ones.
- Try every change with `--dry-run` first.

## Boundaries
- Never send mail or call the mail relay: the digest is printed or written to `jobs/out/` only.
- Never read the real clock or the real files in a test: inject them through `io`.
- Never re-run the job to "retry" a send (CH-107: the mail goes out twice).
