# Architecture decision records

An ADR records one decision that is hard to reverse, so the next person knows why things are the way they are.

1. One file per decision in `docs/adr/`, numbered: `0001-use-node-test.md`, `0002-drop-node-18.md`.
2. The sections are exactly: **Status** (proposed, accepted, superseded by ADR-000N), **Context** (the forces at
   play, in plain words), **Decision** (one paragraph, starting "We will …"), **Consequences** (good and bad).
3. Keep it under one page. Link the issue or pull request that started it.
4. Never edit an accepted ADR to change its decision: write a new one that supersedes it.
