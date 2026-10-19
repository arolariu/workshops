// Shared helpers for the Lab 04 checks: start the server the way Copilot would, from .mcp.json; and keep every free
// check free: learner code runs with a `copilot` on PATH that only records the attempt, so a bug can't spend credits.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export function serverConfig(t) {
  const cfg = t.json('.mcp.json', 'Create `.mcp.json` in src/ (see the lab guide for the format).');
  const servers = cfg.mcpServers ?? cfg.servers;
  if (!servers || typeof servers !== 'object' || !Object.keys(servers).length) t.fail('.mcp.json needs an "mcpServers" object with at least one server.');
  const [name, server] = Object.entries(servers)[0];
  return { name, server };
}

const COPILOT_CALLED = 'Your code tried to start Copilot (`copilot …`) during a free check. Free checks never spend AI credits: remove that call (the server and the tests must work without Copilot).';
/**
 * Environment for learner code during a free check: PATH and HARNESS_COPILOT point at a folder whose only `copilot`
 * records the call and fails. `called()` says whether anything tried.
 */
export function noCopilot(t) {
  const dir = t.tmp();
  const marker = path.join(dir, 'copilot-was-called');
  fs.writeFileSync(path.join(dir, 'copilot.cmd'), `@echo off\r\necho %*>>"${marker}"\r\necho Free checks never start Copilot. 1>&2\r\nexit /b 1\r\n`);
  fs.writeFileSync(path.join(dir, 'copilot'), `#!/bin/sh\necho "$@" >> '${marker}'\necho 'Free checks never start Copilot.' >&2\nexit 1\n`, { mode: 0o755 });
  return {
    env: { PATH: dir, Path: dir, HARNESS_COPILOT: path.join(dir, process.platform === 'win32' ? 'copilot.cmd' : 'copilot') },
    called: () => fs.existsSync(marker),
    assert: () => { if (fs.existsSync(marker)) t.fail(COPILOT_CALLED); },
  };
}

/** Start the server from .mcp.json through the kit's MCP client (initialize first, like Copilot), guarded. */
export async function connect(t, env = {}) {
  const { server } = serverConfig(t);
  const guard = noCopilot(t);
  const c = await t.mcp({ command: server.command, args: server.args ?? [], env: { ...(server.env ?? {}), ...env, ...guard.env } });
  const close = c.close;
  c.close = () => { close(); guard.assert(); };
  return c;
}

/** Stop a process and everything it started (a test runner's servers too), on Windows and elsewhere. */
export function killTree(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true, timeout: 10000 });
  else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
}

/**
 * Run a node:test file in `cwd`, guarded and asynchronous (so several can run at once, and a check's timeout isn't
 * blocked by them). After `timeout` ms the runner and every server it started are stopped.
 * Resolves { pass, fail, total, passing, failing }; a run that reported nothing counts as failing.
 */
export function suiteRun(t, cwd, file, { timeout = 120000 } = {}) {
  const guard = noCopilot(t);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--test', '--test-reporter=tap', file], { cwd, env: { ...process.env, NODE_OPTIONS: '', ...guard.env }, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', () => {});
    const timer = setTimeout(() => killTree(child), timeout);
    child.on('close', () => {
      clearTimeout(timer);
      const num = (k) => Number((out.match(new RegExp(`^# ${k} (\\d+)`, 'm')) ?? [])[1] ?? 0);
      const names = (re) => [...out.matchAll(re)].map((m) => m[1].trim()).filter((n) => !/\.(m?js|cjs)$/.test(n));
      const pass = num('pass');
      resolve({ pass, fail: num('fail') || (pass ? 0 : 1), total: num('tests'), passing: names(/^\s*ok \d+ - (.*)$/gm), failing: names(/^\s*not ok \d+ - (.*)$/gm), copilot: guard.called() });
    });
  });
}
/** Fail clearly if any of these suite runs tried to start Copilot. */
export const noCopilotIn = (t, ...runs) => { if (runs.some((r) => r?.copilot)) t.fail(COPILOT_CALLED); };
