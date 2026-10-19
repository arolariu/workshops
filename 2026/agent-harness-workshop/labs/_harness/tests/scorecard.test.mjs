import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LAYERS, scanHarness, scorecard, maturity } from '../scorecard.mjs';
import { tmpdir, writeTree } from './helpers.mjs';

const AGENTS = '# AGENTS.md\n\n## Commands\n- `npm test`\n\n## Boundaries\n- Never add dependencies.\n\n## Definition of done\n- `npm test` is green.\n';
const SKILL = (name, description) => `---\nname: ${name}\ndescription: ${description}\n---\n1. Do it.\n`;
const GOOD_SKILL = SKILL('new-module', 'Create a StudyBuddy module the team way. Use when the user asks for a new module.');
const REVIEWER = (tools) => `---\nname: reviewer\ndescription: Reviews code and reports findings. Read-only.\ntools: ${tools}\n---\nReview.\n`;
const FIXER = "---\nname: fixer\ndescription: Fixes the findings of a code review.\ntools: ['read', 'edit', 'execute']\n---\nFix.\n";
const HOOKS = (entry) => JSON.stringify({ version: 1, hooks: { preToolUse: [entry] } });
const BOTH = { type: 'command', bash: 'node g.mjs', powershell: 'node g.mjs', timeoutSec: 10 };
const HARNESS_MD = '# HARNESS.md\n\nOwner: Ana (platform team)\n\n## Layers\n- instructions, skills\n\n## Threat model\n- prompt injection\n\n## Budget\n- 50 AI credits per run\n';

const run = (files, opts = {}) => {
  const dir = writeTree(tmpdir(), files);
  const scan = scanHarness(dir);
  const rules = scorecard(scan, opts);
  return { scan, rules, m: maturity(rules, scan), rule: (id) => rules.find((r) => r.id === id) };
};

test('the layers follow the labs, and an empty folder is L0 with a next step', () => {
  assert.deepEqual(LAYERS.map((l) => `${l.id}:${l.lab}:${l.level}`), ['instructions:lab-01:L1', 'skills:lab-02:L2', 'agents:lab-03:L3', 'mcp:lab-04:L2', 'hooks:lab-05:L4', 'distribution:lab-06:L5', 'workflows:lab-07:L5', 'governance:lab-08:L5']);
  const { m, rules } = run({ 'index.js': 'x' });
  assert.equal(m.level, 'L0');
  assert.equal(m.name, 'Bare');
  assert.match(m.next, /AGENTS\.md/);
  assert.ok(rules.every((r) => r.ok === null), 'nothing applies to a bare folder');
});

test('instructions: a short AGENTS.md with commands, boundaries and done is L1; a long one is not', () => {
  assert.equal(run({ 'AGENTS.md': AGENTS }).m.level, 'L1');
  const long = run({ 'AGENTS.md': AGENTS + 'x\n'.repeat(120) });
  assert.equal(long.rule('instructions-short').ok, false);
  assert.match(long.rule('instructions-short').message, /1\d\d lines/);
  assert.equal(long.m.level, 'L0');
  const vague = run({ 'AGENTS.md': '# Rules\nWrite clean code.\n' });
  assert.equal(vague.rule('instructions-cover').ok, false);
  assert.match(vague.rule('instructions-cover').message, /commands.*boundaries.*definition of done/);
});

test('skills: a good description reaches L2; a name that is not the folder name holds it back', () => {
  assert.equal(run({ 'AGENTS.md': AGENTS, '.github/skills/new-module/SKILL.md': GOOD_SKILL }).m.level, 'L2');
  const bad = run({ 'AGENTS.md': AGENTS, '.github/skills/new-module/SKILL.md': SKILL('modules', 'Create a StudyBuddy module the team way. Use when asked.') });
  assert.equal(bad.rule('skill-name').ok, false);
  assert.match(bad.rule('skill-name').message, /modules.*new-module/);
  assert.equal(bad.m.level, 'L1');
  const vague = run({ 'AGENTS.md': AGENTS, '.github/skills/x/SKILL.md': SKILL('x', 'Helps with modules.') });
  assert.equal(vague.rule('skill-description').ok, false);
});

test('agents: an explicit tool list reaches L3; a reviewer that can edit does not; a fixer may edit', () => {
  const base = { 'AGENTS.md': AGENTS, '.github/skills/new-module/SKILL.md': GOOD_SKILL };
  assert.equal(run({ ...base, '.github/agents/reviewer.agent.md': REVIEWER("['read', 'search']"), '.github/agents/fixer.agent.md': FIXER }).m.level, 'L3');
  const edits = run({ ...base, '.github/agents/reviewer.agent.md': REVIEWER('read, search, edit') });
  assert.equal(edits.rule('agent-readonly').ok, false);
  assert.match(edits.rule('agent-readonly').message, /reviewer.*edit/);
  const open = run({ ...base, '.github/agents/reviewer.agent.md': '---\nname: reviewer\ndescription: Reviews.\n---\nx\n' });
  assert.equal(open.rule('agent-tools').ok, false);
  assert.equal(open.m.level, 'L2');
});

