// Helpers for Lab 08 · hard++ (roll it out). They read CampusHub the way Copilot and APM do: every hook config in
// .github/hooks/, the lock's file hashes over LF text, the MCP servers in .mcp.json. Nothing here starts Copilot.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseYaml } from '../../../_harness/kit.mjs';

export { maturity, scanHarness, scorecard } from '../../../_harness/scorecard.mjs';
export { measureMcp } from '../../../_harness/xray.mjs';
export const HUB = 'campushub';
export const POLICY_GUARD = `${HUB}/.github/hooks/scripts/policy-guard.mjs`;
export const LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'];
export const lf = (s) => String(s ?? '').replace(/\r\n/g, '\n');
export const tail = (s, n = 4) => lf(s).trim().split('\n').slice(-n).join(' ⏎ ');
export const some = (list, n = 5) => `${list.slice(0, n).join(', ')}${list.length > n ? ` and ${list.length - n} more` : ''}`;
export const readIn = (dir, rel) => { try { return lf(fs.readFileSync(path.join(dir, ...rel.split('/')), 'utf8')); } catch { return null; } };
/** sha256 the way APM 0.33 hashes a deployed file: its text with LF line endings ("sha256:<hex>"). */
export const apmHash = (file) => `sha256:${crypto.createHash('sha256').update(lf(fs.readFileSync(file, 'utf8'))).digest('hex')}`;

/** Every file under `dir` (POSIX, relative), skipping runtime folders. */
export function walk(dir, rel = '') {
  const out = [];
  const abs = path.join(dir, rel);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (/^(node_modules|\.git|apm_modules|\.agent-logs|\.approvals)$/.test(e.name)) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(dir, r));
    else out.push(r);
  }
  return out;
}

