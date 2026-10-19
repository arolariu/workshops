// The fleet's cost report, from a recorded `gh aw logs --json` (its format: `gh aw json-schema logs`).
//   gh aw logs --json > logs.json            # on a real repository, with a token
//   node scripts/cost-report.mjs logs.json   # here: ../tests/fixtures/fleet-logs.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FAILED = ['failure', 'timed_out'];
const round = (x) => Math.round(x * 10) / 10;

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
  const runs = Array.isArray(logs?.runs) ? logs.runs : [];
  const groups = new Map();
  for (const run of runs) {
    const id = workflowId(run);
    const g = groups.get(id) ?? { id, runs: 0, failed: 0, credits: [], days: new Map() };
    const aic = Number(run.aic) || 0;
    g.runs++;
    if (FAILED.includes(run.conclusion)) g.failed++;
    g.credits.push(aic);
    const day = new Date(run.created_at).toISOString().slice(0, 10);
    g.days.set(day, (g.days.get(day) ?? 0) + aic);
    groups.set(id, g);
  }
  const workflows = [...groups.values()].map((g) => {
    const total = g.credits.reduce((a, b) => a + b, 0);
    const budget = { run: budgets[g.id]?.run ?? null, daily: budgets[g.id]?.daily ?? null };
    const peakDay = round(Math.max(0, ...g.days.values()));
    return {
      id: g.id, runs: g.runs, failed: g.failed, aic: round(total), avg: round(total / g.runs), max: round(Math.max(...g.credits)), peakDay, budget,
      nearBudget: budget.run ? g.credits.filter((c) => c >= 0.8 * budget.run).length : 0,
      overDaily: budget.daily != null && peakDay > budget.daily,
    };
  }).sort((a, b) => b.aic - a.aic || a.id.localeCompare(b.id));
  const failures = runs.filter((r) => FAILED.includes(r.conclusion))
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .map((r) => ({ run_id: r.run_id, id: workflowId(r), conclusion: r.conclusion, failure_kind: r.failure_kind ?? null }));
  return { runs: runs.length, failed: failures.length, aic: round(runs.reduce((n, r) => n + (Number(r.aic) || 0), 0)), workflows, failures };
}

/** The Markdown report: the table, the total line, then one line per warning and per failed run. */
export function toMarkdown(report) {
  const cell = (v) => (v == null ? '–' : String(v));
  const lines = [
    '| Workflow | Runs | Failed | AI credits | Avg/run | Max run | Run budget | Peak day | Daily budget |',
    '|---|---|---|---|---|---|---|---|---|',
    ...report.workflows.map((w) => `| ${w.id} | ${w.runs} | ${w.failed} | ${w.aic} | ${w.avg} | ${w.max} | ${cell(w.budget.run)} | ${w.peakDay} | ${cell(w.budget.daily)} |`),
    '',
    `**Total:** ${report.runs} runs · ${report.failed} failed · ${report.aic} AI credits`,
    '',
  ];
  for (const w of report.workflows) {
    if (w.nearBudget) lines.push(`- ⚠️ ${w.id}: ${w.nearBudget} run(s) used 80% or more of the run budget (${w.budget.run})`);
    if (w.overDaily) lines.push(`- ⚠️ ${w.id}: the busiest day (${w.peakDay}) is over the daily budget (${w.budget.daily})`);
  }
  for (const f of report.failures) lines.push(`- ❌ run ${f.run_id} (${f.id}): ${f.conclusion}${f.failure_kind ? ` (${f.failure_kind})` : ''}`);
  return lines.join('\n');
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
