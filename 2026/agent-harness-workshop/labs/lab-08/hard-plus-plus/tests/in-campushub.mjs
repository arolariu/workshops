#!/usr/bin/env node
// Runs one Copilot prompt inside campushub/ of the current folder (the agent check's copy of yours), so CampusHub's
// own AGENTS.md, hooks and MCP server are the ones that load. Used by tests/agent.mjs only; it spends one prompt.
//   node in-campushub.mjs <prompt> [--allow-tool=…]…
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const [prompt, ...extra] = process.argv.slice(2);
const cwd = path.join(process.cwd(), 'campushub');
const args = ['-p', prompt, '-s', '--no-ask-user', '--max-ai-credits=30', '--output-format', 'json', ...extra];
const bin = process.env.HARNESS_COPILOT || 'copilot';
let r = spawnSync(bin, args, { cwd, stdio: 'inherit' });
if (r.error?.code === 'ENOENT' && process.platform === 'win32') {
  // copilot.cmd (an npm install) only starts through a shell: quote every argument for cmd.exe.
  const q = (a) => (/^[\w\-./:=@,]+$/.test(a) ? a : `"${a.replace(/"/g, '""')}"`);
  r = spawnSync([bin, ...args.map(q)].join(' '), { cwd, stdio: 'inherit', shell: true });
}
if (r.error) console.error(`Could not start Copilot: ${r.error.message}`);
process.exitCode = r.status ?? 1;
