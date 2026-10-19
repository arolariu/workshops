# 🟣 Hard+ · Supply chain

> 🕐 1.5–2 h · 🏠 homework · 🆓 free checks (offline: fixture projects, no APM or network needed) · 🧱 builds on: Lab 06 · hard

## 🎯 Mission
Your plugin is now a dependency of other teams, and it has dependencies of its own. That makes it part of a supply
chain made of prompts and code, with the usual ways to break: a dependency that follows `#main` changes under
everyone overnight, someone "fixes" a deployed skill by hand and the lock no longer tells the truth, a project skill
with the plugin skill's name silently hides the approved one, and the next major release renames the skill your agents
rely on. Pin everything, build the tools that catch drift and shadowing, then use them to take a project through a
breaking upgrade and prove that nothing broke.

## 📋 Requirements
1. The plugin is an APM package too: `studybuddy-plugin/apm.yml` has the plugin's name and version and a
   description, and every dependency (there and in the root `apm.yml`) is pinned to one exact release.
2. `scripts/pins.mjs` explains every dependency that isn't pinned: no ref, a branch, a range, a short SHA, a
   major-only tag.
3. `scripts/verify-lock.mjs` finds every kind of drift between `apm.yml`, `apm.lock.yaml` and the deployed files, and
   doesn't call a CRLF checkout drift.
4. `scripts/find-shadows.mjs` lists the project skills that hide a plugin's (shadows) and the project agents that pass for a plugin's (look-alikes), by the names Copilot uses.
5. `scripts/upgrade.mjs` moves a project to a new release of a package: it refuses over drift and over files it
   doesn't own, applies the release's migrations, rewrites the pin and the lock, and proves the result.

**The lock** (`apm.lock.yaml`, written by `apm install`; the plumbing in `verify-lock.mjs` reads and writes it for you):
```text
dependencies:
  - repo_url: studybuddy-org/campus-standards
    resolved_ref: v1.4.0          # what apm.yml asked for
    resolved_commit: 3f1c0d9a…    # the exact commit: 40 hex characters
    version: "1.4.0"
    depth: 1
    deployed_files:
      - ".github/skills/campus-grading-rules/SKILL.md"
    deployed_file_hashes:         # sha256 hex of the text, CRLF as LF
      ".github/skills/campus-grading-rules/SKILL.md": "9f86d0…"
```

## 🧭 Milestones
### M1 · Pin everything
- `pinProblems(deps)` returns one problem per loose dependency, naming it: all 9 in `tests/fixtures/pins.json`
  (`acme/skills`, `#main`, `#latest`, `#^1.2.0`, `#~1.4`, `#>=1.0.0`, a short SHA, `#v1`, `{ git }` without a
  `ref`), and none for its 7 pinned ones (`#v1.0.0`, `#2.3.1`, `#v2.0.0-beta.1`, a full SHA, `{ git, ref }`, a
  local `./path`)
- `studybuddy-plugin/apm.yml` has the same `name` and `version` as `plugin.json`, a `description`, and its dependency
  on `microsoft/apm-sample-package` pinned
- `node scripts/pins.mjs apm.yml studybuddy-plugin/apm.yml` exits 0; on a loose manifest it exits 1 and names the
  dependency

### M2 · The lock verifier
- `hashText(text)` is the SHA-256 hex of the text with CRLF read as LF
- `verifyLock(root)` passes a project that matches its lock, also when a deployed file has CRLF line endings and when
  hashes are written `sha256:<hex>`
- It returns `{ ok: false, problems }` with the right `kind` for each drift: a deployed file deleted (`missing`) or
  edited (`modified`), a pin changed in `apm.yml` (`ref-mismatch`), a dependency added to `apm.yml` but never
  installed (`not-locked`) or removed but still deployed (`orphan`), a lock entry without a full commit SHA
  (`unpinned-commit`), and no lock at all (`no-lock`)
- `node scripts/verify-lock.mjs <folder>` exits 0 when clean, and 1 with the file's name when something drifted

