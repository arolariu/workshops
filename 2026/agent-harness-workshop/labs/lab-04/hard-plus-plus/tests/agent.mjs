// 🤖 Agent check: Copilot, a real MCP client, loads your hand-written server for one session and uses it. The server
// is not in .mcp.json (later labs would start it for nothing), so setup writes a one-off config that the run passes
// with --additional-mcp-config. It starts the server through tests/mcp-trace.mjs, which records every JSON-RPC message
// in .agent-logs/library-trace.jsonl: the verdict needs a tools/call your server answered, not just a right answer.
// The file tools (view, glob, rg) are hidden, so the answer can't come from reading mcp/library-data.json instead.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CONFIG = 'library.mcp.json';
const TRACE = '.agent-logs/library-trace.jsonl';
const DATABASE_COURSES = ['DB110', 'DB220', 'DB310', 'DB320', 'DB410'];

export default [
  {
    name: 'Copilot talks to your hand-written server',
    prompt: 'Use the library MCP server to find the courses about databases, and list their course codes.',
    allow: ['library'],
    deny: ['write', 'shell'],
    extraArgs: ['--additional-mcp-config', `@${CONFIG}`, '--excluded-tools', 'view', 'glob', 'rg'],
    setup: (t) => {
      const tracer = pathToFileURL(path.join(t.exDir, 'tests', 'mcp-trace.mjs')).href;
      const library = { type: 'stdio', command: 'node', args: ['--import', tracer, 'mcp/library-server.mjs'], env: { MCP_TRACE_LOG: t.path(TRACE) }, tools: ['*'] };
      fs.writeFileSync(t.path(CONFIG), `${JSON.stringify({ mcpServers: { library } }, null, 2)}\n`);
    },
    expect: (t, { output }) => {
      const trace = (t.read(TRACE) ?? '').split('\n').filter(Boolean).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
      if (!trace.some((e) => e.dir === 'in' && e.method === 'initialize')) return `Copilot never started the library server (no initialize in ${TRACE}).`;
      if (!trace.some((e) => e.dir === 'out' && e.result && trace.some((i) => i.dir === 'in' && i.method === 'initialize' && i.id === e.id))) return 'Copilot sent initialize, but your server never answered it (M1).';
      const calls = trace.filter((e) => e.dir === 'in' && e.method === 'tools/call');
      if (!calls.length) return `Copilot connected but never called a tool on your server (no tools/call in ${TRACE}). It said: ${output.trim().slice(0, 160)}`;
      if (!calls.some((c) => trace.some((e) => e.dir === 'out' && e.id === c.id && e.result))) return 'Copilot called a tool, but your server never answered it with a result.';
      const found = DATABASE_COURSES.filter((code) => output.includes(code));
      return found.length >= 2 || `Your server answered, but the answer doesn't name two database courses (${DATABASE_COURSES.join(', ')}). It said: ${output.trim().slice(0, 200)}`;
    },
  },
];
