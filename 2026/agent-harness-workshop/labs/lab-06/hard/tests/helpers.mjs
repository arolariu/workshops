// Shared helpers for Lab 06 · hard's checks: find the plugin, read its manifest and component configs, and run the
// Copilot CLI in a scratch COPILOT_HOME (your own plugins, skills and settings stay out of it, and nothing of yours
// changes).
import fs from 'node:fs';
import path from 'node:path';

export const PLUGIN = 'studybuddy-plugin';
const SHELLS = ['bash', 'powershell'];

/** The plugin folder: studybuddy-plugin/, or the first top-level folder with a plugin.json. */
export function pluginDir(t) {
  const candidates = t.files('.').filter((f) => /^[^/]+\/plugin\.json$/.test(f) && !f.startsWith('.')).map((f) => f.split('/')[0]);
  if (!candidates.length) t.fail(`No plugin yet: create ${PLUGIN}/plugin.json.`);
  return candidates.includes(PLUGIN) ? PLUGIN : candidates[0];
}
export const manifest = (t, dir = pluginDir(t)) => t.json(`${dir}/plugin.json`);

/**
 * A path the plugin gives, relative to the plugin; null when it leaves the plugin. `pluginRoot`: accept a leading
 * ${PLUGIN_ROOT}/ (documented for MCP server args only, not for hook commands or manifest paths).
 */
export function inside(dir, rel, { pluginRoot = false } = {}) {
  const raw = String(rel);
  const clean = (pluginRoot ? raw.replace(/^\$\{(?:PLUGIN_ROOT|COPILOT_PLUGIN_ROOT|CLAUDE_PLUGIN_ROOT)\}[\\/]/, '') : raw).replace(/^\.\//, '');
  if (/\$|%/.test(clean)) return null;
  const joined = path.posix.normalize(`${dir}/${clean.replace(/\\/g, '/')}`);
  return joined === dir || joined.startsWith(`${dir}/`) ? joined : null;
}

/** The hook config: the manifest's "hooks" (a path or an object), else hooks.json or hooks/hooks.json. */
export function hookConfig(t, dir = pluginDir(t)) {
  const m = manifest(t, dir);
  if (m.hooks && typeof m.hooks === 'object') return { file: `${dir}/plugin.json`, cfg: m.hooks.hooks ? m.hooks : { hooks: m.hooks } };
  const rel = typeof m.hooks === 'string' ? inside(dir, m.hooks) : [`${dir}/hooks.json`, `${dir}/hooks/hooks.json`].find((f) => t.exists(f));
  if (!rel || !t.exists(rel)) t.fail(`No hook configuration in ${dir}: add hooks/hooks.json (and "hooks": "hooks/hooks.json" in plugin.json).`);
  return { file: rel, cfg: t.json(rel) };
}

/** The MCP servers: the manifest's "mcpServers" (a path or an object), else .mcp.json. { file, servers: { name: cfg } } */
export function mcpConfig(t, dir = pluginDir(t)) {
  const m = manifest(t, dir);
  if (m.mcpServers && typeof m.mcpServers === 'object') return { file: `${dir}/plugin.json`, servers: m.mcpServers.mcpServers ?? m.mcpServers };
  const rel = typeof m.mcpServers === 'string' ? inside(dir, m.mcpServers) : [`${dir}/.mcp.json`].find((f) => t.exists(f));
  if (!rel || !t.exists(rel)) t.fail(`No MCP configuration in ${dir}: add mcp/servers.json and point "mcpServers" in plugin.json at it.`);
  const cfg = t.json(rel);
  return { file: rel, servers: cfg.mcpServers ?? cfg.servers ?? {} };
}

export const agentNames = (t, dir) => t.files(`${dir}/agents`).filter((f) => f.endsWith('.agent.md')).map((f) => path.basename(f, '.agent.md'));
export const skillFolders = (t, dir) => t.files(`${dir}/skills`).filter((f) => /\/skills\/[^/]+\/SKILL\.md$/.test(f)).map((f) => path.basename(path.dirname(f)));
export function projectNames(t) {
  // Agents and skills are both known by the name: in their frontmatter (the file or folder name only as a fallback).
  const nameOf = (f, fallback) => { try { return String(t.frontmatter(f).data.name ?? fallback); } catch { return fallback; } };
  const agents = t.files('.github/agents').filter((f) => f.endsWith('.agent.md')).map((f) => nameOf(f, path.basename(f, '.agent.md')));
  const skills = t.files('.github/skills').filter((f) => /^\.github\/skills\/[^/]+\/SKILL\.md$/.test(f)).map((f) => nameOf(f, path.basename(path.dirname(f))));
  let servers = [];
  try { servers = Object.keys(JSON.parse(t.read('.mcp.json') ?? '{}').mcpServers ?? {}); } catch { /* not this level's business */ }
  return { agents, skills, servers };
}

/** The script a hook command runs with node, as a path inside the plugin (or null). */
export function hookScript(dir, command) {
  const m = String(command ?? '').match(/\bnode(?:\.exe)?\s+("([^"]+)"|'([^']+)'|(\S+))/);
  if (!m) return null;
  return inside(dir, m[2] ?? m[3] ?? m[4]);
}
export function preToolUse(cfg) {
  const list = cfg?.hooks?.preToolUse;
  return Array.isArray(list) ? list : [];
}
export { SHELLS };

/** Copilot CLI with a scratch COPILOT_HOME: { json, r } (json null when stdout isn't JSON). */
export function copilotScratch(t, args, opts = {}) {
  const home = opts.home ?? t.tmp();
  const r = t.copilot(args, { env: { COPILOT_HOME: home, COPILOT_AUTO_UPDATE: 'false' }, ...(opts.cwd ? { cwd: opts.cwd } : {}) });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* reported by the caller */ }
  return { json, r, home };
}

/** A copy of the plugin in a scratch folder, so running its scripts never writes into your src/. */
export function pluginCopy(t, dir = pluginDir(t)) {
  const dest = path.join(t.tmp(), path.basename(dir));
  fs.cpSync(t.path(dir), dest, { recursive: true });
  return dest;
}
