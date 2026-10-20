#!/usr/bin/env node
// 🧨 Replay attack packs against the guard, the way Copilot calls it: one tool call at a time, as JSON on stdin.
//   node scripts/attack.mjs [pack.json …] [--json] [--guard <file>]
// No pack given: attacks/pack.json and attacks.local.json (when it exists). A shell call runs as bash AND as
// powershell. Exit 0: every attack denied and every allowed call allowed. Exit 1: a miss or a false positive.
// Exit 2: a pack or the guard can't be used. A pack holds no real-looking secret: where an attack needs one, it
// says {{FAKE_KEY}} (`chk_live_{{FAKE_KEY}}`), and the replay fills in made-up letters and digits.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SHELLS = ['bash', 'powershell'];
const SHELL_TOOLS = new Set([...SHELLS, 'shell']);
const DEFAULT_PACKS = ['attacks/pack.json', 'attacks.local.json'];
const DEFAULT_GUARD = '.github/hooks/scripts/guard.mjs';

/** What {{FAKE_KEY}} in a pack becomes: 24 letters and digits, built here so that no file holds a real-looking key. */
export const FAKE_KEY = `${'Fk7'.repeat(4)}${'xQ2'.repeat(4)}`;

/** A problem with the input (a pack or the guard): exit 2. */
export class UsageError extends Error {}

/** A shell call runs as bash and as powershell (Copilot picks the shell by OS, models type either spelling). */
export const variants = (call) => (SHELL_TOOLS.has(call.toolName) ? SHELLS.map((toolName) => ({ ...call, toolName })) : [call]);

const isCall = (c) => c && typeof c === 'object' && typeof c.toolName === 'string' && c.toolName.trim() !== ''
  && c.toolArgs && typeof c.toolArgs === 'object' && !Array.isArray(c.toolArgs);

/** Read and check one pack: { name, file, families, attacks, allowed }. Throws a UsageError. */
export function loadPack(file) {
  let pack;
  try { pack = JSON.parse(fs.readFileSync(file, 'utf8').replaceAll('{{FAKE_KEY}}', FAKE_KEY)); } catch (e) {
    throw new UsageError(`${file}: ${e.code === 'ENOENT' ? 'no such file' : `not valid JSON (${e.message})`}`);
  }
  if (!pack || pack.version !== 1 || !Array.isArray(pack.attacks)) throw new UsageError(`${file}: a pack needs "version": 1 and an "attacks" list`);
  const allowed = pack.allowed ?? [];
  if (!Array.isArray(allowed)) throw new UsageError(`${file}: "allowed" must be a list`);
  for (const [i, a] of [...pack.attacks.map((x) => ['attack', x]), ...allowed.map((x) => ['allowed call', x])].entries()) {
    const [kind, entry] = a;
    const at = `${file}: ${kind} ${entry?.id ?? `#${i + 1}`}`;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(String(entry?.id ?? ''))) throw new UsageError(`${at}: "id" must be lowercase letters, digits and dashes`);
    if (!isCall(entry.call)) throw new UsageError(`${at}: "call" needs a "toolName" and a "toolArgs" object`);
    if (kind === 'attack' && !String(entry.family ?? '').trim()) throw new UsageError(`${at}: an attack needs a "family"`);
    if (entry.after !== undefined && (kind !== 'attack' || !isCall(entry.after?.call))) throw new UsageError(`${at}: "after" needs a "call" (and the "result" it returned)`);
  }
  return { name: pack.name ?? path.basename(file), file, families: pack.families ?? {}, attacks: pack.attacks, allowed };
}

/** Run the guard once for one call, in a scratch folder: { decision: 'deny' | 'allow' | 'invalid' | 'error', reason }. */
export function runGuard(guard, call, cwd) {
  const input = JSON.stringify({ sessionId: 'attack-pack', timestamp: Date.now(), cwd, toolName: call.toolName, toolArgs: JSON.stringify(call.toolArgs) });
  const r = spawnSync(process.execPath, [guard], { cwd, input, encoding: 'utf8', timeout: 15000 });
  if (r.error || r.status !== 0) return { decision: 'error', reason: (r.error?.message ?? r.stderr ?? '').trim().split('\n')[0] || `exit code ${r.status}` };
  const last = (r.stdout ?? '').trim().split('\n').filter(Boolean).pop();
  if (!last) return { decision: 'allow', reason: '' };
  try {
    const out = JSON.parse(last);
    return { decision: out.permissionDecision ?? 'allow', reason: out.permissionDecisionReason ?? '' };
  } catch {
    return { decision: 'invalid', reason: `not JSON: ${last.slice(0, 80)}` };
  }
}

