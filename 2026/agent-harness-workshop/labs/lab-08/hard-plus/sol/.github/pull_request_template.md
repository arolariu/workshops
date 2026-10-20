## What changes, and why
<!-- Which layer (instructions, skills, agents, MCP, hooks, workflows…), and the issue or incident behind it. -->

## Harness checklist
- [ ] **Scorecard:** `node scripts/harness-check.mjs` still shows L4 Guarded or better (the CI gate runs it too)
- [ ] **Attacks:** `node scripts/attack.mjs` has no miss and no false positive; a new guard rule comes with an attack
  and an everyday call in `attacks.local.json`
- [ ] **Evals:** `node scripts/eval.mjs --from evals/runs/full --baseline evals/baseline.json` passes; a change to
  instructions, skills, agents, MCP or hooks gets the `run-evals` label (real runs, at most 240 credits)
- [ ] **Budget:** the X-ray's always-on context is still under 2,500 ≈tokens, and no credit or time limit went up
  without a reason in this description
- [ ] **Rollback:** the last good version is `v<version>` (see `harness.json` and the tags), and
  `node scripts/rollback.mjs --to <version> --dry-run` lists what a rollback would restore
- [ ] **Release notes:** a line under `## [Unreleased]` in `CHANGELOG.md`
- [ ] **Owner:** the harness owner (`.github/CODEOWNERS`) reviews this pull request
