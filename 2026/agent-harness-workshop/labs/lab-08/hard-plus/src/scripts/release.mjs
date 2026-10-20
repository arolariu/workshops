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

// ---------- the decisions: TODO(M3) ----------
/** The next version: bump('1.4.2', 'minor') → '1.5.0'. A pre-release becomes its release first (1.0.0-rc.1 → 1.0.0). */
export function bump(version, part) {
  // TODO(M3): check the version against SEMVER and the part against PARTS (throw an Error with a clear message),
  // then bump: the parts to the right of the bumped one go back to 0.
  throw new Error('TODO(M3): bump() is not written yet.');
}

/** CHANGELOG.md with the Unreleased notes moved under `## [version] - date`, and an empty Unreleased on top. */
export function releaseNotes(text, version, date) {
  // TODO(M3): sections(text) gives you { head, unreleased, releases }: put them back together with an empty
  // "## [Unreleased]", then "## [version] - date" with the old Unreleased notes, then the older releases.
  throw new Error('TODO(M3): releaseNotes() is not written yet.');
}

/** Every reason not to release `next` from `current`: an empty list means go. */
export async function validate({ current, next, changelog }) {
  const problems = [];
  // TODO(M3): one sentence per problem:
  // - the scorecard: harnessCheck(ROOT, { min: 'L4' }) and report() from harness-check.mjs;
  // - the attack pack: runScript('scripts/attack.mjs') must exit 0;
  // - CHANGELOG.md: something under Unreleased, and its newest release is `current`;
  // - the tag v<next> doesn't exist yet (when inGitRepository(): git(['tag', '--list', ...])).
  problems.push('TODO(M3): validate() checks nothing yet.');
  return problems;
}

/** Builds dist/plugin/ and dist/apm/ for `meta` ({ name, version, description }); returns the files written (POSIX, from dist/). */
export function pack(meta, out = path.join(ROOT, 'dist')) {
  const plugin = path.join(out, 'plugin');
  const apm = path.join(out, 'apm');
  for (const dir of [plugin, apm]) fs.rmSync(dir, { recursive: true, force: true });
  const written = [];
  // TODO(M3): the plugin, as in Lab 06: plugin.json (name, version, description, and the folders it has), agents/,
  // skills/, hooks/hooks.json (commands rewritten from .github/hooks/ to hooks/, no cwd) with the hook scripts,
  // and mcp/servers.json with the server. copy(), filesIn() and foldersIn() do the file work.
  // TODO(M3): the APM package: apm.yml (name, version, description), and .apm/instructions/, .apm/agents/,
  // .apm/skills/ and .apm/hooks/ (each hook command points at its script relative to the hook file: ./scripts/…).
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
