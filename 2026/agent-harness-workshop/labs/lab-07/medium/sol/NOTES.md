# Which changes need a recompile?

One row per change I made in this level: where it lives, and whether it needs `gh aw compile`.

| Change | Frontmatter or body? | Recompile? |
|---|---|---|
| Ask bug reporters for their OS and Node.js version | body | no |
| Allow the `good first issue` label | frontmatter (`safe-outputs.add-labels.allowed`) | yes |
| A daily sweep: `schedule: daily`, plus `workflow_dispatch` | frontmatter (`on`) | yes |
| Let a scheduled run label the issue it picks (`target: "*"`) | frontmatter (`safe-outputs`) | yes |
| A daily budget: `max-daily-ai-credits: 200` | frontmatter | yes |
| Tell the agent what to do on a scheduled run | body | no |

Why: `gh aw compile` turns the frontmatter into the `.lock.yml` that Actions runs (triggers, permissions, tools,
safe-output limits, budgets) and stores a hash of the frontmatter in it. The body isn't compiled in: the lock
imports the `.md` at run time, so the agent always reads the latest instructions. A frontmatter change without a
recompile leaves a stale lock, and the activation job stops the next run. One trap: `${{ vars.* }}` and
`${{ env.* }}` expressions in the body count towards the frontmatter hash, so adding one needs a recompile too.