test('MCP: tools are measured when given; a server that did not answer is "not measured", never a failure', () => {
  const files = { 'AGENTS.md': AGENTS, '.mcp.json': JSON.stringify({ mcpServers: { s: { type: 'stdio', command: 'node', args: ['s.mjs'] } } }) };
  assert.deepEqual(run(files).scan.mcp.servers.map((s) => s.name), ['s']);
  const notMeasured = run(files, { mcpTools: { s: { error: 'did not answer in 5s' } } });
  assert.equal(notMeasured.rule('mcp-described').ok, null);
  assert.match(notMeasured.rule('mcp-described').message, /not measured/);
  assert.equal(notMeasured.m.level, 'L2', 'an unmeasured server still counts as the layer being there');
  const tools = [
    { name: 'get_deadlines', description: 'Deadlines due soon', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
    { name: 'mark_done', description: 'Mark done', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
    { name: 'list_courses', inputSchema: { type: 'object' } },
  ];
  const measured = run(files, { mcpTools: { s: { tools } } });
  assert.equal(measured.rule('mcp-described').ok, false);
  assert.match(measured.rule('mcp-described').message, /list_courses/);
  assert.equal(measured.rule('mcp-readonly-hint').ok, false);
  assert.match(measured.rule('mcp-readonly-hint').message, /mark_done.*list_courses|list_courses.*mark_done/);
});

test('hooks: both shells and a timeout reach L4; a bash-only hook does not', () => {
  const base = { 'AGENTS.md': AGENTS, '.github/skills/new-module/SKILL.md': GOOD_SKILL, '.github/agents/reviewer.agent.md': REVIEWER("['read']") };
  assert.equal(run({ ...base, '.github/hooks/guard.json': HOOKS(BOTH) }).m.level, 'L4');
  const bashOnly = run({ ...base, '.github/hooks/guard.json': HOOKS({ type: 'command', bash: 'node g.mjs', timeoutSec: 5 }) });
  assert.equal(bashOnly.rule('hooks-both-shells').ok, false);
  assert.match(bashOnly.rule('hooks-both-shells').message, /powershell/);
});

test('L5 needs a pinned, shared harness and HARNESS.md; workflows are checked when they are there', () => {
  const l4 = { 'AGENTS.md': AGENTS, '.github/skills/new-module/SKILL.md': GOOD_SKILL, '.github/agents/reviewer.agent.md': REVIEWER("['read']"), '.github/hooks/guard.json': HOOKS(BOTH) };
  const pinned = 'name: x\ndependencies:\n  apm:\n    - microsoft/apm-sample-package#v1.0.0\n';
  assert.equal(run({ ...l4, 'apm.yml': pinned }).m.level, 'L4', 'no HARNESS.md yet');
  assert.match(run({ ...l4, 'apm.yml': pinned }).m.next, /HARNESS\.md/);
  assert.equal(run({ ...l4, 'apm.yml': pinned, 'HARNESS.md': HARNESS_MD }).m.level, 'L5');
  const unpinned = run({ ...l4, 'apm.yml': 'name: x\ndependencies:\n  apm:\n    - microsoft/apm-sample-package\n', 'HARNESS.md': HARNESS_MD });
  assert.equal(unpinned.rule('apm-pinned').ok, false);
  assert.equal(unpinned.m.level, 'L4');
  const writes = run({ ...l4, 'apm.yml': pinned, 'HARNESS.md': HARNESS_MD, '.github/workflows/t.md': '---\non: issues\npermissions:\n  issues: write\nsafe-outputs:\n  add-comment:\n    max: 1\ntimeout-minutes: 10\nmax-ai-credits: 50\n---\nGo.\n' });
  assert.equal(writes.rule('workflow-readonly').ok, false);
  assert.equal(writes.rule('workflow-safe-outputs').ok, true);
  assert.equal(writes.m.level, 'L4');
  const plugin = run({ 'p/plugin.json': JSON.stringify({ name: 'p', version: '1.0.0' }) });
  assert.equal(plugin.rule('plugin-manifest').ok, false);
  assert.match(plugin.rule('plugin-manifest').message, /description/);
});

test('broken files are reported as problems, never thrown', () => {
  const { scan, rules } = run({ '.mcp.json': '{ not json', '.github/hooks/h.json': '[', '.github/agents/a.agent.md': 'no frontmatter' });
  assert.equal(scan.problems.length, 2);
  assert.match(scan.problems.join(' '), /\.mcp\.json.*not valid JSON/);
  assert.equal(rules.find((r) => r.id === 'agent-tools').ok, false);
});
