// Free checks for Lab 06 · hard: ship the harness as one plugin. The CLI checks run Copilot with a scratch
// COPILOT_HOME, so your own plugins and settings neither help nor get touched; they never send a prompt.
import fs from 'node:fs';
import path from 'node:path';
import {
  pluginDir, manifest, inside, hookConfig, mcpConfig, agentNames, skillFolders, projectNames, hookScript, preToolUse,
  SHELLS, copilotScratch, pluginCopy,
} from './helpers.mjs';

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const WRITE_TOOLS = /^(?:\*|all|edit|write|create|execute|shell|bash|powershell)\b/i;
const WHEN = /\buse (it |this )?when\b|\bwhen (the user|you|asked|someone)\b/i;
const PATH_FIELDS = ['agents', 'skills', 'commands', 'hooks', 'mcpServers', 'lspServers', 'extensions'];

/** Every name the plugin gives Copilot: agents and skills (by the name: in their frontmatter) and MCP servers. */
function itemNames(t, dir) {
  const skills = skillFolders(t, dir).map((s) => String(t.frontmatter(`${dir}/skills/${s}/SKILL.md`).data.name ?? s));
  const agents = agentNames(t, dir).map((a) => String(t.frontmatter(`${dir}/agents/${a}.agent.md`).data.name ?? a));
  let servers = [];
  try { servers = Object.keys(mcpConfig(t, dir).servers); } catch { /* M4 reports it */ }
  return { agents, skills, servers };
}
/** Run the plugin's guard from a copy of the plugin, with a session folder elsewhere (like Copilot does). */
function runGuard(t, toolName, command) {
  const dir = pluginDir(t);
  const { cfg } = hookConfig(t, dir);
  const entry = preToolUse(cfg)[0];
  const script = hookScript(dir, entry?.bash ?? entry?.powershell);
  if (!script || !t.exists(script)) t.fail('The preToolUse hook must run `node <a script inside the plugin>`, like `node hooks/scripts/sb-guard.mjs`.');
  const copy = pluginCopy(t, dir);
  const project = t.tmp();
  const raw = JSON.stringify({ sessionId: 'harness-check', timestamp: Date.now(), cwd: project, toolName, toolArgs: { command } });
  const r = t.hook(path.join(copy, path.relative(dir, script)), { raw }, { cwd: copy });
  return { ...r, copy, project };
}

