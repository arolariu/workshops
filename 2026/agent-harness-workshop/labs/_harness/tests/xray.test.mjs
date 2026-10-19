import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { tokens, measureMcp, contextBudget, artifactMarks, xrayReport } from '../xray.mjs';
import { xrayLines } from '../screens/xray.mjs';
import { scanHarness } from '../scorecard.mjs';
import { blobId } from '../chain.mjs';
import { stripAnsi, width } from '../ui.mjs';
import { tmpdir, writeTree, alive, waitFor } from './helpers.mjs';

const fmt = Object.fromEntries(['green', 'bright', 'dim', 'white', 'yellow', 'bold', 'cyan', 'red'].map((k) => [k, (s) => s]));
const SERVER = `import readline from 'node:readline';
readline.createInterface({ input: process.stdin }).on('line', (l) => {
  const m = JSON.parse(l);
  if (m.id == null) return;
  const result = m.method === 'initialize' ? { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'f', version: '1' } }
    : m.method === 'tools/list' ? { tools: [{ name: 'get_deadlines', description: 'Deadlines due in the next days', inputSchema: { type: 'object', properties: { days: { type: 'number' } } }, annotations: { readOnlyHint: true } }] } : {};
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result }) + '\\n');
});
`;
const SILENT = "console.error('booting'); setInterval(() => {}, 1000);\n";
const mcpJson = (servers) => JSON.stringify({ mcpServers: servers });

test('the budget: always-on files in full, skills by name and description, hooks cost nothing', () => {
  const dir = writeTree(tmpdir(), {
    'AGENTS.md': 'x'.repeat(400),
    '.github/instructions/tests.instructions.md': '---\napplyTo: "**/*.test.js"\n---\nUse node:test.\n',
    '.github/skills/new-module/SKILL.md': `---\nname: new-module\ndescription: Create a module. Use when asked.\n---\n${'step\n'.repeat(200)}`,
    '.github/agents/reviewer.agent.md': "---\nname: reviewer\ndescription: Reviews code.\ntools: ['read']\n---\nYou review.\n",
    '.github/hooks/guard.json': JSON.stringify({ version: 1, hooks: { preToolUse: [{ bash: 'x', powershell: 'x', timeoutSec: 5 }] } }),
  });
  assert.equal(tokens('x'.repeat(400)), 100);
  const b = contextBudget(scanHarness(dir), {});
  const by = (label) => b.every.find((x) => x.label.includes(label));
  assert.equal(by('AGENTS.md').tokens, 100);
  assert.ok(by('new-module').tokens < 20, 'only the name and description, every turn');
  assert.equal(by('reviewer').source, 'agents');
  assert.equal(by('guard.json').tokens, 0);
  assert.match(by('guard.json').note, /outside the model/);
  assert.ok(b.whenNeeded.some((x) => /new-module\/SKILL\.md/.test(x.label) && x.tokens > 200), 'the full SKILL.md, loaded when needed');
  assert.ok(b.whenNeeded.some((x) => /tests\.instructions\.md/.test(x.label) && /\*\*\/\*\.test\.js/.test(x.note)), 'scoped files load when their files are involved');
  assert.equal(b.total, b.every.reduce((n, x) => n + (x.tokens ?? 0), 0));
});

test('MCP tool schemas are measured from tools/list; a silent server is "not measured" within the timeout and is stopped', async () => {
  const dir = writeTree(tmpdir(), { 'mcp/ok.mjs': SERVER, 'mcp/silent.mjs': SILENT });
  const servers = [
    { name: 'ok', type: 'stdio', command: 'node', args: ['mcp/ok.mjs'], env: {} },
    { name: 'silent', type: 'stdio', command: 'node', args: ['mcp/silent.mjs'], env: {} },
    { name: 'web', type: 'http', url: 'https://example.com/mcp' },
  ];
  const t0 = Date.now();
  const r = await measureMcp(dir, servers, { timeout: 1500 });
  assert.ok(Date.now() - t0 < 6000, `took ${Date.now() - t0} ms`);
  assert.equal(r.ok.tools[0].name, 'get_deadlines');
  assert.match(r.silent.error, /did not answer|within/);
  assert.match(r.web.error, /remote/);
  const b = contextBudget(scanHarness(writeTree(dir, { '.mcp.json': mcpJson({ ok: servers[0], silent: servers[1] }) })), r);
  assert.ok(b.every.find((x) => x.label.startsWith('ok')).tokens > 10);
  assert.equal(b.every.find((x) => x.label.startsWith('silent')).tokens, null);
  assert.match(b.every.find((x) => x.label.startsWith('silent')).note, /not measured/);
});

