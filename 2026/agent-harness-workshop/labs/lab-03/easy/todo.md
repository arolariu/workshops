# 🟢 Easy · Eyes, not hands

> 🕐 10 min · 👥 together · 🆓 free checks · 🤖 optional agent check (about 2 prompts) · 🧱 builds on: Lab 02 · easy

## 🎯 Mission
You want a second pair of **eyes** on `deadlines.js`, not a second pair of hands. Create a `reviewer`
agent that finds problems and reports them in a clear table, but **physically cannot change anything**.
Then use it, and save its findings to `REVIEW.md`. (Notice who has to save them, and why.)

## 📂 Work here
```bash
cd labs/lab-03/easy/src
copilot
```

## ✅ Done when
- `.github/agents/reviewer.agent.md` has a `description` and a `tools` list with **read-only** tools only
- Its instructions list what to look for (3+ bullets) and define a table with **Severity** and **Location** columns
- `REVIEW.md` holds the reviewer's table for `deadlines.js` with at least 2 real problems

## 🧠 Takeaway
A tool list is a guarantee: a tool that isn't listed never reaches the model, whatever the prompt says.

## ❓ Check yourself
Why does a reviewer agent without `edit` stay read-only, even when the prompt says "fix it"?
1. The instructions tell it not to edit.
2. The edit tool is never offered to the model, so the model can't call it.
3. Copilot asks for permission before every edit.

<details><summary>Answer</summary>

**2.** The tool list decides which tool schemas reach the model at all. It's a guarantee, not a wish.

</details>

## 💡 Hints
<details><summary>Least privilege</summary>

The `tools` list is the guarantee. Which of `read`, `search`, `edit`, `execute` does a reviewer really need?

</details>

<details><summary>Use it</summary>

Start a new session, type `/agent`, pick `reviewer` and ask *"Review deadlines.js"*. Or from the terminal:
`copilot --agent reviewer`. Ask it to fix something: what happens?

</details>

<details><summary>Saving the report</summary>

The reviewer can't write files, which is the point. Switch back to the default agent (`/agent`) and ask it
to save the table to `REVIEW.md`, or copy it yourself. Look for the time-zone issue and the "done" items.

</details>

## 🚀 Going further
- Add `model:` to the frontmatter to pin a cheaper model for reviews.
- Ask the default agent: *"Use the reviewer agent to check grades.js"*. That's delegation to a subagent.
