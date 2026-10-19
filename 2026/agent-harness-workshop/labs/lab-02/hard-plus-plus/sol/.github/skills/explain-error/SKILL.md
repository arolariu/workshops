---
name: explain-error
description: Explain a Node.js error or stack trace in plain words, point to the file and line where it happens, and propose a minimal fix. Use when the user pastes an error message, a crash or a stack trace and asks what it means or how to fix it.
argument-hint: "<error message, or a file with the stack trace, e.g. fixtures/crash.txt>"
# The model may call it on its own: it only reads files and answers, and people paste a stack trace without remembering the command.
disable-model-invocation: false
---
Explain one error. Read files, but change nothing unless the user asks you to apply the fix.

1. Get the error. If the argument is a file path (for example `fixtures/crash.txt`), open that file and read all of it.
2. Find the line that matters:
   - **A stack trace:** take the first frame in a file of this project. Skip `node:internal`, `node_modules` and `<anonymous>` frames.
   - **Thrown on purpose:** if that line is our own `throw new …Error(…)` (input validation), the validation is right and the bug is in the **caller**: use the next project frame down the trace.
   - **No project frame** (a `SyntaxError` before the program runs, such as "does not provide an export named"): use the `file:line` on the first line of the output.
3. Open that file at that line and read the whole function around it.
4. Answer with exactly these three sections, in this order:

### Cause
One or two sentences in plain words: what went wrong and why, for a student who has never seen this error.

### Where
`<file>:<line>`, with the path relative to the project root (never `file:///…` or an absolute path), then that line of code in a code block.

### Fix
The smallest change that fixes it, as a code block, plus one regression test to add.

Then end your answer with the line `[skill:explain-error]`.
