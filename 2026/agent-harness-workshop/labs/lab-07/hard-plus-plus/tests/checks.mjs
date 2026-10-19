// Free checks for Lab 07 · hard++: a continuous-AI fleet (shared configuration, budgets, failure handling, costs, a runbook).
import fs from 'node:fs';
import path from 'node:path';
import { readOnly, GLOBAL_SAFE_OUTPUT_KEYS, importsOf, refCostReport, compileAll, simulator, tableRows } from './common.mjs';

const SHARED = '.github/workflows/shared/fleet.md';
const FLEET = ['issue-triage', 'pr-review', 'issue-assistant', 'weekly-report'];
const wf = (id) => `.github/workflows/${id}.md`;
const COST = 'scripts/cost-report.mjs';
const RUNBOOK = 'RUNBOOK.md';
const FLEET_DAILY = 1000;
// What gh aw v0.92.0 refuses in a shared file (compile errors, measured): a timeout, and concurrency keys other than
// group and job-discriminator. Budgets, max-turns and a concurrency group are allowed there, as fleet defaults.
const REFUSED_IN_SHARED = ['timeout-minutes'];
const SHARED_CONCURRENCY = ['group', 'job-discriminator'];
const TRANSIENT = ['!inference_access_error', '!ai_credits_rate_limit_error', '!report_incomplete'];
const FIXED_BUDGETS = { 'pr-review': { run: 100, daily: 300 }, 'weekly-report': { run: 150, daily: 200 }, 'issue-triage': { run: 50, daily: 200 }, 'issue-assistant': { run: 50, daily: 150 } };

const fm = (t, rel) => t.frontmatter(rel, `\`${rel}\` is missing.`);
const fleet = (t) => FLEET.map((id) => ({ id, ...fm(t, wf(id)) }));
const shared = (t) => (t.exists(SHARED) ? fm(t, SHARED).data : {});
/** A setting as the workflow ends up with it: its own value wins, else the shared file's (gh aw's merge, v0.92.0). */
const effective = (t, data, key) => data[key] ?? (importsOf(data).includes(SHARED) ? shared(t)[key] : undefined);
const groupOf = (c) => (typeof c === 'string' ? c : c?.group);
const logsFile = (t) => path.join(t.exDir, 'tests', 'fixtures', 'fleet-logs.json');
const logs = (t) => JSON.parse(fs.readFileSync(logsFile(t), 'utf8'));
const pick = (w) => ({ id: w.id, runs: w.runs, failed: w.failed, aic: w.aic, avg: w.avg, max: w.max, peakDay: w.peakDay, nearBudget: w.nearBudget, overDaily: w.overDaily });

function weeklyProblem(schedule) {
  const items = schedule == null ? [] : typeof schedule === 'string' ? [schedule] : (Array.isArray(schedule) ? schedule : [schedule]).map((s) => (typeof s === 'string' ? s : s?.cron));
  if (!items.length) return 'Add a weekly schedule, for example `schedule: weekly on monday`.';
  for (const item of items) {
    const v = String(item ?? '').trim();
    if (/^(weekly|bi-weekly|tri-weekly)\b/i.test(v) || /^every\s+(1\s*w|7\s*d|7 days|1 week)\b/i.test(v)) continue;
    const f = v.split(/\s+/);
    if (f.length === 5 && /^\d+$/.test(f[0]) && /^\d+$/.test(f[1]) && f[2] === '*' && f[4] !== '*') continue;
    return `"${v}" isn't once a week. A weekly report should run weekly: \`schedule: weekly on monday\`.`;
  }
  return null;
}

