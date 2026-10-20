// The scorecard (spec §5.5): what a harness folder contains, layer by layer, a few rules per layer, and the maturity level
// they add up to. Pure apart from reading the folder; MCP tool lists come in from outside (xray.mjs measures them).
import fs from 'node:fs';
import path from 'node:path';
import { parseFrontmatter, parseYaml } from './kit.mjs';

export const LAYERS = [
  { id: 'instructions', title: 'Instructions', icon: '📜', lab: 'lab-01', level: 'L1' },
  { id: 'skills', title: 'Skills', icon: '🧩', lab: 'lab-02', level: 'L2' },
  { id: 'agents', title: 'Custom agents', icon: '🎭', lab: 'lab-03', level: 'L3' },
  { id: 'mcp', title: 'MCP servers', icon: '🔌', lab: 'lab-04', level: 'L2' },
  { id: 'hooks', title: 'Hooks', icon: '🔒', lab: 'lab-05', level: 'L4' },
  { id: 'distribution', title: 'Plugins & APM', icon: '📦', lab: 'lab-06', level: 'L5' },
  { id: 'workflows', title: 'Agentic workflows', icon: '🚀', lab: 'lab-07', level: 'L5' },
  { id: 'governance', title: 'Governance', icon: '🏛️', lab: 'lab-08', level: 'L5' },
];
export const LEVEL_NAMES = { L0: 'Bare', L1: 'Instructed', L2: 'Equipped', L3: 'Scoped', L4: 'Guarded', L5: 'Governed' };
// Each level needs every group to have at least one layer present ("any of"), and every present layer at that level to pass.
const REQUIRES = {
  L1: [['instructions']],
  L2: [['skills', 'mcp']],
  L3: [['agents']],
  L4: [['hooks']],
  L5: [['distribution'], ['governance']],
};
const NEEDS = {
  instructions: 'an AGENTS.md with commands, boundaries and a definition of done',
  'skills|mcp': 'a skill or an MCP server',
  agents: 'a custom agent with an explicit tools list',
  hooks: 'a preToolUse hook for both shells, with a timeout',
  distribution: 'a pinned, shared harness (APM or a plugin)',
  governance: 'a HARNESS.md that names an owner, the layers, the threat model and the budget, with a CI gate on harness changes and evals',
};

