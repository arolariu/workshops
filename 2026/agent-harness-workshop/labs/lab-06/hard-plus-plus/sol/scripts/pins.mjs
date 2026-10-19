#!/usr/bin/env node
// 📌 Pin checker (Lab 06 · hard+). A dependency is pinned when it names one exact release: a full version tag
// (v1.0.0, 1.2.3, v2.0.0-beta.1) or a full 40-character commit SHA. A branch (#main), a range (#^1.2.0), a short
// SHA, a major-only tag (#v1) or no ref at all can change under you without a single line of your repo changing.
//   node scripts/pins.mjs [apm.yml …]     exit 0 when every dependency is pinned, 1 when one isn't
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml, manifestDeps, depKey, depRef } from './verify-lock.mjs';

const LOCAL = /^(\.{1,2}\/|\/|file:)/;
const FULL_SHA = /^[0-9a-f]{40}$/;
const EXACT_TAG = /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

/** Why a ref isn't one exact release, or null when it is. */
function looseness(ref) {
  if (!ref) return 'has no version, so it follows the default branch';
  if (FULL_SHA.test(ref) || EXACT_TAG.test(ref)) return null;
  if (/^[0-9a-f]{7,39}$/.test(ref)) return `uses a short SHA (${ref}); write all 40 characters`;
  if (/^v?\d+(\.\d+)?$/.test(ref)) return `uses #${ref}, a tag that is moved to every new ${ref}.x release`;
  if (/[\^~*<>=|]|\s|\.x\b/.test(ref)) return `uses a range (#${ref}), which picks a different release later`;
  return `follows #${ref}, a branch or a name that moves`;
}

/**
 * @param {(string | object)[]} deps - dependencies as written in apm.yml: "owner/repo#ref", "./local/path",
 *   or { git: "https://…", ref: "v1.0.0" }
 * @returns {string[]} one readable problem per dependency that isn't pinned (naming it); [] when all are pinned
 */
export function pinProblems(deps) {
  const problems = [];
  for (const dep of deps ?? []) {
    if (typeof dep === 'string' && LOCAL.test(dep)) continue;
    const why = looseness(depRef(dep));
    if (why) problems.push(`${depKey(dep) || JSON.stringify(dep)} ${why}: pin a full version tag (#v1.0.0) or a full commit SHA.`);
  }
  return problems;
}

// ---------- CLI (given) ----------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const files = process.argv.slice(2).length ? process.argv.slice(2) : ['apm.yml'];
  let bad = 0;
  for (const file of files) {
    let deps;
    try { deps = manifestDeps(parseYaml(fs.readFileSync(file, 'utf8'))); } catch (e) { console.error(`❌ ${file}: ${e.message}`); bad++; continue; }
    const problems = pinProblems(deps);
    bad += problems.length;
    console.log(problems.length ? `❌ ${file}\n${problems.map((p) => `   ${p}`).join('\n')}` : `✅ ${file}: ${deps.length} dependencies, all pinned`);
  }
  process.exit(bad ? 1 : 0);
}