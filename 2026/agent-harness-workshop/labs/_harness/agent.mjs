// Agent checks: run the real Copilot CLI (`copilot -p ...`) on a throwaway copy of your folder
// (labs/.runs/<lab>-<level>), then check what the agent said and did. These use AI credits.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeKit, copilotBin, commandExists, runCopilot, TRUST_HINT, CheckFail, isTrusted } from './kit.mjs';

export async function loadAgentChecks(exDir) {
  const file = path.join(exDir, 'tests', 'agent.mjs');
  if (!fs.existsSync(file)) return [];
  const mod = await import(`${pathToFileURL(file).href}?v=${Date.now()}`);
  return mod.default ?? [];
}

const resolveField = (v, kit) => (typeof v === 'function' ? (kit ? v(kit) : ['<from your files>']) : v);
export function copilotArgs(specIn, kit) {
  const spec = { ...specIn, allow: resolveField(specIn.allow, kit), deny: resolveField(specIn.deny, kit) };
  const args = [];
  if (spec.agent) args.push('--agent', spec.agent);
  for (const dir of spec.pluginDirs ?? []) args.push('--plugin-dir', dir);
  args.push('-p', spec.prompt, '-s', '--no-ask-user', `--max-ai-credits=${spec.credits ?? 30}`);
  for (const a of spec.allow ?? []) args.push(`--allow-tool=${a}`);
  for (const d of spec.deny ?? []) args.push(`--deny-tool=${d}`);
  args.push(...(spec.extraArgs ?? []));
  return args;
}

const show = (a) => (/^[\w\-./:=@,]+$/.test(a) ? a : `'${a.replace(/'/g, "'\\''")}'`);
export const displayCommand = (cmd, args) => [cmd, ...args].map(show).join(' ');

function spawnAsync(cmd, args, opts, onTick) {
  const winQuote = (a) => (/^[\w\-./:=@,]+$/.test(a) ? a : `"${String(a).replace(/"/g, '""')}"`);
  return new Promise((resolve) => {
    const started = Date.now();
    const go = (useShell) => {
      let out = '';
      let err = '';
      let settled = false;
      let timedOut = false;
      const child = spawn(cmd, useShell ? args.map(winQuote) : args, { ...opts, shell: useShell, stdio: ['ignore', 'pipe', 'pipe'] });
      const tick = setInterval(() => onTick?.(Math.round((Date.now() - started) / 1000)), 1000);
      const timer = setTimeout(() => { timedOut = true; child.kill(); }, opts.timeout ?? 300000);
      const cancel = () => { try { child.kill(); } catch { /* gone */ } };
      process.on('harness:cancel', cancel);
      const finish = (res) => { if (settled) return; settled = true; clearInterval(tick); clearTimeout(timer); process.off('harness:cancel', cancel); resolve(res); };
      child.stdout.on('data', (d) => (out += d));
      child.stderr.on('data', (d) => (err += d));
      child.on('error', (e) => {
        if (e.code === 'ENOENT' && !useShell && process.platform === 'win32') { settled = true; clearInterval(tick); clearTimeout(timer); process.off('harness:cancel', cancel); go(true); return; }
        finish({ code: -1, stdout: out, stderr: `${err}${e.message}`, missing: e.code === 'ENOENT' });
      });
      child.on('close', (code) => finish({ code, stdout: out, stderr: err, timedOut }));
    };
    go(false);
  });
}

function prepareRunDir({ labsDir, labId, level, target }) {
  const runDir = path.join(labsDir, '.runs', `${labId}-${level}`);
  fs.rmSync(runDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(runDir), { recursive: true });
  fs.cpSync(target, runDir, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(target, src);
      return !rel || !/(^|[\\/])(node_modules|\.git|\.agent-logs)([\\/]|$)/.test(rel);
    },
  });
  const git = (...a) => spawnSync('git', ['-c', 'user.name=Harness Check', '-c', 'user.email=harness@example.com', '-c', 'commit.gpgsign=false', ...a], { cwd: runDir, encoding: 'utf8' });
  git('init', '-q');
  git('add', '-A');
  git('commit', '-q', '-m', 'Snapshot before the agent check');
  return runDir;
}

function preflight(kit, spec) {
  const needsTrust = spec.needsTrust ?? ['.mcp.json', '.github/mcp.json', '.github/hooks', '.github/extensions', '.github/agents'].some((p) => kit.exists(p));
  if (needsTrust && isTrusted(kit.dir) === false) return `Copilot would ignore this folder's MCP servers, hooks and agents. ${TRUST_HINT}`;
  return null;
}

export async function runAgentChecks({ exDir, target, labsDir, labId, level, onEvent = () => {} }) {
  const specs = await loadAgentChecks(exDir);
  const results = [];
  if (!specs.length) return { results, none: true };
  if (!commandExists(copilotBin())) {
    const r = { name: 'Copilot CLI', status: 'fail', message: 'GitHub Copilot CLI is not installed (npm install -g @github/copilot).' };
    onEvent({ type: 'result', ...r });
    return { results: [r] };
  }
  for (const [idx, spec] of specs.entries()) {
    const runDir = prepareRunDir({ labsDir, labId, level, target });
    const kit = makeKit({ dir: runDir, exDir });
    let status = 'pass';
    let message = '';
    let output = '';
    try {
      if (spec.setup) await spec.setup(kit);
      const trouble = preflight(kit, spec);
      if (trouble) throw new CheckFail(trouble);
      let cmd;
      let args;
      if (spec.command) {
        cmd = spec.command[0] === 'node' ? process.execPath : spec.command[0];
        args = spec.command.slice(1);
      } else {
        cmd = copilotBin();
        args = copilotArgs(spec, kit);
      }
      onEvent({ type: 'start', idx, name: spec.name, command: displayCommand(spec.command ? spec.command[0] : 'copilot', args), runDir });
      const res = await spawnAsync(cmd, args, { cwd: runDir, timeout: spec.timeout ?? 300000, env: { ...process.env } }, (s) => onEvent({ type: 'tick', idx, seconds: s }));
      output = `${res.stdout}`.trim();
      if (res.missing) throw new CheckFail(`Could not start \`${spec.command ? spec.command[0] : 'copilot'}\`.`);
      if (res.timedOut) throw new CheckFail('The agent run took too long and was stopped.');
      if (res.code !== 0 && !spec.allowNonZero) {
        const why = `${res.stderr}\n${res.stdout}`.trim().split('\n').slice(-4).join(' ').slice(0, 400);
        throw new CheckFail(`The run ended with exit code ${res.code}. ${why}${/auth|login|token/i.test(why) ? ' (Are you logged in? Run `copilot` and use /login.)' : ''}`);
      }
      const verdict = await spec.expect(kit, { output, stderr: res.stderr, code: res.code });
      if (typeof verdict === 'string') { status = 'fail'; message = verdict; }
      else if (verdict === false) { status = 'fail'; message = 'The agent did not do what we expected.'; }
    } catch (e) {
      status = 'fail';
      message = e?.message ?? String(e);
    }
    const r = { idx, name: spec.name, status, message, output, runDir };
    results.push(r);
    onEvent({ type: 'result', ...r });
  }
  return { results, allPass: results.every((r) => r.status === 'pass') };
}
