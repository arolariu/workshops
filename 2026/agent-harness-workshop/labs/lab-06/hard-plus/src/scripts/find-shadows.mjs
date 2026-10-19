#!/usr/bin/env node
// 👥 Shadow detector (Lab 06 · hard+). Copilot loads project skills BEFORE plugin skills and keeps the first of each
// name, without a warning: a project skill with a plugin skill's name silently hides the approved one (a SHADOW).
// Plugin agents can't be hidden: Copilot lists them as <plugin>:<name>. But a project agent with a plugin agent's
// name is a LOOK-ALIKE: `/agent sb-reviewer` picks the project's (often stale) copy, not studybuddy-harness:sb-reviewer.
//   node scripts/find-shadows.mjs [--root folder] [plugin folder …]     default plugin: studybuddy-plugin
//   exit 0 when nothing is shadowed or imitated, 1 when something is
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from './verify-lock.mjs';

/** Given: the frontmatter of a Markdown file as an object ({} when there is none or it can't be read). */
export function frontmatter(file) {
  try {
    const m = fs.readFileSync(file, 'utf8').replace(/\r/g, '').match(/^---\n([\s\S]*?)\n---/);
    return m ? parseYaml(m[1]) : {};
  } catch { return {}; }
}

/**
 * Project skills that hide plugin skills, and project agents that look like plugin agents.
 * @param {string} root - the project folder
 * @param {string[]} pluginDirs - plugin folders, relative to root
 * @returns {{ kind: 'agent' | 'skill', effect: 'look-alike' | 'shadow', name: string, project: string, plugin: string,
 *   id?: string }[]} sorted by kind, name, then project; paths relative to root, with forward slashes; agents also
 *   have `id`, the plugin agent's own name (<plugin name>:<name>)
 */
export function findShadows(root, pluginDirs) {
  // TODO(M3): collect the plugin's agents and skills, then every project agent and skill Copilot loads first (see
  // todo.md for the folders, and which name each kind goes by), and pair up equal names: a skill is a shadow, an
  // agent a look-alike.
  return [];
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
  const at = args.indexOf('--root');
  const root = path.resolve(at >= 0 ? args.splice(at, 2)[1] ?? '.' : '.');
  const plugins = args.length ? args : ['studybuddy-plugin'];
  const found = findShadows(root, plugins);
  if (!found.length) console.log(`✅ nothing in the project hides or imitates an item of ${plugins.join(', ')}`);
  for (const s of found) {
    if (s.effect === 'shadow') console.log(`❌ skill "${s.name}": ${s.project} hides ${s.plugin} (Copilot keeps the project's)`);
    else console.log(`⚠️  agent "${s.name}": ${s.project} looks like ${s.id} (/agent ${s.name} picks the project's copy)`);
  }
  process.exit(found.length ? 1 : 0);
}