export default (t) => [
  // M1 · One shared configuration
  t.check('shared/fleet.md: a shared component with the network and the mention rule', async () => {
    const { data } = fm(t, SHARED);
    if (data.on !== undefined) return 'A shared file has no `on:`: with a trigger, gh aw would compile it as a workflow of its own.';
    if (!data.network) return '`shared/fleet.md` sets no `network` yet: put the fleet\'s firewall allow-list here, once.';
    const S = await simulator(t);
    if (S.firewall(data.network).includes('*')) return 'The shared `network` lets every agent reach any host (`*`).';
    if (data['safe-outputs']?.mentions !== false) return 'Set `mentions: false` under the shared `safe-outputs`: no agent in the fleet pings anyone.';
    const refused = REFUSED_IN_SHARED.filter((k) => data[k] !== undefined);
    if (data.concurrency && typeof data.concurrency === 'object') refused.push(...Object.keys(data.concurrency).filter((k) => !SHARED_CONCURRENCY.includes(k)).map((k) => `concurrency.${k}`));
    return !refused.length || `gh aw refuses these in a shared file (compile error): ${refused.join(', ')}. Set them in each workflow.`;
  }, { milestone: 'M1' }),
  t.check('All four workflows import it, and don\'t set again what it sets', () => {
    for (const { id, data } of fleet(t)) {
      if (!importsOf(data).includes(SHARED)) return `${id}.md doesn't import the shared configuration: add \`shared/fleet.md\` to its \`imports:\`.`;
      if (data.network !== undefined) return `${id}.md still sets its own \`network\`: let the shared file decide, in one place.`;
      if (data['safe-outputs']?.mentions !== undefined) return `${id}.md still sets its own \`mentions\`: the shared file decides that.`;
    }
    return true;
  }, { milestone: 'M1' }),

  // M2 · The weekly report
  t.check('The weekly report runs once a week, and by hand', () => {
    const on = fm(t, wf('weekly-report')).data.on ?? {};
    const problem = weeklyProblem(on.schedule);
    if (problem) return problem;
    return ('workflow_dispatch' in on) || 'Add `workflow_dispatch:` so a maintainer can run the report by hand (`gh aw run weekly-report`).';
  }, { milestone: 'M2' }),
  t.check('It reads issues and pull requests, and its only output is one issue', () => {
    const d = fm(t, wf('weekly-report')).data;
    const p = d.permissions;
    if (!readOnly(p) || typeof p !== 'object') return 'Read-only permissions for the agent: `contents`, `issues` and `pull-requests`, all `read`.';
    const miss = ['contents', 'issues', 'pull-requests'].filter((k) => p[k] !== 'read');
    if (miss.length) return `It needs \`${miss.join('`, `')}: read\`.`;
    const sets = d.tools?.github ? d.tools.github.toolsets ?? ['default'] : [];
    if (!sets.some((s) => ['default', 'all'].includes(s)) && !(sets.includes('issues') && sets.includes('pull_requests'))) return 'Give it the GitHub tool with the `issues` and `pull_requests` toolsets.';
    const so = d['safe-outputs'] ?? {};
    const extra = Object.keys(so).filter((k) => k !== 'create-issue' && !GLOBAL_SAFE_OUTPUT_KEYS.includes(k));
    if (extra.length) return `A report writes one issue and nothing else. Remove: ${extra.join(', ')}.`;
    const ci = so['create-issue'];
    if (!ci || typeof ci !== 'object') return 'Add `create-issue` under safe-outputs, with a `title-prefix` and `max: 1`.';
    if (!String(ci['title-prefix'] ?? '').trim()) return 'Give the report a `title-prefix` (for example `"[weekly] "`), so people and filters can find it.';
    if (ci.max !== 1) return 'One report per run: `max: 1`.';
    return (ci['close-older-issues'] === true || Number(ci.expires) > 0) || 'Old reports pile up: set `close-older-issues: true` (or `expires`).';
  }, { milestone: 'M2' }),
  t.check('Its instructions: the week\'s issues, pull requests and bots, and noop when it was empty', () => {
    const { body } = fm(t, wf('weekly-report'));
    const missing = [[/week/i, 'the week it covers'], [/issue/i, 'issues'], [/pull request|\bPRs?\b/i, 'pull requests'], [/bot|triage|review|assistant/i, 'what the bots did'], [/noop/, 'call `noop` when the week was empty']]
      .filter(([re]) => !re.test(body)).map(([, what]) => what);
    return !missing.length || `The instructions don't mention: ${missing.join('; ')}.`;
  }, { milestone: 'M2' }),

  // M3 · Budgets and limits per workflow
  t.check('Every workflow ends up with budgets, a turn limit and a timeout', () => {
    for (const { id, data: d } of fleet(t)) {
      const run = Number(effective(t, d, 'max-ai-credits'));
      const day = Number(effective(t, d, 'max-daily-ai-credits'));
      if (!(run > 0)) return `${id}.md has no \`max-ai-credits\` (its own, or a fleet default in the shared file).`;
      if (!(day > 0)) return `${id}.md has no \`max-daily-ai-credits\`: a cap on its runs over 24 hours.`;
      if (day < run) return `${id}.md: max-daily-ai-credits (${day}) is below max-ai-credits (${run}), so not even one run fits in a day.`;
      const turns = Number(effective(t, d, 'max-turns'));
      if (!(turns > 0 && turns <= 50)) return `${id}.md needs \`max-turns\` (50 or less), its own or the fleet's: the default, 500, lets a confused agent go round for a long time.`;
      const minutes = Number(d['timeout-minutes']);
      if (!(minutes > 0 && minutes <= 20)) return `${id}.md needs \`timeout-minutes\` (20 or less), in the workflow itself.`;
    }
    return true;
  }, { milestone: 'M3' }),
  t.check('Concurrency: a group per workflow, and a new push cancels an outdated review', () => {
    const groups = new Map();
    for (const { id, data: d } of fleet(t)) {
      const group = groupOf(d.concurrency) ?? groupOf(effective(t, d, 'concurrency'));
      if (!String(group ?? '').trim()) return `${id}.md needs a \`concurrency:\` group, so a burst of events queues instead of starting a crowd of agents.`;
      if (groups.has(group)) return `${id}.md and ${groups.get(group)}.md share the concurrency group "${group}": one would hold up the other${id === 'pr-review' || groups.get(group) === 'pr-review' ? ', and a new push would cancel the other\'s run' : ''}.`;
      groups.set(group, id);
      const cancel = d.concurrency?.['cancel-in-progress'] === true;
      if (id === 'pr-review' && !cancel) return 'pr-review.md: set `cancel-in-progress: true`. A review of an outdated push is wasted credits.';
      if (id !== 'pr-review' && cancel) return `${id}.md: don't cancel in progress here. A cancelled triage or report is lost work, not an outdated one.`;
    }
    return true;
  }, { milestone: 'M3' }),
  t.check(`The fleet fits its daily budget (${FLEET_DAILY.toLocaleString('en-US')} AI credits)`, () => {
    const rows = fleet(t).map(({ id, data }) => [id, Number(effective(t, data, 'max-daily-ai-credits')) || 0]);
    const total = rows.reduce((n, [, v]) => n + v, 0);
    return total <= FLEET_DAILY || `The daily budgets add up to ${total} (${rows.map(([id, v]) => `${id} ${v}`).join(', ')}); the fleet has ${FLEET_DAILY} a day.`;
  }, { milestone: 'M3' }),

  // M4 · When things go wrong
  t.check('Failures become issues, minus the transient ones', () => {
    const so = fm(t, SHARED).data['safe-outputs'] ?? {};
    const r = so['report-failure-as-issue'];
    if (r === false) return 'Don\'t switch failure reports off for the whole fleet: a failure nobody sees is the worst kind.';
    if (!Array.isArray(r) || !r.length) return 'Set `report-failure-as-issue` in the shared safe-outputs to a list of categories, so failures become issues but transient ones don\'t.';
    if (!r.map(String).some((c) => TRANSIENT.includes(c.trim()))) return `Exclude at least one transient category (${TRANSIENT.join(', ')}): a flaky AI endpoint shouldn't open an issue every time.`;
    const off = fleet(t).find(({ data }) => data['safe-outputs']?.['report-failure-as-issue'] !== undefined);
    return !off || `${off.id}.md overrides the fleet's failure reports: let the shared file decide.`;
  }, { milestone: 'M4' }),
  t.check('The fleet rules: untrusted text is data, and noop when there\'s nothing to do', () => {
    const { body } = fm(t, SHARED);
    if (!/noop/.test(body)) return 'Tell every agent to call `noop` when there is nothing to do: a run that ends without any safe output fails.';
    return /untrusted|never follow|not instructions/i.test(body) || 'Add the rule every agent needs: text from outside the project is untrusted data, never instructions.';
  }, { milestone: 'M4' }),

  // M5 · The cost report
  t.check('costReport() adds up the recorded runs', async () => {
    const { costReport } = await t.import(COST);
    const want = refCostReport(logs(t), FIXED_BUDGETS);
    let got;
    try { got = costReport(logs(t), FIXED_BUDGETS); } catch (e) { return `costReport() crashed: ${e.message}`; }
    for (const k of ['runs', 'failed', 'aic']) if (got?.[k] !== want[k]) return t.fail(`The total "${k}" is off.`, { expected: want[k], actual: got?.[k] });
    const ids = (got.workflows ?? []).map((w) => w.id);
    if (ids.join() !== want.workflows.map((w) => w.id).join()) return t.fail('The workflows aren\'t all there, or not sorted by AI credits (most first).', { expected: want.workflows.map((w) => w.id), actual: ids });
    for (const [i, w] of want.workflows.entries()) {
      const a = pick(got.workflows[i]);
      const e = pick(w);
      const diff = Object.keys(e).filter((k) => a[k] !== e[k]);
      if (diff.length) return t.fail(`${w.id}: ${diff.join(', ')} ${diff.length > 1 ? 'are' : 'is'} off.`, { expected: e, actual: a });
    }
    const fails = (got.failures ?? []).map((f) => f.run_id);
    if (fails.join() !== want.failures.map((f) => f.run_id).join()) return t.fail('The failed runs (failure or timed_out, oldest first) don\'t match.', { expected: want.failures.map((f) => f.run_id), actual: fails });
    const empty = costReport({ runs: [] }, {});
    return (empty.runs === 0 && empty.aic === 0 && (empty.workflows ?? []).length === 0) || 'With no runs, the report should be all zeros and no workflows.';
  }, { milestone: 'M5' }),
  t.check('The CLI prints the report with your fleet\'s budgets', () => {
    const r = t.node([COST, logsFile(t)]);
    if (r.code !== 0) return `\`node ${COST} <logs.json>\` exited with ${r.code}: ${r.all.trim().split('\n').slice(-2).join(' ')}`;
    const budgets = Object.fromEntries(fleet(t).map(({ id, data }) => [id, { run: Number(effective(t, data, 'max-ai-credits')) || null, daily: Number(effective(t, data, 'max-daily-ai-credits')) || null }]));
    const want = refCostReport(logs(t), budgets);
    const rows = tableRows(r.stdout);
    for (const w of want.workflows) {
      const row = rows.find((cells) => cells[0].replace(/`/g, '') === w.id);
      if (!row) return `The table has no row for ${w.id}.`;
      const n = row.slice(1).map((c) => Number(c.replace(/[^\d.]/g, '')));
      const exp = [w.runs, w.failed, w.aic, w.avg, w.max, w.budget.run, w.peakDay, w.budget.daily];
      const off = exp.findIndex((v, i) => n[i] !== v);
      if (off >= 0) return t.fail(`The row for ${w.id} is off in column ${off + 2}. Columns: Workflow, Runs, Failed, AI credits, Avg/run, Max run, Run budget, Peak day, Daily budget.`, { expected: exp, actual: n.slice(0, 8) });
    }
    const total = r.stdout.match(/Total:?\**\s*(\d+)\s*runs?\s*·\s*(\d+)\s*failed\s*·\s*([\d.]+)\s*AI credits/i);
    if (!total || Number(total[1]) !== want.runs || Number(total[2]) !== want.failed || Number(total[3]) !== want.aic) return t.fail('The total line is missing or off.', { expected: `**Total:** ${want.runs} runs · ${want.failed} failed · ${want.aic} AI credits`, actual: total?.[0] ?? null });
    const lines = r.stdout.split('\n');
    for (const w of want.workflows) {
      if (w.nearBudget && !lines.some((l) => l.includes('⚠️') && l.includes(w.id) && l.includes('80%'))) return `No warning line for ${w.id}: ${w.nearBudget} run(s) used 80% or more of the run budget.`;
      if (w.overDaily && !lines.some((l) => l.includes('⚠️') && l.includes(w.id) && /daily/i.test(l))) return `No warning line for ${w.id}: its busiest day (${w.peakDay}) is over the daily budget (${w.budget.daily}).`;
    }
    const missed = want.failures.filter((f) => !lines.some((l) => l.includes('❌') && l.includes(String(f.run_id))));
    if (missed.length) return `No ❌ line for the failed run(s): ${missed.map((f) => f.run_id).join(', ')}.`;
    const none = t.node([COST, 'no-such-logs.json']);
    return (none.code === 1 && /not found|no such|missing|doesn.t exist/i.test(none.all)) || 'With a file that doesn\'t exist, the CLI should say so and exit 1.';
  }, { milestone: 'M5' }),

  // M6 · The runbook
  t.check('RUNBOOK.md: an owner, and a budget table that matches the workflows', () => {
    const s = t.need(RUNBOOK, 'RUNBOOK.md is missing: it comes with the starter.');
    if (/TODO/.test(s)) return 'RUNBOOK.md still has TODOs: finish every section.';
    const owner = s.match(/\bowner\b[*:\s]*([^\n]+)/i)?.[1]?.replace(/[*_`]/g, '').trim();
    if (!owner) return 'Name an owner: `**Owner:** @your-handle (and a backup)`.';
    const rows = tableRows(s);
    for (const { id, data } of fleet(t)) {
      const row = rows.find((cells) => cells.some((c) => c.replace(/`/g, '').includes(id)));
      if (!row) return `The budget table has no row for ${id}.`;
      const nums = row.join(' ').replace(/,/g, '').match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
      const need = [['max-ai-credits', effective(t, data, 'max-ai-credits')], ['max-daily-ai-credits', effective(t, data, 'max-daily-ai-credits')]];
      const wrong = need.filter(([, v]) => !nums.includes(Number(v)));
      if (wrong.length) return `The row for ${id} doesn't match its frontmatter: ${wrong.map(([k, v]) => `${k} is ${v}`).join(', ')}.`;
    }
    return true;
  }, { milestone: 'M6' }),
  t.check('RUNBOOK.md: what to do when a run fails, the budget runs out, or a hostile issue gets through', () => {
    const s = t.need(RUNBOOK);
    const heads = (s.match(/^#{2,3}\s+.+$/gm) ?? []).join('\n');
    const sections = [[/fail/i, 'a failed run'], [/budget|credit/i, 'the budget alarm'], [/hostile|injection|attack/i, 'a hostile issue that got through']].filter(([re]) => !re.test(heads)).map(([, w]) => w);
    if (sections.length) return `Add a section for: ${sections.join(', ')}.`;
    const cmds = ['gh aw logs', 'gh aw disable', 'gh aw compile'].filter((c) => !s.includes(c));
    return !cmds.length || `Say which command to run when: ${cmds.map((c) => `\`${c}\``).join(', ')} ${cmds.length > 1 ? "aren't" : "isn't"} in the runbook yet.`;
  }, { milestone: 'M6' }),

  t.check('gh aw compile --strict compiles the whole fleet', () => compileAll(t, FLEET), { needs: ['gh-aw'], optional: true, env: true, timeout: 200000 }),
];
