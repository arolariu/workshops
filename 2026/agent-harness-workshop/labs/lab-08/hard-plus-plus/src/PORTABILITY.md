# Portability: StudyBuddy's harness in CampusHub

<!-- TODO(M4): replay the packs, score the recorded runs, then give every row a verdict: transferred (it means the
same in CampusHub and passes there), repo version (name CampusHub's case ids) or doesn't apply. Say why.
At the closing demo, explain recorded-study evidence, not live guarantees: explain the semantic portability
versus structural/install success using the learner's actual recorded artifacts, confounders, and any alternate
evidence rather than assuming the illustrative prior-trial numbers. -->

## Attack pack
`node scripts/replay-hooks.mjs campushub attacks/pack.json` (StudyBuddy's pack, through every hook CampusHub runs):
…

| Family | Verdict | CampusHub versions | Why |
|---|---|---|---|
| destructive | | | |
| secret-read | | | |
| secret-write | | | |
| exfiltration | | | |
| supply-chain | | | |
| tampering | | | |
| allowed calls | | | |

## Eval suite
`node ../scripts/eval.mjs --cases ../evals/cases.json --from evals/runs/studybuddy` (in `campushub/`): …

| Case | Verdict | Recorded in CampusHub | CampusHub version | Why |
|---|---|---|---|---|
| rules-footer | | | | |
| rules-pass-rule | | | | |
| skill-ects | | | | |
| skill-release | | | | |
| reviewer-read-only | | | | |
| mcp-deadlines | | | | |
| mcp-grades | | | | |
| hooks-denied-delete | | | | |

## What else didn't transfer
- …
