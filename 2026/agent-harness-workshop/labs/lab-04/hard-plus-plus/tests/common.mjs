// Shared helpers for the Lab 04 checks: start the server the way Copilot would, from .mcp.json.
export function serverConfig(t) {
  const cfg = t.json('.mcp.json', 'Create `.mcp.json` in src/ (see the lab guide for the format).');
  const servers = cfg.mcpServers ?? cfg.servers;
  if (!servers || typeof servers !== 'object' || !Object.keys(servers).length) t.fail('.mcp.json needs an "mcpServers" object with at least one server.');
  const [name, server] = Object.entries(servers)[0];
  return { name, server };
}
export async function connect(t, env = {}) {
  const { server } = serverConfig(t);
  return t.mcp({ command: server.command, args: server.args ?? [], env: { ...(server.env ?? {}), ...env } });
}
