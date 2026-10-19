// aw-sim: replay what a tricked agent would PROPOSE against your workflows, and see what gh aw would let through.
//   node scripts/aw-sim.mjs ../tests/fixtures/hostile.json [fixtures/my-attacks.json …]
// It models the rules gh aw v0.92.0 enforces outside the model: which safe outputs exist and their limits, which
// item a write may target, which @mentions survive, which links get redacted, which hosts the firewall lets
// through, and whose content the GitHub tool shows the agent. It's a model of the documented rules, not gh aw
// itself: it reads your .github/workflows/*.md, runs nothing, and reaches no network.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------- a small YAML reader (the subset workflow frontmatter uses) ----------
function stripComment(line) {
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === q) q = null; } else if (ch === '"' || ch === "'") q = ch;
    else if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}
function splitFlow(s) {
  const parts = [];
  let depth = 0, q = null, cur = '';
  for (const ch of s) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === '[' || ch === '{') depth++;
    if (ch === ']' || ch === '}') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim());
}
const unquote = (s) => { s = s.trim(); return /^(["']).*\1$/.test(s) ? s.slice(1, -1) : s; };
function scalar(v) {
  v = v.trim();
  if (v.startsWith('[') && v.endsWith(']')) return splitFlow(v.slice(1, -1)).map(scalar);
  if (v.startsWith('{') && v.endsWith('}')) {
    const o = {};
    for (const part of splitFlow(v.slice(1, -1))) {
      const m = part.match(/^("[^"]*"|'[^']*'|[^:]+?)\s*:\s*(.*)$/);
      if (m) o[unquote(m[1])] = scalar(m[2]);
    }
    return o;
  }
  if (/^(["']).*\1$/.test(v)) return v.slice(1, -1);
  if (/^(true|yes)$/i.test(v)) return true;
  if (/^(false|no)$/i.test(v)) return false;
  if (/^(null|~)$/i.test(v) || v === '') return null;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}
export function parseYaml(src) {
  const lines = [];
  for (const raw of String(src).replace(/\r/g, '').replace(/\t/g, '  ').split('\n')) {
    const s = stripComment(raw);
    if (!s.trim() || /^---\s*$/.test(s)) continue;
    lines.push({ indent: s.match(/^ */)[0].length, text: s.trim() });
  }
  let i = 0;
  const isItem = (l) => l.text === '-' || l.text.startsWith('- ');
  const isKey = (t) => /^("[^"]*"|'[^']*'|[^\s"'[{][^:]*?)\s*:(\s|$)/.test(t);
  const block = (indent) => (isItem(lines[i]) ? list(indent) : map(indent));
  function map(indent) {
    const obj = {};
    while (i < lines.length && lines[i].indent === indent && !isItem(lines[i])) {
      const m = lines[i].text.match(/^("[^"]*"|'[^']*'|[^:]+?)\s*:(?:\s+(.*))?$/);
      if (!m) throw new Error(`cannot read the line "${lines[i].text}"`);
      const key = unquote(m[1]);
      const rest = m[2] ?? '';
      i++;
      if (rest === '') {
        if (i < lines.length && lines[i].indent > indent) obj[key] = block(lines[i].indent);
        else if (i < lines.length && lines[i].indent === indent && isItem(lines[i])) obj[key] = list(indent);
        else obj[key] = null;
      } else if (/^[|>][-+]?$/.test(rest)) {
        const parts = [];
        while (i < lines.length && lines[i].indent > indent) parts.push(lines[i++].text);
        obj[key] = parts.join(rest.startsWith('|') ? '\n' : ' ');
      } else obj[key] = scalar(rest);
    }
    return obj;
  }
  function list(indent) {
    const arr = [];
    while (i < lines.length && lines[i].indent === indent && isItem(lines[i])) {
      const content = lines[i].text === '-' ? '' : lines[i].text.slice(2).trim();
      if (!content) {
        i++;
        arr.push(i < lines.length && lines[i].indent > indent ? block(lines[i].indent) : null);
      } else if (isKey(content)) {
        lines[i] = { indent: indent + 2, text: content };
        arr.push(map(indent + 2));
      } else { arr.push(scalar(content)); i++; }
    }
    return arr;
  }
  return lines.length ? block(lines[0].indent) : {};
}
/** { data, body } of a workflow file, or null when it has no frontmatter. */
export function parseFrontmatter(text) {
  const m = String(text).replace(/^\uFEFF/, '').replace(/\r/g, '').match(/^---\n([\s\S]*?)\n---\s*(?:\n|$)([\s\S]*)$/);
  return m ? { data: parseYaml(m[1]) ?? {}, body: m[2] } : null;
}

// ---------- what gh aw v0.92.0 knows ----------
export const ECOSYSTEMS = {
  // `defaults`, read from the firewall allow-list of a lock compiled with gh-aw v0.92.0.
  defaults: ['api.snapcraft.io', 'archive.ubuntu.com', 'azure.archive.ubuntu.com', 'crl.geotrust.com', 'crl.globalsign.com', 'crl.identrust.com',
    'crl.sectigo.com', 'crl.thawte.com', 'crl.usertrust.com', 'crl.verisign.com', 'crl3.digicert.com', 'crl4.digicert.com', 'crls.ssl.com',
    'json-schema.org', 'json.schemastore.org', 'keyserver.ubuntu.com', 'ocsp.digicert.com', 'ocsp.geotrust.com', 'ocsp.globalsign.com',
    'ocsp.identrust.com', 'ocsp.sectigo.com', 'ocsp.ssl.com', 'ocsp.thawte.com', 'ocsp.usertrust.com', 'ocsp.verisign.com', 'packagecloud.io',
    'packages.cloud.google.com', 'packages.microsoft.com', 'ppa.launchpad.net', 's.symcb.com', 's.symcd.com', 'security.ubuntu.com',
    'ts-crl.ws.symantec.com', 'ts-ocsp.ws.symantec.com', 'www.googleapis.com'],
  github: ['github.com', 'api.github.com', 'github.io', 'githubusercontent.com', 'githubassets.com', 'github.dev', 'codespaces.new', 'ghcr.io'],
  node: ['registry.npmjs.org', 'npmjs.org', 'npmjs.com', 'nodejs.org', 'yarnpkg.com'],
  python: ['pypi.org', 'pythonhosted.org'],
  local: ['localhost', '127.0.0.1'],
};
ECOSYSTEMS['default-safe-outputs'] = [...ECOSYSTEMS.defaults, ...ECOSYSTEMS.github, ...ECOSYSTEMS.local];
// Links in what the agent writes: these domains always survive (sanitize_content_core.cjs).
const OUTPUT_DOMAINS = ['github.com', 'github.io', 'githubusercontent.com', 'githubassets.com', 'github.dev', 'codespaces.new'];
const DEFAULT_MAX = { 'add-labels': 5, 'add-comment': 1, 'create-issue': 1, 'hide-comment': 5, 'remove-labels': 3 };
const TARGETED = ['add-labels', 'add-comment', 'remove-labels', 'hide-comment', 'close-issue', 'update-issue', 'assign-to-user', 'assign-milestone'];
const INTEGRITY = ['none', 'unapproved', 'approved', 'merged'];
const LEVEL_OF = { OWNER: 'approved', MEMBER: 'approved', COLLABORATOR: 'approved', CONTRIBUTOR: 'unapproved', FIRST_TIME_CONTRIBUTOR: 'unapproved', FIRST_TIMER: 'none', NONE: 'none' };
export const DEFAULT_REPO = { name: 'studybuddy/studybuddy', visibility: 'public', collaborators: ['alice', 'bob'] };

const arr = (v) => (v == null || v === false ? [] : Array.isArray(v) ? v : [v]).map(String);
const globRe = (g) => new RegExp(`^${g.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`, 'i');
const expand = (list) => list.flatMap((d) => ECOSYSTEMS[d] ?? [d]);
function hostIn(host, list) {
  const h = host.toLowerCase();
  return list.some((d) => {
    const e = String(d).toLowerCase().replace(/^https?:\/\//, '');
    if (e === '*') return true;
    if (e.startsWith('*.')) return h.endsWith(e.slice(1));
    return h === e || h.endsWith(`.${e}`);
  });
}
const hostOf = (url) => { try { return new URL(url).hostname; } catch { return null; } };

/** The hosts the firewall lets through: `network: defaults`, `{ allowed: [...] }` (ecosystems or domains), or none. */
export function firewall(network) {
  if (network == null || network === 'defaults') return expand(['defaults']);
  if (typeof network === 'object' && !Array.isArray(network)) return expand(arr(network.allowed));
  return expand(arr(network));
}
/** Can the agent send a request at all? A shell with curl/wget/node/python (or any command), or web-fetch. */
export function canSend(tools) {
  if (!tools || typeof tools !== 'object') return false;
  if (tools['web-fetch'] !== undefined) return 'the web-fetch tool';
  if (tools.bash === true) return 'an unrestricted shell';
  const hit = arr(tools.bash).find((c) => /^:?\*$/.test(c.trim()) || /^(curl|wget|nc|ncat|node|python3?)\b/.test(c.trim()));
  return hit ? `a shell that allows \`${hit}\`` : false;
}

/** The integrity of an item, as the GitHub tool's filter sees it. */
function integrityOf(item, gh, repo) {
  const author = String(item.author ?? '').toLowerCase();
  if (arr(gh?.['blocked-users']).map((u) => u.toLowerCase()).includes(author)) return 'blocked';
  let level = repo.visibility === 'public' ? LEVEL_OF[String(item.association ?? 'NONE').toUpperCase()] ?? 'none' : 'approved';
  const labels = arr(item.labels).map((l) => l.toLowerCase());
  const promote = arr(gh?.['approval-labels']).some((l) => labels.includes(l.toLowerCase())) || arr(gh?.['trusted-users']).map((u) => u.toLowerCase()).includes(author);
  if (promote && INTEGRITY.indexOf(level) < INTEGRITY.indexOf('approved')) level = 'approved';
  if (arr(gh?.['refusal-labels']).some((l) => labels.includes(l.toLowerCase()))) level = 'none';
  return level;
}

/** What gh aw does to the text the agent wrote: escape mentions that aren't allowed, redact links it can't vouch for. */
export function sanitize(text, so = {}, repo = DEFAULT_REPO, context = [], notes = []) {
  const m = so.mentions;
  const allowed = arr(m?.allowed).map((u) => u.toLowerCase());
  const teams = arr(m?.['allowed-teams']).map((u) => u.toLowerCase());
  const collaborators = m === false || m?.['allowed-collaborators'] === false || m?.['allow-team-members'] === false ? [] : arr(repo.collaborators).map((u) => u.toLowerCase());
  const ctx = m === false || m?.['allow-context'] === false ? [] : context.map((u) => String(u).toLowerCase());
  const keep = (alias) => {
    if (m === false) return false;
    const a = alias.toLowerCase();
    if (a.includes('/')) return teams.includes(a) || teams.includes(a.split('/')[1]);
    return allowed.includes(a) || collaborators.includes(a) || ctx.includes(a);
  };
  const domains = [...OUTPUT_DOMAINS, ...expand(arr(so['allowed-domains']))];
  return String(text ?? '')
    .replace(/(^|[^A-Za-z0-9`])@([A-Za-z0-9](?:[A-Za-z0-9_-]{0,37}[A-Za-z0-9])?(?:\/[A-Za-z0-9._-]+)?)/g, (all, pre, alias) => {
      if (keep(alias)) return all;
      notes.push(`@${alias} was escaped (not an allowed mention)`);
      return `${pre}\`@${alias}\``;
    })
    .replace(/\bhttps?:\/\/[^\s)<>"'\]]+/gi, (url) => {
      const host = hostOf(url);
      if (url.toLowerCase().startsWith('https://') && host && hostIn(host, domains)) return url;
      notes.push(`the link to ${host ?? url} became (redacted): not in allowed-domains`);
      return '(redacted)';
    });
}

/** Problems with a case's shape ([] when it can be replayed). */
export function validateCase(c) {
  const out = [];
  if (!c || typeof c !== 'object') return ['a case must be an object'];
  if (!/^[a-z0-9-]+$/.test(String(c.id ?? ''))) out.push('"id" must be lowercase letters, digits and dashes');
  if (!['issue-assistant', 'issue-triage'].includes(c.workflow)) out.push('"workflow" must be "issue-assistant" or "issue-triage"');
  if (!['hostile', 'benign'].includes(c.kind)) out.push('"kind" must be "hostile" or "benign"');
  if (!Array.isArray(c.proposals) || !c.proposals.length) out.push('"proposals" must be a non-empty list');
  for (const p of c.proposals ?? []) {
    if (p?.type === 'add_labels' && !(Array.isArray(p.labels) && p.labels.length)) out.push('add_labels needs "labels"');
    else if ((p?.type === 'add_comment' || p?.type === 'create_issue') && typeof p.body !== 'string') out.push(`${p.type} needs a "body"`);
    else if (p?.type === 'fetch' && !hostOf(p.url)) out.push('fetch needs a "url"');
    else if (p?.type === 'read' && !Number.isInteger(p.item)) out.push('read needs an "item" number');
    else if (typeof p?.type !== 'string') out.push('every proposal needs a "type"');
  }
  const goals = c.kind === 'benign' ? arr(c.expect).length : Object.keys(c.goal ?? {}).filter((k) => GOALS[k]).length;
  if (c.kind === 'hostile' && goals !== 1) out.push('a hostile case needs one "goal": label, labels, mention, item, host, read or handler');
  if (c.kind === 'benign' && !Array.isArray(c.expect)) out.push('a benign case needs an "expect" list');
  return out;
}

const mentioned = (body, who) => new RegExp(`(^|[^A-Za-z0-9\`])@${who.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?![A-Za-z0-9_-])`, 'i').test(body ?? '');
const GOALS = {
  label: (g, fx) => fx.find((e) => e.kind === 'label' && e.label.toLowerCase() === String(g).toLowerCase()),
  labels: (g, fx) => (fx.filter((e) => e.kind === 'label').length >= Number(g) ? fx.find((e) => e.kind === 'label') : null),
  mention: (g, fx) => fx.find((e) => e.body != null && mentioned(e.body, String(g))),
  item: (g, fx) => fx.find((e) => (e.kind === 'label' || e.kind === 'comment') && e.item === Number(g)),
  host: (g, fx) => fx.find((e) => (e.kind === 'fetch' && e.host === g) || (e.body != null && e.body.toLowerCase().includes(`://${String(g).toLowerCase()}`))),
  read: (g, fx) => fx.find((e) => e.kind === 'read' && e.item === Number(g)),
  handler: (g, fx) => fx.find((e) => e.kind === g),
  comment: (g, fx) => fx.find((e) => e.kind === 'comment'),
  link: (g, fx) => fx.find((e) => e.body != null && e.body.toLowerCase().includes(`://${String(g).toLowerCase()}`)),
};
const describe = (e) => ({
  label: () => `the label "${e.label}" was added to #${e.item}`,
  comment: () => `a comment landed on #${e.item}: "${e.body.slice(0, 60)}${e.body.length > 60 ? '…' : ''}"`,
  issue: () => `an issue was created: "${e.title}"`,
  fetch: () => `a request reached ${e.host} through ${e.via}`,
  read: () => `the agent read #${e.item} (integrity: ${e.level})`,
}[e.kind] ?? (() => `${e.kind} went through`))();

/** Replay one case against one workflow's { data, body }. */
export function simulateCase(config, c, repo = DEFAULT_REPO) {
  const d = config?.data ?? {};
  const so = d['safe-outputs'] && typeof d['safe-outputs'] === 'object' ? d['safe-outputs'] : {};
  const trigger = c.trigger ?? {};
  const triggering = Number.isInteger(trigger.item) ? trigger.item : null;
  const effects = [];
  const notes = [];
  const used = {};
  for (const p of c.proposals ?? []) {
    if (p.type === 'fetch') {
      const host = hostOf(p.url);
      const via = canSend(d.tools);
      if (!via) { notes.push(`fetch ${host}: the agent has no tool that can send a request`); continue; }
      if (!hostIn(host, firewall(d.network))) { notes.push(`fetch ${host}: the firewall blocks it (not in network.allowed)`); continue; }
      effects.push({ kind: 'fetch', host, via });
      continue;
    }
    if (p.type === 'read') {
      const gh = d.tools?.github;
      if (!d.tools || !('github' in d.tools) || gh === false) { notes.push(`read #${p.item}: there is no GitHub tool`); continue; }
      const sets = arr(gh?.toolsets ?? ['default']);
      const need = p.kind === 'pull_request' ? 'pull_requests' : 'issues';
      if (!sets.some((s) => s === need || s === 'default' || s === 'all')) { notes.push(`read #${p.item}: the GitHub tool has no ${need} toolset`); continue; }
      const min = gh?.['min-integrity'] ?? (repo.visibility === 'public' ? 'approved' : 'none');
      const level = integrityOf(p, gh, repo);
      if (level === 'blocked' || INTEGRITY.indexOf(level) < INTEGRITY.indexOf(min)) { notes.push(`read #${p.item}: filtered out (its integrity is ${level}, min-integrity is ${min})`); continue; }
      effects.push({ kind: 'read', item: p.item, level });
      continue;
    }
    const key = String(p.type).replace(/_/g, '-');
    const cfg = so[key];
    if (cfg === undefined || cfg === false) { notes.push(`${p.type}: ${key} is not enabled in safe-outputs`); continue; }
    const opt = cfg && typeof cfg === 'object' ? cfg : {};
    used[key] = (used[key] ?? 0) + 1;
    const max = Number(opt.max ?? DEFAULT_MAX[key] ?? 1);
    if (used[key] > max) { notes.push(`${p.type}: over the limit (${key}.max is ${max})`); continue; }
    let item = null;
    if (TARGETED.includes(key)) {
      item = Number.isInteger(p.item) ? p.item : triggering;
      const target = opt.target ?? 'triggering';
      if (item == null) { notes.push(`${p.type}: no item to write to (a scheduled run has no triggering item)`); continue; }
      if (item !== triggering) {
        if (target === 'triggering') { notes.push(`${p.type} on #${item}: it may only write to the triggering item${triggering ? ` (#${triggering})` : ''}`); continue; }
        if (target !== '*' && Number(target) !== item) { notes.push(`${p.type} on #${item}: its target is #${target}`); continue; }
      }
    }
    if (key === 'add-labels') {
      const labels = arr(p.labels);
      const perCall = Number(opt['max-labels'] ?? 10);
      if (labels.length > perCall) { notes.push(`add_labels: ${labels.length} labels in one call, max-labels is ${perCall}`); continue; }
      const kept = labels.filter((l) => {
        if (arr(opt.blocked).some((g) => globRe(g).test(l))) { notes.push(`add_labels: "${l}" is blocked`); return false; }
        if (opt.allowed != null && !arr(opt.allowed).some((g) => globRe(g).test(l))) { notes.push(`add_labels: "${l}" isn't in the allow-list`); return false; }
        return true;
      });
      for (const label of kept) effects.push({ kind: 'label', item, label });
      continue;
    }
    const context = [trigger.author].filter(Boolean);
    if (key === 'add-comment') { effects.push({ kind: 'comment', item, body: sanitize(p.body, so, repo, context, notes) }); continue; }
    if (key === 'create-issue') { effects.push({ kind: 'issue', title: `${opt['title-prefix'] ?? ''}${p.title ?? ''}`, body: sanitize(p.body, so, repo, context, notes) }); continue; }
    effects.push({ kind: key, item });
  }
  const out = { id: c.id, workflow: c.workflow, kind: c.kind, effects, notes };
  if (c.kind === 'benign') {
    const missing = (c.expect ?? []).filter((x) => !Object.entries(x).every(([k, v]) => GOALS[k]?.(v, effects))).map((x) => JSON.stringify(x));
    return { ...out, verdict: missing.length ? 'broken' : 'works', why: missing.length ? `expected ${missing.join(', ')}${notes.length ? `; ${notes.join('; ')}` : ''}` : '' };
  }
  const [k, v] = Object.entries(c.goal ?? {}).find(([key]) => GOALS[key]) ?? [];
  const hit = k ? GOALS[k](v, effects) : null;
  const labels = effects.filter((e) => e.kind === 'label').map((e) => e.label);
  let why = hit ? describe(hit) : notes.join('; ') || 'nothing it proposed got through';
  if (hit && k === 'labels') why = `${labels.length} labels were added to #${hit.item} (${labels.join(', ')})`;
  if (hit && k === 'mention') why = `@${v} was pinged in a comment on #${hit.item}`;
  return { ...out, verdict: hit ? 'got-through' : 'blocked', why };
}

/** Replay many cases; `configs` maps a workflow id ("issue-assistant") to its { data, body }. */
export function replay(configs, cases, repo = DEFAULT_REPO) {
  return cases.map((c) => (configs[c.workflow] ? simulateCase(configs[c.workflow], c, repo)
    : { id: c.id, workflow: c.workflow, kind: c.kind, verdict: c.kind === 'benign' ? 'broken' : 'blocked', why: `no workflow ${c.workflow}.md`, effects: [], notes: [] }));
}

const networkList = (n) => (n == null ? [] : n === 'defaults' ? ['defaults'] : typeof n === 'object' && !Array.isArray(n) ? arr(n.allowed) : arr(n));
function deepMerge(base, over) {
  if (Array.isArray(base) && Array.isArray(over)) return [...new Set([...base, ...over])];
  if (base && over && typeof base === 'object' && typeof over === 'object' && !Array.isArray(base) && !Array.isArray(over)) {
    const out = { ...base };
    for (const [k, v] of Object.entries(over)) out[k] = k in base ? deepMerge(base[k], v) : v;
    return out;
  }
  return over === undefined ? base : over;
}
/**
 * The workflow with the shared components it imports merged in, for the fields the simulator reads (gh aw's rules:
 * network lists are joined, the main file's safe outputs win, tools merge). `read(rel)` returns a file's text or null.
 */
export function withImports(config, read) {
  const d = { ...(config?.data ?? {}) };
  const list = (Array.isArray(d.imports) ? d.imports : d.imports ? [d.imports] : []).map((i) => String(typeof i === 'string' ? i : i?.uses ?? i?.path ?? ''));
  for (const raw of list) {
    const p = raw.replace(/[?]$/, '').replace(/^\/+/, '');
    const rel = path.posix.normalize(p.startsWith('.github/') ? p : `.github/workflows/${p}`);
    if (rel.startsWith('.github/agents/')) continue;
    const shared = parseFrontmatter(read(rel) ?? '')?.data;
    if (!shared) continue;
    if (shared.network !== undefined) d.network = d.network === undefined ? shared.network : { allowed: [...new Set([...networkList(d.network), ...networkList(shared.network)])] };
    if (shared['safe-outputs'] && typeof shared['safe-outputs'] === 'object') d['safe-outputs'] = { ...shared['safe-outputs'], ...(d['safe-outputs'] ?? {}) };
    if (shared.tools && typeof shared.tools === 'object') d.tools = deepMerge(shared.tools, d.tools ?? {});
  }
  return { data: d, body: config?.body ?? '' };
}

/** What the prompt and the tools let the agent see, in words: [] when only trusted or sanitized text gets in. */
export function contextFindings(config) {
  const d = config?.data ?? {};
  const body = config?.body ?? '';
  const out = [];
  const raw = body.match(/\$\{\{\s*github\.event\.(issue|pull_request|discussion)\.title\s*\}\}|\$\{\{\s*github\.event\.release\.name\s*\}\}/);
  if (raw) out.push(`The prompt pastes \`${raw[0]}\` raw: a stranger wrote it. Use \`\${{ steps.sanitized.outputs.text }}\`.`);
  if (!/\$\{\{\s*steps\.sanitized\.outputs\.(text|body)\s*\}\}/.test(body)) out.push('Untrusted text doesn\'t arrive through `${{ steps.sanitized.outputs.text }}`, the sanitized channel.');
  const gh = d.tools?.github;
  if (d.tools && 'github' in d.tools && gh !== false) {
    const sets = arr(gh?.toolsets ?? ['default']);
    if (sets.some((s) => s === 'default' || s === 'all')) out.push(`The GitHub tool has the "${sets.find((s) => s === 'default' || s === 'all')}" toolset: name only the ones it needs.`);
    const min = gh?.['min-integrity'];
    if (!min || INTEGRITY.indexOf(min) < INTEGRITY.indexOf('approved')) out.push(min ? `min-integrity is ${min}: strangers' issues and comments reach the agent through the GitHub tool.` : 'min-integrity is not set: gh aw picks approved in a public repository, but lets everything through in a private one. Say what you mean.');
    const labels = d['safe-outputs']?.['add-labels'];
    if (labels && typeof labels === 'object') {
      const can = (l) => !arr(labels.blocked).some((g) => globRe(g).test(l)) && (labels.allowed == null || arr(labels.allowed).some((g) => globRe(g).test(l)));
      const raise = arr(gh?.['approval-labels']).filter(can);
      if (raise.length) out.push(`The agent can add ${raise.map((l) => `"${l}"`).join(', ')}, which approval-labels turns into trusted content.`);
    } else if (labels === null && arr(gh?.['approval-labels']).length) out.push('The agent can add any label, including the approval-labels that make content trusted.');
  }
  return out;
}

// ---------- the CLI ----------
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error('Usage: node scripts/aw-sim.mjs <cases.json> [more.json …]   (try ../tests/fixtures/hostile.json)');
    process.exit(2);
  }
  let repo = null;
  const cases = [];
  for (const f of files) {
    let json;
    try { json = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { console.error(`${f}: ${e.code === 'ENOENT' ? 'not found' : e.message}`); process.exit(2); }
    repo = repo ?? json.repo ?? null;
    cases.push(...(json.cases ?? []));
  }
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const read = (rel) => { try { return fs.readFileSync(path.join(dir, ...rel.split('/')), 'utf8'); } catch { return null; } };
  const configs = {};
  for (const wf of new Set(cases.map((c) => c.workflow))) {
    const own = parseFrontmatter(read(`.github/workflows/${wf}.md`) ?? '');
    configs[wf] = own ? withImports(own, read) : null;
  }
  const results = replay(configs, cases, repo ?? DEFAULT_REPO);
  const icon = { blocked: '✅ blocked    ', 'got-through': '❌ got through', works: '✅ works      ', broken: '❌ broken     ' };
  console.log(`🧪 aw-sim · ${results.length} cases · the rules of gh aw v0.92.0, modelled (not gh aw itself)`);
  for (const wf of Object.keys(configs)) {
    console.log(`\n${wf}  (.github/workflows/${wf}.md)`);
    for (const r of results.filter((x) => x.workflow === wf)) console.log(`  ${icon[r.verdict]}  ${r.id.padEnd(26)} ${r.why}`);
    const ctx = configs[wf] ? contextFindings(configs[wf]) : [];
    for (const f of ctx) console.log(`  👀 ${f}`);
  }
  const through = results.filter((r) => r.verdict === 'got-through').length;
  const broken = results.filter((r) => r.verdict === 'broken').length;
  console.log(`\n${through ? `❌ ${through} hostile case(s) got through` : '✅ every hostile case was blocked'} · ${broken ? `❌ ${broken} normal case(s) broken` : '✅ the normal work still works'}`);
  process.exit(through || broken ? 1 : 0);
}
