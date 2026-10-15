# studybuddy-harness 🧩

StudyBuddy's agent harness as a Copilot CLI plugin.

| Type | Name | What it does |
|---|---|---|
| Agent | `sb-reviewer` | Read-only code review with a severity table and a verdict |
| Skill | `sb-explain-error` | Explains a stack trace: cause, where (file:line), fix |

## Install
```bash
copilot plugin install <owner>/<repo>:labs/lab-06/hard/sol/studybuddy-plugin
```
Try it without installing: `copilot --plugin-dir ./studybuddy-plugin`
