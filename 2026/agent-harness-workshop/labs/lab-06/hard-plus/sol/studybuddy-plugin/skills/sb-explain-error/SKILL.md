---
name: sb-explain-error
description: Explain an error message or stack trace in plain words, find the exact file and line in this project, and propose a minimal fix. Use when the user pastes an error, a crash or a stack trace, or points to a file that contains one.
argument-hint: "<error message, or a file with the stack trace>"
---
1. Read the error. If the argument is a file path (for example `fixtures/crash.txt`), open that file first.
2. Find the first stack frame that points to a file in **this** project (skip `node:internal` and `<anonymous>` frames).
3. Open that file at that line and read the surrounding function.
4. Answer in exactly this format, short and in plain words:

### Cause
One or two sentences: what went wrong and why, for a student who has never seen this error.

### Where
`<file>:<line>`, then the offending line of code in a code block.

### Fix
The smallest code change that fixes it (a code block), plus one regression test to add.

Do not change any file unless the user asks you to apply the fix.
