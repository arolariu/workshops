// Reviewed tool versions for the workshop setup: exact versions, official download URLs, SHA-256 digests and the
// platforms each build supports. Nothing here is resolved at run time ("latest" is never used).
//
// Provenance (reviewed 2026-10-18): digests are the ones published by each project for these exact assets
// (nodejs.org SHASUMS256.txt; GitHub release asset digests for the others). To update a tool, change its version,
// URLs and digests together, then run the bootstrap and setup tests. start.sh and start.cmd carry the Node.js pin
// too (they run before Node.js exists); a test checks that all three agree.

export const NODE = {
  version: 'v24.22.0',
  minimumMajor: 22,
  source: 'https://nodejs.org/dist/v24.22.0/SHASUMS256.txt',
  assets: {
    'win-x64': { file: 'node-v24.22.0-win-x64.zip', sha256: 'f9683a19877e12a9b167305c8db71040d812876359de21f0d2e97c3f321f80c3' },
    'win-arm64': { file: 'node-v24.22.0-win-arm64.zip', sha256: '3a5c209a5bc59e65b3bc0fa13ed5e166a26bd3d55332847f498b76b037408d61' },
    'darwin-arm64': { file: 'node-v24.22.0-darwin-arm64.tar.gz', sha256: '6a9724d9b50a5f22b4816cded441b5a8d9ddae546191a5e5b7efa5a5e2ee26d5' },
    'darwin-x64': { file: 'node-v24.22.0-darwin-x64.tar.gz', sha256: '495e3f273c645f3c4677d438304cdfc701729ea5dec5728f5c8e76a2dece4b91' },
    'linux-arm64': { file: 'node-v24.22.0-linux-arm64.tar.gz', sha256: 'b7e7991d5407815adfa74a2a9cd4db683552c8ce32ff4a295c22e972849c3f5d' },
    'linux-x64': { file: 'node-v24.22.0-linux-x64.tar.gz', sha256: '28ea0a438de9a13bd7891fd758eee6c7819ee8af5442dfd8d45bd65e56d4228c' },
    'linux-x64-musl': { file: 'node-v24.22.0-linux-x64-musl.tar.gz', sha256: 'a95a0faf28d6f7c493036f0559d6d32b7b8c79aa06e415b12782f96946844484' },
  },
};

const gh = (file) => `https://github.com/${file}`;

/**
 * Tools the setup can prepare privately. Each asset: { url, sha256, size, exe, bin } where `bin` is the folder (inside
 * the unpacked archive) that goes on the companion's PATH and `exe` the program in it. Platform keys:
 * win32-x64, win32-arm64, darwin-x64, darwin-arm64, linux-x64, linux-arm64, linux-x64-musl, linux-arm64-musl.
 */
