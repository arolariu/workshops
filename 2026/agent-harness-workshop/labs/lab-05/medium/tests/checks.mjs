// Free checks for Lab 05 · medium: soft rules → hard rules, an audit trail and a report.
import fs from 'node:fs';
import path from 'node:path';
import { GUARD, shell, ps, tool, label, expectDecisions, hookConfig, runs } from './helpers.mjs';

const RM_DENY = [shell('rm -rf build'), shell('rm -fr build'), shell('rm -r -f build'), shell('cd build && rm -rf *'), ps('Remove-Item -Recurse -Force build')];
const RM_ALLOW = [shell('rm notes.txt'), shell('rm -r empty-folder'), shell('npm test'), shell('ls -la'), ps('Get-ChildItem'), tool('view', { path: 'README.md' })];

const DEPS_DENY = [
  shell('npm install lodash'), shell('npm i -D jest'), shell('npm add left-pad'), shell('yarn add chalk'), shell('pnpm add zod'),
  shell('cd src && npm install express --save'), shell('npm pkg set dependencies.lodash=4'), shell('echo {} > package.json'),
  ps("Set-Content package.json '{}'"),
  tool('edit', { path: 'package.json', old_str: '"private": true', new_str: '"private": true, "dependencies": { "lodash": "4" }' }),
  tool('create', { path: 'package.json', file_text: '{}' }),
];
const DEPS_ALLOW = [shell('npm install'), shell('npm ci'), shell('npm i'), shell('npm test'), shell('npm install --no-audit'), tool('view', { path: 'package.json' }), shell('cat package.json')];

const ENV_DENY = [tool('view', { path: '.env' }), shell('cat .env'), shell('cat config/.env.local'), ps('Get-Content .env'), tool('edit', { path: '.env', old_str: 'A=1', new_str: 'A=2' })];
const ENV_ALLOW = [tool('view', { path: '.env.example' }), shell('cat .env.example'), tool('edit', { path: 'grades.js', old_str: 'x', new_str: 'const home = process.env.HOME;' }), shell('echo $HOME')];
const HOOKS_DENY = [
  tool('edit', { path: '.github/hooks/guardrails.json', old_str: 'a', new_str: 'b' }), tool('create', { path: '.github/hooks/scripts/guard.mjs', file_text: '' }),
  shell('rm .github/hooks/guardrails.json'), shell('echo {} > .github/hooks/guardrails.json'), shell('mv .github/hooks/scripts/guard.mjs /tmp/'), ps('Remove-Item .github/hooks/guardrails.json'),
];
const HOOKS_ALLOW = [tool('view', { path: '.github/hooks/guardrails.json' }), shell('cat .github/hooks/guardrails.json'), shell('ls .github/hooks')];

// A denial is read by the model: it should say what to do instead, so the next try is a good one.
const INSTEAD = /instead|ask the human|use /i;
function explainsItself(t, calls) {
  const seen = calls.map((p) => ({ p, r: t.hook(GUARD, p) }));
  const open = seen.filter(({ r }) => r.decision !== 'deny');
  if (open.length) return `Block these first: ${open.map(({ p }) => label(p)).join(' · ')}`;
  const vague = seen.filter(({ r }) => r.reason.length < 30 || !INSTEAD.test(r.reason));
  return !vague.length || `Say what to do instead (or "ask the human") in these denials: ${vague.slice(0, 2).map(({ p, r }) => `${label(p)} → "${r.reason}"`).join(' · ')}`;
}
// The decisions first, then the reasons of a few denials.
const decidesAndExplains = (t, deny, allow, sample) => {
  const d = expectDecisions(t, deny, allow);
  return d === true ? explainsItself(t, sample) : d;
};

const SAMPLE = (t) => path.join(t.exDir, 'tests', 'fixtures', 'guard-sample.jsonl');
const auditLines = (cwd) => {
  const file = path.join(cwd, '.agent-logs', 'audit.jsonl');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean) : null;
};

