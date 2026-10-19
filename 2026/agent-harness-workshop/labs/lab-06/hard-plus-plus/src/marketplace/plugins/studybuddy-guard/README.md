# studybuddy-guard

A `preToolUse` hook that blocks recursive force-deletes (`rm -rf`, `Remove-Item -Recurse`) in every repository where
the plugin is enabled, and logs each decision to `.agent-logs/studybuddy-guard.jsonl` in the session's folder.