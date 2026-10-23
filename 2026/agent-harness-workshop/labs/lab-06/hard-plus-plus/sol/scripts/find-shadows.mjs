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
  const rel = (abs) => path.relative(root, abs).split(path.sep).join('/');
  const entries = (dir) => { try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; } };
  // Both are known by the name: in their frontmatter; the file or folder name is only the fallback.
  const agentsIn = (dir, re) => entries(dir).filter((e) => e.isFile() && re.test(e.name))
    .map((e) => ({ name: String(frontmatter(path.join(dir, e.name)).name ?? e.name.replace(re, '')), file: rel(path.join(dir, e.name)) }));
  const skillsIn = (dir) => entries(dir).filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'SKILL.md')))
    .map((e) => ({ name: String(frontmatter(path.join(dir, e.name, 'SKILL.md')).name ?? e.name), file: rel(path.join(dir, e.name, 'SKILL.md')) }));

  // Plugin items: agents/ and skills/, or the folders its plugin.json names. Its agents are <plugin name>:<name>.
  const plugin = { agent: [], skill: [] };
  for (const p of pluginDirs) {
    const dir = path.join(root, p);
    let manifest = {};
    try { manifest = JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf8')); } catch { /* defaults */ }
    const owner = manifest.name || path.basename(dir);
    const list = (v, d) => (Array.isArray(v) ? v : typeof v === 'string' ? [v] : [d]);
    for (const a of list(manifest.agents, 'agents')) plugin.agent.push(...agentsIn(path.join(dir, a), /\.agent\.md$/).map((x) => ({ ...x, id: `${owner}:${x.name}` })));
    for (const s of list(manifest.skills, 'skills')) plugin.skill.push(...skillsIn(path.join(dir, s)));
  }
  // Project items Copilot loads before any plugin's.
  const project = {
    agent: [...agentsIn(path.join(root, '.github', 'agents'), /\.agent\.md$/), ...agentsIn(path.join(root, '.claude', 'agents'), /(\.agent)?\.md$/)],
    skill: ['.github', '.agents', '.claude'].flatMap((d) => skillsIn(path.join(root, d, 'skills'))),
  };
  const found = [];
  for (const mine of project.skill) {
    const hidden = plugin.skill.find((x) => x.name === mine.name);
    if (hidden) found.push({ kind: 'skill', effect: 'shadow', name: mine.name, project: mine.file, plugin: hidden.file });
  }
  for (const mine of project.agent) {
    const twin = plugin.agent.find((x) => x.name === mine.name);
    if (twin) found.push({ kind: 'agent', effect: 'look-alike', name: mine.name, project: mine.file, plugin: twin.file, id: twin.id });
  }
  return found.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name) || a.project.localeCompare(b.project));
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