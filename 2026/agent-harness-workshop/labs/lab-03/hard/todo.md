# 🔴 Hard · Two agents, one loop

> 🕐 30 min · 🆓 free checks · 🤖 optional agent check (up to 4 prompts)

## 🎯 Mission
One agent finds problems, another fixes them, and a script runs the loop: **review → fix → test → review
again**, until the reviewer is happy or 2 rounds have passed. The `reviewer` agent and the loop are
already there. Create the `fixer` agent and finish the three functions the loop needs, so each agent gets
exactly the permissions its job requires, and not one more.

## 📂 Work here
```bash
cd labs/lab-03/hard/src
node scripts/review-loop.mjs deadlines.js --dry-run
```

## ✅ Done when
- `.github/agents/fixer.agent.md` can read, edit and run; it fixes **only** the review findings, adds a test
  per fix, runs `npm test`, and never pushes
- `reviewerArgs(file)` runs the `reviewer` agent read-only (no write permission), quiet (`-s`, the loop parses
  the answer), with a credit cap between 30 and 100
- `fixerArgs(file, reviewPath)` runs the `fixer` agent with the review path in the prompt, may write and run
  `npm`, is denied `git push`, and has a credit cap between 30 and 100
- `verdict(text)` returns `CLEAN`, `ISSUES` or `UNKNOWN`. The **last** VERDICT line wins.

## 💡 Hints
<details><summary>Picking an agent from a script</summary>

`copilot --agent <name> -p "<prompt>" -s` runs one prompt as that agent. The agent's `tools` line limits what
it *can* do; `--allow-tool` / `--deny-tool` decide what runs without asking. In `-p` mode nobody can
answer a prompt, so anything not allowed is refused.

</details>

<details><summary>Permission patterns</summary>

`--allow-tool=write` (edit files), `--allow-tool=shell(npm:*)` (any npm command),
`--deny-tool=shell(git push)` (exactly that). Deny always wins. Never use `--allow-all` in a loop.

</details>

<details><summary>Parsing the verdict</summary>

The review may quote "VERDICT: CLEAN" in its text before the real verdict at the end. Use `matchAll` with a
case-insensitive regex and take the last match.

</details>

## 🚀 Going further
- Add a third agent, `tester`, that runs after the fixer and only reports coverage gaps.
- Write the loop's summary to `.agent-logs/summary.md`: rounds, findings, verdicts.
