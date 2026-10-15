# 🟡 Medium · Two kinds of change

> 🕐 15 min · 🆓 free checks

## 🎯 Mission
The (now safe) triage bot needs two new tricks:
1. When someone reports a **bug** without saying which **operating system** and **Node.js version** they
   use, the comment should ask for both.
2. Maintainers want it to be able to add the **`good first issue`** label.

One of these changes needs `gh aw compile`; the other doesn't. Make both changes, keep the workflow safe,
and explain in `NOTES.md` which one needs a recompile, and why.

## 📂 Work here
```bash
cd labs/lab-07/medium/src
code .github/workflows/issue-triage.md
```

## ✅ Done when
- The instructions ask bug reporters for their OS and Node.js version when they're missing
- `good first issue` is an allowed label, and the workflow is still safe (read-only, max 1 label, max 1 comment)
- `NOTES.md` says which change needs a recompile and why (mention the frontmatter and the body)

## 💡 Hints
<details><summary>Where does each change go?</summary>

What the agent should *do* lives in the body. What it's *allowed* to do (labels, permissions, outputs)
lives in the frontmatter.

</details>

<details><summary>Why the difference?</summary>

The frontmatter is compiled into the `.lock.yml` that Actions runs: permissions, tools, safe-output
limits. The body is read by the agent at run time.

</details>

<details><summary>Labels with spaces</summary>

In a YAML list, quote it: `allowed: [bug, "good first issue"]`.

</details>

## 🚀 Going further
- Add a `workflow_dispatch:` trigger so you can run it by hand with `gh aw run issue-triage`.
- Use `gh aw logs` after a run: how many credits did one triage cost?
