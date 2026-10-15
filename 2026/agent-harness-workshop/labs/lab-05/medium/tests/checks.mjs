// Free checks for Lab 05 · medium.
import fs from 'node:fs';
import path from 'node:path';
import { GUARD, shell, ps, tool, expectDecisions, hookConfig, runs } from './helpers.mjs';

const RM_DENY = [
  shell('rm -rf build'),
  shell('rm -fr build'),
  shell('rm -r -f build'),
  shell('rm -Rf ./dist'),
  shell('rm --recursive --force tmp'),
  shell('cd build && rm -rf *'),
  shell('sudo rm -rf /'),
  ps('Remove-Item -Recurse -Force build'),
];
const RM_ALLOW = [
  shell('rm notes.txt'),
  shell('rm -f notes.txt'),
  shell('rm -r empty-folder'),
  shell('npm test'),
  shell('ls -la'),
  ps('Get-ChildItem'),
  tool('view', { path: 'README.md' }),
];

export default (t) => [
  t.check('Still blocks rm -rf, still allows normal work', () => expectDecisions(t, RM_DENY.slice(0, 4), RM_ALLOW.slice(3))),
  t.check('No new dependencies (npm, yarn, pnpm, package.json)', () => expectDecisions(t,
    [shell('npm install lodash'), shell('npm i -D jest'), shell('npm add left-pad'), shell('yarn add chalk'), shell('pnpm add zod'), shell('cd src && npm install express --save'), tool('edit', { path: 'package.json', old_str: '"private": true', new_str: '"private": true, "dependencies": { "lodash": "4" }' }), tool('create', { path: 'package.json', file_text: '{}' })],
    [shell('npm install'), shell('npm ci'), shell('npm i'), shell('npm test'), shell('npm install --no-audit'), tool('view', { path: 'package.json' })])),
  t.check('.env is off-limits (but .env.example and process.env are fine)', () => expectDecisions(t,
    [tool('view', { path: '.env' }), shell('cat .env'), shell('cat config/.env.local'), ps('Get-Content .env'), tool('edit', { path: '.env', old_str: 'A=1', new_str: 'A=2' })],
    [tool('view', { path: '.env.example' }), shell('cat .env.example'), tool('edit', { path: 'grades.js', old_str: 'x', new_str: 'const home = process.env.HOME;' }), shell('echo $HOME')])),
  t.check('The guardrails protect themselves', () => expectDecisions(t,
    [tool('edit', { path: '.github/hooks/guardrails.json', old_str: 'a', new_str: 'b' }), tool('create', { path: '.github/hooks/scripts/guard.mjs', file_text: '' }), shell('rm .github/hooks/guardrails.json'), shell('echo {} > .github/hooks/guardrails.json'), shell('mv .github/hooks/scripts/guard.mjs /tmp/'), ps('Remove-Item .github/hooks/guardrails.json')],
    [tool('view', { path: '.github/hooks/guardrails.json' }), shell('cat .github/hooks/guardrails.json'), shell('ls .github/hooks')])),
  t.check('The audit hook is registered as postToolUse', () => runs(hookConfig(t).postToolUse, 'audit.mjs') || 'Add a postToolUse entry that runs `node .github/hooks/scripts/audit.mjs` (bash and powershell).'),
  t.check('audit.mjs appends one JSON line per call', () => {
    const payload = { toolName: 'bash', toolArgs: { command: 'npm test' }, toolResult: { resultType: 'success', textResultForLlm: 'ok' } };
    const first = t.hook('.github/hooks/scripts/audit.mjs', payload);
    t.hook('.github/hooks/scripts/audit.mjs', payload, { cwd: first.cwd });
    const file = path.join(first.cwd, '.agent-logs', 'audit.jsonl');
    if (!fs.existsSync(file)) return 'audit.mjs did not write .agent-logs/audit.jsonl (relative to the working directory).';
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    if (lines.length !== 2) return `Expected 2 lines after 2 calls (append, don't overwrite), got ${lines.length}.`;
    let entry;
    try { entry = JSON.parse(lines[0]); } catch { return 'Each line must be valid JSON.'; }
    const text = JSON.stringify(entry);
    return (/bash/.test(text) && /npm test/.test(text) && /success/.test(text)) || `Log the tool, its arguments and the result. Got: ${text.slice(0, 160)}`;
  }),
  t.check('audit.mjs never breaks the session', () => {
    const r = t.hook('.github/hooks/scripts/audit.mjs', { raw: 'garbage' });
    return (r.code === 0 && !r.stdout.trim()) || 'On bad input the audit hook must exit 0 and print nothing.';
  }),
];
