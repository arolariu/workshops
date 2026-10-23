---
name: release-checklist
description: The StudyBuddy release checklist, for a regular release or a hotfix. Use when the user wants to release StudyBuddy, bump its version, tag a release or ship a hotfix.
---
We release StudyBuddy about once a term, before the course starts. Follow these steps in order, and stop at the first
one that fails:

1. Check out `main`, pull, and run `npm test` on a clean checkout: every test is green and none is skipped.
2. Decide the new version with semantic versioning: a patch for fixes, a minor version for a new module or a new
   exported function, a major version when an exported function changes its parameters or its results.
3. Bump `version` in `package.json`, and nothing else in that file.
4. Add a section to `CHANGELOG.md`: `## <version> - <YYYY-MM-DD>`, with `Added`, `Changed` and `Fixed` lists. Each
   entry is one line that a student can understand, and names the module.
5. Check that the "## Modules" list in `README.md` matches the modules in `index.js`.
6. Commit with the message `release: v<version>`, tag the commit `v<version>`, and push the commit and the tag.
7. Create a GitHub release from the tag, and paste the changelog section into it.
8. Post a short note in the course channel: the version, the three most important changes, and a link to the
   release.
9. If anything goes wrong after the release, don't delete the tag: release a patch version with the fix.

A hotfix during the term (a wrong grade, a deadline shown as upcoming when it is overdue) follows the same steps, with
three differences: branch from the latest tag instead of `main` (`git switch -c hotfix/<version> v<version>`), bump
only the patch number, and add a regression test that fails without the fix before you change any code. Merge the
hotfix branch back into `main` after the release, so the next regular release has the fix too, and mention the
hotfix in the course channel on the same day, because students may have seen the wrong value.
