---
description: Every Monday, one issue that sums up last week - new issues, pull requests, and what the bots did
on:
  schedule: weekly on monday
  workflow_dispatch:
permissions:
  contents: read
  issues: read
  pull-requests: read
engine: copilot
imports:
  - shared/fleet.md
tools:
  github:
    toolsets: [issues, pull_requests]
    min-integrity: approved
safe-outputs:
  create-issue:
    title-prefix: "[weekly] "
    labels: [report]
    max: 1
    close-older-issues: true
    expires: 14
concurrency:
  group: "fleet-weekly-report"
  cancel-in-progress: false
max-ai-credits: 150
max-daily-ai-credits: 200
max-turns: 40
timeout-minutes: 15
---

# Weekly report 📊

Write the weekly report for ${{ github.repository }}: one issue that covers the last 7 days.

1. New issues: how many, and which labels the triage bot gave them.
2. Pull requests: opened, merged and still open, with the reviewer's verdict on each.
3. What the bots did: the questions the assistant answered, and the issues it flagged `needs-maintainer`.
4. What needs a human this week, as a short list.

Use counts and links to issues and pull requests; don't quote what people outside the project wrote. If nothing
happened this week, call `noop` instead of creating an issue.
