// Free checks for Lab 05 · hard+: policy as code.
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { GUARD, shell, ps, tool, expectDecisions, hookConfig } from './helpers.mjs';
import { ghp, aws, key } from './secrets.mjs';

const ENGINE = '.github/hooks/scripts/engine.mjs';
const POLICY = '.github/hooks/policies/repo.json';
const SUITE = '.github/hooks/scripts/guard.test.mjs';
const SEVERITY = ['low', 'medium', 'high', 'critical'];
const fixture = (t, name) => JSON.parse(fs.readFileSync(path.join(t.exDir, 'tests', 'fixtures', name), 'utf8'));
const call = ([toolName, command]) => (toolName === 'powershell' ? ps(command) : shell(command));

/** The checks' own reading of the policy format (independent of your validatePolicy). */
function schemaProblems(p) {
  if (!p || typeof p !== 'object' || p.version !== 1) return ['policies/repo.json needs "version": 1.'];
  if (!['allow', 'deny'].includes(p.default)) return ['policies/repo.json needs "default": "allow" or "deny".'];
  if (!Array.isArray(p.rules)) return ['policies/repo.json needs a "rules" list.'];
  for (const r of p.rules) {
    const at = `Rule ${r?.id ?? '(no id)'}`;
    if (!/^[a-z0-9-]+$/.test(String(r?.id ?? ''))) return [`${at}: "id" must be lowercase letters, digits and dashes.`];
    if (!['allow', 'deny'].includes(r.decision)) return [`${at}: "decision" must be "allow" or "deny".`];
    if (r.decision === 'deny' && (!String(r.reason ?? '').trim() || !SEVERITY.includes(r.severity))) return [`${at}: a deny rule needs a "reason" and a "severity" (${SEVERITY.join(', ')}).`];
    const keys = Object.keys(r.match ?? {});
    if (!keys.length || keys.some((k) => !['tool', 'command', 'commandLine', 'path', 'text'].includes(k))) return [`${at}: "match" uses tool, command, commandLine, path or text (and at least one).`];
    for (const k of ['command', 'commandLine', 'path', 'text']) {
      if (r.match[k] === undefined) continue;
      try { new RegExp(r.match[k], 'i'); } catch (e) { return [`${at}: ${k} is not a valid regex (${e.message}).`]; }
    }
  }
  return [];
}

/** Run the guard of a copy of your folder whose policies/repo.json was changed by `edit`. */
function guardWithPolicy(t, edit, payload, opts = {}) {
  const copy = t.copy(t.tmp());
  edit(path.join(copy, POLICY));
  const started = Date.now();
  const r = t.hook(path.join(copy, GUARD), payload, { cwd: copy, ...opts });
  return { ...r, ms: Date.now() - started, copy };
}
const addRule = (rule) => (file) => {
  const p = JSON.parse(fs.readFileSync(file, 'utf8'));
  p.rules.push(rule);
  fs.writeFileSync(file, JSON.stringify(p, null, 2));
};

const OLD_DENY = [
  shell('npm install lodash'), shell('npm pkg set dependencies.lodash=4'), shell('echo {} > package.json'),
  tool('edit', { path: 'package.json', old_str: '"private": true', new_str: '"private": false' }),
  tool('view', { path: '.env' }), shell('cat .env'),
  tool('edit', { path: '.github/hooks/guardrails.json', old_str: '10', new_str: '1' }), shell('rm .github/hooks/guardrails.json'),
  tool('create', { path: 'config.js', file_text: `export const token = '${ghp}';` }), tool('create', { path: 'id_rsa', file_text: key }), shell(`echo ${aws} > key.txt`),
];
const OLD_ALLOW = [
  shell('npm install'), shell('npm test'), tool('view', { path: '.env.example' }), tool('view', { path: '.github/hooks/guardrails.json' }),
  tool('view', { path: 'README.md' }), tool('create', { path: 'config.js', file_text: 'export const token = process.env.GITHUB_TOKEN;' }),
];

