// The fleet's cost report, from a recorded `gh aw logs --json` (its format: `gh aw json-schema logs`).
//   gh aw logs --json > logs.json            # on a real repository, with a token
//   node scripts/cost-report.mjs logs.json   # here: ../tests/fixtures/fleet-logs.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** "issue-triage" for a run of .github/workflows/issue-triage.lock.yml. */
export function workflowId(run) {
  return path.basename(String(run?.workflow_path ?? run?.workflow_name ?? '?')).replace(/\.(lock\.yml|yml|md)$/, '');
}

/** { [workflow id]: { run: max-ai-credits, daily: max-daily-ai-credits } } from .github/workflows/*.md. A workflow's
 *  own value wins; otherwise it comes from a shared file the workflow imports (gh aw's merge, v0.92.0). */
export function readBudgets(dir = '.') {
  const folder = path.join(dir, '.github', 'workflows');
  const front = (file) => { try { return fs.readFileSync(file, 'utf8').replace(/\r/g, '').match(/^---\n([\s\S]*?)\n---/)?.[1] ?? ''; } catch { return ''; } };
  const num = (text, key) => { const m = text.match(new RegExp(`^${key}:\\s*(\\d+(?:\\.\\d+)?)`, 'm')); return m ? Number(m[1]) : null; };
  const out = {};
  for (const f of fs.existsSync(folder) ? fs.readdirSync(folder).filter((n) => n.endsWith('.md')) : []) {
    const own = front(path.join(folder, f));
    const block = own.match(/^imports:[ \t]*\[(.*)\]/m)?.[1] ?? own.match(/^imports:[ \t]*\n((?:[ \t]+-.*\n?)+)/m)?.[1] ?? '';
    const imported = [...block.matchAll(/["']?([^"',\s\]]+\.md)/g)].map((m) => m[1].replace(/^-/, ''))
      .map((p) => front(p.startsWith('.github/') ? path.join(dir, p) : path.join(folder, p)));
    const pick = (key) => num(own, key) ?? imported.map((text) => num(text, key)).find((v) => v != null) ?? null;
    out[f.replace(/\.md$/, '')] = { run: pick('max-ai-credits'), daily: pick('max-daily-ai-credits') };
  }
  return out;
}

/**
 * { runs, failed, aic, workflows: [{ id, runs, failed, aic, avg, max, peakDay, budget, nearBudget, overDaily }], failures }
 * (todo.md has the exact rules: what counts as failed, how to round, how to sort.)
 */
export function costReport(logs, budgets = {}) {
  // TODO(M5): group logs.runs by workflowId(), add up the AI credits (`aic`), find each workflow's busiest UTC day,
  // and compare with its budgets.
  return { runs: 0, failed: 0, aic: 0, workflows: [], failures: [] };
}

/** The Markdown report: the table, the total line, then one line per warning and per failed run. */
export function toMarkdown(report) {
  // TODO(M5): the exact format is in todo.md.
  return '';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) {
    console.error(`${file ?? 'A logs file'} not found. Usage: node scripts/cost-report.mjs <logs.json> (from gh aw logs --json)`);
    process.exit(1);
  }
  let logs;
  try { logs = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
    console.error(`${file} is not JSON: ${e.message}`);
    process.exit(1);
  }
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  console.log(toMarkdown(costReport(logs, readBudgets(root))));
}
