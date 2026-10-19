#!/usr/bin/env node
// 👥 Shadow detector (Lab 06 · hard+). Copilot loads project agents and skills BEFORE plugin ones, and the first
// name wins without a warning. So a project file with a plugin item's name silently hides the approved plugin item.
//   node scripts/find-shadows.mjs [--root folder] [plugin folder …]     default plugin: studybuddy-plugin
//   exit 0 when nothing is shadowed, 1 when something is
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
 * Project items that hide plugin items.
 * @param {string} root - the project folder
 * @param {string[]} pluginDirs - plugin folders, relative to root
 * @returns {{ kind: 'agent' | 'skill', name: string, project: string, plugin: string }[]} sorted by kind, then
 *   name; `project` and `plugin` are paths relative to root, with forward slashes
 */
export function findShadows(root, pluginDirs) {
  // TODO(M3): collect the plugin's agents and skills, then every project agent and skill Copilot would load
  // first (see todo.md for the folders, and how each kind gets its name), and pair up equal names.
  return [];
}

// ---------- CLI (given) ----------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--root');
  const root = path.resolve(at >= 0 ? args.splice(at, 2)[1] ?? '.' : '.');
  const plugins = args.length ? args : ['studybuddy-plugin'];
  const found = findShadows(root, plugins);
  if (!found.length) console.log(`✅ nothing in the project hides an item of ${plugins.join(', ')}`);
  for (const s of found) console.log(`❌ ${s.kind} "${s.name}": ${s.project} hides ${s.plugin}`);
  process.exit(found.length ? 1 : 0);
}