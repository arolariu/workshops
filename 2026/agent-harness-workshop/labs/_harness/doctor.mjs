// The setup doctor: one read-only source of truth for what the workshop needs, what is missing, why it matters
// and how to recover. Used by the lab app, the CLI (`doctor`), the free checks and the native setup.

/** Every tool the workshop knows about. `labs` lists the labs that need it (empty = most labs). */
export const TOOLS = {
  node: {
    label: 'Node.js',
    why: 'Runs the lab companion and every free check.',
    recovery: 'Install Node.js 22 or newer from https://nodejs.org, or run ./start.sh (macOS/Linux) or start.cmd (Windows) to get a private copy.',
  },
  copilot: {
    label: 'GitHub Copilot CLI',
    why: 'The agent you build a harness for; some free checks ask it what it loaded.',
    recovery: 'Install GitHub Copilot CLI (https://docs.github.com/copilot/how-tos/set-up/install-copilot-cli), or run the workshop launcher to prepare a private copy.',
  },
  git: {
    label: 'git',
    why: 'Shows what you changed, resets to your last commit, and snapshots agent-check copies. Free checks mostly work without it.',
    recovery: 'Install git from https://git-scm.com/downloads (macOS: run `xcode-select --install`).',
  },
  pwsh: {
    label: 'PowerShell 7',
    why: 'Copilot CLI on Windows runs shell commands with PowerShell 7 (pwsh).',
    recovery: 'Install PowerShell 7 (https://aka.ms/powershell), or run start.cmd to prepare a private copy.',
  },
  apm: {
    label: 'APM',
    why: 'Agent Package Manager, used by Lab 06.',
    recovery: 'Install APM (Agent Package Manager): https://github.com/microsoft/apm#install, or run the launcher with --install=apm.',
  },
  gh: {
    label: 'GitHub CLI',
    why: 'Hosts the `gh aw` extension used by Lab 07.',
    recovery: 'Install the GitHub CLI from https://cli.github.com, or run the launcher with --install=gh.',
  },
  'gh-aw': {
    label: 'gh aw',
    why: 'Compiles agentic workflows in Lab 07 (those checks are optional).',
    recovery: 'Install the GitHub CLI (https://cli.github.com) and run: gh extension install github/gh-aw',
  },
};

/** One sentence telling a student how to get `tool`. */
export const recoveryFor = (tool) => TOOLS[tool]?.recovery ?? `Install \`${tool}\` and try again.`;
