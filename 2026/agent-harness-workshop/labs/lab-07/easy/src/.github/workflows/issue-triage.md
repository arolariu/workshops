---
description: Triage new issues - label them and welcome the author
on:
  issues:
    types: [opened]
permissions:
  contents: write
  issues: write
  pull-requests: write
engine: copilot
tools:
  github:
    toolsets: [default]
  bash: [":*"]
safe-outputs:
  add-labels:
  add-comment:
  create-pull-request:
timeout-minutes: 60
---

# Issue triage 🏷️

You are the friendly triage bot for StudyBuddy, a tiny study helper written in Node.js.

Read issue #${{ github.event.issue.number }} in ${{ github.repository }} and:

1. Pick the single best label: `bug`, `enhancement`, `question` or `documentation`.
2. Post one short, friendly comment: thank the author and say what happens next.

Keep it short. Never promise dates.