export default (t) => [
  t.check('Still blocks rm -rf, still allows normal work', () => expectDecisions(t, RM_DENY, RM_ALLOW), { milestone: 'M1' }),
  t.check('No new dependencies: npm, yarn, pnpm, npm pkg set, and package.json from any tool', () => expectDecisions(t, DEPS_DENY, DEPS_ALLOW), { milestone: 'M1' }),
  t.check('Every denial says what to do instead', () => explainsItself(t, [DEPS_DENY[0], DEPS_DENY[7], DEPS_DENY[9], RM_DENY[0]]), { milestone: 'M1' }),
  t.check('.env is off-limits (but .env.example and process.env are fine)', () => decidesAndExplains(t, ENV_DENY, ENV_ALLOW, [ENV_DENY[0], ENV_DENY[1]]), { milestone: 'M2' }),
  t.check('The guardrails protect themselves (reading them is fine)', () => decidesAndExplains(t, HOOKS_DENY, HOOKS_ALLOW, [HOOKS_DENY[0], HOOKS_DENY[2]]), { milestone: 'M2' }),
  t.check('The audit hook runs after every call: postToolUse and postToolUseFailure', () => {
    const cfg = hookConfig(t);
    if (!runs(cfg.postToolUse, 'audit.mjs')) return 'Add a postToolUse entry that runs `node .github/hooks/scripts/audit.mjs` (bash and powershell).';
    return runs(cfg.postToolUseFailure, 'audit.mjs') || 'postToolUse only fires after a call succeeds. Register audit.mjs for postToolUseFailure too, so failed calls are logged.';
  }, { milestone: 'M3' }),
  t.check('audit.mjs appends one JSON line per call: tool, arguments and result', () => {
    const payload = { toolName: 'bash', toolArgs: { command: 'npm test' }, toolResult: { resultType: 'success', textResultForLlm: 'ok' } };
    const first = t.hook('.github/hooks/scripts/audit.mjs', payload);
    t.hook('.github/hooks/scripts/audit.mjs', payload, { cwd: first.cwd });
    const lines = auditLines(first.cwd);
    if (!lines) return 'audit.mjs did not write .agent-logs/audit.jsonl (relative to the working directory).';
    if (lines.length !== 2) return `Expected 2 lines after 2 calls (append, don't overwrite), got ${lines.length}.`;
    let entry;
    try { entry = JSON.parse(lines[0]); } catch { return 'Each line must be valid JSON.'; }
    const text = JSON.stringify(entry);
    return (/bash/.test(text) && /npm test/.test(text) && /success/.test(text)) || `Log the tool, its arguments and the result. Got: ${text.slice(0, 160)}`;
  }, { milestone: 'M3' }),
  t.check('A failed call is logged as a failure, with the error', () => {
    const cwd = t.tmp();
    t.hook('.github/hooks/scripts/audit.mjs', { raw: JSON.stringify({ sessionId: 's', timestamp: 1, cwd, toolName: 'bash', toolArgs: { command: 'npm test' }, error: 'Command exited with code 1' }) }, { cwd });
    const lines = auditLines(cwd);
    if (!lines) return 'A postToolUseFailure payload (it has `error` instead of `toolResult`) wrote nothing.';
    const entry = JSON.parse(lines[0]);
    return (entry.result === 'failure' && /exited with code 1/.test(JSON.stringify(entry))) || `Expected result "failure" and the error text, got ${JSON.stringify(entry).slice(0, 160)}`;
  }, { milestone: 'M3' }),
  t.check('audit.mjs never breaks the session', () => {
    const r = t.hook('.github/hooks/scripts/audit.mjs', { raw: 'garbage' });
    return (r.code === 0 && !r.stdout.trim()) || 'On bad input the audit hook must exit 0 and print nothing.';
  }, { milestone: 'M3' }),
  t.check('summarize() counts the calls per tool and lists every denial', async () => {
    const { summarize } = await t.import('scripts/audit-report.mjs');
    const s = summarize(fs.readFileSync(SAMPLE(t), 'utf8').split(/\r?\n/));
    if (s?.calls !== 9) return `summarize() counted ${s?.calls ?? 0} calls; the sample log has 9 (plus a broken line and a blank one).`;
    if (s.unreadable !== 1) return `The sample has 1 broken line: count it as unreadable (got ${s.unreadable}). Blank lines are not counted.`;
    const per = (s.perTool ?? []).map((x) => `${x.tool} ${x.calls}/${x.denied}`).join(', ');
    if (per !== 'bash 4/2, edit 2/1, view 2/0, powershell 1/0') return `perTool (calls/denied, most calls first, then by name) should be "bash 4/2, edit 2/1, view 2/0, powershell 1/0", got "${per}".`;
    const d = s.denials ?? [];
    return (d.length === 3 && /dependenc/i.test(d[0].reason) && d[1].tool === 'bash' && d[2].tool === 'edit' && d[2].at === '2026-10-01T09:00:07.000Z')
      || `Expected the 3 denials in log order with at, tool and reason, got ${JSON.stringify(d).slice(0, 200)}`;
  }, { milestone: 'M4' }),
  t.check('The report runs from the command line, and says when there is no log', () => {
    const cwd = t.tmp();
    fs.mkdirSync(path.join(cwd, '.agent-logs'));
    fs.copyFileSync(SAMPLE(t), path.join(cwd, '.agent-logs', 'guard.jsonl'));
    const r = t.node([t.path('scripts/audit-report.mjs')], { cwd });
    if (r.code !== 0) return `node scripts/audit-report.mjs failed: ${r.all.trim().slice(0, 200)}`;
    if (!/\|\s*bash\s*\|\s*4\s*\|\s*2\s*\|/.test(r.stdout)) return `The report needs a row like "| bash | 4 | 2 |". It printed: ${r.stdout.slice(0, 200)}`;
    if ((r.stdout.match(/^- .+ · .+ · .+$/gm) ?? []).length !== 3) return 'The report should list the 3 denials, one "- at · tool · reason" line each.';
    const none = t.node([t.path('scripts/audit-report.mjs'), 'nowhere.jsonl'], { cwd });
    return (none.code === 1 && /nowhere\.jsonl/.test(none.all)) || 'With a log file that does not exist, say so and exit 1.';
  }, { milestone: 'M4' }),
];
