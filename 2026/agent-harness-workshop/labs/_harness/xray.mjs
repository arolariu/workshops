// The harness X-ray (spec §5.7 Phase 3): what a folder's harness adds to every turn of the model's context, which of its
// files are yours, and the scorecard and maturity level. Also the inherited checks ("🧱 Your harness so far").
// The only process it starts is the folder's own local MCP servers (to list their tools), for at most `timeout` ms.
import fs from 'node:fs';
import path from 'node:path';
import { mcpClient } from './kit.mjs';
import { LAYERS, scanHarness, scorecard, maturity, present } from './scorecard.mjs';
import { blobId, chainEntry } from './chain.mjs';

/** ≈ tokens: characters ÷ 4. Real tokenizers differ, so it is always shown with "≈". */
export const tokens = (text) => Math.ceil(String(text ?? '').length / 4);

/** Is this server `node <a script inside dir>`? Only those start by themselves (for the inherited checks). */
function ownNodeServer(dir, s) {
  if (!/^node(\.exe)?$/i.test(path.basename(String(s.command ?? ''))) || !s.args?.[0] || s.args[0].startsWith('-')) return false;
  const rel = path.relative(path.resolve(dir), path.resolve(dir, s.args[0]));
  return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * { [server]: { tools } | { error } }. Only local (stdio) servers are started; each is stopped afterwards.
 * localOnly: start only `node` servers whose script is inside the folder (never a download like `npx -y …`).
 */
export async function measureMcp(dir, servers, { timeout = 5000, localOnly = false } = {}) {
  const out = {};
  await Promise.all((servers ?? []).map(async (s) => {
    if (!['stdio', 'local'].includes(s.type) || !s.command) { out[s.name] = { error: s.url ? 'a remote server: not measured' : 'no command to start it' }; return; }
    if (localOnly && !ownNodeServer(dir, s)) { out[s.name] = { error: 'not started automatically: only node servers inside this folder are. Press u on the level to X-ray it' }; return; }
    let client = null;
    let timer = null;
    const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`did not answer within ${Math.round(timeout / 1000)} s`)), timeout); });
    const starting = mcpClient({ command: s.command, args: s.args ?? [], env: s.env ?? {}, cwd: dir, timeout });
    try {
      client = await Promise.race([starting, deadline]);
      out[s.name] = { tools: await Promise.race([client.tools(), deadline]) };
    } catch (e) {
      out[s.name] = { error: String(e?.message ?? e).replace(/\s+/g, ' ').trim().slice(0, 240) };
      // A server that answers only after the deadline is closed as soon as it does (mcpClient kills one that never does).
      if (!client) starting.then((c) => c.close(), () => {});
    } finally {
      clearTimeout(timer);
      client?.close();
    }
  }));
  return out;
}

/** What the harness adds to the context: every turn, and only when needed. tokens null = not measured. */
export function contextBudget(scan, mcpTools = {}) {
  const every = [];
  const whenNeeded = [];
  for (const i of scan.instructions) {
    if (i.applyTo) whenNeeded.push({ source: 'instructions', label: i.path, tokens: tokens(i.text), note: `when ${i.applyTo} files are involved` });
    else every.push({ source: 'instructions', label: i.path, tokens: tokens(i.text), note: 'the whole file' });
  }
  for (const s of scan.skills) {
    every.push({ source: 'skills', label: `skill ${s.name || s.folder}`, tokens: tokens(`${s.name}: ${s.description}`), note: 'name and description' });
    whenNeeded.push({ source: 'skills', label: `${s.folder}/SKILL.md`, tokens: Math.ceil(s.size / 4), note: 'when the model picks the skill' });
  }
  for (const a of scan.agents) every.push({ source: 'agents', label: `agent ${a.name}`, tokens: tokens(`${a.name}: ${a.description}`), note: 'its description' });
  for (const s of scan.mcp?.servers ?? []) {
    const m = mcpTools?.[s.name];
    if (Array.isArray(m?.tools)) {
      const schemas = m.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
      every.push({ source: 'mcp', label: `${s.name}: ${m.tools.length} tool schema${m.tools.length === 1 ? '' : 's'}`, tokens: tokens(JSON.stringify(schemas)), note: 'names, descriptions and input schemas' });
    } else every.push({ source: 'mcp', label: `${s.name}: tool schemas`, tokens: null, note: `not measured: ${m?.error ?? 'its tools were not listed'}` });
  }
  for (const h of scan.hooks) every.push({ source: 'hooks', label: h.path.split('/').pop(), tokens: 0, note: 'they run outside the model' });
  return { every, whenNeeded, total: every.reduce((n, x) => n + (x.tokens ?? 0), 0), unmeasured: every.filter((x) => x.tokens === null).length };
}

/** { [path]: '🆕' | '✏️' | '🧳' | '' }: new to this level's seed, changed from it, or brought in from an earlier level. */
export function artifactMarks({ key, dir, paths, manifest, brought }) {
  const entry = manifest ? chainEntry(manifest, key) : null;
  const seed = entry ? { ...entry.inherited, ...entry.starter } : (manifest?.exercises?.[key] ?? {});
  const broughtSet = new Set((brought?.files ?? []).map((f) => f.file));
  const out = {};
  for (const p of paths) {
    if (broughtSet.has(p)) { out[p] = '🧳'; continue; }
    if (!(p in seed)) { out[p] = '🆕'; continue; }
    let id = null;
    try { id = blobId(fs.readFileSync(path.join(dir, ...p.split('/')))); } catch { /* gone */ }
    out[p] = id && id !== seed[p] ? '✏️' : '';
  }
  return out;
}

/** Everything the X-ray shows. `measure: false` skips starting MCP servers (their rules say "not measured"). */
export async function xrayReport({ key, dir, manifest = null, brought = null, measure = true, timeout = 5000 }) {
  const scan = scanHarness(dir);
  const mcpTools = measure && scan.mcp?.servers.length ? await measureMcp(dir, scan.mcp.servers, { timeout }) : {};
  const rules = scorecard(scan, { mcpTools });
  return {
    key,
    dir,
    scan,
    mcpTools,
    rules,
    maturity: maturity(rules, scan),
    budget: contextBudget(scan, mcpTools),
    marks: artifactMarks({ key, dir, paths: scan.artifacts.map((a) => a.path), manifest, brought }),
  };
}

/**
 * The inherited checks for a level: the scorecard rules of the layers that earlier labs taught. Advisory: the caller
 * shows them apart from the level's own checks and never counts them. null when no earlier lab taught a layer.
 */
export async function inheritedChecks({ ex, dir, measure = true, timeout = 5000 }) {
  const layers = LAYERS.filter((l) => l.lab < ex.labId);
  if (!layers.length) return null;
  const scan = scanHarness(dir);
  const wantMcp = measure && layers.some((l) => l.id === 'mcp') && scan.mcp?.servers.length;
  const mcpTools = wantMcp ? await measureMcp(dir, scan.mcp.servers, { timeout, localOnly: true }) : {};
  const rules = scorecard(scan, { mcpTools });
  const group = layers.map((l) => ({ ...l, present: present(scan, l.id), rules: rules.filter((r) => r.layer === l.id && (r.ok !== null || /^not measured/.test(r.message))) }));
  const all = group.flatMap((g) => g.rules);
  return { layers: group, ok: all.filter((r) => r.ok === true).length, failed: all.filter((r) => r.ok === false).length, notMeasured: all.filter((r) => r.ok === null).length };
}
