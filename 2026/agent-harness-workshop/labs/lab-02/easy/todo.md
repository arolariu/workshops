# 🟢 Easy · Teach a recipe once

> 🕐 10 min · 👥 together · 🆓 free checks · 🤖 optional agent check (about 1 prompt) · 🧱 builds on: Lab 01 · easy

## 🎯 Mission
Every new StudyBuddy module follows the same recipe, and the team keeps explaining it to the agent again
and again. The templates are already in `.github/skills/new-module/templates/`. Write the `SKILL.md` that
teaches the recipe once. Then ask for an attendance module **without describing the recipe** and watch the
agent follow it on its own.

## 📂 Work here
```bash
cd labs/lab-02/easy/src
copilot
```

## ✅ Done when
- `.github/skills/new-module/SKILL.md` has a `name` matching its folder and a `description` that says
  **what** the skill does and **when** to use it
- Its numbered steps use both templates and cover: module file, test file, `index.js` export, a line in `README.md`, `npm test`
- `copilot skill list` shows it
- You asked for an attendance module: `attendanceRate(sessions)` returns the percentage of
  `{ attended: true }` sessions (1 decimal) and throws a `RangeError` for an empty list, built the recipe way

## 🧠 Takeaway
Only a skill's name and description are always in the context, so write the description as a routing rule: what the skill does and when to use it.

## ❓ Check yourself
Twenty skills are installed in a project. Before any of them is used, what is in the model's context?
1. All twenty `SKILL.md` files in full, so the model can compare their steps before it picks one.
2. Each skill's name and description; a skill's full instructions load when the model picks it.
3. Nothing at all, until you call one of the skills yourself by name, with `/skill-name`.

<details><summary>Answer</summary>

**2.** That's progressive disclosure: the descriptions are cheap and always there, the bodies load on demand. It's
also why a vague description means the skill never gets picked.

</details>

## 💡 Hints
<details><summary>The frontmatter</summary>

```markdown
---
name: new-module
description: <what it does>. Use when <the situations that should trigger it>.
---
```
The description is the only part the agent reads before choosing a skill. Make the "Use when" concrete.

</details>

<details><summary>The steps</summary>

Number them. Point to the templates with their path from the project root
(`.github/skills/new-module/templates/module.template.js`). End with "run `npm test`".

</details>

<details><summary>The proof</summary>

Start a **new** session (`/new`) so the skill is picked up, then type `/skills` to see it. Now ask:
*"Add an attendance module: attendanceRate(sessions) returns the percentage of sessions attended, 1 decimal."*
Look for the `// StudyBuddy attendance:` header from the template in the new file.

</details>

## 🚀 Going further
- Add `argument-hint: "<module name> <what it does>"` and call it directly: `/new-module grades-export ...`
- Move the skill to `~/.copilot/skills/` and it follows you to every project.
