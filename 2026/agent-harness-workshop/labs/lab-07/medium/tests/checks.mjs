// Free checks for Lab 07 · medium: two kinds of change (frontmatter vs body), a schedule and a budget.
import { readOnly, compileStrict, scheduleProblem, tableRows, front } from './common.mjs';

const WF = '.github/workflows/issue-triage.md';
const fm = (t) => front(t, WF);

/** NOTES.md's change table: [{ text, change, part: 'frontmatter'|'body'|null, recompile: true|false|null }]. */
function changeRows(s) {
  return tableRows(s).map((cells) => {
    const rest = cells.slice(1).map((c) => c.replace(/[*_`]/g, '').trim());
    // The first cell that starts with the answer counts, so a "why" column that mentions the other part doesn't.
    const where = rest.map((c) => c.match(/^(?:(?:in )?the )?(front ?matter|body)\b/i)?.[1]).find(Boolean);
    const answer = rest.find((c) => /^(yes|no)\b/i.test(c));
    return {
      text: cells.join(' | '),
      change: cells[0],
      part: where ? (/front/i.test(where) ? 'frontmatter' : 'body') : null,
      recompile: answer ? /^yes/i.test(answer) : null,
    };
  });
}

export default (t) => [
  // M1 · A change in the body
  t.check('The instructions ask bug reporters for OS and Node.js version', () => {
    const { body } = fm(t);
    if (!/bug/i.test(body)) return 'Mention bug reports in the instructions.';
    if (!/operating system|\bOS\b/i.test(body)) return 'Ask for the operating system (OS).';
    return /node(\.js)?\b[^\n]*version|version[^\n]*node/i.test(body) || 'Ask for the Node.js version.';
  }, { milestone: 'M1' }),

  // M2 · A change in the frontmatter
  t.check('"good first issue" is an allowed label', () => {
    const allowed = fm(t).data['safe-outputs']?.['add-labels']?.allowed ?? [];
    return (Array.isArray(allowed) && allowed.includes('good first issue')) || 'Add "good first issue" to safe-outputs.add-labels.allowed (quote it in YAML).';
  }, { milestone: 'M2' }),
  t.check('The workflow is still safe', () => {
    const d = fm(t).data;
    if (!readOnly(d.permissions)) return 'The agent must stay read-only.';
    if (d['safe-outputs']?.['add-labels']?.max !== 1) return 'Keep add-labels.max at 1.';
    return d['safe-outputs']?.['add-comment']?.max === 1 || 'Keep add-comment.max at 1.';
  }, { milestone: 'M2' }),

  // M3 · A schedule and a budget
  t.check('New issues and a daily sweep trigger it', () => {
    const on = fm(t).data.on ?? {};
    const types = on.issues?.types ?? [];
    if (!(Array.isArray(types) && types.includes('opened'))) return 'Keep the trigger for new issues: on.issues.types must include "opened".';
    return scheduleProblem(on.schedule) ?? true;
  }, { milestone: 'M3' }),
  t.check('A scheduled run can label the issue it picks; comments stay on the triggering issue', () => {
    const so = fm(t).data['safe-outputs'] ?? {};
    if (String(so['add-labels']?.target ?? '') !== '*') return 'A scheduled run has no triggering issue, so add-labels can\'t reach the issue it picks yet: set `target: "*"` under add-labels.';
    const ct = so['add-comment']?.target;
    return (ct == null || ct === 'triggering') || 'Leave add-comment on the triggering issue (no `target`): the sweep labels, it doesn\'t comment on issues nobody asked it about.';
  }, { milestone: 'M3' }),
  t.check('The instructions say what to do on a schedule', () => {
    const { body } = fm(t);
    if (!/github\.event\.issue\.number/.test(body)) return 'Keep ${{ github.event.issue.number }} for the runs a new issue starts.';
    if (!/schedul/i.test(body)) return 'Tell the agent what to do on a scheduled run: there is no triggering issue then.';
    return /without (a |any )?labels?|no labels?|unlabel/i.test(body) || 'Say which issue a scheduled run picks: one without a label.';
  }, { milestone: 'M3' }),
  t.check('A daily budget that fits at least one run', () => {
    const d = fm(t).data;
    const run = Number(d['max-ai-credits']);
    const day = Number(d['max-daily-ai-credits']);
    const minutes = Number(d['timeout-minutes']);
    if (!(run > 0 && run <= 100)) return 'Keep `max-ai-credits` (100 or less).';
    if (!(minutes > 0 && minutes <= 15)) return 'Keep `timeout-minutes` (15 or less).';
    if (!(day > 0)) return 'Add `max-daily-ai-credits`: a cap on what this workflow may spend in 24 hours, across all its runs.';
    if (day < run) return `max-daily-ai-credits (${day}) is below max-ai-credits (${run}): not even one run fits in a day.`;
    return day <= 500 || `max-daily-ai-credits is ${day}: keep the daily cap at 500 or less.`;
  }, { milestone: 'M3' }),

  // M4 · Recompile only when you need to
  t.check('NOTES.md: one row per change, and only the frontmatter rows need a recompile', () => {
    const s = t.need('NOTES.md', 'Create NOTES.md with your change table.');
    const rows = changeRows(s).filter((r) => r.part || r.recompile != null);
    const unclear = rows.filter((r) => !r.part || r.recompile == null);
    if (unclear.length) return `This row needs "frontmatter" or "body", and "yes" or "no": ${unclear[0].text}`;
    if (rows.length < 4) return `NOTES.md has ${rows.length} change row(s). Add one row per change you made: at least the OS/Node.js question, "good first issue", the schedule and the daily budget.`;
    const wrong = rows.find((r) => (r.part === 'frontmatter') !== r.recompile);
    if (wrong) return `Check this row again: a ${wrong.part} change ${wrong.part === 'frontmatter' ? 'needs' : "doesn't need"} a recompile. "${wrong.change}"`;
    const missing = [[/\bOS\b|operating system|node/i, 'the OS/Node.js question'], [/good first issue/i, '"good first issue"'], [/schedul|cron|daily|weekly/i, 'the schedule'], [/budget|credit|max-daily/i, 'the daily budget']]
      .filter(([re]) => !rows.some((r) => re.test(r.change))).map(([, what]) => what);
    return !missing.length || `Your table has no row for: ${missing.join(', ')}.`;
  }, { milestone: 'M4' }),
  t.check('NOTES.md explains why', () => {
    const s = t.need('NOTES.md', 'Create NOTES.md with your explanation.');
    if (!/front ?matter/i.test(s) || !/\bbody\b|instructions/i.test(s)) return 'Talk about both parts: the frontmatter and the body.';
    if (!/compile/i.test(s) || !/\block\b|\.lock\.yml/i.test(s)) return 'Say what `gh aw compile` writes: the `.lock.yml`.';
    return /run[- ]?time|when (it|the workflow) runs|at run/i.test(s) || 'Say when the agent reads the body: at run time.';
  }, { milestone: 'M4' }),

  t.check('gh aw compile --strict accepts it', () => compileStrict(t, 'issue-triage'), { needs: ['gh-aw'], optional: true, env: true, timeout: 150000 }),
];