test('marks: 🆕 for files the seed does not have, ✏️ for changed ones, 🧳 for brought ones', () => {
  const dir = writeTree(tmpdir(), { 'AGENTS.md': 'mine\n', '.github/skills/s/SKILL.md': 'new\n', '.mcp.json': '{}', 'README.md': 'x' });
  const manifest = { exercises: {}, chain: { 'lab-05/easy': { from: 'lab-04/easy', starter: {}, inherited: { 'AGENTS.md': blobId(Buffer.from('seed\n')), '.mcp.json': blobId(Buffer.from('{}')) } } } };
  const marks = artifactMarks({ key: 'lab-05/easy', dir, paths: ['AGENTS.md', '.github/skills/s/SKILL.md', '.mcp.json'], manifest, brought: { files: [{ file: '.mcp.json', from: 'lab-04/easy' }] } });
  assert.deepEqual(marks, { 'AGENTS.md': '✏️', '.github/skills/s/SKILL.md': '🆕', '.mcp.json': '🧳' });
});

test('the report and its lines: the tree, the budget and the maturity, within the width', async () => {
  const dir = writeTree(tmpdir(), {
    'AGENTS.md': '# Rules\n## Commands\n- npm test\n## Boundaries\n- Never push.\n## Definition of done\n- green\n',
    '.mcp.json': mcpJson({ portal: { type: 'stdio', command: 'node', args: ['mcp/ok.mjs'] } }),
    'mcp/ok.mjs': SERVER,
    '.github/hooks/guard.json': JSON.stringify({ version: 1, hooks: { preToolUse: [{ bash: 'x', powershell: 'x', timeoutSec: 5 }] } }),
  });
  const report = await xrayReport({ key: 'lab-05/easy', dir, manifest: null, brought: null });
  assert.equal(report.mcpTools.portal.tools.length, 1);
  assert.equal(report.maturity.level, 'L2');
  const lines = xrayLines(report, { W: 76, fmt });
  const s = lines.map(stripAnsi).join('\n');
  for (const want of [/YOUR HARNESS/, /📜 Instructions/, /AGENTS\.md/, /🔌 MCP servers/, /CONTEXT BUDGET/, /portal: 1 tool schema/, /≈\d+/, /0 · they run outside the model/, /characters ÷ 4; real tokenizers differ/, /MATURITY · L2 Equipped/, /Next: L3 Scoped needs a custom agent/]) assert.match(s, want);
  for (const l of lines) assert.ok(width(stripAnsi(l)) <= 78, l);
});

test('a server that never answers leaves no process behind', async () => {
  const dir = writeTree(tmpdir(), { 'mcp/silent.mjs': "require('node:fs').writeFileSync('pid.txt', String(process.pid)); setInterval(() => {}, 1000);\n".replace("require('node:fs')", "(await import('node:fs'))") });
  await measureMcp(dir, [{ name: 'silent', type: 'stdio', command: 'node', args: ['mcp/silent.mjs'], env: {} }], { timeout: 1000 });
  const pidFile = path.join(dir, 'pid.txt');
  await waitFor(() => fs.existsSync(pidFile));
  const pid = Number(fs.readFileSync(pidFile, 'utf8'));
  await waitFor(() => !alive(pid), { timeout: 5000 });
});
