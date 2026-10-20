---
name: campushub-release
description: Prepares a CampusHub release from its release ticket (scope check, version, changelog, tests, deploy dry run) and stops where a human must act. Use when asked to release, ship or cut a version of CampusHub.
---
# Releasing CampusHub

CampusHub's process is in `README.md` (Releasing). You prepare the release; a release approver deploys it.

1. **Check the scope first.** Find the release ticket (`list_tickets` with the label `release`, e.g. CH-108), then run
   `node .github/skills/campushub-release/scope.mjs <ticket>`. Exit 1 means tickets in scope aren't `done`: stop, and
   report the blockers with their status and assignee. Don't release around them.
2. **Version and notes.** Propose the next version (semver) and move the Unreleased notes in `CHANGELOG.md` under it
   with today's date. `package.json` changes only through a reviewed pull request (the guard denies editing it): ask
   the human to bump `version` there.
3. **Tests.** `npm test` must be green (55 tests or more).
4. **Deploy dry run.** Run `./deploy.sh --dry-run` and put its plan in your answer for the release ticket.
5. **Stop for the approver.** Never run `npm run deploy` or `./deploy.sh` without `--dry-run`: a release approver
   (never the author) deploys from the release runner. Say so, and say what you prepared.
6. **After the deploy.** Tag `campushub-vX.Y.Z`. Closing the release ticket and the tickets it shipped needs an
   approval: call `close_ticket` once a human has run `node tickets/approve.mjs <ticket> --as <name>`.

Never put an API key (`chk_live_…`, `chk_test_…`) in the changelog, a ticket or a command.
