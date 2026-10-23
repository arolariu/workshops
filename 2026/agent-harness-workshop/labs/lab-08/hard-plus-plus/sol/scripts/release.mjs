#!/usr/bin/env node
// Release the harness: bump the version, validate, package, commit and tag.
//
//   node scripts/release.mjs <major|minor|patch> [--dry-run] [--json]
//
// --dry-run validates and builds dist/ (look inside!), but leaves harness.json, CHANGELOG.md and the tags alone.
// A real release also moves the Unreleased notes under the new version, commits harness.json, CHANGELOG.md and
// dist/, and tags that commit v<version>. It refuses unless this folder is the top of its own git repository and
// everything but dist/ is committed: inside another repository (like the workshop) it would tag someone else's code.
//
// The packages: dist/plugin/ (a Copilot CLI plugin: plugin.json, agents/, skills/, hooks/, mcp/) and dist/apm/
// (an APM package: apm.yml and .apm/instructions, agents, skills, hooks). AGENTS.md stays home: it's this repository's
// own rules.
//
// Exit codes: 0 released (or the dry run would release), 1 a validation failed, 2 refused (arguments, git, files).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { harnessCheck, report as scoreReport, UsageError } from './harness-check.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PARTS = ['major', 'minor', 'patch'];
export const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
export class Refused extends Error {}

