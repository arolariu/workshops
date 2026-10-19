// Lab 03 · tool names → capabilities, for the medium and hard checks (the hard+ audit has its own copy, which the
// learner reads). The aliases of the custom agents configuration reference, any case, plus the CLI's own tool names.
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

/** A frontmatter `tools` value (list, comma string, or missing) as entries: null when there is no tools line. */
export const toolEntries = (tools) => (tools == null ? null : (Array.isArray(tools) ? tools : String(tools).split(',')).map((x) => String(x).trim().replace(/^['"]|['"]$/g, '')).filter(Boolean));

/** What a tools list grants: { all, caps: Set, unknown: [] }. MCP entries ("server/tool") count as "mcp". */
export function capsOf(tools) {
  const entries = toolEntries(tools);
  const out = { all: entries === null || entries.includes('*'), caps: new Set(), unknown: [] };
  for (const e of entries ?? []) {
    if (e === '*') continue;
    if (e.includes('/')) { out.caps.add('mcp'); continue; }
    const cap = Object.keys(ALIASES).find((k) => ALIASES[k].includes(e.toLowerCase()));
    if (cap) out.caps.add(cap);
    else out.unknown.push(e);
  }
  return out;
}
/** Does a tools list grant `cap`? Every tool counts. */
export const grants = (tools, cap) => { const c = capsOf(tools); return c.all || c.caps.has(cap); };
