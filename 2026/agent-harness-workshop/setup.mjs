#!/usr/bin/env node
// 🧠 Build Your Agent Harness: workshop setup. Normally started by start.cmd (Windows) or start.sh (macOS, Linux).
//   node setup.mjs                    reuse what is installed, prepare what is missing (privately), start the lab app
//   node setup.mjs --check            only report: no downloads, installs, writes or launch
//   node setup.mjs --offline          never use the network: use verified cached downloads only
//   node setup.mjs --full             also prepare the tools every lab needs
//   node setup.mjs --install=apm,gh   also prepare these tools
//   node setup.mjs --setup-only       prepare, but do not start the lab app
//   node setup.mjs -- open lab-01 easy   everything after -- goes to the lab app as-is
// Tools are installed into a private folder (WORKSHOP_TOOLS_DIR, default .workshop/ next to this file) and only added
// to the PATH of the lab app this script starts. Nothing global changes: no admin rights, no shell profile or PATH
// edits, no sign-in, no folder trust, no licenses accepted, nothing replaced.
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TOOLS as PINS, MANUAL, PLATFORM_ONLY } from './setup-tools.mjs';
import { inspectEnvironment, reportLines } from './labs/_harness/doctor.mjs';
import { runProcess, resolveCommand } from './labs/_harness/process.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const KNOWN = ['copilot', 'pwsh', 'git', 'apm', 'gh', 'gh-aw'];
const LAB_COMMANDS = new Set(['open', 'test', 'hint', 'reset', 'restore', 'checkpoint', 'recovery', 'diff', 'history', 'bookmark']);
const sep = (platform) => (platform === 'win32' ? ';' : ':');
const pathKey = (env) => Object.keys(env).find((k) => k.toLowerCase() === 'path') ?? 'PATH';
const sha256File = (file) => new Promise((resolve, reject) => {
  const h = crypto.createHash('sha256');
  fs.createReadStream(file).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
});

/** Is this Linux using musl (Alpine)? */
function isMusl() {
  if (process.platform !== 'linux') return false;
  try { return !process.report.getReport().header.glibcVersionRuntime; } catch { return false; }
}
/** win32-x64, darwin-arm64, linux-x64, linux-x64-musl, … */
export const platformKey = ({ platform = process.platform, arch = process.arch, musl = isMusl() } = {}) => `${platform}-${arch}${platform === 'linux' && musl ? '-musl' : ''}`;

/** Parse setup options; everything else (and everything after --) is for the lab app. */
export function parseArgs(argv) {
  const opts = { check: false, offline: false, full: false, install: [], setupOnly: false, help: false, forward: [], errors: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { opts.forward.push(...argv.slice(i + 1)); break; }
    if (a === '--check') opts.check = true;
    else if (a === '--offline') opts.offline = true;
    else if (a === '--full') opts.full = true;
    else if (a === '--setup-only') opts.setupOnly = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (a.startsWith('--install=')) {
      for (const t of a.slice(10).split(',').map((s) => s.trim()).filter(Boolean)) {
        if (KNOWN.includes(t)) opts.install.push(t); else opts.errors.push(`"${t}" is not a tool the setup knows. Use: ${KNOWN.join(', ')}.`);
      }
    } else if (a === '--install') opts.errors.push('--install needs a list, like --install=apm,gh.');
    else opts.forward.push(a);
  }
  return opts;
}

/** The lab the forwarded command is about, so its tools count as required (e.g. "open lab-06 easy"). */
export function selectedLab(forward) {
  const norm = (s) => String(s ?? '').toLowerCase().match(/^(?:lab-?)?(\d{1,2})$/)?.[1]?.padStart(2, '0');
  const ex = forward.find((a) => a.startsWith('--exercise='));
  if (ex) { const n = norm(ex.slice(11).split('/')[0]); return n ? `lab-${n}` : null; }
  if (LAB_COMMANDS.has(forward[0])) { const n = norm(forward[1]); return n ? `lab-${n}` : null; }
  return null;
}

