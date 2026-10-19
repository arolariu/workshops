// 🤖 Agent check: Copilot, a real MCP client, loads your hand-written server for one session and uses it. The server
// is not in .mcp.json (later labs would start it for nothing), so setup writes a one-off config that the run passes
// with --additional-mcp-config. Copilot speaks MCP 2025-11-25 over stdio: initialize, tools/list, tools/call.
import fs from 'node:fs';

const CONFIG = 'library.mcp.json';
const DATABASE_COURSES = ['DB110', 'DB220', 'DB310', 'DB320', 'DB410'];

export default [
  {
    name: 'Copilot talks to your hand-written server',
    prompt: 'Use the library MCP server to find the courses about databases, and list their course codes.',
    allow: ['library'],
    deny: ['write', 'shell'],
    extraArgs: ['--additional-mcp-config', `@${CONFIG}`],
    setup: (t) => fs.writeFileSync(t.path(CONFIG), `${JSON.stringify({ mcpServers: { library: { type: 'stdio', command: 'node', args: ['mcp/library-server.mjs'], tools: ['*'] } } }, null, 2)}\n`),
    expect: (t, { output }) => {
      const found = DATABASE_COURSES.filter((code) => output.includes(code));
      return found.length >= 2 || `Expected at least two database courses (${DATABASE_COURSES.join(', ')}): did Copilot connect to the library server (initialize, tools/list)? It said: ${output.trim().slice(0, 200)}`;
    },
  },
];
