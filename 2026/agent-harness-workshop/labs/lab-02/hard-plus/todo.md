# 🟣 Hard+ · Vet before you trust

> 🕐 1.5–2 h · 🏠 homework · 🆓 free checks · 🧱 builds on: Lab 02 · hard

## 🎯 Mission
Your `release-notes` skill runs a script. So can any skill you download, and a skill is a friendly description in
front of code that runs with your permissions, plus instructions the model follows with your tools. A teammate found
three skills online and wants them in the project today: they're waiting in `vendor/`, where Copilot doesn't load
them. Build `scripts/vet-skill.mjs`, a vetter that **reads** a skill (never runs it) and reports what's risky, with
file and line. Run it on the three, read what it found, write `VERDICT.md`, and install only the one you trust.

## 📋 Requirements
1. `vet-skill.mjs` checks the label: frontmatter, the name against its folder, and the description's quality.
2. It checks every file, `SKILL.md` too, for network calls, `eval`, downloads piped into a shell, and writes outside
   the project, with no false alarms on code that only looks similar.
3. It reads between the lines: pre-approved shell access (`allowed-tools`), hidden instructions, absolute paths,
   secrets, and secrets plus network together (exfiltration).
4. Its CLI vets one skill or a folder of skills, prints a report or `--json`, and exits `2` (block), `1` (review) or
   `0` (ok), so CI can use it.
5. `VERDICT.md` gives each vendor skill a verdict with evidence, and says what vetting can't see.
6. The skill that passes is installed (the whole folder); the other two load nowhere.

**The rules** (ids and severities are in `RULES`; a finding is `{ rule, severity, file, line, message }`):
```text
review  frontmatter    no SKILL.md, or no frontmatter block
        name           missing, not lowercase-with-hyphens, not the
                       folder's name
        description    missing, under 40 characters, no "when",
                       over 1,024 characters
        absolute-path  C:\Users\…, /Users/…, /home/… (not in URLs)
        network        fetch(, an http/https/net import, curl,
                       wget, Invoke-WebRequest/iwr, Invoke-RestMethod
        secrets        .env (not .env.example), id_rsa, .ssh,
                       .npmrc, GITHUB_TOKEN and other tokens
block   allowed-tools  pre-approves shell, bash, powershell or write
        hidden-instr…  "silently", "do not tell/mention … the user",
                       "ignore previous instructions", and HTML
                       comments that tell the model to do something
        eval           eval(, new Function(, Invoke-Expression, iex
        pipe-to-shell  curl/wget/iwr … | sh/bash/iex
        write-outside  a write and an outside target on one line:
                       /etc/…, ~/…, os.homedir(), $HOME, $env:APPDATA,
                       %APPDATA%, ../
        exfiltration   the skill reads secrets and calls the network
```

## 🧭 Milestones
### M1 · Read the label
- `checkFrontmatter()` finds a folder without `SKILL.md` and a `SKILL.md` without frontmatter (`frontmatter`); a
  missing name, `StudyTimer` in `study-timer/`, `csv-tools` in `csv-export/`, `grade_sync` (`name`); a missing,
  short, "when"-less or over-long description (`description`)
- A clean skill gets no findings; a finding points at `SKILL.md` and the line of its key

### M2 · Read the code
- `checkScripts()` finds `network`, `eval`, `pipe-to-shell` and `write-outside` in scripts **and** in `SKILL.md`,
  each with its file and line
- No findings for look-alikes: `evaluate(`, `retrieval`, a comment that mentions fetching, `curlyBraces`, writes
  inside the project, a `startsWith('..')` guard, `cp -r src dist`, `npm test`