/** campushub/apm.lock.yaml: { lock, dep } (the dependency installed from ../dist/apm), or a sentence why not. */
export function lockOf(t) {
  const text = t.read(`${HUB}/apm.lock.yaml`);
  if (text == null) return { why: `There is no ${HUB}/apm.lock.yaml yet: run \`apm install --target copilot\` in ${HUB}/ after listing ../dist/apm in its apm.yml.` };
  let lock;
  try { lock = parseYaml(text); } catch (e) { return { why: `${HUB}/apm.lock.yaml can't be read: ${e.message}` }; }
  const deps = Array.isArray(lock?.dependencies) ? lock.dependencies : [];
  const local = (d) => String(d?.local_path ?? '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
  const dep = deps.find((d) => local(d) === '../dist/apm');
  if (!dep) return { why: `${HUB}/apm.lock.yaml has no dependency installed from ../dist/apm (local_path), only: ${deps.map((d) => d?.local_path ?? d?.repo_url ?? d?.name).join(', ') || 'nothing'}.` };
  return { lock, dep, hashes: dep.deployed_file_hashes && typeof dep.deployed_file_hashes === 'object' ? dep.deployed_file_hashes : {} };
}

/** Where APM 0.33 puts a package file in the consumer (target copilot): the package's `.apm/…` path, or null. */
export function packageSource(installed) {
  let m;
  if ((m = installed.match(/^\.github\/agents\/(.+)$/))) return `.apm/agents/${m[1]}`;
  if ((m = installed.match(/^\.github\/instructions\/(.+)$/))) return `.apm/instructions/${m[1]}`;
  if ((m = installed.match(/^\.(?:agents|github)\/skills\/(.+)$/))) return `.apm/skills/${m[1]}`;
  if ((m = installed.match(/^\.github\/hooks\/scripts\/apm\/(.+)$/))) return `.apm/hooks/${m[1]}`;
  if ((m = installed.match(/^\.github\/hooks\/apm-(.+\.json)$/))) return `.apm/hooks/${m[1]}`;
  return null;
}

/** The scripts of a repository's preToolUse hooks: [{ config, script, entry }] (POSIX paths from the repository). */
export function hookScripts(repo) {
  const dir = path.join(repo, '.github', 'hooks');
  const out = [];
  for (const name of fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : []) {
    let cfg = null;
    try { cfg = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')); } catch { /* reported by the scorecard */ }
    for (const entry of Array.isArray(cfg?.hooks?.preToolUse) ? cfg.hooks.preToolUse : []) {
      const m = String(entry?.bash ?? entry?.powershell ?? '').match(/\bnode\s+(?:"([^"]+)"|'([^']+)'|(\S+))/);
      if (m) out.push({ config: `.github/hooks/${name}`, script: path.posix.join(entry.cwd ?? '.', (m[1] ?? m[2] ?? m[3]).replace(/\\/g, '/')), entry });
    }
  }
  return out;
}

/** Run one hook script the way Copilot does: the call as JSON on stdin, in `cwd`. → 'allow' | 'deny' | 'error' + reason. */
export function runHook(script, call, cwd, env = {}) {
  const input = JSON.stringify({ sessionId: 'harness-check', timestamp: Date.now(), cwd, toolName: call.toolName, toolArgs: JSON.stringify(call.toolArgs) });
  const r = spawnSync(process.execPath, [script], { cwd, input, encoding: 'utf8', timeout: 15000, env: { ...process.env, HARNESS_ORG_POLICY: '', ...env } });
  if (r.error || r.status !== 0) return { decision: 'error', reason: (r.error?.message ?? r.stderr ?? '').trim().split('\n')[0] || `exit ${r.status}` };
  const last = (r.stdout ?? '').trim().split('\n').filter(Boolean).pop();
  if (!last) return { decision: 'allow', reason: '' };
  try { const o = JSON.parse(last); return { decision: o.permissionDecision ?? 'allow', reason: o.permissionDecisionReason ?? '' }; } catch { return { decision: 'invalid', reason: last.slice(0, 80) }; }
}

/**
 * A replayer for CampusHub as Copilot runs it: a scratch copy (its own AGENTS.md and policies, logs land there), every
 * preToolUse hook, one deny blocks. decide(call) → { decision, reason, hook }; a shell call runs as bash and powershell.
 */
export function hubReplayer(t) {
  const copy = t.tmp();
  fs.cpSync(t.path(HUB), copy, { recursive: true, filter: (src) => !/[\\/](node_modules|\.git|apm_modules|\.agent-logs|\.approvals)([\\/]|$)/.test(src.slice(t.path(HUB).length)) });
  const hooks = hookScripts(copy);
  const one = (call) => {
    let last = { decision: 'allow', reason: '', hook: null };
    for (const h of hooks) {
      const r = runHook(path.join(copy, h.script), call, copy);
      if (r.decision === 'deny') return { ...r, hook: h.script };
      if (r.decision !== 'allow') last = { ...r, hook: h.script };
    }
    return last;
  };
  const variants = (call) => (['bash', 'powershell', 'shell'].includes(call.toolName) ? ['bash', 'powershell'].map((toolName) => ({ ...call, toolName })) : [call]);
  return { copy, hooks, decide: one, variants };
}

/** Replay a pack ({ attacks, allowed }) through decide(): { misses: [{ id, family, tool }], falsePositives: [{ id, tool, reason }] }. */
export function replayPack(pack, { decide, variants }) {
  const misses = [];
  const falsePositives = [];
  for (const a of pack.attacks ?? []) {
    for (const call of variants(a.call)) { const r = decide(call); if (r.decision !== 'deny') misses.push({ id: a.id, family: a.family, tool: call.toolName, decision: r.decision }); }
    for (const call of a.after ? variants(a.after.call) : []) { const r = decide(call); if (r.decision !== 'allow') falsePositives.push({ id: a.id, tool: call.toolName, reason: r.reason }); }
  }
  for (const a of pack.allowed ?? []) {
    for (const call of variants(a.call)) { const r = decide(call); if (r.decision !== 'allow') falsePositives.push({ id: a.id, tool: call.toolName, reason: r.reason }); }
  }
  return { misses, falsePositives };
}

/** The rows of every Markdown table: arrays of cells (an escaped \| stays inside its cell). */
export function tableRows(md) {
  return lf(md).split('\n').filter((l) => /^\s*\|.*\|\s*$/.test(l) && !/^\s*\|[\s:|-]+\|\s*$/.test(l))
    .map((l) => l.trim().slice(1, -1).split(/(?<!\\)\|/).map((c) => c.trim()));
}
export const VERDICT = /\b(transferred|repo version|doesn'?t apply|does not apply)\b/i;
export const verdictOf = (cell) => ((String(cell).match(VERDICT) ?? [])[1] ?? '').toLowerCase().replace("doesnt", "doesn't").replace('does not', "doesn't");
/** The table row that starts with `name` (bare or in backticks). */
export const rowOf = (rows, name) => rows.find((r) => r[0]?.replace(/`/g, '').trim().toLowerCase() === name.toLowerCase());

/** A Markdown file's `## ` sections: { heading (lower case): body }. */
export function sections(md) {
  const out = {};
  let cur = null;
  for (const line of lf(md).split('\n')) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) { cur = h[1].toLowerCase(); out[cur] = ''; } else if (cur) out[cur] += `${line}\n`;
  }
  return out;
}

/** The reference's scoring (hard's scripts/eval/score.mjs, from this level's sol/): the learner's copy may change. */
export const refScore = (t) => import(pathToFileURL(path.join(t.solDir, 'scripts', 'eval', 'score.mjs')).href);

/** The checks' own count of a session log (independent of your report.mjs). */
export function countLogs(texts) {
  const out = { sessions: 0, calls: 0, denied: 0, premiumRequests: 0, tokens: 0, byTool: {}, byRule: {} };
  for (const text of texts) {
    let run = [];
    const finish = () => {
      if (!run.length) return;
      out.sessions++;
      const started = new Map();
      let usage = null;
      for (const e of run) {
        if (e.type === 'tool.execution_start') { out.calls++; out.byTool[e.data.toolName] = (out.byTool[e.data.toolName] ?? 0) + 1; started.set(e.data.toolCallId, true); }
        if (e.type === 'tool.execution_complete' && e.data?.success === false && e.data?.error?.code === 'denied') {
          out.denied++;
          const reason = String(e.data.error.message ?? '').replace(/^Denied by preToolUse hook:\s*/, '');
          const rule = (reason.match(/^([a-z0-9][a-z0-9-]*):\s/) ?? [])[1] ?? '(unnamed)';
          out.byRule[rule] = (out.byRule[rule] ?? 0) + 1;
        }
        if (e.type === 'session.usage_checkpoint') usage = e.data;
        if (e.type === 'result') out.premiumRequests += Number(e.usage?.premiumRequests) || 0;
      }
      for (const m of Object.values(usage?.accountingSnapshot?.modelMetrics ?? {})) out.tokens += (Number(m?.usage?.inputTokens) || 0) + (Number(m?.usage?.outputTokens) || 0);
      run = [];
    };
    for (const line of lf(text).split('\n')) {
      let e;
      try { e = JSON.parse(line); } catch { continue; }
      if (!e || typeof e !== 'object' || Array.isArray(e)) continue;
      run.push(e);
      if (e.type === 'result') finish();
    }
    finish();
  }
  return out;
}

/** Start CampusHub's MCP servers (from its .mcp.json, in `cwd`) until one has `tool`: { client, name } or a reason. */
export async function serverWith(t, cwd, tool) {
  const cfg = (() => { try { return JSON.parse(fs.readFileSync(path.join(cwd, '.mcp.json'), 'utf8')); } catch { return null; } })();
  const servers = Object.entries(cfg?.mcpServers ?? cfg?.servers ?? {});
  if (!servers.length) return { why: `${HUB}/.mcp.json doesn't start an MCP server yet (\`"tickets": { "type": "stdio", "command": "node", "args": ["mcp/tickets-server.mjs"] }\`).` };
  const seen = [];
  for (const [name, s] of servers) {
    if (s?.url) continue;
    let client;
    try {
      client = await t.mcp({ command: s.command, args: s.args ?? [], env: s.env ?? {}, cwd, timeout: 8000 });
    } catch (e) { seen.push(`${name}: ${e.message}`); continue; }
    const tools = await client.tools();
    if (tools.some((x) => x.name === tool)) return { client, name, tools };
    seen.push(`${name}: ${tools.map((x) => x.name).join(', ') || 'no tools'}`);
    client.close();
  }
  return { why: `No server in ${HUB}/.mcp.json has a \`${tool}\` tool yet (${seen.join('; ')}).` };
}
