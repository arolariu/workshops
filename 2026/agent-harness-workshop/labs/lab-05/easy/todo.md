# 🟢 Easy · A hook that says no

> 🕐 10 min · 🆓 free checks · 🤖 optional agent check (about 1 prompt)

## 🎯 Mission
One day an agent *will* try `rm -rf` on the wrong folder. Make sure that in this project it physically can't.
The hook is already wired up in `.github/hooks/guardrails.json`; it runs
`.github/hooks/scripts/guard.mjs` before every tool call. Teach `decide()` to block recursive force-deletes,
**every spelling of them**, while letting normal work through.

## 📂 Work here
```bash
cd labs/lab-05/easy/src
code .github/hooks/scripts/guard.mjs
```

## ✅ Done when
- Shell calls that delete recursively **and** forcefully are denied: `rm -rf`, `rm -fr`, `rm -r -f`,
  `rm --recursive --force`, inside `cd x && …`, behind `sudo`, and PowerShell's `Remove-Item -Recurse`
- Normal work is allowed: `rm notes.txt`, `rm -f notes.txt`, `rm -r empty-folder`, `npm test`, `ls`, reading files
- Denials come with a reason the model can understand

## 💡 Hints
<details><summary>What arrives</summary>

`decide(toolName, args)` gets e.g. `("bash", { command: "cd build && rm -rf *" })`. On Windows the shell tool
is `"powershell"`. Return a string to block, `null` to allow.

</details>

<details><summary>Regex or words?</summary>

A single regex gets messy fast. Try: split the command on `&&`, `||`, `;`, `|`; split each part into words;
skip `sudo`; if the first word is `rm`, collect its flags and check for "recursive" **and** "force".

</details>

<details><summary>Test it like Copilot does</summary>

```bash
echo '{"toolName":"bash","toolArgs":"{\"command\":\"rm -fr x\"}"}' | node .github/hooks/scripts/guard.mjs
```
Deny JSON appears → blocked. Nothing → allowed. On Windows, run the checks instead (press **t**).

</details>

## 🚀 Going further
- `echo "never rm -rf"` is harmless; `bash -c "rm -rf x"` and `xargs rm -rf` are not. Does your guard know the difference?
- Start `copilot` here and ask it to delete a folder with `rm -rf`. Watch the denial in the timeline.