export default (t) => [
  // M1 · The policy file
  t.check('validatePolicy() finds what is wrong with 7 broken policies, and accepts a good one', async () => {
    const { validatePolicy } = await t.import(ENGINE);
    const { valid, broken } = fixture(t, 'policies.json');
    const fine = validatePolicy(valid);
    if (!Array.isArray(fine)) return 'validatePolicy() must return a list of problems ([] when the policy is fine).';
    if (fine.length) return `A valid policy got a problem: ${fine[0]}`;
    const missed = broken.filter(([, p]) => !(validatePolicy(p) ?? []).length).map(([name]) => name);
    return !missed.length || `validatePolicy() found nothing wrong with: ${missed.join('; ')}.`;
  }, { milestone: 'M1' }),
  t.check('policies/repo.json is valid and carries every rule of the old guard', async () => {
    const p = t.json(POLICY);
    const own = schemaProblems(p);
    if (own.length) return own[0];
    const { validatePolicy } = await t.import(ENGINE);
    const yours = validatePolicy(p) ?? [];
    if (yours.length) return `Your validatePolicy() says: ${yours[0]}`;
    const denies = p.rules.filter((r) => r.decision === 'deny').length;
    return denies >= 8 || `policies/repo.json has ${denies} deny rule(s). Port every rule of the old guard: rm -rf; dependencies (npm/yarn/pnpm, and package.json from tools and from the shell); .env; .github/hooks (tools and shell); and the five kinds of secret.`;
  }, { milestone: 'M1' }),

  // M2 · The engine
  t.check('evaluate(): deny wins, the highest severity decides, the default applies', async () => {
    const { evaluate, normalize } = await t.import(ENGINE);
    const policy = { version: 1, default: 'allow', rules: [
      { id: 'allow-npm', decision: 'allow', match: { tool: 'shell', command: '^npm\\b' } },
      { id: 'npm-install-low', decision: 'deny', severity: 'low', reason: 'A low-severity reason.', match: { tool: 'shell', command: '^npm install\\b' } },
      { id: 'npm-install-high', decision: 'deny', severity: 'high', reason: 'Not npm install here: ask the human.', match: { tool: 'shell', commandLine: 'install' } },
    ] };
    const a = evaluate(policy, normalize('bash', { command: 'npm install lodash' }));
    if (a?.decision !== 'deny') return `An allow rule and two deny rules match "npm install lodash": deny must win. Got ${JSON.stringify(a)?.slice(0, 140)}`;
    if (a.rule !== 'npm-install-high' || a.severity !== 'high' || !/ask the human/.test(a.reason ?? '')) return `Of two matching deny rules, the higher severity decides, and the result names it with its reason: expected npm-install-high (high), got ${a.rule} (${a.severity}).`;
    const b = evaluate(policy, normalize('bash', { command: 'npm test' }));
    if (b?.decision !== 'allow' || b.rule !== 'allow-npm') return `"npm test" matches only allow-npm: expected { decision: "allow", rule: "allow-npm" }, got ${JSON.stringify(b)?.slice(0, 140)}`;
    const c = evaluate({ ...policy, default: 'deny' }, normalize('view', { path: 'README.md' }));
    if (c?.decision !== 'deny' || c.rule !== null) return `With "default": "deny", a call that no rule matches is denied (rule: null). Got ${JSON.stringify(c)?.slice(0, 140)}`;
    const d = evaluate(policy, normalize('view', { path: 'README.md' }));
    return (d?.decision === 'allow' && d.rule === null) || `With "default": "allow", a call that no rule matches is allowed (rule: null). Got ${JSON.stringify(d)?.slice(0, 140)}`;
  }, { milestone: 'M2' }),
  t.check('The old rules still hold: dependencies, .env, the hooks, secrets', () => expectDecisions(t, OLD_DENY, OLD_ALLOW), { milestone: 'M2' }),
  t.check('The rules live in policies/repo.json, and the log names the rule that decided', () => {
    const r = guardWithPolicy(t, addRule({ id: 'no-echo-check', decision: 'deny', severity: 'low', reason: 'No echo in this test: the check added this rule.', match: { tool: 'shell', command: '^echo\\b' } }), shell('echo hi'));
    if (r.decision !== 'deny') return 'A rule added to policies/repo.json (deny `echo`) did not change what the guard decides: the guard must read its rules from .github/hooks/policies/repo.json.';
    if (!/the check added this rule/.test(r.reason)) return `Deny with the rule's own reason (got "${r.reason}").`;
    const file = path.join(r.copy, '.agent-logs', 'guard.jsonl');
    return (fs.existsSync(file) && /"rule":"no-echo-check"/.test(fs.readFileSync(file, 'utf8'))) || 'Log the rule that decided ("rule": "<id>") in .agent-logs/guard.jsonl.';
  }, { milestone: 'M2' }),

  // M3 · One command, many spellings
  t.check('Every spelling of a recursive force-delete is denied; look-alikes are allowed', () => {
    const { deny, allow } = fixture(t, 'spellings.json');
    return expectDecisions(t, deny.map(call), allow.map(call));
  }, { timeout: 120000, milestone: 'M3' }),
  t.check('normalize() turns them into one canonical form', async () => {
    const { normalize } = await t.import(ENGINE);
    const cases = [
      ['powershell', 'rm -r -fo build', 'delete --force --recursive build'],
      ['bash', 'sudo -E bash -c "rm -Rf build"', 'delete --force --recursive build'],
      ['bash', 'cmd /c "rd /s /q build"', 'delete --force --recursive build'],
      ['powershell', 'Remove-Item build -Recurse', 'delete --force --recursive build'],
      ['bash', 'rm -r empty-folder', 'delete --recursive empty-folder'],
      ['bash', 'npm install lodash', 'npm install lodash'],
    ];
    for (const [toolName, command, want] of cases) {
      const got = normalize(toolName, { command })?.commands?.[0]?.line;
      if (got !== want) return `normalize("${toolName}", "${command}") gives "${got}"; expected "${want}".`;
    }
    return true;
  }, { milestone: 'M3' }),
  t.check('Your hard-level suite still passes on the new guard', () => {
    if (!t.exists(SUITE)) return `${SUITE} is gone: it is your safety net from the hard level.`;
    const r = t.unitTests({ files: [SUITE] });
    return (r.total > 0 && r.fail === 0) || `node --test ${SUITE}: ${r.fail} of ${r.total} failing. ${r.failing.slice(0, 2).join(' | ')} (keep decide(toolName, args) returning a reason or null).`;
  }, { timeout: 120000, milestone: 'M3' }),

  // M4 · Fail closed, fast
  t.check('A missing or broken policy blocks every call, and says why', () => {
    const cases = [
      ['broken JSON', (f) => fs.writeFileSync(f, '{ "version": 1, "rules": [')],
      ['an invalid policy', (f) => fs.writeFileSync(f, JSON.stringify({ version: 1, default: 'allow', rules: [{ id: 'x', decision: 'deny', match: {} }] }))],
      ['no policy file', (f) => fs.rmSync(f)],
    ];
    for (const [what, edit] of cases) {
      const r = guardWithPolicy(t, edit, shell('ls'));
      if (r.decision !== 'deny') return `With ${what}, the guard allowed "ls". Fail closed: no usable policy, no calls.`;
      if (!/polic/i.test(r.reason)) return `With ${what}, say that the policy is the problem (got "${r.reason}").`;
    }
    return true;
  }, { timeout: 60000, milestone: 'M4' }),
  t.check('A policy that hangs is cut off: denied within 5 seconds', () => {
    const r = guardWithPolicy(t, addRule({ id: 'slow-on-purpose', decision: 'deny', severity: 'low', reason: 'Slow on purpose.', match: { text: '(a+)+$' } }), shell(`echo ${'a'.repeat(34)}!`), { timeout: 20000 });
    if (r.code === null) return 'The guard was still thinking after 20 s. Copilot would let the call through when its hook timeout passes (timeouts fail open), so give the guard its own deadline.';
    if (r.decision !== 'deny' || r.ms > 5000) return `A rule with a catastrophic regex made the guard ${r.decision} after ${r.ms} ms. Decide in a worker, and deny when your own deadline passes.`;
    return /time|deadline|\bms\b|second/i.test(r.reason) || `Say that the guard ran out of time (got "${r.reason}").`;
  }, { timeout: 60000, milestone: 'M4' }),
  t.check("The guard's deadline ends well before the hook's timeout", async () => {
    const { DEADLINE_MS } = await t.import(GUARD);
    if (!(Number(DEADLINE_MS) > 0)) return 'Export DEADLINE_MS from guard.mjs: how long the guard may think before it denies.';
    const entry = (hookConfig(t).preToolUse ?? []).find((e) => /guard\.mjs/.test(`${e.bash} ${e.powershell}`));
    const sec = Number(entry?.timeoutSec ?? entry?.timeout ?? 30);
    return DEADLINE_MS + 1000 <= sec * 1000 || `The guard's deadline (${DEADLINE_MS} ms) must end at least a second before the hook's timeoutSec (${sec} s).`;
  }, { milestone: 'M4' }),
  t.check('evaluate() stays under 50 ms a call', async () => {
    const { normalize, evaluate } = await t.import(ENGINE);
    const policy = t.json(POLICY);
    const rows = [fixture(t, 'spellings.json'), fixture(t, 'injection.json')].flatMap((f) => [...f.deny, ...f.allow]);
    const calls = rows.map(([toolName, command]) => normalize(toolName, { command }));
    for (const c of calls) evaluate(policy, c);
    const times = [];
    for (let round = 0; round < 10; round++) for (const c of calls) { const s = performance.now(); evaluate(policy, c); times.push(performance.now() - s); }
    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95)];
    return p95 < 50 || `evaluate() takes ${p95.toFixed(1)} ms for 95% of calls; keep it under 50 ms (compile each regex once).`;
  }, { milestone: 'M4' }),

  // M5 · Calls an injection would make
  t.check('Calls a prompt injection would make are denied as critical; normal network calls are not', async () => {
    const { normalize, evaluate } = await t.import(ENGINE);
    const policy = t.json(POLICY);
    const { deny, allow } = fixture(t, 'injection.json');
    const open = deny.filter(([toolName, command]) => { const d = evaluate(policy, normalize(toolName, { command })); return d?.decision !== 'deny' || d.severity !== 'critical'; }).map(([, c]) => c);
    if (open.length) return `Deny these with severity "critical": ${open.slice(0, 3).join(' · ')}${open.length > 3 ? ` (and ${open.length - 3} more)` : ''}`;
    const blocked = allow.filter(([toolName, command]) => evaluate(policy, normalize(toolName, { command }))?.decision !== 'allow').map(([, c]) => c);
    return !blocked.length || `These are normal network calls; allow them: ${blocked.join(' · ')}`;
  }, { milestone: 'M5' }),
  t.check('The guard blocks them too', () => {
    const { deny, allow } = fixture(t, 'injection.json');
    return expectDecisions(t, [deny[0], deny[4], deny[8]].map(call), [allow[1], allow[2]].map(call));
  }, { milestone: 'M5' }),
];