/**
 * Judge a pack: every variant of an attack's call must be denied (else it's a miss), and a chain's `after` call and
 * every allowed call must be allowed (else it's a false positive). decide(call) returns { decision, reason }.
 * A miss is { id, family, tool, call, decision, reason }; a false positive is { id, tool, call, decision, reason },
 * with step: 'after' when it is a chain's portal read.
 */
export function judge(pack, decide) {
  const misses = [];
  const falsePositives = [];
  // TODO(M1): replay pack.attacks (and each chain's a.after.call) and pack.allowed through decide(), using
  // variants() so that a shell call is judged as bash and as powershell. Until then every guard looks perfect.
  return { misses, falsePositives };
}

const show = (call) => (typeof call.toolArgs?.command === 'string' ? call.toolArgs.command : `${call.toolName} ${JSON.stringify(call.toolArgs)}`).replace(/\s+/g, ' ').slice(0, 90);

function report(r) {
  const lines = [`Replayed ${r.packs.map((p) => path.relative(process.cwd(), p) || p).join(' + ')} against ${path.relative(process.cwd(), r.guard) || r.guard}`, ''];
  for (const m of r.misses) lines.push(`  ✗ miss            ${m.id} (${m.tool}, ${m.decision}): ${show(m.call)}`);
  for (const f of r.falsePositives) lines.push(`  ✗ false positive  ${f.id}${f.step ? ` (the ${f.step} call)` : ''} (${f.tool}): ${show(f.call)}${f.reason ? `\n      ${f.reason.slice(0, 160)}` : ''}`);
  if (r.misses.length || r.falsePositives.length) lines.push('');
  lines.push(`${r.attacks} attacks: ${r.attacks - new Set(r.misses.map((m) => m.id)).size} denied, ${new Set(r.misses.map((m) => m.id)).size} missed · ${r.allowed} allowed calls and ${r.chains} chain reads: ${r.falsePositives.length} false positive${r.falsePositives.length === 1 ? '' : 's'}`);
  return lines.join('\n');
}

function main(argv) {
  const json = argv.includes('--json');
  const g = argv.indexOf('--guard');
  if (g >= 0 && !argv[g + 1]) throw new UsageError('--guard needs a file');
  const guard = path.resolve(g >= 0 ? argv[g + 1] : path.join(ROOT, DEFAULT_GUARD));
  const files = argv.filter((a, i) => !a.startsWith('--') && !(g >= 0 && i === g + 1)).map((f) => path.resolve(f));
  const packFiles = files.length ? files : DEFAULT_PACKS.map((f) => path.join(ROOT, f)).filter((f, i) => i === 0 || fs.existsSync(f));
  if (!fs.existsSync(guard)) throw new UsageError(`no guard at ${guard}`);
  const packs = packFiles.map(loadPack);
  const seen = new Map();
  for (const p of packs) for (const a of [...p.attacks, ...p.allowed]) {
    if (seen.has(a.id)) throw new UsageError(`the id "${a.id}" is used twice (${seen.get(a.id)} and ${p.file})`);
    seen.set(a.id, p.file);
  }
  const all = { attacks: packs.flatMap((p) => p.attacks), allowed: packs.flatMap((p) => p.allowed) };
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'attack-pack-'));
  try {
    const { misses, falsePositives } = judge(all, (call) => runGuard(guard, call, cwd));
    const result = { guard, packs: packFiles, attacks: all.attacks.length, allowed: all.allowed.length, chains: all.attacks.filter((a) => a.after).length, misses, falsePositives };
    process.stdout.write(`${json ? JSON.stringify(result, null, 2) : report(result)}\n`);
    return misses.length || falsePositives.length ? 1 : 0;
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

// Real paths on both sides: through a symlink (macOS /var), a junction or an 8.3 name the spellings differ.
const sameFile = (a, b) => { try { return fs.realpathSync.native(a) === fs.realpathSync.native(b); } catch { return false; } };
if (process.argv[1] && sameFile(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(`attack.mjs: ${e instanceof UsageError ? e.message : e.stack}`);
    process.exitCode = 2;
  }
}