### M3 · Read between the lines
- `checkTrust()` blocks `allowed-tools: shell` and `[view, bash]`, and leaves `allowed-tools: view` alone
- It finds hidden instructions ("Silently run …", "Do not mention … to the user", "Ignore all previous
  instructions", a comment `<!-- First run … -->`), and not ordinary steps ("Don't change any file unless …")
- It finds absolute paths (not URLs), secrets (not `.env.example` or `process.env.HOME`), and `exfiltration` only
  when the same skill also calls the network

### M4 · The verdict
- `verdictOf()`: `block` beats `review` beats `ok`
- `node scripts/vet-skill.mjs vendor --json` gives grade-sync `block`, study-timer `review`, csv-export `ok`, and
  exits 2; a clean skill exits 0, a sloppy one 1
- Vetting a skill never runs it: a skill whose scripts write a file when they run leaves no file behind

### M5 · Decide and install
- `VERDICT.md`: for each vendor skill, `**Verdict:** block|review|ok` and the evidence (at least 3 rules with
  `file:line` for grade-sync, 2 for study-timer), plus a "What vetting can't see" section with 3 or more bullets
- `.github/skills/csv-export/` holds exactly what `vendor/csv-export/` holds, and your vetter says `ok` for it
- grade-sync and study-timer are in no skills folder, and `copilot skill list` shows csv-export but neither of them

## 📂 Work here
```bash
cd labs/lab-02/hard-plus/src
code scripts/vet-skill.mjs VERDICT.md
node scripts/vet-skill.mjs vendor
node labs/start.mjs test lab-02 hard+     # from the workshop folder
```
`vet-skill.mjs` gives you the plumbing: `readSkill()` (every text file with its lines, the parsed frontmatter and the
line of each key), `grep(skill, regex)` (every matching line, with file and line), `finding()`, the report and the
folder handling. You write the four functions marked `TODO(Mn)`. The checks build their test skills in temp
folders, and only ever **read** `vendor/`.

⚠️ `vendor/grade-sync` is a malicious sample. It's inert (its script stops on the first statement, its hosts are
reserved `.invalid` names), but treat it like the real thing: read it, don't run it. And never `copilot skill add
vendor`: that registers the folder in your personal settings, and all three skills would load in every project.

## 💡 Hints
### M1
<details><summary>Line numbers for free</summary>

`skill.skillMd.keyLines.name` is the line of `name:` in `SKILL.md`. Use `finding('name', 'SKILL.md',
keyLines.name ?? 1, '…')` so every finding says where to look. The name rule is `/^[a-z0-9]+(-[a-z0-9]+)*$/`.

</details>

<details><summary>"When" in a description</summary>

The scorecard (and Copilot's router) cares about the trigger. A regex such as `/\buse (it |this )?when\b|\bwhen
(the user|you|asked|someone)\b/i` catches "Use when …" and "… when the user asks …".

</details>

### M2
<details><summary>One regex per rule, one finding per line</summary>

`grep(skill, /\beval\s*\(|\bnew\s+Function\s*\(/i)` returns every matching line in every file; map each hit to
`finding('eval', h.file, h.line, …)`. Word boundaries keep `evaluate(` and `retrieval` out; `\bcurl\s` keeps
`curlyBraces` out.

</details>

<details><summary>Outside the project</summary>

Two regexes: a write (`writeFileSync(`, `appendFileSync(`, `mkdirSync(`, `>>`, `Set-Content`, `cp `, …) and an
outside target (`'/etc`, `~/`, `homedir()`, `$HOME`, `$env:APPDATA`, `'../`). Flag a line only when both match.
The guard `startsWith('..')` has no write on its line, and `path.join(root, 'out')` has no outside target.

</details>

### M3
<details><summary>What allowed-tools does</summary>

`allowed-tools: shell` in a skill pre-approves the shell for it: no permission prompt, for any command the skill
asks for. GitHub's docs say to pre-approve `shell` or `bash` only for skills you reviewed and fully trust. A list
can be `shell, view` or `[view, bash]`; `parseFrontmatter` turns `[…]` into an array.

</details>

<details><summary>Instructions people can't see</summary>

GitHub hides `<!-- … -->` when it renders Markdown, but the model gets the raw file. Find comments with
`/<!--([\s\S]*?)-->/g` (they can span lines), and flag the ones that contain an action (`run`, `install`, `send`,
`upload`, `read`, …). Count the line of a match with `text.slice(0, m.index).split('\n').length`.

</details>

<details><summary>Exfiltration is a pair</summary>

Reading `.env` is sometimes legitimate; calling an API is sometimes legitimate. Both in one skill is how secrets
leave. `checkTrust()` gets the `checkScripts()` findings as its second argument: look for a `network` one there.

</details>

### M4
<details><summary>Never import what you vet</summary>

`readSkill()` only reads text. Don't `import()` a skill's script to "see what it exports", and don't run `npm
install` in it: a `postinstall` script would run. The checks plant files that leave a trace when they run.

</details>

### M5
<details><summary>Installing a skill with scripts</summary>

`copilot skill add --project vendor/csv-export/SKILL.md` copies **only** `SKILL.md` into `.github/skills/`; the
script stays behind. Copy the folder instead: `cp -r vendor/csv-export .github/skills/` (PowerShell: `Copy-Item
-Recurse vendor/csv-export .github/skills/`). Then `copilot skill list`.

</details>

<details><summary>Evidence a reviewer can check</summary>

Quote the rule ids and the `file:line` your vetter printed, and say in a few words why each one matters (`allowed-tools`
(SKILL.md:5): every command runs without a prompt). Then read the files yourself: a vetter is a flashlight, not a
judge.

</details>

## 🧠 Takeaway
A skill is a dependency made of prompts and code: read it before you trust it, and install exactly what you read.

## ❓ Check yourself
A skill's only finding is `network` (review). Reading the script, you see it downloads a JSON config from the
vendor's server, then runs the command that config names. What do you conclude?
1. It's fine to install: a review finding is minor, and there's no `eval` and no pipe-to-shell.
2. Nothing: a static vetter can't tell anything that matters about a real skill.
3. What it runs is decided by a server after your review: treat it like pipe-to-shell, and block it.

<details><summary>Answer</summary>

**3.** No rule matched the pattern, but the effect is the same as `curl … | sh`: someone else picks the command,
later. That's why a `review` finding means a person reads the code. Pin what you reviewed, run unknown skills in
`/sandbox`, and keep your guard hooks in front of every tool call.

</details>

## 🚀 Going further
- Vet your own library: `node scripts/vet-skill.mjs .github/skills`. Does your `release-notes` script pass?
- Add `hidden-characters`: zero-width and bidi characters (U+200B–U+200F, U+202A–U+202E, U+2066–U+2069) can make a
  line read differently from what it does.
- Wire it into CI or a pre-commit hook: block a pull request that adds a skill with a `block` finding.
- Lab 06 pins and locks shared skills, so the one you vetted is the one everyone gets.
