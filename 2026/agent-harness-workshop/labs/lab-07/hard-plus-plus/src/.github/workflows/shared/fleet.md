---
description: Shared settings for every agentic workflow in the StudyBuddy fleet
# A shared component: no `on:`, so gh aw never compiles it on its own. Workflows bring it in with
#   imports:
#     - shared/fleet.md
# TODO(M1): what the whole fleet shares: the network, and who may be mentioned (safe-outputs)
# TODO(M3): fleet defaults, if you want them (max-turns, budgets): a workflow's own value wins
# TODO(M4): which failures become issues (safe-outputs.report-failure-as-issue)
---

## Fleet rules

<!-- TODO(M4): rules every agent in the fleet follows, including what to do when there's nothing to do -->
