# 🟢 Easy · A hook that says no

> 🕐 10 min · 🆓 free checks · 🤖 optional agent check (about 1 prompt)

## 🎯 Mission
One day an agent *will* try `rm -rf` on the wrong folder. Make sure that in this project it physically can't.
The hook is already wired up in `.github/hooks/guardrails.json`; it runs
`.github/hooks/scripts/guard.mjs` before every tool call. Fill in `isRecursiveForceDelete()` and `decide()` so it
blocks recursive force-deletes, **every spelling of them**, while letting normal work through.

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

<details><summary>The helpers do the splitting</summary>

`segments("cd build && rm -rf x")` gives `["cd build", "rm -rf x"]`, and `words("sudo rm -r -f x")` gives
`["rm", "-r", "-f", "x"]` (it drops `sudo`). So `isRecursiveForceDelete` only looks at one command's flags:
are "recursive" **and** "force" both there, in short (`-rf`, `-r -f`) or long (`--recursive --force`) form?

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
