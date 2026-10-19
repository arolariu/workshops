// Free checks for Lab 05 · hard.
import fs from 'node:fs';
import path from 'node:path';
import { GUARD, shell, tool, expectDecisions, hookConfig, runs } from './helpers.mjs';
import { ghp, pat, aws, key, sk } from './secrets.mjs';

// Accept both "--flag=value" and "--flag", "value" (two array items).
const VALUE_FLAGS = new Set(['-p', '--prompt', '--agent', '--allow-tool', '--deny-tool', '--max-ai-credits', '--output-format', '--model', '--plugin-dir']);
const norm = (args) => {
  const out = [];
  const list = Array.isArray(args) ? args.map(String) : [];
  for (let i = 0; i < list.length; i++) {
    if (VALUE_FLAGS.has(list[i]) && i + 1 < list.length) out.push(`${list[i]}=${list[++i]}`);
    else out.push(list[i]);
  }
  return out;
};
const flag = (args, name) => {
  const hit = norm(args).find((a) => a.startsWith(`${name}=`));
  return hit === undefined ? undefined : hit.slice(name.length + 1);
};

export default (t) => [
  t.check('The guard blocks secrets in writes and commands', () => expectDecisions(t,
    [tool('create', { path: 'config.js', file_text: `export const token = '${ghp}';` }), tool('edit', { path: 'grades.js', old_str: 'x', new_str: `const aws = "${aws}";` }), tool('create', { path: 'id_rsa', file_text: key }), shell(`echo ${pat} > token.txt`), tool('create', { path: 'ai.js', file_text: `const k = '${sk}';` })],
    [tool('create', { path: 'config.js', file_text: 'export const token = process.env.GITHUB_TOKEN;' }), tool('create', { path: 'notes.md', file_text: 'GitHub tokens start with ghp_ (never commit one).' }), shell('npm test')]), { milestone: 'M1' }),
  t.check("Denials don't repeat the secret", () => {
    const r = t.hook(GUARD, tool('create', { path: 'config.js', file_text: `token = '${ghp}'` }));
    if (r.decision !== 'deny') return 'The GitHub token is not blocked yet.';
    return !r.reason.includes(ghp) || 'The deny reason contains the token itself. Describe it ("a GitHub token"), never repeat it.';
  }, { milestone: 'M1' }),
  t.check('The guard log never contains a secret', () => {
    const r = t.hook(GUARD, tool('create', { path: 'config.js', file_text: `token = '${ghp}' and '${aws}'` }));
    const file = path.join(r.cwd, '.agent-logs', 'guard.jsonl');
    if (!fs.existsSync(file)) return 'The guard did not write its log.';
    const log = fs.readFileSync(file, 'utf8');
    return (!log.includes(ghp) && !log.includes(aws)) || 'guard.jsonl contains the secret. Redact before logging.';
  }, { milestone: 'M1' }),
  t.check('The audit log never contains a secret', () => {
    const r = t.hook('.github/hooks/scripts/audit.mjs', { toolName: 'bash', toolArgs: { command: `echo ${ghp}` }, toolResult: { resultType: 'denied' } });
    const file = path.join(r.cwd, '.agent-logs', 'audit.jsonl');
    if (!fs.existsSync(file)) return 'audit.mjs did not write its log.';
    return !fs.readFileSync(file, 'utf8').includes(ghp) || 'audit.jsonl contains the secret. Redact there too.';
  }, { milestone: 'M1' }),
  t.check('Tests run after every .js edit (postToolUse)', () => {
    if (!runs(hookConfig(t).postToolUse, 'run-tests-after-edit.mjs')) return 'Register `node .github/hooks/scripts/run-tests-after-edit.mjs` as a postToolUse hook.';
    const copy = t.copy(t.tmp());
    const script = t.path('.github/hooks/scripts/run-tests-after-edit.mjs');
    t.hook(script, { toolName: 'edit', toolArgs: { path: 'grades.js', old_str: 'a', new_str: 'b' }, toolResult: { resultType: 'success' } }, { cwd: copy, timeout: 120000 });
    t.hook(script, { toolName: 'edit', toolArgs: { path: 'README.md', old_str: 'a', new_str: 'b' }, toolResult: { resultType: 'success' } }, { cwd: copy, timeout: 120000 });
    const file = path.join(copy, '.agent-logs', 'tests.jsonl');
    if (!fs.existsSync(file)) return 'No .agent-logs/tests.jsonl after an edit to grades.js.';
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    if (lines.length !== 1) return `Expected exactly 1 line (README.md is not code), got ${lines.length}.`;
    return (lines[0].result === 'pass' && lines[0].file && typeof lines[0].pass === 'number') || `Expected { file, result: "pass", pass, fail }, got ${JSON.stringify(lines[0])}`;
  }, { timeout: 150000, milestone: 'M2' }),
  t.check('...and they report failures', () => {
    const copy = t.copy(t.tmp());
    fs.writeFileSync(path.join(copy, 'broken.test.js'), "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\ntest('fails on purpose', () => assert.equal(1, 2));\n");
    t.hook(t.path('.github/hooks/scripts/run-tests-after-edit.mjs'), { toolName: 'create', toolArgs: { path: 'broken.test.js', file_text: '...' }, toolResult: { resultType: 'success' } }, { cwd: copy, timeout: 120000 });
    const file = path.join(copy, '.agent-logs', 'tests.jsonl');
    if (!fs.existsSync(file)) return 'No log line after creating a test file.';
    const entry = JSON.parse(fs.readFileSync(file, 'utf8').trim().split('\n').pop());
    return (entry.result === 'fail' && entry.fail >= 1) || `A failing test should give result "fail", got ${JSON.stringify(entry)}`;
  }, { timeout: 150000, milestone: 'M2' }),
  t.check('leashArgs(): least privilege and a budget', async () => {
    const { leashArgs } = await t.import('scripts/leash.mjs');
    const a = leashArgs('TASK');
    if (!a.length) return 'leashArgs() returns nothing yet.';
    if (flag(a, '-p') !== 'TASK') return 'Pass the prompt with -p.';
    const cap = Number(flag(a, '--max-ai-credits'));
    if (!(cap >= 30 && cap <= 60)) return 'Add a credit cap between 30 and 60.';
    if (a.some((x) => /^--(allow-all|yolo|allow-all-tools)/.test(x))) return 'No --allow-all / --yolo on a leash!';
    const n = norm(a);
    if (n.some((x) => /^--allow-tool=shell(\(\))?$/.test(x))) return 'Do not allow every shell command.';
    if (!n.includes('--allow-tool=write')) return 'It needs to edit files: --allow-tool=write.';
    if (!n.some((x) => /^--allow-tool=shell\(npm/.test(x))) return 'It needs to run the tests: --allow-tool=shell(npm:*).';
    if (!n.includes('--deny-tool=shell(git push)')) return 'Deny git push: --deny-tool=shell(git push).';
    return n.some((x) => /^--deny-tool=shell\(rm(:\*)?\)$/.test(x)) || 'Deny rm: --deny-tool=shell(rm).';
  }, { milestone: 'M3' }),
];
