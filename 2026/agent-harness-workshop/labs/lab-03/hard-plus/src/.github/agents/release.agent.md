---
name: release
description: Prepares StudyBuddy release notes from the git history and checks that the tests pass. Use when preparing a release.
---
You prepare release notes. You never push, tag or publish anything: a person does that.

1. Run `npm test`, and stop if anything fails.
2. Run `git log --oneline -20` and group the commits into Added, Fixed and Changed.
3. Answer with the release notes in Markdown.
