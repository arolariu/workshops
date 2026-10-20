#!/usr/bin/env node
// 🧨 Replay attack packs through EVERY preToolUse hook of a repository, the way Copilot runs them: each hook gets the
// call, and one deny blocks it. scripts/attack.mjs tests one guard; this tests what a repository really runs (in
// CampusHub: StudyBuddy's installed guard and the policy guard), from a scratch copy of that repository, so the hooks
// read its AGENTS.md and policies and write their logs in the copy.
//   node scripts/replay-hooks.mjs <repo> [pack.json …] [--json]       default pack: <repo>/attacks/pack.json
// Exit codes: 0 no miss and no false positive · 1 a miss or a false positive · 2 unusable (no hooks, a broken pack).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { judge, loadPack, runGuard, UsageError } from './attack.mjs';

const SKIP = /(^|[\\/])(\.git|node_modules|apm_modules|\.agent-logs|\.approvals)([\\/]|$)/;

/** The scripts of a repository's preToolUse hooks: [{ config, script }] (paths relative to the repository). */
export function hookScripts(repo) {
  const dir = path.join(repo, '.github', 'hooks');
  const configs = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : [];
  const out = [];
  for (const name of configs) {
    let cfg;
    try { cfg = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')); } catch (e) { throw new UsageError(`.github/hooks/${name} is not valid JSON (${e.message})`); }
    for (const e of Array.isArray(cfg?.hooks?.preToolUse) ? cfg.hooks.preToolUse : []) {
      const m = String(e?.bash ?? e?.powershell ?? '').match(/\bnode\s+(?:"([^"]+)"|'([^']+)'|(\S+))/);
      if (m) out.push({ config: `.github/hooks/${name}`, script: path.posix.join(e.cwd ?? '.', (m[1] ?? m[2] ?? m[3]).replace(/\\/g, '/')) });
    }
  }
  return out;
}

/** One decision from every hook: the first deny wins ({ decision, reason, hook }); a hook that fails is reported. */
export function decideAll(hooks, call, cwd) {
  let last = { decision: 'allow', reason: '', hook: null };
  for (const h of hooks) {
    const r = runGuard(path.join(cwd, h.script), call, cwd);
    if (r.decision === 'deny') return { ...r, hook: h.script };
    if (r.decision !== 'allow') last = { ...r, hook: h.script };
  }
  return last;
}

/** Replay packs against a repository's hooks: { hooks, attacks, allowed, misses, falsePositives }. */
export function replay(repo, packFiles) {
  const hooks = hookScripts(repo);
  if (!hooks.length) throw new UsageError(`${repo} has no preToolUse hook in .github/hooks/*.json`);
  const packs = packFiles.map(loadPack);
  const all = { attacks: packs.flatMap((p) => p.attacks), allowed: packs.flatMap((p) => p.allowed) };
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-hooks-'));
  try {
    fs.cpSync(repo, copy, { recursive: true, filter: (src) => !SKIP.test(path.relative(repo, src)) });
    const { misses, falsePositives } = judge(all, (call) => decideAll(hooks, call, copy));
    return { repo, hooks, packs: packFiles, attacks: all.attacks.length, allowed: all.allowed.length, misses, falsePositives };
  } finally {
    fs.rmSync(copy, { recursive: true, force: true });
  }
}

const show = (call) => (typeof call.toolArgs?.command === 'string' ? call.toolArgs.command : `${call.toolName} ${JSON.stringify(call.toolArgs)}`).replace(/\s+/g, ' ').slice(0, 90);

function main(argv) {
  const json = argv.includes('--json');
  const [repoArg, ...packArgs] = argv.filter((a) => !a.startsWith('--'));
  if (!repoArg) throw new UsageError('Say which repository: node scripts/replay-hooks.mjs <repo> [pack.json …] [--json]');
  const repo = path.resolve(repoArg);
  if (!fs.existsSync(repo)) throw new UsageError(`no folder ${repo}`);
  const packs = (packArgs.length ? packArgs : [path.join(repoArg, 'attacks', 'pack.json')]).map((f) => path.resolve(f));
  const r = replay(repo, packs);
  if (json) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(`Replayed ${packs.map((p) => path.relative(process.cwd(), p)).join(' + ')} through ${r.hooks.length} hook(s) of ${path.relative(process.cwd(), repo) || '.'}: ${r.hooks.map((h) => h.script).join(', ')}\n`);
    for (const m of r.misses) console.log(`  ✗ miss            ${m.id} (${m.tool}, ${m.decision}): ${show(m.call)}`);
    for (const f of r.falsePositives) console.log(`  ✗ false positive  ${f.id}${f.step ? ` (the ${f.step} call)` : ''} (${f.tool}): ${show(f.call)}\n      ${String(f.reason).slice(0, 160)}`);
    const missed = new Set(r.misses.map((m) => m.id)).size;
    console.log(`${r.misses.length || r.falsePositives.length ? '\n' : ''}${r.attacks} attacks: ${r.attacks - missed} denied, ${missed} missed · ${r.allowed} allowed calls: ${r.falsePositives.length} false positive${r.falsePositives.length === 1 ? '' : 's'}`);
  }
  return r.misses.length || r.falsePositives.length ? 1 : 0;
}

const sameFile = (a, b) => { try { return fs.realpathSync.native(a) === fs.realpathSync.native(b); } catch { return false; } };
if (process.argv[1] && sameFile(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    console.error(`✗ ${e.message}`);
    process.exitCode = 2;
  }
}
