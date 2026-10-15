# 🔴 Hard · Ship it as a plugin

> 🕐 25 min · 🆓 free checks (they use `copilot --plugin-dir`, no AI credits)

## 🎯 Mission
This project's harness (the `reviewer` agent and the `explain-error` skill) is great, and other teams want
it. Package it as a **Copilot CLI plugin** in a `studybuddy-plugin/` folder that anyone can install with
one command, and test it locally without installing anything.

## 📂 Work here
```bash
cd labs/lab-06/hard/src
mkdir studybuddy-plugin
```

## ✅ Done when
- `studybuddy-plugin/plugin.json` has a kebab-case `name`, a `description`, a semver `version` and `author.name`
- The plugin contains at least one agent (`agents/*.agent.md`) and one skill (`skills/<name>/SKILL.md`)
- Their names **don't clash** with this project's own agents and skills (the project would win and hide them)
- `studybuddy-plugin/README.md` says what's inside and how to install it
- `copilot --plugin-dir ./studybuddy-plugin plugin list` shows your plugin, and `skill list` shows its skill

## 💡 Hints
<details><summary>Layout</summary>

```text
studybuddy-plugin/
├── plugin.json
├── README.md
├── agents/<agent>.agent.md
└── skills/<skill>/SKILL.md
```
Copy the existing agent and skill in, then rename them (a prefix like `sb-` works). The `name` in the
frontmatter and the skill's folder name must change too.

</details>

<details><summary>Test without installing</summary>

```bash
copilot --plugin-dir ./studybuddy-plugin plugin list
copilot --plugin-dir ./studybuddy-plugin skill list
copilot --plugin-dir ./studybuddy-plugin --agent sb-reviewer
```

</details>

<details><summary>Publishing</summary>

Push the folder to GitHub and anyone can install it with the `owner/repo:path/to/studybuddy-plugin` form
of the plugin install command. Put that line in the README.

</details>

## 🚀 Going further
- Add the guardrail hooks from Lab 05 to the plugin. Who should get guardrails by default?
- Create your own marketplace: a repo with a `marketplace.json` listing your plugins
  (`copilot plugin marketplace add <owner>/<repo>`).
