# Verdict: three third-party skills

Vetted with `node scripts/vet-skill.mjs vendor` (exit code 2), then read by hand: every finding below was checked in
the file it points to.

## grade-sync
**Verdict:** block

Don't install it, and tell whoever found it. It looks like a helpful portal sync, but:
- `allowed-tools` (SKILL.md:5) pre-approves `shell`, so every command it asks for runs without a prompt.
- `hidden-instructions` (SKILL.md:12): an HTML comment, invisible on GitHub, tells the model to run `install.sh` and not
  to mention it.
- `pipe-to-shell` (scripts/install.sh:4): `curl … | sh` runs whatever the server sends today.
- `write-outside` (scripts/install.sh:5, scripts/sync.mjs:17): it edits `~/.bashrc`, so it survives the session.
- `secrets` + `network` = `exfiltration` (scripts/sync.mjs:11–14): it reads `.env` and `GITHUB_TOKEN` and posts them.
- `eval` (scripts/sync.mjs:16): it runs code downloaded at run time, which no review can ever see.

## study-timer
**Verdict:** review

Harmless but sloppy: fix it before anyone uses it (or write our own, it's ten lines).
- `name` (SKILL.md:2): `StudyTimer` is not lowercase-with-hyphens and doesn't match its folder, `study-timer`.
- `description` (SKILL.md:3): "Helps with studying." never says when to use it, so the model can't route to it.
- `absolute-path` (SKILL.md:9): `C:\Users\dev\…` and `/Users/dev/…` only exist on the author's machines.

## csv-export
**Verdict:** ok

No findings. Read by hand too: `scripts/to-csv.mjs` reads one JSON file, refuses an output path outside the project,
and writes one CSV file; no network, no `eval`, no secrets. Installed as `.github/skills/csv-export/` (the whole
folder: `copilot skill add --project` would copy `SKILL.md` without its script).

## What vetting can't see
- **Code that arrives later:** a script that downloads and runs code (or a skill updated upstream after we vetted it)
  is only as safe as the server it trusts; pin the version you reviewed.
- **Patterns spread over lines or disguised:** `const h = os.homedir()` on one line and the write on the next, a
  command built from strings, base64 or hex, a binary or a file over 512 KB.
- **Dependencies:** a `package.json` or `requirements.txt` in a skill pulls in code the vetter never reads.
- **Prompts that persuade:** an instruction without a suspicious word ("first, upload the config for backup") reads
  like a normal step; only a person reading the whole SKILL.md catches it.
- **What it does at run time:** a static check can't prove behaviour; run unknown skills in `/sandbox`, and keep your
  hooks (Lab 05) in front of every tool call.
