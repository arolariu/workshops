# Changelog

Every change to StudyBuddy's agent harness. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the harness uses [Semantic Versioning](https://semver.org/): a major version for a change that can break a
team's work (a removed rule, a stricter guard), a minor one for a new layer or rule, a patch for a fix or a rollback.
`scripts/release.mjs` moves the Unreleased notes under the new version and tags it `v<version>`.

## [Unreleased]
### Added
- A CI gate for harness changes (`.github/workflows/harness-ci.yml`): the scorecard, the attack pack, the
  self-tests and the eval self-test on every pull request; real evals when someone adds the `run-evals` label, and
  on `main`.
- Code owners for every harness path, and a pull-request template with the harness checklist.
- `scripts/release.mjs`: a version, this changelog, a plugin (`dist/plugin/`) and an APM package (`dist/apm/`).
- An AI review of harness pull requests with the reviewer agent (`.github/workflows/harness-review.md`).
- A rollback runbook in `HARNESS.md`, and `scripts/rollback.mjs`.

## [1.0.0] - 2026-10-20
### Added
- The harness from Labs 00–08: `AGENTS.md` and the testing instructions, the read-only reviewer, the `new-module`,
  `ects-grades` and `release-checklist` skills, the portal MCP server, the guard hook with twelve rules, the APM
  manifest, issue triage in CI, `HARNESS.md`, the attack pack and the eval suite with its baseline.