const SKIP = new Set(['node_modules', '.git', '.agent-logs', 'apm_modules', 'runs']);
function walk(root) {
  const out = [];
  const go = (abs, rel, depth) => {
    if (depth > 6) return;
    let entries = [];
    try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (SKIP.has(e.name)) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) go(path.join(abs, e.name), r, depth + 1);
      else if (e.isFile()) out.push(r);
    }
  };
  go(root, '', 0);
  return out.sort();
}
// Keys under safe-outputs that configure every output (or are the always-on system types), not handlers with a max.
// https://github.github.com/gh-aw/reference/safe-outputs/ (Global Configuration Options, System Types)
const SAFE_OUTPUT_OPTIONS = new Set(['allowed-domains', 'allowed-github-references', 'mentions', 'max-bot-mentions', 'messages', 'report-failure-as-issue', 'failure-issue-repo', 'group-reports', 'github-token', 'github-app', 'app', 'environment', 'needs', 'data', 'max-patch-size', 'allow-full-history-fetch', 'runs-on', 'concurrency-group', 'staged', 'env', 'jobs', 'actions', 'threat-detection', 'noop', 'missing-tool', 'missing-data']);
const toolList = (v) => (v == null ? null : (Array.isArray(v) ? v : String(v).split(',')).map((x) => String(x).trim().replace(/^['"]|['"]$/g, '')).filter(Boolean));

/** What the folder holds, layer by layer. Broken JSON or YAML becomes a `problems` entry, never a throw. */
export function scanHarness(dir) {
  const files = walk(dir);
  const read = (rel) => { try { return fs.readFileSync(path.join(dir, ...rel.split('/')), 'utf8').replace(/\r\n/g, '\n'); } catch { return null; } };
  const problems = [];
  const json = (rel) => { const t = read(rel); if (t == null) return null; try { return JSON.parse(t); } catch (e) { problems.push(`${rel} is not valid JSON: ${e.message}`); return null; } };
  const front = (rel) => { try { return parseFrontmatter(read(rel) ?? ''); } catch (e) { problems.push(`${rel} has frontmatter that cannot be read: ${e.message}`); return null; } };
  const scan = { dir, files, problems, artifacts: [] };
  const art = (layer, rel) => scan.artifacts.push({ layer, path: rel });

  scan.instructions = files.filter((f) => f === 'AGENTS.md' || f === '.github/copilot-instructions.md' || /^\.github\/instructions\/.+\.instructions\.md$/.test(f)).map((f) => {
    const text = read(f) ?? '';
    const fm = f.endsWith('.instructions.md') ? front(f) : null;
    art('instructions', f);
    return { path: f, text, applyTo: fm?.data?.applyTo ?? null };
  });
  // .github/skills/ and .agents/skills/ (where APM installs them): Copilot CLI loads project skills from both.
  scan.skills = files.filter((f) => /^\.(github|agents)\/skills\/[^/]+\/SKILL\.md$/.test(f)).map((f) => {
    const folder = f.split('/')[2];
    const fm = front(f);
    return { path: f, folder, name: String(fm?.data?.name ?? ''), description: String(fm?.data?.description ?? ''), size: (read(f) ?? '').length };
  });
  for (const f of files) if (/^\.(github|agents)\/skills\//.test(f)) art('skills', f);
  scan.agents = files.filter((f) => /^\.github\/agents\/[^/]+\.agent\.md$/.test(f)).map((f) => {
    const fm = front(f);
    art('agents', f);
    return { path: f, name: String(fm?.data?.name ?? path.basename(f, '.agent.md')), description: String(fm?.data?.description ?? ''), tools: toolList(fm?.data?.tools) };
  });
  const mcpPath = ['.mcp.json', '.github/mcp.json'].find((f) => files.includes(f));
  scan.mcp = null;
  if (mcpPath) {
    const cfg = json(mcpPath);
    const servers = Object.entries(cfg?.mcpServers ?? cfg?.servers ?? {}).map(([name, s]) => ({ name, type: s?.type ?? (s?.url ? 'http' : 'stdio'), command: s?.command ?? null, args: Array.isArray(s?.args) ? s.args.map(String) : [], env: s?.env ?? {}, url: s?.url ?? null }));
    scan.mcp = { path: mcpPath, servers };
    art('mcp', mcpPath);
    for (const f of files) if (/^mcp\//.test(f)) art('mcp', f);
  }
  scan.hooks = files.filter((f) => /^\.github\/hooks\/[^/]+\.json$/.test(f)).map((f) => {
    const cfg = json(f);
    const list = (k) => (Array.isArray(cfg?.hooks?.[k]) ? cfg.hooks[k] : []);
    return { path: f, preToolUse: list('preToolUse'), postToolUse: list('postToolUse'), events: Object.keys(cfg?.hooks ?? {}) };
  });
  for (const f of files) if (/^\.github\/hooks\//.test(f)) art('hooks', f);
  scan.apm = null;
  if (files.includes('apm.yml')) {
    let data = null;
    try { data = parseYaml(read('apm.yml') ?? ''); } catch (e) { problems.push(`apm.yml cannot be read: ${e.message}`); }
    const deps = data?.dependencies?.apm ?? data?.dependencies ?? [];
    scan.apm = { path: 'apm.yml', deps: (Array.isArray(deps) ? deps : []).map((d) => (typeof d === 'string' ? d : String(d?.name ?? d?.repo ?? JSON.stringify(d)))) };
    art('distribution', 'apm.yml');
    if (files.includes('apm.lock.yaml')) art('distribution', 'apm.lock.yaml');
  }
  scan.plugins = files.filter((f) => /(^|\/)plugin\.json$/.test(f) && f.split('/').length <= 3 && !f.startsWith('.github/')).map((f) => {
    const p = json(f);
    const folder = path.posix.dirname(f);
    // A plugin at the root is the whole folder: list its manifest, not every file.
    if (folder === '.') art('distribution', f);
    else for (const g of files) if (g.startsWith(`${folder}/`)) art('distribution', g);
    return { path: f, name: p?.name ?? null, version: p?.version ?? null, description: p?.description ?? null };
  });
  scan.workflows = files.filter((f) => /^\.github\/workflows\/[^/]+\.md$/.test(f)).map((f) => {
    art('workflows', f);
    const own = front(f)?.data ?? null;
    // gh-aw imports: a shared file's settings reach the workflow (its own values win). Paths are relative to the
    // workflow's folder; `file.md#Section` and `owner/repo/…@ref` imports from elsewhere are not followed.
    const shared = (Array.isArray(own?.imports) ? own.imports : []).map((i) => String(typeof i === 'object' ? i?.path ?? '' : i).split('#')[0])
      .map((i) => path.posix.normalize(path.posix.join('.github/workflows', i))).filter((i) => files.includes(i));
    let effective = own;
    for (const i of shared) {
      art('workflows', i);
      const d = front(i)?.data ?? {};
      effective = { ...d, ...effective, 'safe-outputs': { ...(d['safe-outputs'] ?? {}), ...(effective?.['safe-outputs'] ?? {}) } };
    }
    return { path: f, frontmatter: own, effective, imports: shared };
  });
  scan.harnessMd = files.includes('HARNESS.md') ? { path: 'HARNESS.md', text: read('HARNESS.md') ?? '' } : null;
  if (scan.harnessMd) art('governance', 'HARNESS.md');
  // Plain GitHub Actions workflows (a gh-aw `.lock.yml` is compiled from a `.md` workflow, read above).
  scan.ci = files.filter((f) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(f) && !/\.lock\.ya?ml$/.test(f)).map((f) => {
    let data = null;
    try { data = parseYaml(read(f) ?? ''); } catch (e) { problems.push(`${f} cannot be read: ${e.message}`); }
    return { path: f, on: data?.on ?? null };
  });
  scan.evals = null;
  if (files.includes('evals/cases.json')) {
    const cfg = json('evals/cases.json');
    const cases = Array.isArray(cfg) ? cfg : Array.isArray(cfg?.cases) ? cfg.cases : [];
    scan.evals = { path: 'evals/cases.json', cases };
  }
  if (scan.harnessMd) {
    for (const w of scan.ci) art('governance', w.path);
    if (scan.evals) art('governance', scan.evals.path);
  }
  return scan;
}

/** Is a layer there at all? */
export function present(scan, layer) {
  switch (layer) {
    case 'instructions': return scan.instructions.length > 0;
    case 'skills': return scan.skills.length > 0;
    case 'agents': return scan.agents.length > 0;
    case 'mcp': return Boolean(scan.mcp?.servers.length);
    case 'hooks': return scan.hooks.length > 0;
    case 'distribution': return Boolean(scan.apm) || scan.plugins.length > 0;
    case 'workflows': return scan.workflows.length > 0;
    case 'governance': return Boolean(scan.harnessMd);
    default: return false;
  }
}

const READ_ONLY_ROLE = (a) => /review|audit/i.test(a.name) || /read-only|readonly|never edits/i.test(a.description);
const EVERY_TOOL = /^(\*|all)$/i;
const WRITE_TOOLS = /^(?:\*|(?:edit|write|execute|shell|bash|powershell|all)\b)/i;
// A pin is a version tag (v1.0.0, 1.2, v2.0.0-beta.1) or a commit SHA; a branch (#main) moves.
const PINNED = /#(?:v?\d+(?:\.\d+)*(?:[-+][\w.-]+)?|[0-9a-f]{7,40})$/i;
const WHEN = /\buse (it |this )?when\b|\bwhen (the user|you|asked|someone)\b|\buse (it )?(after|before|to|for)\b/i;
const READ_TOOL = /^(get|list|search|read|find)_/;
const WRITE_TOOL = /^(mark|set|create|update|delete|add|remove|save|write)_/;
const list = (xs) => xs.join('; ');

/** The rules: [{ id, layer, level, ok: true | false | null, message, files }]. ok null = not applicable or not measured. */
export function scorecard(scan, { mcpTools } = {}) {
  const out = [];
  const level = (layer) => LAYERS.find((l) => l.id === layer).level;
  const add = (id, layer, ok, message, files = []) => out.push({ id, layer, level: level(layer), ok, message, files });
  const none = (layer, what) => (id) => add(id, layer, null, `No ${what} here.`);

  // Instructions
  const main = scan.instructions.find((i) => i.path === 'AGENTS.md') ?? scan.instructions.find((i) => i.path === '.github/copilot-instructions.md');
  if (!main) ['instructions-short', 'instructions-cover'].forEach(none('instructions', 'AGENTS.md'));
  else {
    const lines = main.text.replace(/\n+$/, '').split('\n').length;
    add('instructions-short', 'instructions', lines < 100, lines < 100 ? `${main.path} is ${lines} lines.` : `${main.path} has ${lines} lines; keep it under 100 (every line is sent on every turn).`, [main.path]);
    const t = main.text;
    const missing = [
      [/^#+.*command/im.test(t) || /\b(npm|node|npx|pnpm|yarn) \S+/.test(t), 'commands'],
      [/^#+.*(boundar|never|don'?t)/im.test(t) || /\bnever\b/i.test(t), 'boundaries'],
      [/definition of done|done when|^#+.*\bdone\b/im.test(t), 'definition of done'],
    ].filter(([ok]) => !ok).map(([, w]) => w);
    add('instructions-cover', 'instructions', !missing.length, missing.length ? `${main.path} should cover: ${missing.join(', ')}.` : `${main.path} covers commands, boundaries and the definition of done.`, [main.path]);
  }

  // Skills
  if (!scan.skills.length) ['skill-name', 'skill-description'].forEach(none('skills', 'skills'));
  else {
    const badName = scan.skills.filter((s) => s.name !== s.folder);
    add('skill-name', 'skills', !badName.length, badName.length ? list(badName.map((s) => `name "${s.name}" should match its folder "${s.folder}"`)) : 'Every skill is named after its folder.', badName.map((s) => s.path));
    const vague = scan.skills.filter((s) => s.description.length < 40 || !WHEN.test(s.description));
    add('skill-description', 'skills', !vague.length, vague.length ? list(vague.map((s) => `${s.folder}: the description should say what it does and when to use it ("Use when …"), in 40+ characters`)) : 'Every description says what the skill does and when to use it.', vague.map((s) => s.path));
  }

  // Agents
  if (!scan.agents.length) ['agent-tools', 'agent-readonly'].forEach(none('agents', 'custom agents'));
  else {
    // No tools key means every tool; `tools: []` is an explicit list with no tools at all (the least privilege there is).
    const open = scan.agents.filter((a) => a.tools == null || a.tools.some((t) => EVERY_TOOL.test(t)));
    const why = (a) => (a.tools != null ? `${a.name}: tools [${a.tools.join(', ')}] allows every tool` : `${a.name}: no tools list, so it can use every tool`);
    add('agent-tools', 'agents', !open.length, open.length ? list(open.map(why)) : 'Every agent has an explicit tools list.', open.map((a) => a.path));
    const ro = scan.agents.filter(READ_ONLY_ROLE);
    const leaks = ro.map((a) => ({ a, w: (a.tools ?? ['(every tool)']).filter((x) => WRITE_TOOLS.test(x) || x === '(every tool)') })).filter((x) => x.w.length);
    if (!ro.length) add('agent-readonly', 'agents', null, 'No read-only role (reviewer, auditor) to check.');
    else add('agent-readonly', 'agents', !leaks.length, leaks.length ? list(leaks.map(({ a, w }) => `${a.name} is a read-only role but has ${w.join(', ')}`)) : `${ro.map((a) => a.name).join(', ')}: read-only, and the tools say so.`, leaks.map(({ a }) => a.path));
  }

  // MCP
  if (!scan.mcp?.servers.length) ['mcp-described', 'mcp-readonly-hint'].forEach(none('mcp', 'MCP servers'));
  else {
    const measured = scan.mcp.servers.filter((s) => Array.isArray(mcpTools?.[s.name]?.tools));
    const unmeasured = scan.mcp.servers.filter((s) => !measured.includes(s)).map((s) => `${s.name} (${mcpTools?.[s.name]?.error ?? 'its tools were not listed'})`);
    if (!measured.length) {
      ['mcp-described', 'mcp-readonly-hint'].forEach((id) => add(id, 'mcp', null, `not measured: ${unmeasured.join('; ')}`, [scan.mcp.path]));
    } else {
      const tools = measured.flatMap((s) => mcpTools[s.name].tools.map((t) => ({ ...t, server: s.name })));
      const note = unmeasured.length ? ` (not measured: ${unmeasured.join('; ')})` : '';
      const bare = tools.filter((t) => !String(t.description ?? '').trim() || !t.inputSchema);
      add('mcp-described', 'mcp', !bare.length, bare.length ? `${list(bare.map((t) => `${t.name} needs ${!String(t.description ?? '').trim() ? 'a description' : 'an input schema'}`))}${note}` : `Every tool (${tools.length}) has a description and an input schema.${note}`, [scan.mcp.path]);
      const ro = (t) => t.annotations?.readOnlyHint === true;
      const wrong = [
        ...tools.filter((t) => READ_TOOL.test(t.name) && !ro(t)).map((t) => `${t.name} only reads: mark it readOnlyHint`),
        ...tools.filter((t) => WRITE_TOOL.test(t.name) && ro(t)).map((t) => `${t.name} changes things but is marked read-only`),
      ];
      add('mcp-readonly-hint', 'mcp', !wrong.length, wrong.length ? `${list(wrong)}${note}` : `Read tools are marked read-only, write tools are not.${note}`, [scan.mcp.path]);
    }
  }

  // Hooks
  if (!scan.hooks.length) none('hooks', 'hooks')('hooks-both-shells');
  else {
    const pre = scan.hooks.flatMap((h) => h.preToolUse.map((e) => ({ e, path: h.path })));
    const bad = pre.filter(({ e }) => !e?.bash || !e?.powershell || !(Number(e?.timeoutSec) > 0));
    const msg = !pre.length ? 'No preToolUse hook: nothing can block a tool call.'
      : bad.length ? list(bad.map(({ e, path: p }) => `${p}: ${[!e?.bash && 'bash', !e?.powershell && 'powershell'].filter(Boolean).map((s) => `no "${s}" command`).concat(Number(e?.timeoutSec) > 0 ? [] : ['no timeoutSec']).join(', ')}`))
        : 'preToolUse runs on both shells, with a timeout.';
    add('hooks-both-shells', 'hooks', pre.length > 0 && !bad.length, msg, scan.hooks.map((h) => h.path));
  }

  // Distribution
  if (!scan.apm) none('distribution', 'apm.yml')('apm-pinned');
  else {
    // A local path (../dist/apm, ./packages/x) is pinned by the repository's own history.
    const loose = scan.apm.deps.filter((d) => !PINNED.test(d) && !/^\.{1,2}[\\/]/.test(d));
    add('apm-pinned', 'distribution', !loose.length, loose.length ? `Pin these to a tag (owner/repo#v1.0.0): ${loose.join(', ')}` : `Every dependency is pinned (${scan.apm.deps.length}).`, ['apm.yml']);
  }
  if (!scan.plugins.length) none('distribution', 'plugin.json')('plugin-manifest');
  else {
    const gaps = scan.plugins.map((p) => ({ p, miss: ['name', 'version', 'description'].filter((k) => !p[k]) })).filter((x) => x.miss.length);
    add('plugin-manifest', 'distribution', !gaps.length, gaps.length ? list(gaps.map(({ p, miss }) => `${p.path} needs ${miss.join(', ')}`)) : 'plugin.json has a name, a version and a description.', scan.plugins.map((p) => p.path));
  }

  // Workflows
  if (!scan.workflows.length) ['workflow-readonly', 'workflow-safe-outputs', 'workflow-limits'].forEach(none('workflows', 'agentic workflows'));
  else {
    const fm = scan.workflows.map((w) => ({ w, d: w.frontmatter ?? {}, e: w.effective ?? w.frontmatter ?? {} }));
    const writes = fm.filter(({ d }) => {
      const p = d.permissions;
      if (p == null) return true;
      if (typeof p === 'string') return /write/i.test(p);
      return Object.values(p).some((v) => /write/i.test(String(v)));
    });
    add('workflow-readonly', 'workflows', !writes.length, writes.length ? list(writes.map(({ w, d }) => `${w.path}: ${d.permissions == null ? 'no permissions block, so the default token may write' : 'the agent has write permission'}`)) : "The agents' permissions are read-only.", writes.map(({ w }) => w.path));
    const unbounded = fm.flatMap(({ w, e }) => Object.entries(e['safe-outputs'] ?? {}).filter(([k, v]) => !SAFE_OUTPUT_OPTIONS.has(k) && v && typeof v === 'object' && !(Number(v.max) > 0)).map(([k]) => `${w.path}: ${k} has no max`));
    add('workflow-safe-outputs', 'workflows', !unbounded.length, unbounded.length ? list(unbounded) : 'Every safe output has a max.', scan.workflows.map((w) => w.path));
    const limits = fm.filter(({ e }) => e['timeout-minutes'] == null || e['max-ai-credits'] == null);
    add('workflow-limits', 'workflows', !limits.length, limits.length ? list(limits.map(({ w, e }) => `${w.path}: needs ${[e['timeout-minutes'] == null && 'timeout-minutes', e['max-ai-credits'] == null && 'max-ai-credits'].filter(Boolean).join(' and ')}`)) : 'Every workflow has a timeout and a credit limit.', scan.workflows.map((w) => w.path));
  }

  // Governance
  if (!scan.harnessMd) none('governance', 'HARNESS.md')('harness-owner');
  else {
    const t = scan.harnessMd.text;
    const missing = [[/owner/i, 'an owner'], [/layer/i, 'the layers'], [/threat/i, 'the threat model'], [/budget|credit/i, 'the budget']].filter(([re]) => !re.test(t)).map(([, w]) => w);
    add('harness-owner', 'governance', !missing.length, missing.length ? `HARNESS.md should name ${missing.join(', ')}.` : 'HARNESS.md names an owner, the layers, the threat model and the budget.', ['HARNESS.md']);
    const gates = scan.ci.filter((w) => gatesHarness(w.on));
    add('governance-ci-gate', 'governance', gates.length > 0, gates.length
      ? `${list(gates.map((w) => w.path))} runs on pull requests that change the harness.`
      : 'A harness change needs a CI gate: a .github/workflows/*.yml that runs on pull_request, with paths (if any) that include the harness (AGENTS.md, .github/**, mcp/**, scripts/**, evals/**…).', gates.length ? gates.map((w) => w.path) : scan.ci.map((w) => w.path));
    const cases = scan.evals?.cases.length ?? 0;
    add('governance-evals', 'governance', cases > 0, cases
      ? `evals/cases.json has ${cases} case${cases === 1 ? '' : 's'}.`
      : scan.evals ? 'evals/cases.json has no cases: an empty suite is no evidence.' : 'A governed harness has evals: an evals/cases.json with at least one case.', ['evals/cases.json']);
  }
  return out;
}

// Paths a harness change touches; a gate's `paths` filter has to let at least one of them through.
const HARNESS_SAMPLES = ['AGENTS.md', 'HARNESS.md', '.github/copilot-instructions.md', '.github/instructions/a.instructions.md', '.github/skills/a/SKILL.md', '.github/agents/a.agent.md', '.github/hooks/guard.json', '.github/workflows/a.md', '.mcp.json', 'mcp/server.mjs', 'apm.yml', 'scripts/a.mjs', 'evals/cases.json'];
const globRe = (g) => new RegExp(`^${String(g).replace(/^\.\//, '').replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/?/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\u0000/g, '.*')}$`);
const anyGlob = (globs, p) => {
  let hit = false;
  for (const g of globs.map(String)) if (g.startsWith('!')) { if (globRe(g.slice(1)).test(p)) hit = false; } else if (globRe(g).test(p)) hit = true;
  return hit;
};

/** Does a workflow's `on` run on pull requests that change the harness? */
export function gatesHarness(on) {
  const events = typeof on === 'string' ? { [on]: null } : Array.isArray(on) ? Object.fromEntries(on.map((e) => [String(e), null])) : on ?? {};
  if (!Object.hasOwn(events, 'pull_request')) return false;
  const pr = events.pull_request ?? {};
  const paths = Array.isArray(pr.paths) ? pr.paths : null;
  const ignored = Array.isArray(pr['paths-ignore']) ? pr['paths-ignore'] : null;
  return HARNESS_SAMPLES.some((p) => (!paths || anyGlob(paths, p)) && !(ignored && anyGlob(ignored, p)));
}

/** { level, name, reached, next } — the highest level reached together with every level below it. */
export function maturity(rules, scan) {
  const layerOk = (layer) => rules.filter((r) => r.layer === layer).every((r) => r.ok !== false);
  const reached = {};
  let level = 'L0';
  let next = null;
  let below = true;
  for (const L of ['L1', 'L2', 'L3', 'L4', 'L5']) {
    const missing = REQUIRES[L].filter((group) => !group.some((l) => present(scan, l)));
    const failing = LAYERS.filter((l) => l.level === L && present(scan, l.id) && !layerOk(l.id));
    reached[L] = below && !missing.length && !failing.length;
    if (reached[L]) level = L;
    else if (below) {
      const needs = missing.map((g) => NEEDS[g.join('|')]);
      const fix = failing.flatMap((l) => rules.filter((r) => r.layer === l.id && r.ok === false).map((r) => r.message));
      next = `${L} ${LEVEL_NAMES[L]} needs ${[...needs, ...fix.map((m) => `a fix: ${m}`)].join('; and ')}.`;
    }
    below = reached[L];
  }
  return { level, name: LEVEL_NAMES[level], reached, next };
}
