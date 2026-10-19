#!/usr/bin/env node
// 🚀 The marketplace's release script (Lab 06 · hard++): validate, bump, changelog, commit and tag, in that order.
//   node scripts/release.mjs <plugin> <major|minor|patch> [--date YYYY-MM-DD] [--dry-run]
//   node scripts/release.mjs --validate          only validate the marketplace
// It works on the marketplace this script lives in. It commits and tags only when that folder is its own Git
// repository: inside a bigger repository (like this workshop) it says so and skips both.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(HERE, '..');
const MANIFESTS = ['marketplace.json', '.plugin/marketplace.json', '.github/plugin/marketplace.json', '.claude-plugin/marketplace.json'];

// ---------- plumbing (given) ----------
/** Where the CLI finds marketplace.json (the first that exists, in its search order), or null. */
export function manifestPath(root) {
  return MANIFESTS.map((m) => path.join(root, ...m.split('/'))).find((f) => fs.existsSync(f)) ?? null;
}
export const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
export const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
/** Run git in `cwd`: { code, out }. */
export function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
}
/** Is `root` the top of its own Git repository (not a folder inside a bigger one)? */
export function ownRepo(root) {
  const r = git(root, ['rev-parse', '--show-toplevel']);
  return r.code === 0 && path.resolve(r.out) === path.resolve(root);
}
/** The "## Unreleased" section of a changelog: { start, end, body } (line indexes), or null. */
export function unreleased(changelog) {
  const lines = changelog.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((l) => /^##\s+unreleased\s*$/i.test(l));
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  if (end < 0) end = lines.length;
  return { start, end, body: lines.slice(start + 1, end).join('\n') };
}

// ---------- your part ----------
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const EXACT_TAG = /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const FULL_SHA = /^[0-9a-f]{40}$/;
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasSection = (log, version) => new RegExp(`^##\\s+\\[?${esc(version)}\\]?(\\s|$)`, 'm').test(log);

/**
 * Everything that would make this marketplace a bad release, as readable sentences ([] when it's publishable).
 * @param {string} root - the marketplace folder
 * @returns {string[]}
 */
export function validateMarketplace(root) {
  const file = manifestPath(root);
  if (!file) return [`No marketplace.json (the CLI looks in ${MANIFESTS.join(', ')}).`];
  let m;
  try { m = readJson(file); } catch (e) { return [`marketplace.json is not valid JSON: ${e.message}`]; }
  const problems = [];
  if (!KEBAB.test(m.name ?? '') || m.name.length > 64) problems.push(`The marketplace's "name" must be kebab-case, up to 64 characters (got "${m.name ?? ''}").`);
  if (!String(m.owner?.name ?? '').trim()) problems.push('"owner.name" is required: the CLI refuses a marketplace without an owner.');
  if (!Array.isArray(m.plugins) || !m.plugins.length) return [...problems, '"plugins" must list at least one plugin.'];
  const seen = new Set();
  m.plugins.forEach((p, i) => {
    const at = `Plugin ${i + 1} (${p?.name ?? 'no name'})`;
    if (!KEBAB.test(p?.name ?? '') || p.name.length > 64) problems.push(`${at}: the name must be kebab-case (the CLI refuses anything else).`);
    if (seen.has(p?.name)) problems.push(`${at}: another plugin already has this name, so "${p.name}@${m.name}" would be ambiguous.`);
    seen.add(p?.name);
    if (!SEMVER.test(String(p?.version ?? ''))) problems.push(`${at}: "version" must be semver, X.Y.Z (got "${p?.version ?? ''}").`);
    const src = p?.source;
    if (src && typeof src === 'object') {
      const pinned = FULL_SHA.test(String(src.sha ?? '')) || EXACT_TAG.test(String(src.ref ?? ''));
      if (!pinned) problems.push(`${at}: its ${src.source ?? 'remote'} source follows "${src.ref ?? src.sha ?? 'the default branch'}": pin a full version tag or a 40-character sha.`);
      return;
    }
    if (typeof src !== 'string' || !src.trim()) { problems.push(`${at}: "source" is missing.`); return; }
    const dir = path.resolve(root, src);
    const rel = path.relative(path.resolve(root), dir);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) { problems.push(`${at}: the source "${src}" must be a folder inside the marketplace.`); return; }
    if (!fs.existsSync(path.join(dir, 'plugin.json'))) { problems.push(`${at}: "${src}" has no plugin.json (the CLI accepts the entry, then fails at install).`); return; }
    let pj;
    try { pj = readJson(path.join(dir, 'plugin.json')); } catch (e) { problems.push(`${at}: its plugin.json is not valid JSON: ${e.message}`); return; }
    if (pj.name !== p.name) problems.push(`${at}: its plugin.json is named "${pj.name}" (the CLI installs it silently under the entry's name).`);
    if (pj.version !== p.version) problems.push(`${at}: the entry says ${p.version}, plugin.json says ${pj.version} (Copilot reports plugin.json's).`);
    const logFile = path.join(dir, 'CHANGELOG.md');
    const log = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '';
    if (!hasSection(log, pj.version)) problems.push(`${at}: CHANGELOG.md has no "## ${pj.version}" section: what changed in this version?`);
  });
  return problems;
}