### M3 · Shadows and look-alikes
- `findShadows(root, pluginDirs)` returns exactly what `tests/fixtures/shadows.json` expects, sorted by kind, name
  and project path, with both paths: 3 skill **shadows** (`effect: "shadow"`) and 3 agent **look-alikes**
  (`effect: "look-alike"`, with the plugin agent's own name in `id`, like `sb-harness:sb-reviewer`), and none of the
  fixture's traps (`docs/`, `sb-study-plan-v2`, an agent called `reviewer`)
- `node scripts/find-shadows.mjs --root <folder> <plugin>` exits 1 and names them; on your project with
  `studybuddy-plugin` it exits 0

### M4 · A breaking upgrade
- `node scripts/upgrade.mjs studybuddy-org/campus-standards v2.0.0 --root <project>` takes the checks' consumer
  project from v1.4.0 to v2.0.0: `apm.yml` pins `#v2.0.0`; the lock entry has v2's `resolved_ref`,
  `resolved_commit`, `version`, files and hashes; v2's files are deployed and v1's old skill is gone; the other
  package's entry is untouched
- The breaking rename is migrated: no file in the project mentions `campus-grading-rules` any more
- Your own `verifyLock()` passes after the upgrade, and a second run says it's already done and changes nothing
- With a deployed file edited by hand, it exits 1, names the file and changes **nothing**; same when the project
  already has its own file where v2 wants to deploy one (`.github/skills/campus-grading/SKILL.md`)

## 📂 Work here
```bash
cd labs/lab-06/hard-plus/src
code studybuddy-plugin/apm.yml scripts/pins.mjs
code scripts/verify-lock.mjs scripts/find-shadows.mjs scripts/upgrade.mjs
cat vendor/campus-standards/v2.0.0/CHANGELOG.md
node labs/start.mjs test lab-06 hard+      # from the workshop folder
```
Each script has its CLI written; you write the function marked `TODO(Mn)`. The plumbing at the bottom of
`verify-lock.mjs` reads and writes `apm.yml` and `apm.lock.yaml` for all four (`readManifest`, `manifestDeps`,
`readLock`, `writeLock`, `depKey`, `depRef`, `parseYaml`).
`vendor/campus-standards/` holds two releases of a university package, exactly as APM would fetch them: the checks
are offline, so `vendor/` plays GitHub. The checks build a small consumer project in a temp folder (from
`tests/fixtures/consumer.json` and `vendor/`) and run your scripts on it. If you installed the APM sample package in
Lab 06 easy, try `node scripts/verify-lock.mjs` on that project too, next to `apm audit --ci`.

## 💡 Hints
### M1
<details><summary>What counts as one exact release</summary>

A full SHA (`/^[0-9a-f]{40}$/`) or a full version tag (`/^v?\d+\.\d+\.\d+(-…)?$/`). Everything else moves: a
branch with every push, a range with every release, `#v1` because publishers re-point major tags (GitHub Actions do
exactly this), and a short SHA can become ambiguous. Say *why* in the problem: "acme/skills uses a range (#^1.2.0)".

</details>

### M2
<details><summary>Matching apm.yml to the lock</summary>

`depKey()` turns `owner/repo#v1`, `https://github.com/owner/repo.git` and a lock entry's `repo_url` into the same
`owner/repo`. Build a `Map` from each side. In `apm.yml` but not locked: `not-locked`; locked (with `depth` 1) but not
in `apm.yml`: `orphan`; both, with a different ref: `ref-mismatch`.

</details>

<details><summary>Hashes that survive Windows</summary>

Git may check a file out with CRLF line endings, and APM hashes the text with CRLF turned into LF, so the same file
gets the same hash everywhere: `createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex')`. Strip a
`sha256:` prefix from the lock's value before you compare.

</details>

### M3
<details><summary>Which names Copilot compares</summary>

Both go by the `name:` in their frontmatter (the file or folder name only when there is none), and `docs/` isn't loaded
at all. **Skills** are first-found-wins: a project skill in `.github/skills/`, `.agents/skills/` or `.claude/skills/`
with a plugin skill's name hides it, whatever its folder is called (`skill list` shows only the project's).
**Agents** can't be hidden: Copilot lists a plugin's agents as `<plugin>:<name>`. But a project agent in
`.github/agents/*.agent.md` or `.claude/agents/*.md` with the same `name:` (even `tutor.agent.md` with
`name: sb-tutor`) is what `/agent sb-tutor` picks: a look-alike. `frontmatter(file)` is given.

</details>

### M4
<details><summary>Check everything, then write</summary>

A refusal must leave the project exactly as it was, so do every check first: `verifyLock(root)` is clean; the lock
has the package; `vendor/<repo>/<version>/release.json` exists; every file the release deploys is either new or
already listed in this package's `deployed_files`. Only then delete, write, migrate and re-lock. "Already on v2.0.0"
is a success with nothing changed.

</details>

<details><summary>Migrations and the proof</summary>

`release.json` lists `migrations: [{ rename, to }]`: apply each to the project's **own** text files (not the files a
package deployed, not the lock, not `vendor/`). Bump the pin with a replace on `owner/repo#<old ref>`, update the lock
entry, `writeLock()`, then run `verifyLock()` and `findShadows()` once more: that is your proof.

</details>

## 🧠 Takeaway
A dependency made of prompts needs the same discipline as code: pin it, verify what's installed against the lock, and let a tool, not a hand edit, carry you through a breaking upgrade.

## ❓ Check yourself
Your project pins `studybuddy-org/campus-standards#v1.4.0`, the lock has its exact commit, and every hash matches.
Then the package's maintainer deletes the `v1.4.0` tag and creates a new one, with different content, on another
commit. What happens on your next `apm install --frozen`?
1. You silently get the new content, because the tag in `apm.yml` still says `v1.4.0`.
2. Nothing changes: the lock records the commit SHA, so the frozen install uses the commit, not the moved tag, and
   a hash check would flag any file that differs.
3. The install fails forever, because a pinned tag can never be resolved again.

<details><summary>Answer</summary>

**2.** The tag is a human-friendly name; the lock's `resolved_commit` is the real pin, and the file hashes prove
what's on disk. That's why the lock is committed, and why your verifier treats a lock without a full SHA as drift.

</details>

## 🚀 Going further
- Run your verifier in CI next to `apm audit --ci`, and fail the build on any drift.
- Add a `--write` mode to `find-shadows.mjs` that renames a shadowing project item instead of only reporting it. Is
  renaming always the right fix?
- Write the reverse codemod (v2 → v1). What can't be undone automatically?
- `apm lock export` writes an SBOM from the lock: which questions does it answer for a security team?