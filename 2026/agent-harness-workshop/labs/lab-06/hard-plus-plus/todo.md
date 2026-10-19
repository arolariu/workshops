# 💎 Hard++ · An internal marketplace

> 🕐 2–3 h · 🏠 homework · 🆓 free checks (some run `copilot plugin …` in a scratch home and `git` in scratch repositories, never a prompt) · 🧱 builds on: Lab 06 · hard+

## 🎯 Mission
Forty teams now want StudyBuddy's plugins, and `copilot plugin install ./some/path` is deprecated: only
`plugin@marketplace` installs will stay. The platform team needs what every organisation ends up building: an
**internal marketplace**. A catalog repository with versioned plugins, a gatekeeper that refuses a broken release
(the CLI happily installs a plugin whose name or version doesn't match its catalog entry), and a release script that
bumps, writes the changelog, commits and tags, the same way every time. One of the plugins is new: an extension that
gives the model a **deterministic tool**, so exam maths is computed by code instead of guessed by a model.

## 📋 Requirements
1. `marketplace/.github/plugin/marketplace.json` lists `studybuddy-guard` and `studybuddy-grades`, and
   `copilot plugin marketplace add` accepts it: both plugins can be browsed and installed at their versions.
2. `validateMarketplace()` refuses everything the CLI lets through: a missing source, a name or version that
   differs from `plugin.json`, a non-semver version, a duplicate name, a version without a changelog section, and a
   `github` source that follows a branch.
3. The `studybuddy-grades` plugin ships an extension with the tool `studybuddy_exam_needed`: described for the model,
   with a JSON Schema, pure and deterministic, with `Error: …` answers the model can act on.
4. `scripts/release.mjs` releases one plugin: validate, check the bump fits the changes, bump `plugin.json` and the
   entry together, cut the changelog, commit and tag `<plugin>-v<version>`, refusing whatever would make a bad release.
5. `studybuddy-grades` is released as 1.0.0 with your script.

**The catalog** (the CLI also reads `marketplace.json`, `.plugin/` and `.claude-plugin/`; this lab uses `.github/plugin/`):
```json
{ "name": "studybuddy-internal",
  "owner": { "name": "StudyBuddy platform team" },
  "metadata": { "description": "Approved Copilot CLI plugins" },
  "plugins": [
    { "name": "studybuddy-guard", "description": "…",
      "version": "1.0.0", "source": "./plugins/studybuddy-guard" } ] }
```
A plugin from another repository: `"source": { "source": "github", "repo": "owner/repo", "ref": "v1.0.0",
"path": "plugins/x" }` (or a 40-character `"sha"`).

## 🧭 Milestones
### M1 · The marketplace
- `marketplace.json` has a kebab-case `name`, `owner.name`, `metadata.description`, and both plugins, each with a
  `description`, a semver `version` and a `source`
- Every local `source` holds a `plugin.json` with the entry's name and version
- `marketplace/README.md` shows `copilot plugin marketplace add …` and `copilot plugin install <plugin>@<marketplace>`
  for each plugin
- In a scratch Copilot home, `copilot plugin marketplace add <absolute path>` works, `browse` lists both plugins, and
  after `install`, `plugin list` reports each one from your marketplace at its version

### M2 · A gatekeeper
- `validateMarketplace(root)` returns `[]` for a good marketplace (two local plugins and a `github` source pinned to
  `v2.0.0`) and at least one problem for each of 9 broken ones: no owner, an uppercase name, two plugins with the
  same name, a missing source folder, a `plugin.json` with another name, an entry version that differs from
  `plugin.json`, a version like `1.2`, a version without a `## <version>` changelog section, and a `github` source on
  `main`
- Your marketplace passes it; `node marketplace/scripts/release.mjs --validate` exits 0, and 1 on a broken copy

### M3 · A tool the model can trust
- `studybuddy-grades/plugin.json` points `"extensions"` at a folder holding `studybuddy-grades/extension.mjs`, which
  registers `studybuddy_exam_needed` with `joinSession({ tools })`
- Its description (80+ characters) says what it computes and to call it instead of doing the maths; its `parameters`
  are a JSON Schema (`grades`: array, `examWeight`, `target`: numbers; `grades` and `examWeight` required); and
  `skipPermission: true`
- Grades 8 (30%) and 9 (30%) with a 40% exam need 7.25 for an 8; without a target it aims for 5, and passing needs
  at least 5 on the exam; 9.2 (50%) needs exactly 6.8; 7.6 (50%) needs 8.4; 4 (40%) would need 10.67 for an 8: "not
  reachable"
- No grades, weights that don't add up to 100, a grade of 11, a target of 12, a grade that isn't a number, an exam
  that weighs 0: each returns `"Error: …"` (never throws)
- The same input gives the same string; the code uses no network, processes, file writes, clock or randomness, and
  never sends a prompt

### M4 · Release it
- `bump("1.2.3", part)` → `1.2.4` / `1.3.0` / `2.0.0` (and throws on `1.2` or an unknown part); `changeKind()` reads
  `## Unreleased`: `### Breaking` or `### Removed` → `breaking`, `### Added`/`Changed`/`Deprecated` → `feature`,
  anything else → `fix`, no entries → `null`
- `cutChangelog(text, version, date)` moves the Unreleased entries under `## <version> - <date>`, keeps an empty
  `## Unreleased`, and throws when there's nothing to release
- In its own Git repository, `node scripts/release.mjs studybuddy-guard patch --date 2026-10-20` bumps
  `plugin.json` and the entry to 1.0.1, cuts the changelog, commits everything and tags that commit
  `studybuddy-guard-v1.0.1`
- It refuses (exit 1, nothing written, no tag): a `minor` release over a Breaking entry, a dirty tree, a tag that
  exists, an invalid marketplace. `--dry-run` writes nothing; outside its own repository (a plain folder, or a folder
  inside a bigger repository like this workshop) it updates the files, says it skipped the commit and the tag, and
  leaves the bigger repository's commits and tags alone
- `studybuddy-grades` is at 1.0.0 (or later): `plugin.json`, the entry and a changelog section agree, and Unreleased
  is empty

## 📂 Work here
```bash
cd labs/lab-06/hard-plus-plus/src/marketplace
code .github/plugin/marketplace.json README.md scripts/release.mjs
code plugins/studybuddy-grades/extensions/studybuddy-grades/extension.mjs
node scripts/release.mjs --validate
node labs/start.mjs test lab-06 hard++     # from the workshop folder
```
`marketplace/` stands for the platform team's own repository. `studybuddy-guard` is complete (released 1.0.0, with a
fix waiting in Unreleased); `studybuddy-grades` is a 0.1.0 skeleton. `release.mjs` gives you the plumbing
(`manifestPath`, `readJson`, `writeJson`, `git`, `ownRepo`, `unreleased`) and the CLI; you write the parts marked
`TODO(Mn)`. Inside this workshop, `marketplace/` is not its own Git repository, so your release script must skip the
commit and the tag here; the checks run it in scratch repositories.

