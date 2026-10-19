#!/usr/bin/env node
// 📌 Pin checker (Lab 06 · hard+). A dependency is pinned when it names one exact release: a full version tag
// (v1.0.0, 1.2.3, v2.0.0-beta.1) or a full 40-character commit SHA. A branch (#main), a range (#^1.2.0), a short
// SHA, a major-only tag (#v1) or no ref at all can change under you without a single line of your repo changing.
//   node scripts/pins.mjs [apm.yml …]     exit 0 when every dependency is pinned, 1 when one isn't
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml, manifestDeps, depKey, depRef } from './verify-lock.mjs';

/**
 * @param {(string | object)[]} deps - dependencies as written in apm.yml: "owner/repo#ref", "./local/path",
 *   or { git: "https://…", ref: "v1.0.0" }
 * @returns {string[]} one readable problem per dependency that isn't pinned (naming it); [] when all are pinned
 */
export function pinProblems(deps) {
  // TODO(M1): return one problem per loose dependency. depKey(dep) and depRef(dep) (given in verify-lock.mjs) split
  // "owner/repo#ref" and { git, ref } for you. Local paths ("./packages/x") are versioned with your repo: fine.
  return [];
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