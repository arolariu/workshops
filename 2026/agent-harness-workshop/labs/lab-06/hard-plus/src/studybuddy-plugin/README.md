# studybuddy-harness 🧩 · version 1.0.0

StudyBuddy's agent harness (Labs 02–05) as one Copilot CLI plugin. Every item has the `sb-` prefix, so it never
collides with a project's own agents, skills or servers.

| Type | Name | What it does |
|---|---|---|
| Agent | `sb-reviewer` | Read-only code review: a severity table and a `VERDICT:` line |
| Skill | `sb-explain-error` | Explains a stack trace: cause, where (file:line), fix |
| Skill | `sb-new-module` | Creates a module and its tests from the templates it ships |
| Hook | `sb-guard` (preToolUse) | Blocks recursive force-deletes (`rm -rf`, `Remove-Item -Recurse`); logs to `.agent-logs/sb-guard.jsonl` |
| MCP server | `sb-portal` | The StudyBuddy portal: deadlines, grades and courses (read-only) |

## Install
```bash
copilot plugin install <owner>/<repo>:labs/lab-06/hard/sol/studybuddy-plugin
```
Then start a new session, and use `/agent studybuddy-harness:sb-reviewer` (a plugin's agents carry its name), `/sb-explain-error <file>` or ask about your deadlines.

## Try it without installing
```bash
copilot --plugin-dir ./studybuddy-plugin
copilot --plugin-dir ./studybuddy-plugin --agent studybuddy-harness:sb-reviewer
```

## Good to know
- The guard is a `preToolUse` hook: once the plugin is enabled, it runs before **every** tool call in every project.
- Remove it with `copilot plugin uninstall studybuddy-harness`.