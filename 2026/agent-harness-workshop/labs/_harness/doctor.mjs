// The setup doctor: one read-only source of truth for what the workshop needs, what is missing, why it matters and
// how to recover. Used by the lab app, the CLI (`doctor`), the free checks and the native setup.
// Inspection only runs bounded `--version`/`--help` style commands: it never writes files, downloads, signs in,
// calls a model, reads credentials or changes the environment.
import { runProcess, resolveCommand } from './process.mjs';
import { isTrusted } from './kit.mjs';

/** Every tool the workshop knows about, with the shared explanation and recovery text. */
export const TOOLS = {
  node: {
    label: 'Node.js',
    why: 'Runs the lab companion and every free check.',
    recovery: 'Install Node.js 22 or newer from https://nodejs.org, or run ./start.sh (macOS/Linux) or start.cmd (Windows) to get a private copy.',
  },
  copilot: {
    label: 'GitHub Copilot CLI',
    why: 'The agent you build a harness for; some free checks ask it what it loaded.',
    recovery: 'Install GitHub Copilot CLI (https://docs.github.com/copilot/how-tos/set-up/install-copilot-cli), or run the workshop launcher (start.cmd / ./start.sh) to prepare a private copy.',
  },
  pwsh: {
    label: 'PowerShell 7',
    why: 'Copilot CLI on Windows needs PowerShell 6 or newer (pwsh) to run shell commands.',
    recovery: 'Install PowerShell 7 (https://aka.ms/powershell), or run start.cmd to prepare a private copy.',
  },
  git: {
    label: 'git',
    why: 'Shows what you changed, resets to your last commit and snapshots agent-check copies. Most free checks work without it.',
    recovery: 'Install git from https://git-scm.com/downloads (macOS: run `xcode-select --install`; Windows: start.cmd --install=git prepares a private copy).',
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
    recovery: 'Install the GitHub CLI (https://cli.github.com), then run yourself: gh extension install github/gh-aw',
  },
};

/** One sentence telling a student how to get `tool`. */
export const recoveryFor = (tool) => TOOLS[tool]?.recovery ?? `Install \`${tool}\` and try again.`;

/** Reviewed minimums. Copilot is validated by the capabilities the labs use rather than by a version number. */
export const MINIMUMS = { node: '22.0.0', git: '2.20.0', pwsh: '6.0.0' };
export const COPILOT_CAPABILITIES = ['--max-ai-credits', '--plugin-dir', '--allow-tool', '--deny-tool', '--no-ask-user', '--agent', 'instruction'];
/** Tools a lab needs (required) or benefits from (recommended). */
export const LAB_TOOLS = { 'lab-02': { required: ['git'] }, 'lab-06': { required: ['apm'] }, 'lab-07': { recommended: ['gh', 'gh-aw'] } };
export const OPTIONAL_TOOLS = ['git', 'apm', 'gh', 'gh-aw'];
export const SUPPORTED = { win32: ['x64', 'arm64'], darwin: ['x64', 'arm64'], linux: ['x64', 'arm64'] };

const versionOf = (s) => String(s ?? '').match(/\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?/)?.[0]?.replace(/\.$/, '') ?? null;
const parts = (v) => (versionOf(v) ?? '0.0.0').split(/[^\d]+/).slice(0, 3).map(Number);
export function atLeast(version, min) {
  const a = parts(version);
  const b = parts(min);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return true;
}

/** Runs one bounded, read-only command. Update notifiers are switched off so nothing reaches the network. */
export function defaultProbe(cmd, args, { env = process.env, timeout = 15000 } = {}) {
  return runProcess(cmd, args, {
    env: { ...env, GH_NO_UPDATE_NOTIFIER: '1', GH_NO_EXTENSION_UPDATE_NOTIFIER: '1', GH_PROMPT_DISABLED: '1', NO_COLOR: '1' },
    timeout,
    maxOutput: 256 * 1024,
  });
}

/**
 * Inspect the machine. Resolves:
 * { ready, coreReady, platform, arch, items: [{ id, label, status, version, required, category, message, why, recovery }] }
 * status: ready | missing | incompatible | manual | optional
 */
