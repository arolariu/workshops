// Parent side: run the free checks of one exercise in a child process and report each result.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export function runChecks({ exDir, target, onEvent = () => {}, env = {} }) {
  return new Promise((resolve) => {
    const results = [];
    let fatal = null;
    const child = spawn(process.execPath, [path.join(HERE, 'run-checks.mjs'), exDir, target], {
      cwd: target,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let buf = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), 10 * 60 * 1000);
    child.stdout.on('data', (d) => {
      buf += d;
      let n;
      while ((n = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, n);
        buf = buf.slice(n + 1);
        const m = line.match(/^@@harness (.*)$/);
        if (!m) continue;
        let ev;
        try { ev = JSON.parse(m[1]); } catch { continue; }
        if (ev.type === 'result') results[ev.idx] = ev;
        if (ev.type === 'fatal') fatal = ev.message;
        onEvent(ev);
      }
    });
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', () => {
      clearTimeout(timer);
      if (!fatal && !results.length && stderr.trim()) fatal = stderr.trim().split('\n').slice(-3).join(' ');
      const list = results.filter(Boolean);
      const required = list.filter((r) => !r.optional);
      const passed = list.filter((r) => r.status === 'pass').length;
      const failed = list.filter((r) => r.status === 'fail').length;
      const allPass = !fatal && required.length > 0 && required.every((r) => r.status === 'pass' || r.status === 'skip') && list.every((r) => r.status !== 'fail');
      resolve({ results: list, passed, failed, total: list.length, allPass, fatal });
    });
  });
}
