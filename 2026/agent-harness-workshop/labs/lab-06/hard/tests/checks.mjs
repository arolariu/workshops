// Free checks for Lab 06 · hard.
import path from 'node:path';

function pluginDir(t) {
  const candidates = t.files('.').filter((f) => /^[^/]+\/plugin\.json$/.test(f) && !f.startsWith('.github/')).map((f) => f.split('/')[0]);
  if (!candidates.length) t.fail('No plugin yet: create studybuddy-plugin/plugin.json.');
  return candidates.includes('studybuddy-plugin') ? 'studybuddy-plugin' : candidates[0];
}
const names = (t, dir, kind) => {
  if (kind === 'agents') return t.files(dir).filter((f) => f.endsWith('.agent.md')).map((f) => path.basename(f, '.agent.md'));
  return t.files(dir).filter((f) => f.endsWith('/SKILL.md')).map((f) => path.basename(path.dirname(f)));
};

export default (t) => [
  t.check('plugin.json: name, description, version, author', () => {
    const dir = pluginDir(t);
    const p = t.json(`${dir}/plugin.json`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.name ?? '') || p.name.length > 64) return `"name" must be kebab-case (lowercase-with-hyphens), got "${p.name ?? ''}".`;
    if (String(p.description ?? '').length < 20) return 'Add a "description" that says what is inside.';
    if (!/^\d+\.\d+\.\d+/.test(p.version ?? '')) return '"version" should be semver, e.g. "1.0.0".';
    return Boolean(p.author?.name) || 'Add "author": { "name": "..." }.';
  }),
  t.check('It ships at least one agent and one skill', () => {
    const dir = pluginDir(t);
    const agents = names(t, `${dir}/agents`, 'agents');
    const skills = names(t, `${dir}/skills`, 'skills');
    if (!agents.length) return `No agents in ${dir}/agents/*.agent.md.`;
    if (!skills.length) return `No skills in ${dir}/skills/<name>/SKILL.md.`;
    for (const s of skills) {
      const { data } = t.frontmatter(`${dir}/skills/${s}/SKILL.md`);
      if (data.name !== s) return `Skill folder "${s}" has name "${data.name}". Make them match.`;
      if (String(data.description ?? '').length < 20) return `Skill "${s}" needs a description.`;
    }
    for (const a of agents) {
      const { data } = t.frontmatter(`${dir}/agents/${a}.agent.md`);
      if (String(data.description ?? '').length < 20) return `Agent "${a}" needs a description.`;
      if (!data.tools) return `Agent "${a}" needs an explicit tools list.`;
    }
    return true;
  }),
  t.check('No name clashes with the project', () => {
    const dir = pluginDir(t);
    const clashA = names(t, `${dir}/agents`, 'agents').filter((n) => names(t, '.github/agents', 'agents').includes(n));
    const clashS = names(t, `${dir}/skills`, 'skills').filter((n) => names(t, '.github/skills', 'skills').includes(n));
    const clash = [...clashA, ...clashS];
    return !clash.length || `These names exist in the project too, so the project's version would hide the plugin's: ${clash.join(', ')}. Rename them (e.g. sb-...).`;
  }),
  t.check('README.md explains how to install it', () => {
    const dir = pluginDir(t);
    const s = t.need(`${dir}/README.md`, `Add ${dir}/README.md.`);
    return /copilot plugin install/.test(s) || 'Show the install command (copilot plugin install ...).';
  }),
  t.check('Copilot loads it with --plugin-dir', () => {
    const dir = pluginDir(t);
    const { name } = t.json(`${dir}/plugin.json`);
    const r = t.copilot(['--plugin-dir', `./${dir}`, 'plugin', 'list', '--json']);
    let list = [];
    try { list = JSON.parse(r.stdout); } catch { return `Could not read the plugin list: ${r.all.trim().slice(0, 160)}`; }
    return list.some((p) => p.name === name) || `Copilot did not load "${name}" from ./${dir}.`;
  }, { needs: ['copilot'] }),
  t.check('Copilot lists the plugin skill', () => {
    const dir = pluginDir(t);
    const r = t.copilot(['--plugin-dir', `./${dir}`, 'skill', 'list', '--json']);
    let list = [];
    try { list = JSON.parse(r.stdout); } catch { return `Could not read the skill list: ${r.all.trim().slice(0, 160)}`; }
    return list.some((s) => s.source === 'plugin') || 'No skill with source "plugin" in the list.';
  }, { needs: ['copilot'] }),
];
