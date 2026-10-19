// How many reviews would your triggers start in a month, and what's the worst case in AI credits?
//   node scripts/review-plan.mjs [fixtures/prs.json]
// It reads the trigger and the budget from .github/workflows/pr-review.md (block-style YAML, like the hints).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_TYPES = ['opened', 'synchronize', 'reopened'];

/** GitHub Actions globs: `**` matches across folders, `*` and `?` stay inside one folder name. */
export function globToRegExp(glob) {
  let re = '';
  const g = String(glob).trim();
  for (let i = 0; i < g.length; i++) {
    const ch = g[i];
    if (ch === '*' && g[i + 1] === '*') {
      if (g[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
    } else if (ch === '*') re += '[^/]*';
    else if (ch === '?') re += '[^/]';
    else re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

/** Does `file` end up selected by `patterns`? The last pattern that matches wins; "!" takes a file back out. */
function selected(patterns, file) {
  let on = false;
  for (const p of [patterns].flat().map(String)) {
    if (p.startsWith('!')) { if (globToRegExp(p.slice(1)).test(file)) on = false; } else if (globToRegExp(p).test(file)) on = true;
  }
  return on;
}

/** Would a pull request that changed `files` start the workflow? `trigger` is the `on.pull_request` block. */
export function triggers(trigger, files) {
  if (trigger?.paths != null) return files.some((f) => selected(trigger.paths, f));
  if (trigger?.['paths-ignore'] != null) return files.some((f) => !selected(trigger['paths-ignore'], f));
  return true;
}

/** Review runs over a month of PRs: { prs, reviewed, skipped, runs, worstCase }. */
export function estimate(prs, trigger, maxAiCredits) {
  const types = Array.isArray(trigger?.types) ? trigger.types : DEFAULT_TYPES;
  let reviewed = 0;
  let runs = 0;
  for (const pr of prs) {
    if (!triggers(trigger, pr.files ?? [])) continue;
    const n = (types.includes('opened') ? 1 : 0) + (types.includes('synchronize') ? pr.pushes ?? 0 : 0) + (types.includes('reopened') ? pr.reopens ?? 0 : 0);
    if (!n) continue;
    reviewed++;
    runs += n;
  }
  return { prs: prs.length, reviewed, skipped: prs.length - reviewed, runs, worstCase: runs * Number(maxAiCredits) };
}

// ---- given: read the trigger and the budget from the workflow's frontmatter ----
export function readWorkflow(md) {
  const front = String(md).replace(/\r/g, '').match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  const lines = front.split('\n').map((l) => l.replace(/\s+#.*$/, '')).filter((l) => l.trim());
  const indent = (l) => l.match(/^ */)[0].length;
  const unquote = (s) => s.trim().replace(/^(['"])(.*)\1$/, '$2');
  const credits = Number(front.match(/^max-ai-credits:\s*(\d+)/m)?.[1] ?? 0);
  const at = lines.findIndex((l) => /^\s+pull_request:\s*$/.test(l));
  if (at < 0) return { trigger: null, credits };
  const trigger = {};
  for (let i = at + 1; i < lines.length && indent(lines[i]) > indent(lines[at]); i++) {
    const m = lines[i].match(/^\s*(types|paths|paths-ignore):\s*(.*)$/);
    if (!m) continue;
    if (m[2].startsWith('[')) {
      trigger[m[1]] = m[2].replace(/^\[|\]$/g, '').split(',').map(unquote).filter(Boolean);
      continue;
    }
    const list = [];
    const own = indent(lines[i]);
    while (i + 1 < lines.length && /^\s*- /.test(lines[i + 1]) && indent(lines[i + 1]) >= own) list.push(unquote(lines[++i].replace(/^\s*- /, '')));
    trigger[m[1]] = list;
  }
  return { trigger, credits };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
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
