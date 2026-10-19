// How many reviews would your triggers start in a month, and what's the worst case in AI credits?
//   node scripts/review-plan.mjs [fixtures/prs.json]
// It reads the trigger and the budget from .github/workflows/pr-review.md (block-style YAML, like the hints).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** GitHub Actions globs: `**` matches across folders, `*` and `?` stay inside one folder name. */
export function globToRegExp(glob) {
  // TODO(M5): `**/` = any folders (or none), `**` = anything, `*` = anything but "/", `?` = one character but "/".
  // For now it only matches the exact text.
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
