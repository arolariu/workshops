#!/usr/bin/env node
// 🔐 Privilege audit: what can each custom agent really do, and may it?
//   node scripts/audit-agents.mjs                    .github/agents/ against .github/policies/roles.json
//   node scripts/audit-agents.mjs --json             the findings as JSON
//   node scripts/audit-agents.mjs --agents <dir> --roles <file>
// Exit code: 0 when it finds nothing, 1 when it finds something, 2 when the agents or the policy can't be read.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The tool aliases of the custom agents configuration reference (case-insensitive), plus the CLI's own tool names.
// https://docs.github.com/en/copilot/reference/custom-agents-configuration#tool-aliases
export const ALIASES = {
  read: ['read', 'notebookread', 'view'],
  search: ['search', 'grep', 'glob'],
  edit: ['edit', 'multiedit', 'write', 'notebookedit', 'create'],
  execute: ['execute', 'shell', 'bash', 'powershell'],
  agent: ['agent', 'custom-agent', 'task'],
  web: ['web', 'websearch', 'webfetch', 'web_fetch'],
  todo: ['todo', 'todowrite'],
};
// What a role may do, in roles.json: the seven built-in kinds, and MCP tools that only read or that change things.
export const CAPABILITIES = ['read', 'search', 'edit', 'execute', 'web', 'agent', 'todo', 'mcp:read', 'mcp:write'];

// ---------- M1 · What an agent can really do ----------

/**
 * The capabilities a tools list grants. No list (null) or "*" anywhere = everything; [] = nothing. Aliases count in any
 * case; "server/tool" and "server/*" come from policy.mcp (a server it doesn't know counts as mcp:write: it can't
 * tell). Names Copilot doesn't know are ignored, by Copilot too: they end up in `unknown`.
 * @returns {{ all: boolean, caps: string[], from: Record<string, string[]>, unknown: string[] }}
 */
export function capabilities(tools, policy = {}) {
  const out = { all: false, caps: [], from: {}, unknown: [] };
  const grant = (cap, entry) => { (out.from[cap] ??= []).includes(entry) || out.from[cap].push(entry); };
  const entries = tools == null ? null : (Array.isArray(tools) ? tools : String(tools).split(',')).map((x) => String(x).trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  if (entries === null || entries.includes('*')) {
    out.all = true;
    for (const cap of CAPABILITIES) grant(cap, entries === null ? '(no tools line)' : '*');
  }
  for (const entry of entries ?? []) {
    if (entry === '*') continue;
    const slash = entry.indexOf('/');
    if (slash > 0) {
      const server = entry.slice(0, slash);
      const tool = entry.slice(slash + 1);
      const catalog = policy.mcp?.[server];
      if (!catalog) grant('mcp:write', entry);
      else if (tool === '*') for (const access of Object.values(catalog)) grant(`mcp:${access === 'write' ? 'write' : 'read'}`, entry);
      else if (tool in catalog) grant(`mcp:${catalog[tool] === 'write' ? 'write' : 'read'}`, entry);
      else out.unknown.push(entry);
      continue;
    }
    const cap = Object.keys(ALIASES).find((k) => ALIASES[k].includes(entry.toLowerCase()));
    if (cap) grant(cap, entry);
    else out.unknown.push(entry);
  }
  out.caps = CAPABILITIES.filter((c) => out.from[c]);
  return out;
}

// ---------- M3 · Instructions that fight the tools ----------

const NEEDS = [
  ['execute', /^(run|execute|install|build|deploy)\b/i],
  ['edit', /^(fix|edit|write|create|update|change|apply)\b/i],
  ['agent', /^(delegate|hand\b|(ask|use|call) the [\w-]+ agent\b)/i],
  ['web', /^(fetch|download|browse|search the web)\b/i],
];
const READ_ONLY = /\bread-?only\b|\byou never (change|edit|modify|write)\b|\bnever (edits|changes|modifies|writes)\b/i;
const CHANGES = ['edit', 'execute', 'mcp:write'];

/**
 * Lines of the instructions that ask for a tool the agent doesn't have, and read-only claims next to tools that change
 * things. A signal is a line that starts with a verb (after a list marker or **): see NEEDS.
 * @returns {{ kind: 'needs' | 'read-only', cap: string, line: string }[]}
 */
export function conflicts(agent, caps) {
  const has = (cap) => caps.all || caps.caps.includes(cap);
  const out = [];
  const seen = new Set();
  const push = (kind, cap, line) => { if (!seen.has(`${kind}:${cap}`)) { seen.add(`${kind}:${cap}`); out.push({ kind, cap, line }); } };
  for (const raw of String(agent.body ?? '').split('\n')) {
    const line = raw.trim().replace(/^(?:[-*+]|\d+[.)])\s+/, '').replace(/^(\*\*|__)/, '');
    for (const [cap, re] of NEEDS) if (re.test(line) && !has(cap)) push('needs', cap, raw.trim());
    if (READ_ONLY.test(raw)) for (const cap of CHANGES) if (has(cap)) push('read-only', cap, raw.trim());
  }
  return out;
}

