# StudyBuddy's internal marketplace

In real life this folder is its own repository (say `studybuddy-org/copilot-marketplace`): the platform team's
catalog of approved Copilot CLI plugins. Teams add it once and install plugins by name, pinned to what was released.

| Plugin | Version | What it does |
|---|---|---|
| `studybuddy-guard` | 1.0.0 | The Lab 05 guard as its own plugin: guardrails for every team, without their harness |
| `studybuddy-grades` | 1.0.0 | An extension with `studybuddy_exam_needed`: exam maths the model doesn't have to guess |

## Add the marketplace
```bash
copilot plugin marketplace add studybuddy-org/copilot-marketplace
copilot plugin marketplace add "$PWD/marketplace"   # this folder: use an absolute path
copilot plugin marketplace browse studybuddy-internal
```

## Install
```bash
copilot plugin install studybuddy-guard@studybuddy-internal
copilot plugin install studybuddy-grades@studybuddy-internal
copilot --experimental        # extensions (studybuddy-grades) need it
```
Try it in a throwaway setup first: point `COPILOT_HOME` at a new folder for those commands, and your own setup stays as
it is.

## Remove
```bash
copilot plugin uninstall studybuddy-grades
copilot plugin marketplace remove studybuddy-internal   # --force: uninstall its plugins too
```

## Release
```bash
node scripts/release.mjs --validate
node scripts/release.mjs studybuddy-guard patch --dry-run
node scripts/release.mjs studybuddy-guard patch
```
The script validates the catalog, bumps `plugin.json` and the entry together, moves the changelog's Unreleased
entries under the new version, commits, and tags `<plugin>-v<version>`. It refuses a bump that is smaller than the
changes (a Breaking entry needs a major release), a dirty tree and a tag that already exists.

## Plugins from other repositories
A plugin that lives in another repository is listed with a pinned GitHub source, never a branch:
```json
{ "name": "studybuddy-harness", "version": "1.0.0", "source": {
  "source": "github", "repo": "studybuddy-org/studybuddy",
  "ref": "v1.0.0", "path": "studybuddy-plugin" } }
```