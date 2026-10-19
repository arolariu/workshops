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
  const rel = (abs) => path.relative(root, abs).split(path.sep).join('/');
  const entries = (dir) => { try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; } };
  // An agent's ID is its file name; a skill's name is the name: in its SKILL.md (its folder is only the fallback).
  const agentsIn = (dir, re) => entries(dir).filter((e) => e.isFile() && re.test(e.name))
    .map((e) => ({ name: e.name.replace(re, ''), file: rel(path.join(dir, e.name)) }));
  const skillsIn = (dir) => entries(dir).filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'SKILL.md')))
    .map((e) => ({ name: String(frontmatter(path.join(dir, e.name, 'SKILL.md')).name ?? e.name), file: rel(path.join(dir, e.name, 'SKILL.md')) }));

  // Plugin items: agents/ and skills/, or the folders its plugin.json names.
  const plugin = { agent: [], skill: [] };
  for (const p of pluginDirs) {
    const dir = path.join(root, p);
    let manifest = {};
    try { manifest = JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf8')); } catch { /* defaults */ }
    const list = (v, d) => (Array.isArray(v) ? v : typeof v === 'string' ? [v] : [d]);
    for (const a of list(manifest.agents, 'agents')) plugin.agent.push(...agentsIn(path.join(dir, a), /\.agent\.md$/));
    for (const s of list(manifest.skills, 'skills')) plugin.skill.push(...skillsIn(path.join(dir, s)));
  }
  // Project items Copilot loads before any plugin's.
  const project = {
    agent: [...agentsIn(path.join(root, '.github', 'agents'), /\.agent\.md$/), ...agentsIn(path.join(root, '.claude', 'agents'), /(\.agent)?\.md$/)],
    skill: ['.github', '.agents', '.claude'].flatMap((d) => skillsIn(path.join(root, d, 'skills'))),
  };
  const found = [];
  for (const kind of ['agent', 'skill']) {
    for (const mine of project[kind]) {
      const hidden = plugin[kind].find((x) => x.name === mine.name);
      if (hidden) found.push({ kind, name: mine.name, project: mine.file, plugin: hidden.file });
    }
  }
  return found.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name) || a.project.localeCompare(b.project));
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