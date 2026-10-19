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
  // TODO(M4): refuse over drift (verifyLock) and over files the package doesn't own, swap the deployed files,
  // apply the release's migrations, rewrite the pin and the lock entry, then prove it (verifyLock, findShadows).
  return { ok: false, changed: [], problems: ['upgrade() is not written yet.'] };
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