export async function inspectEnvironment({
  rootDir,
  full = false,
  requirements = [],
  lab = null,
  probe: probeFn = defaultProbe,
  probeTimeout = 15000,
  platform = process.platform,
  arch = process.arch,
  env = process.env,
  nodeVersion = process.versions.node,
  readTrust = (dir) => isTrusted(dir),
  which = (cmd) => resolveCommand(cmd, { env, platform }),
} = {}) {
  const probe = (cmd, args) => probeFn(cmd, args, { env, timeout: probeTimeout });
  const required = new Set(requirements);
  const recommended = new Set();
  if (full) OPTIONAL_TOOLS.forEach((t) => required.add(t));
  for (const t of LAB_TOOLS[lab]?.required ?? []) required.add(t);
  for (const t of LAB_TOOLS[lab]?.recommended ?? []) recommended.add(t);
  const items = [];
  const add = (id, status, message, extra = {}) => {
    const meta = TOOLS[id] ?? {};
    const it = { id, label: extra.label ?? meta.label ?? id, status, version: extra.version ?? null, required: extra.required ?? false, category: extra.category ?? 'lab', message, why: extra.why ?? meta.why ?? '', recovery: extra.recovery ?? meta.recovery ?? '' };
    items.push(it);
    return it;
  };

  // Platform and the companion itself.
  const supported = SUPPORTED[platform]?.includes(arch);
  add('platform', supported ? 'ready' : 'incompatible', supported ? `${platform}-${arch} is supported.` : `${platform}-${arch} is not a supported workshop platform (supported: Windows, macOS and Linux on x64 or arm64).`, { label: 'Platform', category: 'core', required: true, why: 'The launchers and tool downloads exist for these platforms only.', recovery: 'Use a Windows, macOS or Linux machine on x64 or arm64.' });
  const nodeOk = atLeast(nodeVersion, MINIMUMS.node);
  add('node', nodeOk ? 'ready' : 'incompatible', nodeOk ? 'Runs the lab companion.' : `Node.js ${nodeVersion} is too old: the workshop needs ${MINIMUMS.node.split('.')[0]} or newer.`, { version: nodeVersion, category: 'core', required: true });

  /** A tool checked with `cmd args`; returns { status, version, message }. */
  async function check(id, cmd, args, { min, need, describe } = {}) {
    const isRequired = need ?? required.has(id);
    const r = await probe(cmd, args);
    const absent = { status: isRequired ? 'missing' : 'optional', version: null, message: isRequired ? `${TOOLS[id].label} was not found.` : `${TOOLS[id].label} was not found${recommended.has(id) ? ' (recommended for this lab)' : ' (only needed for some labs)'}.` };
    if (r.missing) return { ...absent, required: isRequired };
    if (r.timedOut) return { status: 'incompatible', version: null, required: isRequired, message: `\`${cmd} ${args.join(' ')}\` did not answer within ${Math.round(probeTimeout / 1000)}s and was stopped.` };
    if (r.code !== 0) return { status: 'incompatible', version: null, required: isRequired, message: `\`${cmd} ${args.join(' ')}\` failed: ${`${r.stderr || r.stdout || r.error || ''}`.trim().split('\n').slice(-2).join(' ').slice(0, 200)}` };
    const version = versionOf(`${r.stdout}\n${r.stderr}`);
    if (min && (!version || !atLeast(version, min))) return { status: 'incompatible', version, required: isRequired, message: `${TOOLS[id].label} ${version ?? '(unknown version)'} is too old: ${min} or newer is needed.` };
    return { status: 'ready', version, required: isRequired, message: describe ? describe(version) : 'Installed.' };
  }

  // Copilot CLI: present, and offering the flags and commands the labs rely on.
  const copilotCmd = env.HARNESS_COPILOT || 'copilot';
  const copilot = await check('copilot', copilotCmd, ['--version'], { need: true });
  if (copilot.status === 'ready') {
    const help = await probe(copilotCmd, ['--help']);
    const text = `${help.stdout}\n${help.stderr}`;
    const lacking = COPILOT_CAPABILITIES.filter((c) => !text.includes(c));
    if (help.code !== 0 || lacking.length) Object.assign(copilot, { status: 'incompatible', message: help.code !== 0 ? 'Copilot CLI did not print its help, so its capabilities could not be checked.' : `This Copilot CLI (${copilot.version}) lacks what the labs use: ${lacking.join(', ')}. Update it (copilot update) or run the launcher.` });
    else copilot.message = 'Installed, with every flag and command the labs use.';
  }
  add('copilot', copilot.status, copilot.message, { version: copilot.version, required: true, category: 'workshop' });
  if (platform === 'win32') {
    const pwsh = await check('pwsh', 'pwsh', ['--version'], { min: MINIMUMS.pwsh, need: true });
    add('pwsh', pwsh.status, pwsh.message, { version: pwsh.version, required: true, category: 'workshop' });
  }

  // git: on macOS, /usr/bin/git is a stub that opens the developer-tools installer, so ask xcode-select first.
  let git;
  const gitPath = which('git');
  if (platform === 'darwin' && gitPath === '/usr/bin/git') {
    const clt = await probe('xcode-select', ['-p']);
    if (clt.code !== 0) git = { status: 'manual', version: null, required: required.has('git'), message: 'git comes with Apple\'s Command Line Tools, which are not installed. Run `xcode-select --install` yourself (it asks for your approval).' };
  }
  git = git ?? await check('git', 'git', ['--version'], { min: MINIMUMS.git });
  add('git', git.status, git.message, { version: git.version, required: git.required, category: required.has('git') ? 'lab' : 'workshop' });

  const apm = await check('apm', 'apm', ['--version']);
  add('apm', apm.status, apm.message, { version: apm.version, required: apm.required });
  const gh = await check('gh', 'gh', ['--version']);
  add('gh', gh.status, gh.message, { version: gh.version, required: gh.required });
  const ghaw = gh.status === 'ready'
    ? await check('gh-aw', 'gh', ['aw', 'version'])
    : { status: required.has('gh-aw') ? 'missing' : 'optional', version: null, required: required.has('gh-aw'), message: '`gh aw` needs the GitHub CLI first.' };
  if (ghaw.status === 'incompatible' && /unknown command|not a gh command/i.test(ghaw.message)) Object.assign(ghaw, { status: ghaw.required ? 'missing' : 'optional', message: 'The `gh aw` extension is not installed.' });
  add('gh-aw', ghaw.status, ghaw.message, { version: ghaw.version, required: ghaw.required });

  // Things only you (or your organization) can confirm.
  add('copilot-auth', 'manual', 'Not verified: the doctor never reads your credentials. Run `copilot` and use /login if it asks.', { label: 'Copilot sign-in', category: 'manual', why: 'Agent checks and Copilot sessions need you to be signed in.', recovery: 'Run `copilot`, type /login and follow the steps.' });
  add('copilot-policy', 'manual', 'Not verified: your Copilot plan and your organization\'s policy decide whether Copilot CLI may run.', { label: 'Copilot plan and policy', category: 'manual', why: 'An organization can disable Copilot CLI.', recovery: 'Ask your organization admin, or use a personal Copilot plan (the free plan for verified students works).' });
  const trust = (() => { try { return readTrust(rootDir); } catch { return null; } })();
  add('folder-trust', trust === true ? 'ready' : 'manual', trust === true ? 'Copilot trusts the workshop folder (MCP servers, hooks and agents will load).' : trust === false ? 'Copilot does not trust the workshop folder yet, so it will ignore MCP servers, hooks and agents.' : 'Not verified: Copilot\'s trusted folders could not be read.', { label: 'Folder trust', category: 'manual', why: 'Copilot only loads project MCP servers, hooks and agents from folders you trust.', recovery: 'Run `copilot` once in the workshop folder and choose "Yes, and remember this folder".' });

  const blocking = (it) => it.required && it.status !== 'ready' && it.status !== 'manual';
  const coreReady = !items.some((it) => it.category === 'core' && blocking(it));
  return { ready: !items.some(blocking), coreReady, platform, arch, items };
}

/** Plain-text lines for a report (used by the CLI, the linear mode and the setup). */
export function reportLines(report, { icons = true } = {}) {
  const ICON = icons ? { ready: '✅', missing: '❌', incompatible: '⚠️ ', manual: '🙋', optional: '⬜' } : { ready: '[ok]', missing: '[missing]', incompatible: '[incompatible]', manual: '[manual]', optional: '[optional]' };
  const lines = [];
  for (const it of report.items) {
    const note = it.category === 'manual' ? (it.status === 'ready' ? '' : ' (check yourself)') : it.required ? '' : ' (optional)';
    lines.push(`${ICON[it.status]} ${it.label}${it.version ? ` ${it.version}` : ''}${note}: ${it.message}`);
    if (it.status !== 'ready' && it.recovery) lines.push(`    → ${it.recovery}`);
  }
  return lines;
}
