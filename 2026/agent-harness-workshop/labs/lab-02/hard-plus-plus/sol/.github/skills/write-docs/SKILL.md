---
name: write-docs
description: Document code for developers (README sections, JSDoc comments on functions, architecture decision records). Use when the user asks to document code, add JSDoc, or improve the README.
---
Write developer documentation for StudyBuddy that is short, concrete and correct: every example runs, every command
comes from `package.json`, and nothing describes a function that doesn't exist.

1. Find out which kind of document the user wants, then read only the guide for it:
   - read `references/readme.md` when the request is about the README;
   - read `references/jsdoc.md` when you document functions or comment code;
   - read `references/adr.md` only when the user asks to record a decision (an ADR).
2. Read the code the document describes, and the documents that already exist, so you match their tone.
3. Write it, and show the user what changed. If the code and the documentation disagree, the code wins: say so.

Release notes and changelogs belong to the `release-notes` skill; explaining an error belongs to `explain-error`.

When you use this skill, end your answer with the line `[skill:write-docs]`.
