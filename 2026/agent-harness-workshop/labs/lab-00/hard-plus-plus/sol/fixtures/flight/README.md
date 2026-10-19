# Recorded runs: one prompt, three runs

Three runs of the same prompt, recorded by the course's own agent checks (Lab 05 hard+, Copilot CLI 1.0.99-2,
`gpt-6.1-sol`, 19 Oct 2026) and trimmed: the startup events and the streaming pieces are gone, long fields are
shortened, and local paths are anonymised. Event names and fields are exactly what `copilot -p … --output-format json`
prints.

| Run | Where it comes from | Commit |
|---|---|---|
| `run-1` | a real run | `7fcee81` |
| `run-2` | a real run, one commit later (the policy's deny reason changed in between) | `2e56d97` |
| `run-3` | derived from `run-2`: the same setup, a shorter path (inspect, delete, answer), with its tokens scaled to three model calls | `2e56d97` |

The recordings were made before the flight recorder existed, so `meta.json` was written afterwards from what the
agent-check runner logged (`labs/.runs/<run>/suite.json`): the command line, the start time, the commit of the
workshop repository at that moment.

So these runs are honestly **not one setup**: run 1 ran on an older commit. Runs 2 and 3 are.
