#!/usr/bin/env node
// 🔐 Privilege audit: what can each custom agent really do, and may it?
//   node scripts/audit-agents.mjs                    .github/agents/ against .github/policies/roles.json
//   node scripts/audit-agents.mjs --json             the findings as JSON
//   node scripts/audit-agents.mjs --agents <dir> --roles <file>
// Exit code: 0 when it finds nothing, 1 when it finds something, 2 when the agents or the policy can't be read.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The tool aliases of the custom agents configuration reference (case-insensitive), plus the CLI's own tool names
// (the ones a session lists: view, rg, apply_patch, read_powershell, web_search, read_agent, sql, …).
// https://docs.github.com/en/copilot/reference/custom-agents-configuration#tool-aliases
export const ALIASES = {
  read: ['read', 'notebookread', 'view', 'skill', 'fetch_copilot_cli_documentation'],
  search: ['search', 'grep', 'glob', 'rg'],
  edit: ['edit', 'multiedit', 'write', 'notebookedit', 'create', 'apply_patch', 'str_replace', 'str_replace_editor'],
  execute: ['execute', 'shell', 'bash', 'powershell', 'read_bash', 'write_bash', 'stop_bash', 'list_bash', 'read_powershell', 'write_powershell', 'stop_powershell', 'list_powershell'],
  agent: ['agent', 'custom-agent', 'task', 'read_agent', 'write_agent', 'list_agents'],
  web: ['web', 'websearch', 'webfetch', 'web_fetch', 'web_search'],
  todo: ['todo', 'todowrite', 'sql'],
};
// What a role may do, in roles.json: the seven built-in kinds, and MCP tools that only read or that change things.
export const CAPABILITIES = ['read', 'search', 'edit', 'execute', 'web', 'agent', 'todo', 'mcp:read', 'mcp:write'];

// ---------- M1 · What an agent can really do ----------

/**
 * The capabilities a tools list grants. No list (null) or "*" anywhere = everything; [] = nothing. Aliases count in any
 * case; "server/tool" and "server/*" come from policy.mcp (a server it doesn't know counts as mcp:write: it can't
 * tell), and so does a tool the catalog doesn't list for a known server. Names Copilot doesn't know are ignored, by
 * Copilot too: they end up in `unknown`.
 * @returns {{ all: boolean, caps: string[], from: Record<string, string[]>, unknown: string[] }}
 */
export function capabilities(tools, policy = {}) {
  // TODO(M1): a string is a comma-separated list. Look each entry up in ALIASES (any case), expand "server/tool" and
  // "server/*" with policy.mcp, and remember in `from` which entry gave each capability.
  return { all: false, caps: [], from: {}, unknown: [] };
}

// ---------- M3 · Instructions that fight the tools ----------

// TODO(M3): the signals of the table in todo.md: [capability, a regex for a line that starts with one of its verbs],
// and a regex for a read-only claim.
const NEEDS = [];
const READ_ONLY = /(?!)/;
const CHANGES = ['edit', 'execute', 'mcp:write'];

/**
 * Lines of the instructions that ask for a tool the agent doesn't have, and read-only claims next to tools that change
 * things. A signal is a line that starts with a verb (after a list marker or **): see NEEDS.
 * @returns {{ kind: 'needs' | 'read-only', cap: string, line: string }[]}
 */
export function conflicts(agent, caps) {
  // TODO(M3): one line at a time: strip a list marker (-, *, 1.) and a leading **, then test NEEDS; test READ_ONLY on
  // the line against CHANGES. One item per kind and capability.
  return [];
}

// ---------- M4 · The confused deputy ----------

/**
 * Who an agent can hand work to: with `agent`, every custom agent the model may invoke (not itself, and not one marked
 * disable-model-invocation: true or infer: false) and the built-in agents of policy.builtinAgents.
 * @returns {{ target: string, builtin: boolean, caps: string[] }[]}
 */
export function reach(agent, agents, policy = {}) {
  // TODO(M4): nothing without `agent` (or every tool). Otherwise every other agent with explicit: false, and each
  // entry of policy.builtinAgents, with its capabilities.
  return [];
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
    // TODO(M2): unknown-tool for every name Copilot ignores; unassigned when policy.agents has no role for it (or
    //   names a role that doesn't exist), and then nothing else for this agent; all-tools; not-allowed for each
    //   capability the role's `may` doesn't list (say which tool entry it came from); must-be-explicit when the role
    //   says "invocation": "explicit" and the agent can be picked by the model.
    // TODO(M3): a conflict for each conflicts(a, c) item, detail "needs:<cap>" or "read-only:<cap>".
    // TODO(M4): an escalation for each agent reach() finds that can do something the role may not (detail: its id).
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

// Real paths: a symlinked temp folder, a junction or a short 8.3 path still counts as "run directly".
const isMain = (() => {
  try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
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
  // TODO(M5): run this on .github/agents/ and fix the five agents that came with this level until it finds nothing.
  // Fix the agents, not the policy: roles.json belongs to the security team.
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
