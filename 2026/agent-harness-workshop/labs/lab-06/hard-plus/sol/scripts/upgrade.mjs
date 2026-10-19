#!/usr/bin/env node
// ⬆️ Upgrade codemod (Lab 06 · hard+). Moves a project from one release of an APM package to another, using the
// releases in vendor/ (they play GitHub here), and proves the result:
//   node scripts/upgrade.mjs <owner/repo> <version> [--root folder]
//   e.g. node scripts/upgrade.mjs studybuddy-org/campus-standards v2.0.0 --root ../some-project
//   exit 0 when the project is on <version> and verified, 1 when it refused or the proof failed
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashText, verifyLock, readLock, writeLock, depKey } from './verify-lock.mjs';
import { findShadows } from './find-shadows.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const VENDOR = path.join(HERE, '..', 'vendor');

/**
 * @param {string} root - the project to upgrade
 * @param {string} dep - "owner/repo"
 * @param {string} version - "v2.0.0" or "2.0.0"
 * @param {{ vendor?: string }} [options] - where the releases are (vendor/<repo>/<vX.Y.Z>/release.json)
 * @returns {{ ok: boolean, changed: string[], problems: string[] }} changed: the files written or removed
 */
export function upgrade(root, dep, version, { vendor = VENDOR } = {}) {
  const key = depKey(dep);
  const tag = `v${String(version).replace(/^v/, '')}`;
  const refuse = (...problems) => ({ ok: false, changed: [], problems });
  const at = (rel) => path.join(root, ...rel.split('/'));

  // 1. Never upgrade over drift: local edits to deployed files would be thrown away without anyone noticing.
  const before = verifyLock(root);
  if (!before.ok) return refuse(...before.problems.map((p) => `drift: ${p.message}`), 'Fix the drift first (reinstall, or send the change upstream), then upgrade.');
  const lock = readLock(root);
  const entries = lock.dependencies ?? [];
  const entry = entries.find((e) => depKey(e.repo_url) === key);
  if (!entry) return refuse(`${key} is not in apm.lock.yaml.`);
  if (entry.resolved_ref === tag) return { ok: true, changed: [], problems: [] };

  // 2. The release, as APM would resolve it.
  const dir = path.join(vendor, key.split('/')[1], tag);
  let release;
  try { release = JSON.parse(fs.readFileSync(path.join(dir, 'release.json'), 'utf8')); } catch { return refuse(`There is no release ${tag} of ${key} in ${vendor}.`); }
  if (depKey(release.repo) !== key || !/^[0-9a-f]{40}$/.test(release.commit ?? '')) return refuse(`${dir}/release.json is not a pinned release of ${key}.`);
  const next = new Map(Object.entries(release.deploy ?? {}).map(([to, from]) => [to, fs.readFileSync(path.join(dir, ...from.split('/')), 'utf8')]));

  // 3. Ownership: write only where this package wrote before, or where nothing exists yet.
  const mine = new Set(entry.deployed_files ?? []);
  const others = new Set(entries.filter((e) => e !== entry).flatMap((e) => e.deployed_files ?? []));
  for (const target of next.keys()) {
    if (others.has(target)) return refuse(`${target} belongs to another package: ${tag} can't deploy it.`);
    if (!mine.has(target) && fs.existsSync(at(target))) return refuse(`${target} already exists and the project owns it (no lock entry claims it): ${tag} would overwrite it. Move or rename it first.`);
  }
  const manifestText = fs.readFileSync(at('apm.yml'), 'utf8');
  const pin = new RegExp(`(${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\.git)?)#${String(entry.resolved_ref).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
  if (!pin.test(manifestText)) return refuse(`apm.yml has no "${key}#${entry.resolved_ref}" to bump.`);

  // 4. Everything checked: now write. Old files out, new files in.
  const project = walk(root).filter((f) => !mine.has(f) && !others.has(f) && !next.has(f) && f !== 'apm.lock.yaml'
    && !/^(vendor|node_modules|apm_modules|\.git|\.agent-logs)\//.test(f) && /\.(md|ya?ml|json|txt|m?js)$/i.test(f));
  const changed = new Set();
  for (const f of mine) {
    if (next.has(f)) continue;
    fs.rmSync(at(f), { force: true });
    prune(root, path.dirname(at(f)));
    changed.add(f);
  }
  for (const [f, text] of next) {
    fs.mkdirSync(path.dirname(at(f)), { recursive: true });
    fs.writeFileSync(at(f), text);
    changed.add(f);
  }
  // 5. The breaking changes, in the project's own files (agents, AGENTS.md, instructions …).
  for (const m of release.migrations ?? []) {
    if (!m.rename || !m.to) continue;
    for (const f of project) {
      const text = fs.readFileSync(at(f), 'utf8');
      if (text.includes(m.rename)) { fs.writeFileSync(at(f), text.split(m.rename).join(m.to)); changed.add(f); }
    }
  }
  // 6. The pin and the lock.
  fs.writeFileSync(at('apm.yml'), fs.readFileSync(at('apm.yml'), 'utf8').replace(pin, `$1#${tag}`));
  changed.add('apm.yml');
  const files = [...next.keys()].sort();
  Object.assign(entry, {
    resolved_ref: tag,
    resolved_commit: release.commit,
    version: release.version,
    deployed_files: files,
    deployed_file_hashes: Object.fromEntries(files.map((f) => [f, hashText(next.get(f))])),
  });
  writeLock(root, lock);
  changed.add('apm.lock.yaml');

  // 7. Prove nothing broke: the lock matches what is installed, and nothing in the project hides a plugin's item.
  const after = verifyLock(root);
  const plugins = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory() && fs.existsSync(path.join(root, e.name, 'plugin.json'))).map((e) => e.name);
  const shadows = findShadows(root, plugins);
  const problems = [
    ...after.problems.map((p) => `after the upgrade: ${p.message}`),
    ...shadows.map((s) => `after the upgrade: ${s.project} hides ${s.plugin}`),
  ];
  return { ok: !problems.length, changed: [...changed].sort(), problems };
}

/** Every file under root, relative, with forward slashes. */
function walk(root, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) { if (!/^(node_modules|\.git)$/.test(e.name)) out.push(...walk(root, r)); } else out.push(r);
  }
  return out;
}
/** Remove empty folders from dir up to (not including) root. */
function prune(root, dir) {
  while (path.relative(root, dir) && !path.relative(root, dir).startsWith('..')) {
    try { if (fs.readdirSync(dir).length) return; fs.rmdirSync(dir); } catch { return; }
    dir = path.dirname(dir);
  }
}

// ---------- CLI (given) ----------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--root');
  const root = path.resolve(at >= 0 ? args.splice(at, 2)[1] ?? '.' : '.');
  const [dep, version] = args;
  if (!dep || !version) {
    console.error('Usage: node scripts/upgrade.mjs <owner/repo> <version> [--root folder]');
    process.exit(1);
  }
  const { ok, changed, problems } = upgrade(root, dep, version);
  for (const f of changed) console.log(`   ✏️  ${f}`);
  for (const p of problems) console.log(`❌ ${p}`);
  if (ok) console.log(changed.length ? `✅ ${dep} is on ${version}: lock verified, nothing shadowed` : `✅ ${dep} is already on ${version}: nothing to do`);
  process.exit(ok ? 0 : 1);
}