/** Download with curl when available (it follows system proxy and certificate settings), else with Node. */
export async function defaultDownload(url, dest, { maxBytes, timeout = 15 * 60 * 1000, env = process.env } = {}) {
  const local = /^http:\/\/(127\.0\.0\.1|localhost):\d+\//.test(url);
  if (!url.startsWith('https://') && !local) throw new Error(`refusing to download over an insecure connection: ${url}`);
  const proto = local ? '=http,https' : '=https';
  if (resolveCommand('curl', { env })) {
    const r = await runProcess('curl', ['-fsSL', '--proto', proto, '--proto-redir', proto, '--retry', '2', '--connect-timeout', '20', '--max-time', String(Math.round(timeout / 1000)), '--max-filesize', String(maxBytes), '-o', dest, url], { env, timeout: timeout + 10000 });
    if (r.code !== 0) throw new Error(`curl could not download ${url}: ${(r.stderr || r.error || `exit code ${r.code}`).trim().slice(0, 300)}`);
    return;
  }
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  if (!res.url.startsWith('https://') && !local) throw new Error(`the download was redirected to an insecure address: ${res.url}`);
  const out = fs.createWriteStream(dest, { flags: 'wx' });
  let total = 0;
  try {
    for await (const chunk of res.body) {
      total += chunk.length;
      if (total > maxBytes) throw new Error(`${url} is larger than expected`);
      if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
    }
  } finally {
    await new Promise((r) => out.end(r));
  }
}

/** Entries of an archive, refusing absolute paths and "..". */
async function safeListing(archive, env) {
  const r = await runProcess('tar', ['-tf', archive], { env, timeout: 120000 });
  if (r.code !== 0) throw new Error(`${path.basename(archive)} is not a readable archive`);
  const entries = r.stdout.split(/\r?\n/).filter(Boolean);
  const bad = entries.find((e) => /^([A-Za-z]:|[\\/])/.test(e) || e.split(/[\\/]/).includes('..'));
  if (bad) throw new Error(`${path.basename(archive)} contains an unsafe path (${bad})`);
  return entries;
}

/** No symlink inside `root` may point outside it. */
function checkLinks(root) {
  const realRoot = fs.realpathSync(root);
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isSymbolicLink()) {
        const target = path.resolve(path.dirname(abs), fs.readlinkSync(abs));
        const rel = path.relative(realRoot, target);
        if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`the archive links outside its folder (${path.relative(root, abs)})`);
      } else if (e.isDirectory()) walk(abs);
    }
  };
  walk(root);
}

/** Leftovers of interrupted runs (more than an hour old) are removed; fresh ones may belong to a parallel run. */
function cleanLeftovers(toolsDir, cacheDir) {
  const old = (p) => { try { return Date.now() - fs.statSync(p).mtimeMs > 3600 * 1000; } catch { return false; } };
  for (const dir of [cacheDir, ...KNOWN.map((t) => path.join(toolsDir, t))]) {
    let names = [];
    try { names = fs.readdirSync(dir); } catch { continue; }
    for (const n of names) if ((n.startsWith('.staging-') || n.endsWith('.part')) && old(path.join(dir, n))) fs.rmSync(path.join(dir, n), { recursive: true, force: true });
  }
}

/**
 * Inspect, then prepare what is missing. Never changes process.env. Resolves:
 * { key, plan, installs, downloads, reused, manual, failures, env, report }
 */