// ---------- M4 · The confused deputy ----------

/**
 * Who an agent can hand work to: with `agent`, every custom agent the model may invoke (not itself, and not one marked
 * disable-model-invocation: true or infer: false) and the built-in agents of policy.builtinAgents.
 * @returns {{ target: string, builtin: boolean, caps: string[] }[]}
 */
export function reach(agent, agents, policy = {}) {
  const own = capabilities(agent.tools, policy);
  if (!own.all && !own.caps.includes('agent')) return [];
  const custom = agents.filter((a) => a.id !== agent.id && !a.explicit).map((a) => ({ target: a.id, builtin: false, caps: capabilities(a.tools, policy).caps }));
  const builtin = Object.entries(policy.builtinAgents ?? {}).map(([id, tools]) => ({ target: id, builtin: true, caps: capabilities(tools, policy).caps }));
  return [...custom, ...builtin];
}

// ---------- M2 · Against the role policy (and M3, M4 in it) ----------

/**
 * Every finding: { agent, kind, detail, message }.
 *   unknown-tool (detail: the entry) · conflict (detail: "needs:edit", "read-only:execute", …) · unassigned
 *   all-tools · not-allowed (detail: the capability) · must-be-explicit · escalation (detail: the agent it reaches)
 */
export function audit(agents, policy) {
  const findings = [];
  const add = (agent, kind, detail, message) => findings.push({ agent: agent.id, kind, detail, message });
  const q = (xs) => xs.map((x) => `"${x}"`).join(', ');
  for (const a of agents) {
    const c = capabilities(a.tools, policy);
    for (const u of c.unknown) add(a, 'unknown-tool', u, `${a.id}: Copilot ignores the tool "${u}" without a word (a typo, or a server it doesn't have).`);
    for (const x of conflicts(a, c)) {
      add(a, 'conflict', `${x.kind}:${x.cap}`, x.kind === 'needs'
        ? `${a.id}: its instructions need ${x.cap} ("${x.line}"), but its tools don't give it.`
        : `${a.id}: it says it is read-only ("${x.line}"), but it has ${x.cap}.`);
    }
    const roleName = policy.agents?.[a.id];
    const role = roleName ? policy.roles?.[roleName] : null;
    if (!role) {
      add(a, 'unassigned', roleName ?? null, `${a.id} has no role in the policy${roleName ? ` (the role "${roleName}" doesn't exist)` : ''}: give it one, or remove the agent.`);
      continue;
    }
    const may = role.may ?? [];
    if (c.all) add(a, 'all-tools', null, `${a.id}: ${a.tools == null ? 'no tools line' : '"*" in its tools'} gives it every tool. List what the ${roleName} role needs: ${may.join(', ')}.`);
    else for (const cap of c.caps.filter((x) => !may.includes(x))) add(a, 'not-allowed', cap, `${a.id}: ${cap} (from ${q(c.from[cap])}) is not allowed for the ${roleName} role.`);
    if (role.invocation === 'explicit' && !a.explicit) add(a, 'must-be-explicit', null, `${a.id}: the ${roleName} role only runs when a person or a script picks it (--agent, /agent): add disable-model-invocation: true.`);
    if (c.all) continue;
    for (const r of reach(a, agents, policy)) {
      const gains = r.caps.filter((x) => !may.includes(x));
      if (gains.length) add(a, 'escalation', r.target, `${a.id} can hand work to ${r.builtin ? 'the built-in agent ' : ''}${r.target}, which can ${gains.join(', ')}: more than the ${roleName} role may (a confused deputy).`);
    }
  }
  return findings;
}

// ---------- plumbing: you don't need to change anything below this line ----------

const unquote = (s) => String(s).trim().replace(/^(['"])(.*)\1$/, '$2');
function scalar(v) {
  const s = String(v ?? '').trim();
  if (s === '') return null;
  if (s.startsWith('[') && s.endsWith(']')) return s.slice(1, -1).split(',').map(unquote).filter((x) => x !== '');
  if (/^(true|false)$/i.test(s)) return s.toLowerCase() === 'true';
  return unquote(s);
}

/**
 * One agent file: { id, name, description, tools, explicit, body, data }. `tools` is null when the frontmatter has
 * no tools line (Copilot then gives every tool); `explicit` is true when the model can't pick it by itself.
 */
export function parseAgentFile(text, id) {
  const s = String(text ?? '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const m = s.match(/^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)([\s\S]*)$/);
  const data = {};
  let key = null;
  for (const line of (m ? m[1] : '').split('\n')) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const top = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
    if (top) { key = top[1]; data[key] = scalar(top[2]); continue; }
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && key && (data[key] === null || Array.isArray(data[key]))) (data[key] = data[key] ?? []).push(unquote(item[1]));
    else if (key && data[key] === null) data[key] = {}; // a nested block, such as mcp-servers:
  }
  return {
    id,
    name: String(data.name ?? id),
    description: String(data.description ?? ''),
    tools: data.tools === undefined || data.tools === null ? null : data.tools,
    explicit: data['disable-model-invocation'] === true || data.infer === false,
    body: m ? m[2] : s,
    data,
  };
}

/** Every agent Copilot would load from `dir`: *.agent.md and *.md, subfolders too (their IDs join with "--"). */
export function loadAgents(dir) {
  const out = [];
  const walk = (abs, rel) => {
    for (const e of fs.readdirSync(abs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(abs, e.name), r);
      else if (/\.md$/i.test(e.name)) out.push(parseAgentFile(fs.readFileSync(path.join(abs, e.name), 'utf8'), r.replace(/(\.agent)?\.md$/i, '').split('/').join('--')));
    }
  };
  walk(dir, '');
  return out;
}

/** The role policy (roles.json). Throws with a readable message when it is missing or broken. */
export function loadPolicy(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { throw new Error(`The role policy ${file} doesn't exist.`); }
  try { return JSON.parse(text); } catch (e) { throw new Error(`The role policy ${file} is not valid JSON: ${e.message}`); }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const opt = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
  const agentsDir = opt('--agents', '.github/agents');
  const rolesFile = opt('--roles', '.github/policies/roles.json');
  let agents;
  let policy;
  try {
    agents = loadAgents(agentsDir);
    policy = loadPolicy(rolesFile);
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(2);
  }
  const findings = audit(agents, policy);
  if (argv.includes('--json')) console.log(JSON.stringify(findings, null, 2));
  else {
    console.log(`🔐 Agent audit · ${agents.length} agents · ${rolesFile}\n`);
    console.log('| Agent | Role | Can | Findings |\n|---|---|---|---|');
    for (const a of agents) {
      const c = capabilities(a.tools, policy);
      const n = findings.filter((f) => f.agent === a.id).length;
      console.log(`| ${a.id} | ${policy.agents?.[a.id] ?? '–'} | ${c.all ? 'everything' : c.caps.join(', ') || 'nothing'} | ${n ? `❌ ${n}` : '✅'} |`);
    }
    console.log('');
    for (const f of findings) console.log(`❌ ${f.kind}${f.detail ? ` · ${f.detail}` : ''}: ${f.message}`);
    console.log(findings.length ? `\n${findings.length} finding(s).` : '✅ Every agent has exactly what its role allows.');
  }
  process.exit(findings.length ? 1 : 0);
}
