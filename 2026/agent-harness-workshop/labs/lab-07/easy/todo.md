# 🟢 Easy · Make it safe

> 🕐 8 min · 👥 together · 🆓 free checks (design checks, nothing runs on GitHub) · 🧱 builds on: Lab 06 · easy

## 🎯 Mission
`.github/workflows/issue-triage.md` labels new issues and welcomes their authors. It works, and that's the
problem: the agent can push code, open pull requests, run any shell command, use the open internet, and
run for an hour on an unlimited budget. Make it **safe without breaking it**.

## 📂 Work here
```bash
cd labs/lab-07/easy/src
code .github/workflows/issue-triage.md
```

## ✅ Done when
- It still triggers on new issues, still labels them and still comments
- The **agent** is read-only (no `write` permission anywhere)
- No unrestricted shell; network locked down to the defaults
- Safe outputs: only labels (from an allow-list, max 1) and one comment (max 1). Nothing that can change code.
- A budget: `max-ai-credits` (100 or less) and `timeout-minutes` (15 or less)

## 🧠 Takeaway
In CI nobody is watching: the agent only proposes, and a separate job applies its safe outputs within your limits.

## ❓ Check yourself
In your locked-down triage workflow, how does the `bug` label end up on the issue?
1. The agent calls the GitHub API itself, using a narrow token that is only allowed to add labels to issues.
2. A maintainer approves each label by hand before the workflow is allowed to add it.
3. The agent proposes it; a separate job with write access checks it against your limits and adds it.

<details><summary>Answer</summary>

**3.** The agent's own permissions are read-only. Writes happen in a separate job without a model, and only within
the limits in `safe-outputs` (the allow-list and the `max`).

</details>

## 💡 Hints
<details><summary>Who writes, then?</summary>

In agentic workflows the agent never writes directly. It *proposes* through **safe outputs**, and a
separate job with write access applies them, within your limits. So the agent itself only needs `read`.

</details>

<details><summary>Safe-output limits</summary>

```yaml
safe-outputs:
  add-labels:
    allowed: [ ... ]   # the only labels it may add
    max: 1             # how many
```
`add-comment` takes a `max` too. Does a triage bot need `create-pull-request`?

</details>

<details><summary>Locking down the rest</summary>

Remove the `bash` tool (triage needs none), add `network: defaults`, a `max-ai-credits` and a sensible
`timeout-minutes`. Narrow the GitHub toolset to `[issues]`.

</details>

## 🚀 Going further
- Got `gh aw`? Run `gh aw compile --strict` here (in a git repo) and read the generated `.lock.yml`.
- Run it for real: put `src/` in a new GitHub repo, follow the gh-aw quick start, and open an issue.
