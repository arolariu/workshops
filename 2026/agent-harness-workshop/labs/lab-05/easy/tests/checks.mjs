// Free checks for Lab 05 · easy: we feed fake tool calls to your hook, exactly like Copilot does.
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
  t.check('The hook config runs the guard before every tool call', () => {
    const hooks = hookConfig(t);
    return runs(hooks.preToolUse, 'guard.mjs') || 'preToolUse should run `node .github/hooks/scripts/guard.mjs` (with both "bash" and "powershell" keys).';
  }),
  t.check('It blocks every spelling of rm -rf', () => expectDecisions(t, RM_DENY, [])),
  t.check('It lets normal work through', () => expectDecisions(t, [], RM_ALLOW)),
  t.check('It explains why', () => {
    const r = t.hook(GUARD, shell('rm -rf build'));
    if (r.decision !== 'deny') return 'rm -rf is not blocked yet.';
    return r.reason.length >= 15 || 'Give a helpful permissionDecisionReason: the model reads it and adapts.';
  }),
  t.check('It survives odd input', () => {
    const garbage = t.hook(GUARD, { raw: 'this is not json' });
    if (garbage.code !== 0 || garbage.decision !== 'allow') return 'Garbage on stdin should not crash the guard (exit 0, print nothing).';
    const obj = t.hook(GUARD, { raw: JSON.stringify({ toolName: 'bash', toolArgs: { command: 'rm -rf build' } }) });
    return obj.decision === 'deny' || 'toolArgs can also arrive as an object (not a string). Still block rm -rf.';
  }),
  t.check('Decisions are logged', () => {
    const r = t.hook(GUARD, shell('rm -rf build'));
    const logFile = path.join(r.cwd, '.agent-logs', 'guard.jsonl');
    return (fs.existsSync(logFile) && /"decision":"deny"/.test(fs.readFileSync(logFile, 'utf8'))) || 'The guard should log its decisions to .agent-logs/guard.jsonl (the plumbing does this; did you change it?).';
  }),
];