/** "1.2.3" + "minor" → "1.3.0". Throws on anything that isn't X.Y.Z or a known part. */
export function bump(version, part) {
  const m = String(version).match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) throw new Error(`"${version}" is not a release version (X.Y.Z).`);
  const [major, minor, patch] = m.slice(1).map(Number);
  if (part === 'major') return `${major + 1}.0.0`;
  if (part === 'minor') return `${major}.${minor + 1}.0`;
  if (part === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`"${part}" is not major, minor or patch.`);
}

/** What "## Unreleased" asks for: 'breaking' | 'feature' | 'fix', or null when it has no entries. */
export function changeKind(changelog) {
  const u = unreleased(changelog);
  if (!u) return null;
  const kinds = new Set();
  let heading = '';
  for (const line of u.body.split('\n')) {
    const h = line.match(/^###\s+(.+?)\s*$/);
    if (h) { heading = h[1].toLowerCase(); continue; }
    if (!/^\s*[-*]\s+\S/.test(line)) continue;
    if (/breaking|removed/.test(heading) || /\bBREAKING\b/.test(line)) kinds.add('breaking');
    else if (/added|changed|deprecated/.test(heading)) kinds.add('feature');
    else kinds.add('fix');
  }
  return ['breaking', 'feature', 'fix'].find((k) => kinds.has(k)) ?? null;
}

/** Move the Unreleased entries under "## <version> - <date>", leaving an empty "## Unreleased". Throws when empty. */
export function cutChangelog(changelog, version, date) {
  const text = changelog.replace(/\r\n/g, '\n');
  const u = unreleased(text);
  if (!u) throw new Error('The changelog has no "## Unreleased" section.');
  if (!changeKind(text)) throw new Error('Nothing to release: "## Unreleased" has no entries.');
  if (hasSection(text, version)) throw new Error(`The changelog already has a ${version} section.`);
  const lines = text.split('\n');
  const body = lines.slice(u.start + 1, u.end);
  while (body.length && !body[0].trim()) body.shift();
  while (body.length && !body.at(-1).trim()) body.pop();
  return [...lines.slice(0, u.start + 1), '', `## ${version} - ${date}`, ...body, '', ...lines.slice(u.end)].join('\n').replace(/\n{3,}/g, '\n\n');
}

const RANK = { patch: 0, minor: 1, major: 2 };

/**
 * Release one plugin of the marketplace at ROOT.
 * @param {{ plugin: string, part: 'major'|'minor'|'patch', date: string, dryRun?: boolean, root?: string }} options
 * @returns {{ ok: boolean, version?: string, tag?: string, messages: string[] }}
 */
export function release({ plugin, part, date, dryRun = false, root = ROOT }) {
  const messages = [];
  const refuse = (...lines) => ({ ok: false, messages: [...messages, ...lines.map((l) => `❌ ${l}`)] });

  // 1. Validate first: a broken catalog is never released, and nothing is written.
  const problems = validateMarketplace(root);
  if (problems.length) return refuse('The marketplace is not valid, so nothing was released:', ...problems);
  const file = manifestPath(root);
  const m = readJson(file);
  const entry = m.plugins.find((p) => p.name === plugin);
  if (!entry) return refuse(`There is no plugin "${plugin}" in ${m.name}.`);
  if (typeof entry.source !== 'string') return refuse(`${plugin} lives in another repository: release it there, then pin the new tag here.`);
  const dir = path.resolve(root, entry.source);
  const pjFile = path.join(dir, 'plugin.json');
  const logFile = path.join(dir, 'CHANGELOG.md');
  const pj = readJson(pjFile);
  const log = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '';

  // 2. The bump must fit the changes: a breaking change is a major release (minor while still 0.x).
  const kind = changeKind(log);
  if (!kind) return refuse(`Nothing to release: the Unreleased section of ${plugin}'s CHANGELOG.md has no entries.`);
  const needs = kind === 'breaking' ? (Number(pj.version.split('.')[0]) >= 1 ? 'major' : 'minor') : kind === 'feature' ? 'minor' : 'patch';
  if (RANK[part] < RANK[needs]) return refuse(`The Unreleased changes are ${kind} changes: that needs at least a ${needs} release, not a ${part}.`);
  let next;
  let newLog;
  try { next = bump(pj.version, part); newLog = cutChangelog(log, next, date); } catch (e) { return refuse(e.message); }
  const tag = `${plugin}-v${next}`;

  // 3. Git, only in a repository of its own: a clean tree, and a tag nobody used yet.
  const repo = ownRepo(root);
  if (repo) {
    const dirty = git(root, ['status', '--porcelain']).out;
    if (dirty) return refuse(`The working tree has uncommitted changes (${dirty.split('\n').join(', ')}): a release commit holds the release and nothing else.`);
    if (git(root, ['tag', '-l', tag]).out.split('\n').includes(tag)) return refuse(`The tag ${tag} already exists: that version was released before.`);
  }
  messages.push(`📦 ${plugin} ${pj.version} → ${next} (${kind} changes, a ${part} release), tag ${tag}`);
  if (dryRun) return { ok: true, version: next, tag, messages: [...messages, '🔍 dry run: nothing was written'] };

  // 4. Write the version in both places, and the changelog.
  pj.version = next;
  entry.version = next;
  writeJson(pjFile, pj);
  writeJson(file, m);
  fs.writeFileSync(logFile, newLog);
  messages.push(`✏️  ${[pjFile, file, logFile].map((f) => path.relative(root, f).split(path.sep).join('/')).join(', ')}`);

  // 5. Commit and tag that commit.
  if (!repo) return { ok: true, version: next, tag, messages: [...messages, `⏭️  ${path.basename(path.resolve(root))} is not a Git repository of its own: skipped the commit and the tag ${tag}.`] };
  const files = [pjFile, file, logFile].map((f) => path.relative(root, f));
  for (const args of [['add', '--', ...files], ['commit', '-q', '-m', `release: ${plugin} v${next}`], ['tag', tag]]) {
    const r = git(root, args);
    if (r.code !== 0) return refuse(`git ${args[0]} failed: ${r.out}`);
  }
  return { ok: true, version: next, tag, messages: [...messages, `🏷️  committed and tagged ${tag}`] };
}
// ---------- CLI (given) ----------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes('--validate')) {
    const problems = validateMarketplace(ROOT);
    console.log(problems.length ? problems.map((p) => `❌ ${p}`).join('\n') : '✅ the marketplace is ready to publish');
    process.exit(problems.length ? 1 : 0);
  }
  const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : null; };
  const dryRun = args.includes('--dry-run');
  const date = flag('--date') ?? new Date().toISOString().slice(0, 10);
  const [plugin, part] = args.filter((a) => a !== '--dry-run');
  if (!plugin || !['major', 'minor', 'patch'].includes(part)) {
    console.error('Usage: node scripts/release.mjs <plugin> <major|minor|patch> [--date YYYY-MM-DD] [--dry-run]');
    process.exit(1);
  }
  const r = release({ plugin, part, date, dryRun });
  for (const m of r.messages) console.log(m);
  process.exit(r.ok ? 0 : 1);
}