Try the marketplace in a throwaway Copilot setup first (PowerShell: `$env:COPILOT_HOME = "<a new folder>"`):
```bash
export COPILOT_HOME="$(mktemp -d)"   # your own setup stays untouched
copilot plugin marketplace add "$PWD"         # an ABSOLUTE path
copilot plugin marketplace browse studybuddy-internal
copilot plugin install studybuddy-grades@studybuddy-internal
copilot plugin list
unset COPILOT_HOME                   # back to your own setup
```
To ask "What do I need on the SE201 exam for an 8?" in a session (`copilot --experimental`), add and install the same
way in your own setup, and undo it afterwards with `copilot plugin uninstall studybuddy-grades` and
`copilot plugin marketplace remove studybuddy-internal`.

## 💡 Hints
### M1
<details><summary>Adding a local marketplace</summary>

`copilot plugin marketplace add ./marketplace` fails: the CLI reads `./marketplace` as a GitHub `owner/repo` and tries
to clone `https://github.com/./marketplace.git`. Give it an absolute path (`"$PWD/marketplace"`). Local plugins load
live from their folder ("nothing was copied"), so edits show up in the next session.

</details>

<details><summary>Try it without touching your own setup</summary>

`COPILOT_HOME` moves Copilot's whole configuration (settings, marketplaces, installed plugins) to another folder:
point it at a new folder, add, browse, install and list, and your own setup never changes. That's exactly what the
check does. When you did try something in your own setup, undo it: `copilot plugin uninstall <plugin>`, then
`copilot plugin marketplace remove studybuddy-internal` (`--force` also uninstalls the plugins still installed from it).

