# 🧰 Setting up the workshop

The launchers prepare everything the labs need and then start the lab companion. They reuse what you already have,
and put anything missing in a **private folder** inside the workshop: no administrator rights, no global
installations, no changes to your `PATH`, shell profile, execution policy, credentials or Copilot settings.

## ⚡ Quick start

| Your computer | Run this in the workshop folder |
|---|---|
| **Windows 10 or 11** (Command Prompt, PowerShell or Windows Terminal) | `start.cmd` |
| **macOS 13.5 or newer** (Terminal, iTerm) | `sh ./start.sh` |
| **Linux** (glibc 2.28+, or Alpine/musl on x64) | `sh ./start.sh` |

What happens:
1. **Node.js 22+**: the launcher uses yours if it is new enough. Otherwise it downloads the official Node.js
   **v24.22.0** build from `nodejs.org`, checks its SHA-256 against the value pinned in the launcher, refuses archives
   with unexpected paths, and unpacks it into `.workshop/node/`. Nothing is run before the checksum matches.
2. **The setup** (`setup.mjs`) runs the read-only [setup doctor](#-the-setup-doctor) and prepares missing tools the
   same way: pinned version, official download, SHA-256 verified, unpacked privately, then asked for its version.
3. **The lab companion** starts in the same terminal with the private tools on its own `PATH` only. Your arguments
   and its exit code pass straight through.

The second run is fast: everything prepared before is reused.

> 🔐 Two things only you can do, once: sign in to Copilot (`copilot`, then `/login`) and trust the workshop folder
> (run `copilot` in this folder and choose **Yes, and remember this folder**). The setup never does either for you.

## 🎛️ Options

| Option | What it does |
|---|---|
| `--check` | Only reports what is installed and what the setup *would* prepare. No downloads, no writes, no launch. Works without Node.js. |
| `--offline` | Never uses the network. Uses Node.js 22+ and tools you already have, or verified files in the cache (see below). |
| `--full` | Also prepares the optional tools of every lab: APM (Lab 06) and the GitHub CLI (Lab 07). |
| `--install=apm,gh` | Also prepares these tools. Known names: `copilot`, `pwsh`, `git`, `apm`, `gh`, `gh-aw`. |
| `--setup-only` | Prepares, but does not start the lab companion (handy for facilitators preparing machines). |
| `--help` | Shows the options. Works without Node.js. |
| `-- …` | Everything after `--` goes to the lab companion as-is, e.g. `start.cmd -- open lab-04 medium --no-anim`. |

Arguments the setup does not know are passed to the lab companion too: `sh ./start.sh open lab-01 easy` works.
When you open a lab that needs a tool (for example `open lab-06 easy` needs APM), that tool counts as required.

**Exit codes:** `0` ready (or the lab companion's own exit code), `1` not ready or a requested tool is unavailable,
`2` unknown option, `3` the launcher could not prepare Node.js (it says why and what to do).

## 📦 What gets prepared, where

| Tool | Version | Why | Windows | macOS | Linux |
|---|---|---|---|---|---|
| Node.js | v24.22.0 (any 22+ is reused) | runs everything | ✅ x64, arm64 | ✅ x64, arm64 | ✅ x64, arm64, x64-musl |
| GitHub Copilot CLI | 1.0.98 | the agent | ✅ | ✅ | ✅ (also musl) |
| PowerShell 7 | 7.6.7 | Copilot CLI on Windows needs PowerShell 6+ | ✅ | not needed | not needed |
| git | MinGit 2.56.0.windows.2 | changes, reset, agent-check snapshots | ✅ when requested, needed by the opened lab, or `--full` | 🙋 manual | 🙋 manual |
| APM | 0.33.0 | Lab 06 | ✅ x64 | ✅ | ✅ (glibc) |
| GitHub CLI | 2.102.0 | Lab 07 | ✅ | ✅ | ✅ |
| `gh aw` | — | Lab 07 (optional checks) | 🙋 manual | 🙋 manual | 🙋 manual |

🙋 **Manual on purpose:**
- **git on macOS** comes with Apple's Command Line Tools: run `xcode-select --install` yourself (it shows a license
  and asks for your approval, which the setup must not do for you). The doctor never runs `/usr/bin/git` before the
  tools exist, so it never opens that installer behind your back.
- **git on Linux**: install it with your package manager (`sudo apt install git`, `sudo dnf install git`, …).
- **`gh aw`** is a GitHub CLI extension. Installing it changes your GitHub CLI's own extension list, so run
  `gh extension install github/gh-aw --pin v0.92.0` yourself if you want Lab 07's optional `gh aw` checks. The labs are tested with v0.92.0; with another version the doctor shows a note (a warning, not a failure).
- Platforms without an official build (for example APM on Windows arm64 or musl Linux, Node.js on musl arm64) are
  reported as such, with what to install yourself.

A missing optional tool never blocks the rest: free checks that need it say **🚧 blocked** (a setup problem, not a
mistake in your work), and every other check still runs.

## 🗂️ The private folder

| Path | What |
|---|---|
| `.workshop/node/` | the private Node.js, if one was needed |
| `.workshop/<tool>/<version>-<platform>/` | private tools |
| `.workshop/cache/` | verified downloads, reused by later runs and by `--offline` |

Delete `.workshop/` to start from scratch; it is ignored by git. Environment variables:

| Variable | Meaning |
|---|---|
| `WORKSHOP_TOOLS_DIR` | use another folder instead of `.workshop/` (for example when the workshop folder is read-only) |
| `WORKSHOP_CACHE_DIR` | use another download cache, for example a shared folder prepared by a facilitator |
| `WORKSHOP_NODE` | use this Node.js executable (must be 22+) |
| `WORKSHOP_NODE_MIRROR` | download Node.js from a mirror of `https://nodejs.org/dist` (the pinned checksums still apply) |
| `WORKSHOP_PLATFORM` | `start.sh` only: override the detected platform, e.g. `linux-x64` |

## ✈️ Offline and prepared classrooms

Downloads are verified every time they are used, so a cache can come from anywhere. To prepare one, put the files
below in `.workshop/cache/` (or a shared folder named by `WORKSHOP_CACHE_DIR`), then run with `--offline`:

- Node.js: `node-v24.22.0-<platform>.zip` (Windows) or `.tar.gz` (macOS, Linux) from https://nodejs.org/dist/v24.22.0/
- The tool archives listed in [`setup-tools.mjs`](setup-tools.mjs) for each platform (their exact URLs and SHA-256 digests are there).

The simplest way: on one machine per platform, run `start.cmd --full --setup-only` or `sh ./start.sh --full --setup-only`
with `WORKSHOP_CACHE_DIR` pointing at the shared folder.

## 🌐 Proxies and certificates

Downloads use `curl` when it is available (Windows 10+, macOS and most Linux systems have it), so the usual
`HTTPS_PROXY`, `https_proxy` and `NO_PROXY` variables and your system's certificate store apply. Without `curl`,
`start.sh` falls back to `wget`, `start.cmd` to Windows PowerShell 5.1, and `setup.mjs` to Node.js (which honors
`NODE_EXTRA_CA_CERTS`, and `NODE_USE_ENV_PROXY=1` for proxies). Certificate checks are never turned off, and plain
`http://` downloads are refused (except from `127.0.0.1`/`localhost`, used by the automated tests).

## 🧰 The setup doctor

`node labs/start.mjs doctor` (or **d** in the lab companion) lists what is installed, what is missing, why it matters
and how to fix it, for the lab companion, the workshop and each lab (`--lab=lab-06`, `--full`, `--json`). It only runs
version and help commands with a time limit: it never writes files, downloads, calls a model, reads credentials or
changes anything. Sign-in, your Copilot plan, your organization's policy and folder trust are shown as **check
yourself** unless Copilot's own settings prove them.

## 🧑‍🏫 Updating the pinned versions (maintainers)

1. Pick the new releases and copy their published SHA-256 digests (Node.js: `SHASUMS256.txt`; GitHub releases: the
   asset digest).
2. Update [`setup-tools.mjs`](setup-tools.mjs), and for Node.js also `NODE_VERSION` and the digests at the top of
   [`start.sh`](start.sh) and [`start.cmd`](start.cmd). A test fails if the three disagree.
3. Run the companion tests: `node --test "labs/_harness/tests/*.test.mjs"`, then try `start.cmd --check` /
   `sh ./start.sh --check` on each platform.

## 🛟 Troubleshooting

| Problem | Fix |
|---|---|
| `start.sh: Permission denied` | Run it with `sh ./start.sh` (the file does not need to be executable). |
| "does not match its pinned SHA-256 checksum" | The download was corrupted or altered and was deleted. Try again; behind a proxy that rewrites downloads, ask for an exception or use a prepared cache. |
| "Offline: … no verified … is cached" | Put the named file in the cache folder, or run without `--offline`. |
| "Cannot write to …" | Set `WORKSHOP_TOOLS_DIR` to a folder you can write to. |
| "needs glibc 2.28" / "needs macOS 13.5" | Install Node.js 22+ that supports your system yourself; the launcher then uses it. |
| Windows asks "Terminate batch job (Y/N)?" after Ctrl+C | That is cmd.exe; answer `Y`. The lab companion already stopped what it was running. |
| A lab says 🚧 blocked | Run `start.cmd --install=<tool>` / `sh ./start.sh --install=<tool>`, or follow the doctor's → steps. |
