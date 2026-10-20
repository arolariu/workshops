# Harness review: StudyBuddy's harness, rolled out to CampusHub

Reviewed by the harness owner (see `HARNESS.md`) on 6 November 2026, after the week-45 rollout.
Scorecard today: **StudyBuddy L5 Governed** · **CampusHub L4 Guarded** (`node scripts/harness-check.mjs`; CampusHub
with `scanHarness('campushub')`).

## L5 evidence
- **One owned system:** `HARNESS.md` names the owner, the layers, the threat model, the budget and the rollback
  runbook; `.github/CODEOWNERS` gives every harness path an owner.
- **Change control:** `.github/workflows/harness-ci.yml` gates every harness pull request (scorecard, attack pack,
  self-tests, eval self-test); `harness.json` and `CHANGELOG.md` version it; `scripts/release.mjs` packages it.
- **Measured:** `evals/cases.json` (8 cases) against `evals/baseline.json`; `attacks/pack.json` plus
  `attacks.local.json`: 48 attacks denied, 0 false positives.
- **Distributed, not copied:** CampusHub installs `dist/apm` through `campushub/apm.yml`; `campushub/apm.lock.yaml`
  hashes every installed file. The checks prove each one hashes to the lock and equals its file in the package, that
  the package names this harness and holds only its files, and that CampusHub runs this harness's guard.
- **Layered:** `campushub/.github/hooks/policies/org.json` over `campushub/.github/hooks/policies/repo.json`; the
  organisation's force-push deny beats CampusHub's own override.
- **Portable, on the record:** `PORTABILITY.md` (4 of 6 families and 1 of 8 eval cases transferred as they were; a
  false positive fixed upstream in 1.0.1); `campushub/evals/cases.json` holds CampusHub's own versions.
- **Accountable:** `scripts/report.mjs` merges both repositories' logs: 7 sessions, 21 calls, 9 denied, 10 premium
  requests in week 45; the riskiest session tried three ways to read CampusHub's key, and all three were denied.

## Remaining risks
- A deny-list can't close the approval gate. `.approvals/` and `tickets/tickets.json` sit on the agent's own disk,
  and the policy stops only the spellings it lists: a review found `node -pe`, `import('./tickets/approve.mjs')` and
  PowerShell's `copy` getting through before we added them, and a script the agent writes and then runs still does.
  The real fix is next step 2.
- `npm start` and `npm restart` are denied, but any command that reads `.env.campushub` without naming it slips past.
- StudyBuddy-only skills (`ects-grades`, `release-checklist`) are installed in CampusHub and can be picked for the
  wrong job; `testing.instructions.md` never applies to CampusHub's `*.test.mjs`.
- CampusHub's eval suite has only been planned (`--dry-run`), never run: its cases have no baseline yet.
- The organisation layer lives in CampusHub's repository; a real organisation would install it machine-wide, where a
  repository can't change it.
- Installed files under `.agents/skills/` aren't protected by the guard: only the lock check notices an edit.

## Next steps
1. Split the package: an organisation baseline (guard, reviewer, policy engine) and a StudyBuddy package, so each
   team installs only what applies; publish both from their own repository with tags instead of `../dist/apm`.
2. Move approvals off the agent's disk: the tracker's API with the approver's own credentials, which the agent's
   machine never holds. Until then, keep `.approvals/` and `tickets/` out of the agent's sandbox.
3. Record 3 runs of CampusHub's suite within a 675-credit budget, save its baseline, and add the eval step to a
   CampusHub CI gate: with a `HARNESS.md` there, CampusHub reaches L5.
4. Run `scripts/report.mjs` every week on both repositories, and review any session with two or more denials.