export default (t) => [
  // M1 · The manifest
  t.check('plugin.json: name, description, version, author', () => {
    const p = manifest(t);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.name ?? '') || p.name.length > 64) return `"name" must be kebab-case (lowercase-with-hyphens), got "${p.name ?? ''}".`;
    if (String(p.description ?? '').length < 20) return 'Add a "description" that says what is inside (20+ characters).';
    if (!SEMVER.test(p.version ?? '')) return `"version" should be semver, like "1.0.0" (got "${p.version ?? ''}").`;
    return Boolean(p.author?.name) || 'Add "author": { "name": "..." }.';
  }, { milestone: 'M1' }),
  t.check('Every path in plugin.json is inside the plugin and exists', () => {
    const dir = pluginDir(t);
    const p = manifest(t, dir);
    for (const k of PATH_FIELDS) {
      const v = p[k];
      const list = typeof v === 'string' ? [v] : Array.isArray(v) ? v : [];
      for (const rel of list) {
        const at = inside(dir, rel);
        if (!at) return `"${k}": "${rel}" points outside ${dir}/. A plugin is installed on its own: everything it uses must be inside it.`;
        if (!t.exists(at) && !t.files(at).length) return `"${k}": "${rel}" doesn't exist in ${dir}/.`;
      }
    }
    return true;
  }, { milestone: 'M1' }),
  t.check('Copilot loads it with --plugin-dir, with its version', () => {
    const dir = pluginDir(t);
    const { name, version } = manifest(t, dir);
    const { json, r } = copilotScratch(t, ['--plugin-dir', t.path(dir), 'plugin', 'list', '--json']);
    if (!Array.isArray(json)) return `Could not read the plugin list: ${r.all.trim().slice(0, 200)}`;
    const row = json.find((p) => p.name === name);
    if (!row) return `Copilot did not load "${name}" from ./${dir}. It listed: ${json.map((p) => p.name).join(', ') || 'nothing'}.`;
    return row.version === version || `Copilot reports version "${row.version}", plugin.json says "${version}".`;
  }, { milestone: 'M1', needs: ['copilot'] }),

  // M2 · Agents and skills, prefixed
  t.check('The agents: described, with an explicit tool list (a reviewer stays read-only)', () => {
    const dir = pluginDir(t);
    const agents = agentNames(t, dir);
    if (!agents.length) return `No agents in ${dir}/agents/*.agent.md: package the Lab 03 reviewer.`;
    for (const a of agents) {
      const { data } = t.frontmatter(`${dir}/agents/${a}.agent.md`);
      if (String(data.description ?? '').length < 20) return `Agent "${a}" needs a description.`;
      const tools = Array.isArray(data.tools) ? data.tools : String(data.tools ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      if (!tools.length) return `Agent "${a}" needs an explicit tools list.`;
      if (/review/i.test(a) && tools.some((x) => WRITE_TOOLS.test(String(x)))) return `"${a}" reviews, so it is read-only: its tools [${tools.join(', ')}] can change things.`;
    }
    return agents.some((a) => /review/i.test(a)) || `Package the reviewer agent from Lab 03 (agents: ${agents.join(', ')}).`;
  }, { milestone: 'M2' }),
  t.check('The skills: explain-error and new-module, with the templates inside the plugin', () => {
    const dir = pluginDir(t);
    const folders = skillFolders(t, dir);
    for (const s of folders) {
      const { data, body } = t.frontmatter(`${dir}/skills/${s}/SKILL.md`);
      if (data.name !== s) return `Skill folder "${s}" has name "${data.name}". Make them match.`;
      if (String(data.description ?? '').length < 40 || !WHEN.test(data.description)) return `Skill "${s}": the description should say what it does and when to use it ("Use when …").`;
      if (/\.github\/skills\//.test(body)) return `Skill "${s}" points into .github/skills/, which doesn't exist where the plugin is installed. Point at files next to its SKILL.md (templates/…).`;
    }
    const explain = folders.find((s) => /explain-error$/.test(s));
    const module = folders.find((s) => /new-module$/.test(s));
    if (!explain || !module) return `Package both Lab 02 skills: explain-error and new-module (found: ${folders.join(', ') || 'none'}).`;
    const missing = ['templates/module.template.js', 'templates/module.test.template.js'].filter((f) => !t.exists(`${dir}/skills/${module}/${f}`));
    if (missing.length) return `${module} uses templates the plugin doesn't ship: copy ${missing.join(' and ')} into ${dir}/skills/${module}/.`;
    return /templates\//.test(t.read(`${dir}/skills/${module}/SKILL.md`)) || `${module}'s SKILL.md should tell the model where its templates are (templates/…).`;
  }, { milestone: 'M2' }),
  t.check('One prefix for every item, and no clash with the project', () => {
    const dir = pluginDir(t);
    const mine = itemNames(t, dir);
    const all = [...mine.agents, ...mine.skills, ...mine.servers];
    if (!all.length) return 'The plugin has no agents, skills or MCP servers yet.';
    const prefix = (all[0].match(/^[a-z0-9]+-/) ?? [''])[0];
    const off = all.filter((n) => !prefix || !n.startsWith(prefix));
    if (prefix.length < 3 || off.length) return `Give every agent, skill and MCP server the same short prefix (like sb-), so they never collide with a project's own. Not prefixed: ${(off.length ? off : all).join(', ')}.`;
    const project = projectNames(t);
    const hidden = mine.skills.filter((n) => project.skills.includes(n));
    if (hidden.length) return `The project has skills with these names too, so Copilot would use the project's and drop the plugin's: ${hidden.join(', ')}.`;
    const twins = mine.agents.filter((n) => project.agents.includes(n));
    if (twins.length) return `The project has agents with these names too. The plugin's stay available as <plugin>:<name>, but "/agent ${twins[0]}" would pick the project's look-alike: ${twins.join(', ')}.`;
    const servers = mine.servers.filter((n) => project.servers.includes(n));
    return !servers.length || `The project's .mcp.json has servers with these names too, so one would replace the other: ${servers.join(', ')}.`;
  }, { milestone: 'M2' }),
  t.check('Copilot lists the plugin\'s skills', () => {
    const dir = pluginDir(t);
    const want = itemNames(t, dir).skills;
    if (!want.length) return 'The plugin has no skills yet.';
    const { json, r } = copilotScratch(t, ['--plugin-dir', t.path(dir), 'skill', 'list', '--json']);
    if (!Array.isArray(json)) return `Could not read the skill list: ${r.all.trim().slice(0, 200)}`;
    const missing = want.filter((n) => !json.some((s) => s.name === n && s.source === 'plugin'));
    return !missing.length || `Copilot did not list these plugin skills: ${missing.join(', ')}. Check their frontmatter.`;
  }, { milestone: 'M2', needs: ['copilot'] }),

  // M3 · Guardrails that travel
  t.check('hooks.json: preToolUse on both shells, with a timeout, running a script inside the plugin', () => {
    const dir = pluginDir(t);
    const { file, cfg } = hookConfig(t, dir);
    if (cfg.version !== 1) return `${file} needs "version": 1.`;
    const pre = preToolUse(cfg);
    if (!pre.length) return `${file} has no preToolUse hook.`;
    for (const e of pre) {
      const missing = SHELLS.filter((s) => !e[s]);
      if (missing.length) return `The preToolUse hook needs a "${missing.join('" and a "')}" command (macOS/Linux and Windows).`;
      if (!(Number(e.timeoutSec) > 0)) return 'Give the preToolUse hook a "timeoutSec".';
      if (e.cwd !== undefined) return `Leave "cwd" out. A hook's "cwd" is relative to the repository root (hooks reference), so even "." sends the plugin's hook into the project, where hooks/scripts/… doesn't exist; without it, the command runs from the plugin's own folder, like GitHub's own plugins do.`;
      for (const s of SHELLS) {
        if (/PLUGIN_ROOT|\$env:|%\w+%/.test(String(e[s]))) return `The ${s} command uses a variable (${e[s]}). Copilot documents \${PLUGIN_ROOT} for MCP server arguments, not for hook commands, and a plugin's hook already runs from the plugin's folder: use \`node hooks/scripts/sb-guard.mjs\`.`;
        const script = hookScript(dir, e[s]);
        if (!script) return `The ${s} command should be \`node <a script inside the plugin>\` (got "${e[s]}").`;
        if (!t.exists(script)) return `The ${s} command runs ${script}, which doesn't exist.`;
      }
    }
    return true;
  }, { milestone: 'M3' }),
  t.check('The plugin\'s guard blocks rm -rf and Remove-Item -Recurse, and allows normal work', () => {
    const bad = [['bash', 'rm -rf build'], ['powershell', 'Remove-Item -Recurse build'], ['bash', 'cd src && rm -fr ../dist']];
    for (const [tool, cmd] of bad) {
      const r = runGuard(t, tool, cmd);
      if (r.decision !== 'deny') return `The plugin's guard allowed ${tool} "${cmd}" (exit ${r.code}${r.stderr.trim() ? `, ${r.stderr.trim().split('\n').pop()}` : ''}).`;
    }
    const ok = runGuard(t, 'bash', 'npm test');
    return ok.decision === 'allow' || `The plugin's guard should allow "npm test": ${ok.reason || ok.stderr.trim().slice(0, 160)}`;
  }, { milestone: 'M3' }),
  t.check('It logs into the session\'s folder, not into the plugin', () => {
    const r = runGuard(t, 'bash', 'rm -rf build');
    const logs = path.join(r.project, '.agent-logs');
    const files = fs.existsSync(logs) ? fs.readdirSync(logs).filter((f) => f.endsWith('.jsonl')) : [];
    if (fs.existsSync(path.join(r.copy, '.agent-logs'))) return 'The guard wrote .agent-logs/ inside the plugin. A plugin hook runs from the plugin\'s folder: write logs under the payload\'s "cwd" (the session\'s folder) instead.';
    return files.length > 0 || 'No log in <session folder>/.agent-logs/*.jsonl. Log every decision under the payload\'s "cwd".';
  }, { milestone: 'M3' }),

  // M4 · The portal, packaged
  t.check('The MCP config: a stdio server that runs a script inside the plugin', () => {
    const dir = pluginDir(t);
    const { file, servers } = mcpConfig(t, dir);
    const names = Object.keys(servers);
    if (!names.length) return `${file} has no servers.`;
    for (const n of names) {
      const s = servers[n];
      if (s.url || (s.type && !['stdio', 'local'].includes(s.type))) return `"${n}" should be a local stdio server (the portal runs as a process).`;
      if (!/^node(\.exe)?$/i.test(String(s.command ?? ''))) return `"${n}" should run with "command": "node".`;
      const script = s.args?.[0] ? inside(dir, s.args[0], { pluginRoot: true }) : null;
      if (!script) return `"${n}": the first argument should be the server script inside the plugin (like "mcp/sb-portal.mjs").`;
      if (!t.exists(script)) return `"${n}" runs ${script}, which doesn't exist.`;
    }
    return true;
  }, { milestone: 'M4' }),
  t.check('The packaged portal answers over MCP, started from the plugin\'s folder', async () => {
    const dir = pluginDir(t);
    const [name, s] = Object.entries(mcpConfig(t, dir).servers)[0] ?? [];
    if (!name) return 'No MCP server in the plugin yet.';
    const copy = pluginCopy(t, dir);
    const args = (s.args ?? []).map((a) => String(a).replace(/^\$\{(?:PLUGIN_ROOT|COPILOT_PLUGIN_ROOT|CLAUDE_PLUGIN_ROOT)\}[\\/]/, ''));
    const client = await t.mcp({ command: 'node', args, cwd: copy });
    try {
      const tools = (await client.tools()).map((x) => x.name);
      const missing = ['get_deadlines', 'get_grades'].filter((x) => !tools.includes(x));
      if (missing.length) return `"${name}" doesn't offer ${missing.join(' and ')} (it has: ${tools.join(', ')}).`;
      const res = await client.call('get_grades', { course: 'SE201' });
      return (!res.isError && /SE201/.test(res.text)) || `get_grades { course: "SE201" } failed: ${res.text.slice(0, 160)}. Does the server find its data file from its own folder?`;
    } finally { client.close(); }
  }, { milestone: 'M4' }),
  t.check('Installed, Copilot registers its MCP server', () => {
    const dir = pluginDir(t);
    const { name } = manifest(t, dir);
    const want = Object.keys(mcpConfig(t, dir).servers);
    const copy = pluginCopy(t, dir);
    const home = t.tmp();
    const inst = copilotScratch(t, ['plugin', 'install', copy], { home });
    if (inst.r.code !== 0) return `copilot plugin install failed: ${inst.r.all.trim().slice(0, 200)}`;
    const { json, r } = copilotScratch(t, ['mcp', 'list', '--json'], { home });
    if (!json?.mcpServers) return `Could not read the MCP server list: ${r.all.trim().slice(0, 200)}`;
    const missing = want.filter((n) => json.mcpServers[n]?.sourcePlugin !== name);
    return !missing.length || `After installing ${name}, Copilot did not register: ${missing.join(', ')}. Check "mcpServers" in plugin.json.`;
  }, { milestone: 'M4', needs: ['copilot'] }),

  // M5 · Ready to share
  t.check('README.md: every item, how to install it, how to try it, and the version', () => {
    const dir = pluginDir(t);
    const s = t.need(`${dir}/README.md`, `Add ${dir}/README.md.`);
    const { version } = manifest(t, dir);
    const mine = itemNames(t, dir);
    const missing = [...mine.agents, ...mine.skills, ...mine.servers].filter((n) => !s.includes(n));
    if (missing.length) return `The README should name every item, so people know what they install. Missing: ${missing.join(', ')}.`;
    if (!/guard|hook/i.test(s)) return 'The README should say the plugin adds a guard hook (people should know what will block their calls).';
    if (!/copilot plugin install/.test(s)) return 'Show the install command (copilot plugin install …).';
    if (!/--plugin-dir/.test(s)) return 'Show how to try it without installing (copilot --plugin-dir …).';
    return s.includes(version) || `Say which version this is (plugin.json says ${version}).`;
  }, { milestone: 'M5' }),
];
