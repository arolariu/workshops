// Free checks for Lab 04 · easy.
import fs from 'node:fs';
import { serverConfig, connect } from './common.mjs';

export default (t) => [
  t.check('.mcp.json registers a server', () => {
    const { name } = serverConfig(t);
    return /^[a-z0-9_-]+$/i.test(name) || `Use a simple server name (letters, digits, - or _), got "${name}". You will type it in permission flags.`;
  }),
  t.check('It is a local (stdio) server started with node', () => {
    const { server } = serverConfig(t);
    if (server.type && !['stdio', 'local'].includes(server.type)) return `"type" should be "stdio" (a local process), got "${server.type}".`;
    if (server.command !== 'node') return `"command" should be "node", got "${server.command}".`;
    const file = (server.args ?? []).find((a) => /\.m?js$/.test(a));
    if (!file) return '"args" should contain the path to the server script.';
    return fs.existsSync(t.path(file)) || `"${file}" does not exist (paths are relative to src/, where you start copilot).`;
  }),
  t.check('The server starts from your config and lists its tools', async () => {
    const c = await connect(t);
    try {
      const names = (await c.tools()).map((x) => x.name);
      return names.includes('get_deadlines') || `Unexpected tools: ${names.join(', ')}`;
    } finally { c.close(); }
  }),
  t.check('Copilot sees the server', () => {
    t.needTrust();
    const { name } = serverConfig(t);
    const r = t.copilot(['mcp', 'list']);
    return new RegExp(`\\b${name}\\b`).test(r.stdout) || `\`copilot mcp list\` does not show "${name}". Is the folder trusted? ${r.all.trim().slice(0, 120)}`;
  }, { needs: ['copilot'], env: true }),
];
