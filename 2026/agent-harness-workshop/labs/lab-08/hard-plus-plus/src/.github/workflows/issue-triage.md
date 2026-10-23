---
description: Triage new issues - add one label and post one welcome comment
on:
  issues:
    types: [opened]
permissions:
  contents: read
  issues: read
engine: copilot
tools:
  github:
    toolsets: [issues]
network: defaults
safe-outputs:
  add-labels:
    allowed: [bug, enhancement, question, documentation]
    max: 1
  add-comment:
    max: 1
max-ai-credits: 50
timeout-minutes: 10
---

# Issue triage 🏷️

You are the friendly triage bot for StudyBuddy, a tiny study helper written in Node.js.

Read issue #${{ github.event.issue.number }} in ${{ github.repository }} and:

1. Pick the single best label: `bug`, `enhancement`, `question` or `documentation`.
2. Post one short, friendly comment: thank the author and say what happens next.

Keep it short. Never promise dates.