// ---------- plumbing ----------
/** Runs git in this folder. Throws Refused when it fails, unless `allowFail`. */
export function git(args, { cwd = ROOT, allowFail = false } = {}) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  if (r.error?.code === 'ENOENT') throw new Refused('git is not installed (or not on PATH).');
  if (r.status !== 0 && !allowFail) throw new Refused(`git ${args.join(' ')} failed: ${`${r.stderr}${r.stdout}`.trim()}`);
  return { code: r.status, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() };
}
/** Is this folder the top of a git repository? (`--show-cdup` prints the way up: nothing at the top.) */
export function ownRepository(cwd = ROOT) {
  const r = git(['rev-parse', '--show-cdup'], { cwd, allowFail: true });
  return r.code === 0 && r.out === '';
}
/** Is this folder inside a git repository at all (and is git there)? */
export function inGitRepository(cwd = ROOT) {
  try { return git(['rev-parse', '--git-dir'], { cwd, allowFail: true }).code === 0; } catch { return false; }
}
const abs = (rel) => path.join(ROOT, ...rel.split('/'));
export const readText = (rel) => fs.readFileSync(abs(rel), 'utf8').replace(/\r\n/g, '\n');
export function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}
// Runtime files and secrets never travel in a package.
const RUNTIME = /^(\.agent-logs|node_modules|state\.json|\.env.*)$/;
/** Copies a file or a folder of this harness (`rel`) to `dest`, without runtime files; returns the files written. */
export function copy(rel, dest) {
  const from = abs(rel);
  if (!fs.existsSync(from)) return [];
  if (fs.statSync(from).isFile()) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(from, dest);
    return [dest];
  }
  const out = [];
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (RUNTIME.test(e.name)) continue;
    out.push(...copy(`${rel}/${e.name}`, path.join(dest, e.name)));
  }
  return out;
}
/** The files directly in a folder of this harness that match `re` (POSIX paths), sorted. */
export const filesIn = (rel, re = /./) => (fs.existsSync(abs(rel)) ? fs.readdirSync(abs(rel), { withFileTypes: true }).filter((e) => e.isFile() && re.test(e.name)).map((e) => `${rel}/${e.name}`).sort() : []);
export const foldersIn = (rel) => (fs.existsSync(abs(rel)) ? fs.readdirSync(abs(rel), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => `${rel}/${e.name}`).sort() : []);
/** CHANGELOG.md in parts: the text before the first `## `, the Unreleased notes, and the releases (newest first). */
export function sections(text) {
  const parts = String(text).replace(/\r\n/g, '\n').split(/^(?=## )/m);
  const head = parts[0].startsWith('## ') ? '' : parts.shift();
  let unreleased = null;
  const releases = [];
  for (const p of parts) {
    const title = p.split('\n')[0];
    const body = p.slice(title.length + 1);
    if (/^##\s+\[?unreleased\]?\s*$/i.test(title)) unreleased = body;
    else {
      const m = title.match(/^##\s+\[?v?([^\]\s]+)\]?(?:\s+-\s+(\d{4}-\d{2}-\d{2}))?/);
      releases.push({ title, version: m?.[1] ?? null, date: m?.[2] ?? null, body });
    }
  }
  return { head, unreleased, releases };
}
/** Runs a script of this harness with Node; returns its exit code and output. */
export function runScript(rel, args = []) {
  const r = spawnSync(process.execPath, [abs(rel), ...args], { cwd: ROOT, encoding: 'utf8', windowsHide: true, timeout: 300000 });
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
}

// ---------- the decisions ----------
/** The next version: bump('1.4.2', 'minor') → '1.5.0'. A pre-release becomes its release first (1.0.0-rc.1 → 1.0.0). */
export function bump(version, part) {
  const m = SEMVER.exec(String(version));
  if (!m) throw new Error(`"${version}" is not a semantic version (MAJOR.MINOR.PATCH, like 1.4.2).`);
  if (!PARTS.includes(part)) throw new Error(`Bump ${PARTS.join(', ')}, not "${part}".`);
  const [major, minor, patch] = m.slice(1, 4).map(Number);
  const pre = Boolean(m[4]);
  if (part === 'major') return pre && minor === 0 && patch === 0 ? `${major}.0.0` : `${major + 1}.0.0`;
  if (part === 'minor') return pre && patch === 0 ? `${major}.${minor}.0` : `${major}.${minor + 1}.0`;
  return pre ? `${major}.${minor}.${patch}` : `${major}.${minor}.${patch + 1}`;
}

/** CHANGELOG.md with the Unreleased notes moved under `## [version] - date`, and an empty Unreleased on top. */
export function releaseNotes(text, version, date) {
  const { head, unreleased, releases } = sections(text);
  const notes = (unreleased ?? '').trim();
  const block = (title, body) => `${title}\n${body.trim() ? `${body.trim()}\n` : ''}`;
  const blocks = ['## [Unreleased]\n', block(`## [${version}] - ${date}`, notes), ...releases.map((r) => block(r.title, r.body))];
  return `${head.trim() ? `${head.trim()}\n\n` : ''}${blocks.join('\n')}`;
}

/** Every reason not to release `next` from `current`: an empty list means go. */
export async function validate({ current, next, changelog }) {
  const problems = [];
  const score = await harnessCheck(ROOT, { min: 'L4' });
  if (!score.ok) problems.push(`The scorecard is at ${score.level} ${score.name}: a release needs L4 Guarded or better.\n${scoreReport(score)}`);
  const attacks = runScript('scripts/attack.mjs');
  if (attacks.code !== 0) problems.push(`The attack pack fails (node scripts/attack.mjs exits ${attacks.code}): a release needs no miss and no false positive.\n${attacks.out.split('\n').slice(-8).join('\n')}`);
  const cl = sections(changelog);
  if (!cl.unreleased?.trim()) problems.push('CHANGELOG.md has nothing under "## [Unreleased]": write the release notes first.');
  if (cl.releases[0] && cl.releases[0].version !== current) problems.push(`CHANGELOG.md's newest release is ${cl.releases[0].version}, but harness.json says ${current}.`);
  if (inGitRepository() && git(['tag', '--list', `v${next}`]).out) problems.push(`The tag v${next} exists already.`);
  return problems;
}

/** Rewrites the hook commands of a `.github/hooks/*.json` config: `.github/hooks/` becomes `prefix`, and `cwd` goes. */
function moveHooks(config, prefix) {
  const hooks = {};
  for (const [event, entries] of Object.entries(config?.hooks ?? {})) {
    hooks[event] = (Array.isArray(entries) ? entries : []).map(({ cwd, ...e }) => {
      for (const shell of ['bash', 'powershell', 'command']) if (typeof e[shell] === 'string') e[shell] = e[shell].replaceAll('.github/hooks/', prefix);
      return e;
    });
  }
  return { version: config?.version ?? 1, hooks };
}

/** Builds dist/plugin/ and dist/apm/ for `meta` ({ name, version, description }); returns the files written (POSIX, from dist/). */
export function pack(meta, out = path.join(ROOT, 'dist')) {
  const plugin = path.join(out, 'plugin');
  const apm = path.join(out, 'apm');
  for (const dir of [plugin, apm]) fs.rmSync(dir, { recursive: true, force: true });
  const written = [];
  const json = (file, data) => { writeText(file, `${JSON.stringify(data, null, 2)}\n`); written.push(file); };

  // The plugin (Lab 06): its hooks run from the plugin's own folder.
  const manifest = { name: meta.name, description: meta.description, version: meta.version, author: { name: meta.author ?? 'StudyBuddy maintainers' }, license: meta.license ?? 'MIT' };
  for (const f of filesIn('.github/agents', /\.agent\.md$/)) written.push(...copy(f, path.join(plugin, 'agents', path.basename(f))));
  for (const d of foldersIn('.github/skills')) written.push(...copy(d, path.join(plugin, 'skills', path.basename(d))));
  if (written.some((f) => f.startsWith(path.join(plugin, 'agents')))) manifest.agents = 'agents';
  if (written.some((f) => f.startsWith(path.join(plugin, 'skills')))) manifest.skills = 'skills';
  const hookConfigs = filesIn('.github/hooks', /\.json$/).map((f) => JSON.parse(readText(f)));
  if (hookConfigs.length) {
    const merged = { version: 1, hooks: {} };
    for (const c of hookConfigs) for (const [event, entries] of Object.entries(moveHooks(c, 'hooks/').hooks)) (merged.hooks[event] ??= []).push(...entries);
    json(path.join(plugin, 'hooks', 'hooks.json'), merged);
    for (const d of foldersIn('.github/hooks')) written.push(...copy(d, path.join(plugin, 'hooks', path.basename(d))));
    manifest.hooks = 'hooks/hooks.json';
  }
  if (fs.existsSync(abs('.mcp.json'))) {
    json(path.join(plugin, 'mcp', 'servers.json'), { mcpServers: JSON.parse(readText('.mcp.json')).mcpServers ?? {} });
    written.push(...copy('mcp', path.join(plugin, 'mcp')));
    manifest.mcpServers = 'mcp/servers.json';
  }
  json(path.join(plugin, 'plugin.json'), manifest);

  // The APM package: `apm install` deploys .apm/ into the consumer's .github/ (skills into .agents/skills/), and
  // copies a hook's script when its command points at it relative to the hook file.
  const q = (s) => JSON.stringify(String(s));
  writeText(path.join(apm, 'apm.yml'), `name: ${meta.name}\nversion: ${meta.version}\ndescription: ${q(meta.description)}\nauthor: ${q(manifest.author.name)}\nlicense: ${manifest.license}\n`);
  written.push(path.join(apm, 'apm.yml'));
  for (const f of filesIn('.github/instructions', /\.instructions\.md$/)) written.push(...copy(f, path.join(apm, '.apm', 'instructions', path.basename(f))));
  for (const f of filesIn('.github/agents', /\.agent\.md$/)) written.push(...copy(f, path.join(apm, '.apm', 'agents', path.basename(f))));
  for (const d of foldersIn('.github/skills')) written.push(...copy(d, path.join(apm, '.apm', 'skills', path.basename(d))));
  for (const [i, c] of hookConfigs.entries()) json(path.join(apm, '.apm', 'hooks', path.basename(filesIn('.github/hooks', /\.json$/)[i])), moveHooks(c, './'));
  for (const d of foldersIn('.github/hooks')) written.push(...copy(d, path.join(apm, '.apm', 'hooks', path.basename(d))));

  return written.map((f) => path.relative(out, f).split(path.sep).join('/')).sort();
}

// ---------- the release ----------
export async function main(argv) {
  const dryRun = argv.includes('--dry-run');
  const asJson = argv.includes('--json');
  const unknown = argv.filter((a) => a.startsWith('--') && !['--dry-run', '--json'].includes(a));
  const parts = argv.filter((a) => !a.startsWith('--'));
  if (unknown.length) throw new Refused(`Unknown option: ${unknown.join(', ')}`);
  if (parts.length !== 1 || !PARTS.includes(parts[0])) throw new Refused(`Say which part to bump: node scripts/release.mjs <${PARTS.join('|')}> [--dry-run] [--json]`);
  if (!dryRun) {
    if (!ownRepository()) throw new Refused(`A release commits and tags this repository, but ${ROOT} is not the top of its own git repository. Use --dry-run here, or release from the harness's own repository.`);
    const dirty = git(['status', '--porcelain']).out.split('\n').filter(Boolean).filter((l) => !/^.. "?dist\//.test(l));
    if (dirty.length) throw new Refused(`Commit your changes first: a release must be reproducible from a commit.\n${dirty.slice(0, 10).join('\n')}`);
  }

  let meta;
  try { meta = JSON.parse(readText('harness.json')); } catch (e) { throw new Refused(`harness.json can't be read: ${e.message}`); }
  if (!meta?.name) throw new Refused('harness.json needs a "name".');
  let next;
  try { next = bump(meta.version, parts[0]); } catch (e) { throw new Refused(`harness.json: ${e.message}`); }
  let changelog;
  try { changelog = readText('CHANGELOG.md'); } catch { throw new Refused('CHANGELOG.md is missing.'); }

  const problems = await validate({ current: meta.version, next, changelog });
  const result = { name: meta.name, current: meta.version, next, tag: `v${next}`, dryRun, problems, files: [] };
  if (!problems.length) {
    result.files = pack({ ...meta, version: next });
    if (!dryRun) {
      writeText(abs('harness.json'), `${JSON.stringify({ ...meta, version: next }, null, 2)}\n`);
      writeText(abs('CHANGELOG.md'), releaseNotes(changelog, next, new Date().toISOString().slice(0, 10)));
      git(['add', '--', 'harness.json', 'CHANGELOG.md', 'dist']);
      git(['commit', '-q', '-m', `Release ${meta.name} v${next}`]);
      git(['tag', '-a', `v${next}`, '-m', `${meta.name} ${next}`]);
    }
  }

  if (asJson) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`${meta.name}: ${meta.version} → ${next}${dryRun ? ' (dry run)' : ''}`);
    if (problems.length) for (const p of problems) console.log(`✗ ${p}`);
    else {
      console.log(`✓ scorecard L4 or better, attack pack clean, release notes ready, v${next} is new`);
      console.log(`📦 dist/: ${result.files.length} files (${result.files.filter((f) => f.startsWith('plugin/')).length} in plugin/, ${result.files.filter((f) => f.startsWith('apm/')).length} in apm/)`);
      console.log(dryRun ? `Would write harness.json and CHANGELOG.md, commit, and tag v${next}.` : `🏷️ Committed and tagged v${next}. Push it: git push --follow-tags`);
    }
  }
  return problems.length ? 1 : 0;
}

const sameFile = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
if (process.argv[1] && sameFile(process.argv[1], fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => {
    console.error(e instanceof Refused || e instanceof UsageError ? e.message : e.stack);
    process.exitCode = 2;
  });
}