export async function prepare({
  rootDir = HERE, toolsDir, cacheDir, pins = PINS, manual = MANUAL, platform = process.platform, arch = process.arch, musl,
  env = process.env, check = false, offline = false, full = false, install = [], lab = null, inspect = inspectEnvironment,
  download = defaultDownload, log = () => {}, readTrust,
} = {}) {
  const key = platformKey({ platform, arch, musl });
  const pk = pathKey(env);
  const installs = [];
  const downloads = [];
  const reused = [];
  const failures = [];
  const manualSteps = [];
  const finalDir = (tool) => path.join(toolsDir, tool, `${pins[tool].version}-${key}`);
  const binOf = (tool) => path.join(finalDir(tool), ...pins[tool].assets[key].bin.split('/'));
  const privateDirs = () => Object.keys(pins).filter((t) => pins[t].assets?.[key] && fs.existsSync(path.join(binOf(t), pins[t].assets[key].exe))).map(binOf);
  const envWith = () => ({ ...env, [pk]: [...privateDirs(), env[pk] ?? ''].filter(Boolean).join(sep(platform)) });
  const look = (e) => inspect({ rootDir, full, requirements: install, lab, env: e, platform, arch, ...(readTrust ? { readTrust } : {}) });

  let report = await look(envWith());
  const wanted = report.items.filter((it) => KNOWN.includes(it.id) && (it.required || install.includes(it.id)) && it.status !== 'ready');
  const plan = [];
  for (const it of wanted) {
    const pin = pins[it.id];
    const asset = pin?.assets?.[key];
    const onlyOn = PLATFORM_ONLY[it.id];
    if (pin && asset && (!onlyOn || onlyOn.includes(platform))) plan.push({ tool: it.id, version: pin.version, url: asset.url });
    else {
      const m = manual[it.id];
      manualSteps.push({ tool: it.id, message: m?.[platform] ?? m?.all ?? `There is no reviewed ${it.label} build for ${key}. ${it.recovery}` });
    }
  }
  if (check) return { key, plan, installs, downloads, reused, manual: manualSteps, failures, env: envWith(), report };

  if (plan.length) {
    fs.mkdirSync(toolsDir, { recursive: true });
    fs.mkdirSync(cacheDir, { recursive: true });
    cleanLeftovers(toolsDir, cacheDir);
  }
  for (const { tool } of plan) {
    const pin = pins[tool];
    const asset = pin.assets[key];
    const label = `${pin.label} ${pin.version}`;
    let stage = null;
    try {
      const exeAt = (dir) => path.join(dir, ...asset.bin.split('/'), asset.exe);
      const probe = async (exe) => {
        const r = await runProcess(exe, ['--version'], { env: envWith(), timeout: 60000 });
        return r.code === 0 && pin.expect.test(`${r.stdout}\n${r.stderr}`);
      };
      if (fs.existsSync(exeAt(finalDir(tool)))) {
        if (await probe(exeAt(finalDir(tool)))) { reused.push(tool); continue; }
        log(`  ${label}: the private copy does not run; preparing it again.`);
        fs.rmSync(finalDir(tool), { recursive: true, force: true });
      }
      const archive = path.join(cacheDir, path.basename(new URL(asset.url).pathname));
      let cached = false;
      if (fs.existsSync(archive)) cached = (await sha256File(archive)) === asset.sha256;
      if (!cached) {
        if (offline) throw new Error(`offline, and no verified ${path.basename(archive)} in ${cacheDir}. Copy it there from ${asset.url}, or run without --offline.`);
        log(`  ⬇️  Downloading ${label} (${Math.round(asset.size / 1048576)} MB) from ${new URL(asset.url).host} …`);
        const part = `${archive}.${process.pid}.${crypto.randomBytes(3).toString('hex')}.part`;
        try {
          await download(asset.url, part, { maxBytes: Math.ceil(asset.size * 1.05) + 1048576, env: envWith() });
          const got = await sha256File(part);
          if (got !== asset.sha256) throw new Error(`the download of ${label} does not match its pinned SHA-256 checksum, so it was deleted and not run (expected ${asset.sha256}, got ${got})`);
          fs.renameSync(part, archive);
        } finally {
          fs.rmSync(part, { force: true });
        }
        downloads.push(tool);
      }
      await safeListing(archive, envWith());
      stage = path.join(toolsDir, tool, `.staging-${process.pid}-${crypto.randomBytes(3).toString('hex')}`);
      fs.mkdirSync(stage, { recursive: true });
      const x = await runProcess('tar', ['-xf', archive, '-C', stage], { env: envWith(), timeout: 600000 });
      if (x.code !== 0) throw new Error(`could not unpack ${path.basename(archive)}: ${(x.stderr || '').trim().slice(0, 200)}`);
      checkLinks(stage);
      const exe = exeAt(stage);
      if (!fs.existsSync(exe)) throw new Error(`${asset.exe} is not where the reviewed layout says (${asset.bin}/${asset.exe})`);
      if (platform !== 'win32') fs.chmodSync(exe, 0o755);
      if (!(await probe(exe))) throw new Error(`the unpacked ${asset.exe} does not report version ${pin.version}`);
      if (!fs.existsSync(finalDir(tool))) {
        try { fs.renameSync(stage, finalDir(tool)); stage = null; } catch (e) { if (!fs.existsSync(finalDir(tool))) throw e; }
      }
      installs.push(tool);
      log(`  ✅ ${label} is ready in ${finalDir(tool)}`);
    } catch (e) {
      failures.push({ tool, message: `${label}: ${e.message}` });
    } finally {
      if (stage) fs.rmSync(stage, { recursive: true, force: true });
    }
  }
  if (plan.length) report = await look(envWith());
  return { key, plan, installs, downloads, reused, manual: manualSteps, failures, env: envWith(), report };
}

const USAGE = `
  Build Your Agent Harness: workshop setup

  node setup.mjs                     reuse what is installed, prepare what is missing, start the lab app
  node setup.mjs --check             only report: no downloads, installs, writes or launch
  node setup.mjs --offline           never use the network (verified cached downloads only)
  node setup.mjs --full              also prepare the tools of every lab (APM, GitHub CLI)
  node setup.mjs --install=apm,gh    also prepare these tools (${KNOWN.join(', ')})
  node setup.mjs --setup-only        prepare, but do not start the lab app
  node setup.mjs -- open lab-01 easy everything after -- goes to the lab app

  Usually started by start.cmd (Windows) or ./start.sh (macOS, Linux). Private tools folder:
  WORKSHOP_TOOLS_DIR (default .workshop/ next to this file); download cache: WORKSHOP_CACHE_DIR.
  Nothing global changes. See SETUP.md.
`;