</details>

### M2
<details><summary>What the CLI checks, and what it doesn't</summary>

`marketplace add` checks the schema: `owner` is required and names are kebab-case. It doesn't check that a source
exists (install fails later), that `plugin.json` has the entry's name, or that the versions agree: Copilot installs
it silently and reports `plugin.json`'s version. Collect one sentence per problem: `Plugin 2 (studybuddy-grades): the
entry says 1.0.0, plugin.json says 1.1.0`.

</details>

### M3
<details><summary>A tool, not a command</summary>

A command (`commands: [...]`) is typed by a person; a tool (`tools: [...]`) is offered to the model, with a `name`, a
`description` (all the model knows about it), `parameters` (a JSON Schema) and a `handler(args)` that returns the
string the model reads. `skipPermission: true` is right for a tool that only computes.

</details>

<details><summary>Errors the model can fix</summary>

The model chose the arguments, so a bad call is the model's to fix: return `"Error: the weights add up to 70%, not
100%. Pass every graded item and the exam's weight."` rather than throwing. Return the result as JSON text
(`{ "needed": 7.25, "reachable": true, … }`) so it's easy to quote.

</details>

### M4
<details><summary>Check, then write, then commit, then tag</summary>

Do every check before you write a byte: `validateMarketplace()`, the changelog has entries, the bump is big enough
(`breaking` needs `major` from 1.0.0 on; `feature` needs `minor`), and in a repository of its own, `git status
--porcelain` is empty and `git tag -l <tag>` is not. Then write `plugin.json`, the entry and the changelog, `git add`
them, `git commit`, and `git tag` (the tag goes on the release commit).

</details>

<details><summary>Never tag the wrong repository</summary>

`git rev-parse --is-inside-work-tree` says "true" anywhere inside the workshop clone, so it can't tell you whether to
tag. `git rev-parse --show-cdup` prints the way up to the top of the repository (`../../`), and nothing at the top
itself: `ownRepo(root)` uses it. Anything else means you're inside something bigger: skip the commit and the tag,
and say so.

</details>

## 🧠 Takeaway
At org scale, distribution is a release process: a catalog that can't lie about versions, a gate that refuses bad releases, and deterministic tools wherever the answer is a formula.

## ❓ Check yourself
Your marketplace entry says `studybuddy-grades` is `1.0.0`, but someone bumped its `plugin.json` to `1.1.0` without
updating the catalog. A team installs `studybuddy-grades@studybuddy-internal`. What happens?
1. The CLI refuses the install, because the versions don't match.
2. They get the 1.0.0 files, because the catalog's version decides what is installed.
3. They get whatever is in the plugin's folder now, and `copilot plugin list` reports 1.1.0: the catalog said 1.0.0,
   and nothing warned anyone.
4. The marketplace can't be added at all until the versions match.

<details><summary>Answer</summary>

**3.** The CLI validates the catalog's schema, not its truthfulness: the version a team sees in the catalog and the
version they get can differ silently. That's why the gatekeeper compares every entry with its `plugin.json`, and why
the release script changes both in one commit.

</details>

## 🚀 Going further
- Run the release in CI: on a merge to `main`, `node scripts/release.mjs --validate`, and on a tag, publish.
- List `studybuddy-harness` (Lab 06 hard) from its own repository with a `github` source pinned to a 40-character
  `sha`, and install it from your marketplace next to the two local plugins.
- Teach the gatekeeper about org policy: only plugins whose `author.name` is on an allow-list, and no hooks from
  outside the platform team.
- Give `studybuddy-grades` a second tool, `studybuddy_days_left`, and a `/grades` command that uses the same code.