// The fleet's cost report, from a recorded `gh aw logs --json` (its format: `gh aw json-schema logs`).
//   gh aw logs --json -c 100 --start-date -1w > logs.json   # on a real repository (the default is 10 runs)
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
  const data = (file) => { try { return parseFrontmatter(fs.readFileSync(file, 'utf8'))?.data ?? {}; } catch { return {}; } };
  const out = {};
  for (const f of fs.existsSync(folder) ? fs.readdirSync(folder).filter((n) => n.endsWith('.md')) : []) {
    const own = data(path.join(folder, f));
    const shared = (Array.isArray(own.imports) ? own.imports : own.imports ? [own.imports] : [])
      .map((i) => String(typeof i === 'string' ? i : i?.uses ?? i?.path ?? '').replace(/[?]$/, '').replace(/^\/+/, ''))
      .filter((p) => p && !p.startsWith('.github/agents/'))
      .map((p) => data(p.startsWith('.github/') ? path.join(dir, p) : path.join(folder, p)));
    const pick = (key) => Number(own[key] ?? shared.map((s) => s[key]).find((v) => v != null)) || null;
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

const isMain = (() => {
  try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isMain) {
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