export const TOOLS = {
  copilot: {
    label: 'GitHub Copilot CLI',
    version: '1.0.98',
    expect: /\b1\.0\.98\b/,
    source: 'https://github.com/github/copilot-cli/releases/tag/v1.0.98',
    assets: {
      'win32-x64': { url: gh('github/copilot-cli/releases/download/v1.0.98/copilot-win32-x64.zip'), sha256: 'e264811888fd77217dc36e9656c13d0b9abbb0433a7041043e1d53798e31fd94', size: 101797948, exe: 'copilot.exe', bin: '.' },
      'win32-arm64': { url: gh('github/copilot-cli/releases/download/v1.0.98/copilot-win32-arm64.zip'), sha256: '031015a42b34bf582c5c77f1cba539917670945fba5986b0efe36c3a173c4a34', size: 102333800, exe: 'copilot.exe', bin: '.' },
      'darwin-arm64': { url: gh('github/copilot-cli/releases/download/v1.0.98/copilot-darwin-arm64.tar.gz'), sha256: 'a87018a0194789313c979906e45e8874699fee50549ea11d0be7bdde88b6b3c8', size: 105462854, exe: 'copilot', bin: '.' },
      'darwin-x64': { url: gh('github/copilot-cli/releases/download/v1.0.98/copilot-darwin-x64.tar.gz'), sha256: 'dfa26894b0c178239daaac527d5aac0a6cfce4bc1ede6fa33d54ccf77a5bb3b5', size: 118588094, exe: 'copilot', bin: '.' },
      'linux-x64': { url: gh('github/copilot-cli/releases/download/v1.0.98/copilot-linux-x64.tar.gz'), sha256: '87ddb4b3f98462b7cb13c0a6857c68ee410ec9673e2e5f64ee5bedad45825b05', size: 116812784, exe: 'copilot', bin: '.' },
      'linux-arm64': { url: gh('github/copilot-cli/releases/download/v1.0.98/copilot-linux-arm64.tar.gz'), sha256: 'a7509dcac0e5f22886788ba4c1e2f8b9b07367e84714e42b9e7cee4d8f9fa5f2', size: 118208926, exe: 'copilot', bin: '.' },
      'linux-x64-musl': { url: gh('github/copilot-cli/releases/download/v1.0.98/copilot-linuxmusl-x64.tar.gz'), sha256: '6f6d035f92f70f45f1a9d90b7a4ce2207cbdc0c81bffb88783922b558a6244b1', size: 120995932, exe: 'copilot', bin: '.' },
      'linux-arm64-musl': { url: gh('github/copilot-cli/releases/download/v1.0.98/copilot-linuxmusl-arm64.tar.gz'), sha256: '2ee466d8c13c9e75efdecf786bbb29cb4999cb028b455a3539165d1d5c734a38', size: 117532067, exe: 'copilot', bin: '.' },
    },
  },
  // Copilot CLI on Windows needs PowerShell 6 or newer; Windows only ships Windows PowerShell 5.1.
  pwsh: {
    label: 'PowerShell 7',
    version: '7.6.7',
    expect: /\b7\.6\.7\b/,
    source: 'https://github.com/PowerShell/PowerShell/releases/tag/v7.6.7',
    assets: {
      'win32-x64': { url: gh('PowerShell/PowerShell/releases/download/v7.6.7/PowerShell-7.6.7-win-x64.zip'), sha256: 'd2f952ebdbf24386cb8923553aa58e41a846db35a6155ea04c58142a4b16dbb7', size: 106364316, exe: 'pwsh.exe', bin: '.' },
      'win32-arm64': { url: gh('PowerShell/PowerShell/releases/download/v7.6.7/PowerShell-7.6.7-win-arm64.zip'), sha256: '119bd9221254ef3637523cb1990797618f5fd68848b57de40f12b561d743149e', size: 99570891, exe: 'pwsh.exe', bin: '.' },
    },
  },
  // MinGit is Git for Windows' official portable build. macOS and Linux have no equivalent: see MANUAL.git.
  git: {
    label: 'git (MinGit)',
    version: '2.56.0.windows.2',
    expect: /\b2\.56\.0\b/,
    source: 'https://github.com/git-for-windows/git/releases/tag/v2.56.0.windows.2',
    assets: {
      'win32-x64': { url: gh('git-for-windows/git/releases/download/v2.56.0.windows.2/MinGit-2.56.0.2-64-bit.zip'), sha256: 'da35e72aa21c005a5a0d298cfbae110bc1609a815730ea0dde84b01a1b3cd3be', size: 39806486, exe: 'git.exe', bin: 'cmd' },
      'win32-arm64': { url: gh('git-for-windows/git/releases/download/v2.56.0.windows.2/MinGit-2.56.0.2-arm64.zip'), sha256: '38b33dc6024026e3315cf88ab2cfea65205bbd7bb3a8e824bd21c8ad4fe609a7', size: 37936336, exe: 'git.exe', bin: 'cmd' },
    },
  },
  apm: {
    label: 'APM',
    version: '0.33.0',
    expect: /\b0\.33\.0\b/,
    source: 'https://github.com/microsoft/apm/releases/tag/v0.33.0',
    assets: {
      'win32-x64': { url: gh('microsoft/apm/releases/download/v0.33.0/apm-windows-x86_64.zip'), sha256: 'ab0fba071ef9c04a72fc2c13314f71ebd10fdb599ba3c985a09f5ba38095d0a1', size: 19765595, exe: 'apm.exe', bin: 'apm-windows-x86_64' },
      'darwin-arm64': { url: gh('microsoft/apm/releases/download/v0.33.0/apm-darwin-arm64.tar.gz'), sha256: '312002dca9e1410557bc0da414b7d9bc8438c905c6573e81c06370fde9910857', size: 23694173, exe: 'apm', bin: 'apm-darwin-arm64' },
      'darwin-x64': { url: gh('microsoft/apm/releases/download/v0.33.0/apm-darwin-x86_64.tar.gz'), sha256: 'a192f5915b44dac0f7aed9574a98e34e7cda96607760999e4601d1fde773c4f9', size: 25096606, exe: 'apm', bin: 'apm-darwin-x86_64' },
      'linux-x64': { url: gh('microsoft/apm/releases/download/v0.33.0/apm-linux-x86_64.tar.gz'), sha256: 'e6374402c74318f7c8bef97a90d8572d049fdab0dc3871492c6b0647ae9e881f', size: 14715978, exe: 'apm', bin: 'apm-linux-x86_64' },
      'linux-arm64': { url: gh('microsoft/apm/releases/download/v0.33.0/apm-linux-arm64.tar.gz'), sha256: 'ac40dd0efd1af35a56847beedde96854530d2f54851e026728da017d3af827f8', size: 14547184, exe: 'apm', bin: 'apm-linux-arm64' },
    },
  },
  gh: {
    label: 'GitHub CLI',
    version: '2.102.0',
    expect: /\b2\.102\.0\b/,
    source: 'https://github.com/cli/cli/releases/tag/v2.102.0',
    assets: {
      'win32-x64': { url: gh('cli/cli/releases/download/v2.102.0/gh_2.102.0_windows_amd64.zip'), sha256: 'ae64e556ecc240b200f7eba60d550e4bb60d78e860e69dd88c449405b86067f4', size: 15512013, exe: 'gh.exe', bin: 'bin' },
      'win32-arm64': { url: gh('cli/cli/releases/download/v2.102.0/gh_2.102.0_windows_arm64.zip'), sha256: '5dcf12aa8525eabd0c46ec414f323ab6cf65229fc2cd46543cc705001bbaf223', size: 13907525, exe: 'gh.exe', bin: 'bin' },
      'darwin-arm64': { url: gh('cli/cli/releases/download/v2.102.0/gh_2.102.0_macOS_arm64.zip'), sha256: 'da922c20d1792e5b2cbf375593d7a658acf034c12c84e007e71c76ef959c337e', size: 14359983, exe: 'gh', bin: 'gh_2.102.0_macOS_arm64/bin' },
      'darwin-x64': { url: gh('cli/cli/releases/download/v2.102.0/gh_2.102.0_macOS_amd64.zip'), sha256: 'b245f24eb2bf5f75b426b4c26da3651a107f8d5b6f4fddfbfccc5679041378b3', size: 15995994, exe: 'gh', bin: 'gh_2.102.0_macOS_amd64/bin' },
      'linux-x64': { url: gh('cli/cli/releases/download/v2.102.0/gh_2.102.0_linux_amd64.tar.gz'), sha256: 'bb766f710eef8ede859c18578c72c327597cd4c8a85b06001b1f3843c6019386', size: 15319960, exe: 'gh', bin: 'gh_2.102.0_linux_amd64/bin' },
      'linux-arm64': { url: gh('cli/cli/releases/download/v2.102.0/gh_2.102.0_linux_arm64.tar.gz'), sha256: '7862c86c72f43df3a2d93ddde6f473285b4e2af61b494849846827e513ef6484', size: 13917794, exe: 'gh', bin: 'gh_2.102.0_linux_arm64/bin' },
      'linux-x64-musl': { url: gh('cli/cli/releases/download/v2.102.0/gh_2.102.0_linux_amd64.tar.gz'), sha256: 'bb766f710eef8ede859c18578c72c327597cd4c8a85b06001b1f3843c6019386', size: 15319960, exe: 'gh', bin: 'gh_2.102.0_linux_amd64/bin' },
    },
  },
};

/** What the setup will not do for you, and why. Shown with the exact action to take. */
export const MANUAL = {
  git: {
    darwin: 'git comes with Apple\'s Command Line Tools. Run `xcode-select --install` yourself (it shows a license and asks for approval).',
    linux: 'Install git with your package manager, for example `sudo apt install git` or `sudo dnf install git`.',
  },
  'gh-aw': {
    all: '`gh aw` is a GitHub CLI extension; installing it changes your GitHub CLI\'s own extension list, so the setup leaves it to you: `gh extension install github/gh-aw` (Lab 07\'s gh aw checks are optional).',
  },
};

/** Which tools only make sense on some platforms. */
export const PLATFORM_ONLY = { pwsh: ['win32'], git: ['win32'] };
