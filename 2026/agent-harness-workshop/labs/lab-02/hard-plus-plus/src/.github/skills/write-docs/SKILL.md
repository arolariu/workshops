---
name: write-docs
description: Helps with all kinds of writing and documentation (README files, JSDoc, comments, changelogs, release notes, commit messages, explaining code, errors and crashes, reports and exports). Use when the user asks for anything about docs, notes, text or explanations.
---
<!-- TODO(M5): this description claims the jobs of three other skills. Say what only this skill does. -->
<!-- TODO(M6): this whole body loads every time the skill is used. Keep a short SKILL.md, and move each kind of document to references/<kind>.md, read only when that kind is asked for. -->
# Writing documentation for StudyBuddy

You write the documentation of StudyBuddy: a tiny Node.js 22 study helper (ES modules, zero dependencies) used by
students and by the people who teach them. Good documentation here is short, concrete and correct: every example runs,
every command is copied from `package.json`, and nothing describes a function that doesn't exist.

Before writing anything, find out which kind of document the user wants, read the code it describes, and read the
documents that already exist, so you match their tone and don't repeat them. Then follow the section below for that
kind of document.

## README sections

The README is the first thing a new student or contributor reads. It answers three questions in this order: what is
StudyBuddy, how do I run it, and what's inside.

1. Keep the title and the one-sentence pitch at the top. Never move them down.
2. A "Getting started" section has exactly the commands a new person types: clone, `npm test`. Copy commands from
   `package.json`; never invent a script.
3. A "Usage" section shows one short example per module, in a fenced `js` block, with the output in a comment:
   ```js
   import { weightedAverage } from './grades.js';
   weightedAverage([{ grade: 8, weight: 50 }, { grade: 9, weight: 50 }]); // 8.5
   ```
4. The "Modules" list has one line per module: `` `file.js` - what it does``. Keep it in sync with `index.js`.
5. Use sentence case for headings, no emoji in headings, and keep each section under 15 lines.
6. Link to other documents instead of copying them (`See CHANGELOG.md`).

## JSDoc comments

Every exported function has a JSDoc block. It is read by people and by editors (hover help), so it must be exact.

1. The first sentence says what the function returns, not how: "Weighted average of graded items, rounded to 2
   decimals."
2. One `@param` per parameter, with its type in braces and its meaning: `@param {{ grade: number, weight: number }[]}
   items - weights are percentages or relative weights`.
3. One `@returns` with the type, and the unit or range when there is one (`a value between 0 and 100`).
4. Document every error the function throws on purpose: `@throws {RangeError} when items is empty`.
5. Add `@example` for anything that isn't obvious, with the output in a comment.
6. Never document what the code doesn't do. If the code and the comment disagree, the code wins: say so to the user.

## Architecture decision records

An ADR records one decision that is hard to reverse, so the next person knows why things are the way they are.

1. One file per decision in `docs/adr/`, numbered: `0001-use-node-test.md`, `0002-drop-node-18.md`.
2. The sections are exactly: **Status** (proposed, accepted, superseded by ADR-000N), **Context** (the forces at
   play, in plain words), **Decision** (one paragraph, starting "We will …"), **Consequences** (good and bad).
3. Keep it under one page. Link the issue or pull request that started it.
4. Never edit an accepted ADR to change its decision: write a new one that supersedes it.

## Changelogs and release notes

1. Read `git log` since the last tag and write one entry per commit, grouped into features and fixes.
2. Write the entries for users, in the past tense, and leave out internal work.
3. Add the section to the top of `CHANGELOG.md` under `## [Unreleased]`.

## Explaining errors and crashes

1. Read the stack trace and find the first frame in a file of the project.
2. Explain the error in plain words, show the line, and propose a fix.

## Code comments

1. Comment why, not what: the code already says what it does.
2. Keep a comment next to the line it explains, and delete comments that no longer match the code.
3. A `TODO:` comment names who or what it waits for.

## Exporting reports

1. Export grades or reports to CSV, Markdown or JSON when the user asks for a file they can share.
2. Put one record per line, with a header row for CSV.
