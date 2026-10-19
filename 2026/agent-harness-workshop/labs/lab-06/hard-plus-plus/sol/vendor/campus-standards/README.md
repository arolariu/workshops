# vendor/campus-standards

Two releases of `studybuddy-org/campus-standards`, the university's shared APM package, exactly as APM would fetch
them from GitHub. The checks (and your scripts) can't reach GitHub, so this folder plays the registry.

- `release.json`: what APM resolved (`ref`, the 40-character `commit`), which file it deploys where (`deploy`:
  target path in the project → file in this folder), and the release's machine-readable `migrations`.
- `CHANGELOG.md`: what changed, written for people.
- `files/`: the package's content. Nothing here is named like a file Copilot loads: `deploy` gives the real names.