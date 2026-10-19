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
/** Run git in `cwd`: { code, out (stdout and stderr), stdout }. */
export function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim(), stdout: (r.stdout ?? '').trim() };
}
/**
 * Is `root` the top of its own Git repository (not a folder inside a bigger one)? `--show-cdup` prints the way up
 * to the top ("../../" inside a bigger repository) and nothing at the top itself, so no path strings are compared.
 */
export function ownRepo(root) {
  const r = git(root, ['rev-parse', '--show-cdup']);
  return r.code === 0 && r.stdout === '';
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
/**
 * Everything that would make this marketplace a bad release, as readable sentences ([] when it's publishable).
 * @param {string} root - the marketplace folder
 * @returns {string[]}
 */
export function validateMarketplace(root) {
  // TODO(M2): the CLI only checks the schema when someone adds the marketplace. Check what it doesn't: see todo.md.
  return [];
}

/** "1.2.3" + "minor" → "1.3.0". Throws on anything that isn't X.Y.Z or a known part. */
export function bump(version, part) {
  // TODO(M4)
  return version;
}

/** What "## Unreleased" asks for: 'breaking' | 'feature' | 'fix', or null when it has no entries. */
export function changeKind(changelog) {
  // TODO(M4)
  return null;
}

/** Move the Unreleased entries under "## <version> - <date>", leaving an empty "## Unreleased". Throws when empty. */
export function cutChangelog(changelog, version, date) {
  // TODO(M4)
  return changelog;
}

/**
 * Release one plugin of the marketplace at ROOT.
 * @param {{ plugin: string, part: 'major'|'minor'|'patch', date: string, dryRun?: boolean, root?: string }} options
 * @returns {{ ok: boolean, version?: string, tag?: string, messages: string[] }}
 */
export function release({ plugin, part, date, dryRun = false, root = ROOT }) {
  // TODO(M4): validate, check the bump fits the changes, check git (clean tree, new tag), write plugin.json,
  // the marketplace entry and the changelog, then commit and tag (only in its own repository).
  return { ok: false, messages: ['release() is not written yet.'] };
}

// ---------- CLI (given) ----------
// Run as a script (not imported)? Compare real paths: a symlink, a junction or an 8.3 short name must not switch it off.
const isMain = (() => {
  try {
    const real = (p) => fs.realpathSync.native(p);
    const [a, b] = [real(process.argv[1]), real(fileURLToPath(import.meta.url))];
    return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
  } catch { return false; }
})();
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
