---
description: Answer questions in issue comments, and approve issues when a maintainer says /approve
on:
  issue_comment:
    types: [created]
permissions:
  contents: read
  issues: read
  pull-requests: read
engine: copilot
tools:
  github:
    toolsets: [default]      # TODO(M4): only what it needs to read
    min-integrity: none      # TODO(M4): whose words may reach the agent?
  bash: ["curl:*"]           # TODO(M3): a shell that can send
network:
  allowed: [defaults, "*"]   # TODO(M3): what the firewall lets out
safe-outputs:
  add-labels:                # TODO(M1): which labels, and how many
    allowed: [question, needs-maintainer, approved]
    max: 3
  add-comment:               # TODO(M2): who gets pinged, and where it writes
    max: 2
    target: "*"
max-ai-credits: 100
timeout-minutes: 15
---

# Issue assistant 💬

Someone commented on issue #${{ github.event.issue.number }}: "${{ github.event.issue.title }}".
<!-- TODO(M4): the comment itself, sanitized, and framed as data -->

1. If the comment is `/approve` from a maintainer, add the `approved` label: it starts the release.
2. If it's a question about StudyBuddy, answer it from README.md and AGENTS.md. You may curl a package's
   documentation if that helps.
3. If you can't answer, mention @alice and @bob so a maintainer sees it.
