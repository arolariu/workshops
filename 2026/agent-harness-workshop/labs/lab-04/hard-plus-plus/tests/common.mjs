// Shared helpers for the Lab 04 checks: start the server the way Copilot would, from .mcp.json; and run a node:test
// file without blocking. (Free checks never start Copilot: the kit's guard sees to that, in this process and in every
// Node child, so nothing here has to.)
import { spawn, spawnSync } from 'node:child_process';

export function serverConfig(t) {
  const cfg = t.json('.mcp.json', 'Create `.mcp.json` in src/ (see the lab guide for the format).');
  const servers = cfg.mcpServers ?? cfg.servers;
  if (!servers || typeof servers !== 'object' || !Object.keys(servers).length) t.fail('.mcp.json needs an "mcpServers" object with at least one server.');
  const [name, server] = Object.entries(servers)[0];
  return { name, server };
}

/** Start the server from .mcp.json through the kit's MCP client (initialize first, like Copilot). */
export async function connect(t, env = {}) {
  const { server } = serverConfig(t);
  return t.mcp({ command: server.command, args: server.args ?? [], env: { ...(server.env ?? {}), ...env } });
}

/** Stop a process and everything it started (a test runner's servers too), on Windows and elsewhere. */
export function killTree(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true, timeout: 10000 });
  else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
}

// Like the kit's t.unitTests: no NODE_OPTIONS of yours, but the kit's own --import (its guard) goes along.
const kitNodeOptions = () => (process.env.NODE_OPTIONS ?? '').split(/\s+/).filter((o) => /^--import=.*no-copilot\.mjs$/.test(o)).join(' ');

/**
 * Run a node:test file in `cwd`, asynchronously, so several runs can go at once (the mutant checks) and a check's own
 * timeout isn't blocked by them. After `timeout` ms the runner and every server it started are stopped.
 * Resolves { pass, fail, total, passing, failing }; a run that reported nothing counts as failing.
 */
export function suiteRun(t, cwd, file, { timeout = 120000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--test', '--test-reporter=tap', file], { cwd, env: { ...process.env, NODE_OPTIONS: kitNodeOptions() }, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', () => {});
    const timer = setTimeout(() => killTree(child), timeout);
    child.on('close', () => {
      clearTimeout(timer);
      const num = (k) => Number((out.match(new RegExp(`^# ${k} (\\d+)`, 'm')) ?? [])[1] ?? 0);
      const names = (re) => [...out.matchAll(re)].map((m) => m[1].trim()).filter((n) => !/\.(m?js|cjs)$/.test(n));
      const pass = num('pass');
      resolve({ pass, fail: num('fail') || (pass ? 0 : 1), total: num('tests'), passing: names(/^\s*ok \d+ - (.*)$/gm), failing: names(/^\s*not ok \d+ - (.*)$/gm) });
    });
  });
}
