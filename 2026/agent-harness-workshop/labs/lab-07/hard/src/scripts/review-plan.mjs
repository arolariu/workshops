// How many reviews would your triggers start in a month, and what's the worst case in AI credits?
//   node scripts/review-plan.mjs [fixtures/prs.json]
// It reads the trigger and the budget from .github/workflows/pr-review.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * GitHub Actions filter patterns (the docs' cheat sheet): `*` stays inside one folder, `**` crosses folders, `?` is
 * zero or one of the character before it, `+` one or more of it, and `[a-z]` one character from the set.
 */
export function globToRegExp(glob) {
  // TODO(M5): `**/` = any folders (or none), `**` = anything, `*` = anything but "/". `?`, `+` and `[…]` mean what
  // they mean in a regular expression; every other character is literal. For now it only matches the exact text.
  return new RegExp(`^${String(glob).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}

/** Would a pull request that changed `files` start the workflow? `trigger` is the `on.pull_request` block. */
export function triggers(trigger, files) {
  // TODO(M5): `paths`: at least one file matches (a pattern starting with ! takes a file back out; the last
  // matching pattern wins). `paths-ignore`: at least one file is not ignored. Neither: always.
  return true;
}

/** Review runs over a month of PRs: { prs, reviewed, skipped, runs, worstCase }. */
export function estimate(prs, trigger, maxAiCredits) {
  // TODO(M5): a PR whose files pass the filters gets one run when it's opened, one per push (synchronize) and
  // one per reopen, but only for the types in trigger.types (default: opened, synchronize, reopened).
  return { prs: prs.length, reviewed: prs.length, skipped: 0, runs: prs.length, worstCase: prs.length * maxAiCredits };
}

// ---- given: a small YAML reader (the subset workflow frontmatter uses, the same rules as the checks) ----
function stripComment(line) {
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === q) q = null; } else if (ch === '"' || ch === "'") q = ch;
    else if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}
function depthOf(s) {
  let d = 0, q = null;
  for (const ch of s) {
    if (q) { if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") q = ch;
    else if (ch === '[' || ch === '{') d++;
    else if (ch === ']' || ch === '}') d--;
  }
  return d;
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
  const raw = String(src).replace(/\r/g, '').replace(/\t/g, '  ').split('\n');
  const lines = [];
  for (let k = 0; k < raw.length; k++) {
    let s = stripComment(raw[k]);
    if (!s.trim() || /^---\s*$/.test(s)) continue;
    // A flow list or map that wraps onto the next lines is joined back into one line.
    while (/(:\s+|^\s*-\s+)[[{]/.test(s) && depthOf(s) > 0 && k + 1 < raw.length) s = `${s.trimEnd()} ${stripComment(raw[++k]).trim()}`;
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

// ---- given: read the trigger and the budget from the workflow ----
export function readWorkflow(md) {
  const d = parseFrontmatter(md)?.data ?? {};
  const pr = d.on && typeof d.on === 'object' ? d.on.pull_request : undefined;
  return { trigger: pr === undefined ? null : pr && typeof pr === 'object' ? pr : {}, credits: Number(d['max-ai-credits']) || 0 };
}

const isMain = (() => {
  try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isMain) {
  const file = process.argv[2] ?? 'fixtures/prs.json';
  if (!fs.existsSync(file)) {
    console.error(`${file} not found. Usage: node scripts/review-plan.mjs [fixtures/prs.json]`);
    process.exit(1);
  }
  const { prs } = JSON.parse(fs.readFileSync(file, 'utf8'));
  const workflow = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.github', 'workflows', 'pr-review.md');
  const { trigger, credits } = readWorkflow(fs.readFileSync(workflow, 'utf8'));
  const r = estimate(prs, trigger ?? {}, credits);
  console.log(`PRs: ${r.prs} · reviewed: ${r.reviewed} · skipped: ${r.skipped} · runs: ${r.runs} · worst case: ${r.worstCase} AI credits`);
}