/** Run the setup and (unless --check / --setup-only) the lab app. Resolves the exit code. */
export async function main(argv = process.argv.slice(2), {
  env = process.env, out = (s) => process.stdout.write(`${s}\n`), companion = path.join(HERE, 'labs', 'start.mjs'),
  launch = launchCompanion, ...rest
} = {}) {
  const opts = parseArgs(argv);
  if (opts.help) { out(USAGE); return 0; }
  if (opts.errors.length) { opts.errors.forEach((e) => out(`  ❌ ${e}`)); return 2; }
  const toolsDir = path.resolve(env.WORKSHOP_TOOLS_DIR || path.join(HERE, '.workshop'));
  const cacheDir = path.resolve(env.WORKSHOP_CACHE_DIR || path.join(toolsDir, 'cache'));
  const lab = selectedLab(opts.forward);
  out('');
  out(`  🧠 Build Your Agent Harness · setup${opts.check ? ' (check only: nothing will be changed)' : opts.offline ? ' (offline)' : ''}`);
  const result = await prepare({ toolsDir, cacheDir, env, check: opts.check, offline: opts.offline, full: opts.full, install: opts.install, lab, log: out, ...rest });
  out('');
  reportLines(result.report).forEach((l) => out(`  ${l}`));
  out('');
  if (opts.check) {
    if (result.plan.length) out(`  Without --check, the setup would prepare privately: ${result.plan.map((p) => `${p.tool} ${p.version}`).join(', ')} (into ${toolsDir}).`);
    result.manual.forEach((m) => out(`  🙋 ${m.tool}: ${m.message}`));
    out(result.report.ready ? '  ✅ Ready.' : '  ⚠️  Not ready yet (see above).');
    return result.report.ready ? 0 : 1;
  }
  result.manual.forEach((m) => out(`  🙋 ${m.tool}: ${m.message}`));
  result.failures.forEach((f) => out(`  ❌ ${f.message}`));
  const requested = new Set([...opts.install, ...(opts.full ? KNOWN : [])]);
  const unmet = result.report.items.filter((it) => requested.has(it.id) && it.status !== 'ready');
  if (!result.report.coreReady) { out('  ❌ The lab companion itself cannot run here (see above).'); return 1; }
  if (unmet.length) {
    out(`  ❌ Not ready: ${unmet.map((it) => it.label).join(', ')} ${unmet.length === 1 ? 'was' : 'were'} requested but ${unmet.length === 1 ? 'is' : 'are'} not available. Fix that (see above), or run without ${opts.full ? '--full' : '--install'} to start anyway.`);
    return 1;
  }
  const missing = result.report.items.filter((it) => it.required && !['ready', 'manual'].includes(it.status));
  if (missing.length) out(`  ⚠️  Still missing: ${missing.map((it) => it.label).join(', ')}. The lab app starts anyway; checks that need ${missing.length === 1 ? 'it' : 'them'} will say "blocked".`);
  if (result.installs.length) out(`  🔒 Prepared privately (only for the lab app started from here; your PATH is unchanged): ${result.installs.join(', ')}.`);
  if (opts.setupOnly) return result.report.ready ? 0 : 1;
  return launch(companion, opts.forward, result.env);
}

/** Start the lab app in this terminal; Ctrl+C goes to it, and its exit code is ours. */
export function launchCompanion(companion, args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [companion, ...args], { stdio: 'inherit', env });
    const forward = (sig) => () => { try { child.kill(sig); } catch { /* gone */ } };
    const onInt = () => {};
    const onTerm = forward('SIGTERM');
    process.on('SIGINT', onInt);
    process.on('SIGTERM', onTerm);
    const done = (code) => { process.off('SIGINT', onInt); process.off('SIGTERM', onTerm); resolve(code); };
    child.on('error', (e) => { process.stderr.write(`  Could not start the lab app: ${e.message}\n`); done(1); });
    child.on('exit', (code, signal) => done(code ?? (signal === 'SIGINT' ? 130 : 1)));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [major] = process.versions.node.split('.').map(Number);
  if (major < 22) {
    process.stderr.write(`\n  This workshop needs Node.js 22 or newer (this is ${process.versions.node}). Run start.cmd (Windows) or ./start.sh (macOS, Linux) to get a private copy.\n\n`);
    process.exit(3);
  }
  process.exit(await main());
}