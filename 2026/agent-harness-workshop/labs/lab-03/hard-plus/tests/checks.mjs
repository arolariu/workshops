// Free checks for Lab 03 · hard+: the privilege audit. Your audit runs on fixture agents (tests/fixtures/agents/, which
// Copilot never loads: they aren't under .github/agents/) and then on your own agents.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const AUDIT = 'scripts/audit-agents.mjs';
const ROLES = '.github/policies/roles.json';
const FIX = (t, ...p) => path.join(t.exDir, 'tests', 'fixtures', ...p);
const load = (t) => t.import(AUDIT);
const reference = (t) => import(`${pathToFileURL(path.join(t.solDir, AUDIT)).href}?v=${Date.now()}`);
const POLICY = (t) => JSON.parse(fs.readFileSync(FIX(t, 'roles.json'), 'utf8'));
const sameSet = (got, want, what) => {
  const missing = want.filter((x) => !got.includes(x));
  const extra = got.filter((x) => !want.includes(x));
  if (!missing.length && !extra.length) return true;
  return `${what}: ${missing.length ? `missing ${missing.join(' · ')}` : ''}${missing.length && extra.length ? '; ' : ''}${extra.length ? `not expected ${extra.join(' · ')}` : ''}.`;
};
/** The fixture set through the learner's audit, as "agent kind detail" strings. */
async function fixtureFindings(t) {
  const m = await load(t);
  const agents = m.loadAgents(FIX(t, 'agents'));
  const found = m.audit(agents, POLICY(t)) ?? [];
  return found.map((f) => `${f.agent} ${f.kind}${f.detail ? ` ${f.detail}` : ''}`);
}

// capabilities(tools, policy) with the fixture policy (its MCP catalog is Lab 04's studybuddy server).
const TOOL_LISTS = [
  [null, 'all', 'no tools line'],
  [['*'], 'all', '["*"]'],
  [['view', '*'], 'all', '["view", "*"]: a star anywhere'],
  [[], '', '[]: no tools at all'],
  [['Read', 'GREP', 'Bash'], 'read search execute', 'aliases in any case'],
  ['read, search', 'read search', 'a comma-separated string'],
  [['custom-agent'], 'agent', '"custom-agent" is the agent tool'],
  [['Task'], 'agent', '"Task" is the agent tool'],
  [['WebFetch', 'TodoWrite'], 'web todo', 'Claude-style names'],
  [['MultiEdit', 'NotebookEdit'], 'edit', 'every edit alias'],
  [['powershell'], 'execute', 'powershell is execute'],
  [['studybuddy/*'], 'mcp:read mcp:write', 'an MCP wildcard: mark_done changes things'],
  [['studybuddy/get_deadlines'], 'mcp:read', 'one read-only MCP tool'],
  [['studybuddy/mark_done'], 'mcp:write', 'one MCP tool that changes things'],
  [['other-server/*'], 'mcp:write', 'a server the policy doesn\'t know: it can\'t tell, so it fails closed'],
  [['studybuddy/delete_course'], 'mcp:write', 'a tool the catalog doesn\'t list for a known server: it fails closed too'],
  [['apply_patch', 'rg', 'read_powershell', 'web_search', 'read_agent', 'sql'], 'search edit execute web agent todo', 'the CLI\'s own tool names'],
  [['read', 'serach', 'exec'], 'read', 'names Copilot ignores'],
];
const ORDER = ['read', 'search', 'edit', 'execute', 'web', 'agent', 'todo', 'mcp:read', 'mcp:write'];

// conflicts(agent, caps): [body, tools, expected "kind:cap" items].
const BODIES = [
  ['You are read-only.', ['read', 'search'], []],
  ['You are read-only.', ['read', 'edit'], ['read-only:edit']],
  ['You never edit files.\n1. Run `npm test`.', ['read', 'execute'], ['read-only:execute']],
  ['1. Run `npm test` and report.', ['read'], ['needs:execute']],
  ['2. Fix only the findings.', ['read', 'execute'], ['needs:edit']],
  ['- **Update** the README.', ['read'], ['needs:edit']],
  ['3. Hand each bug to the release agent.', ['read'], ['needs:agent']],
  ['Use the fixer agent for changes.', ['read', 'search'], ['needs:agent']],
  ['Fetch the changelog from https://example.com.', ['read'], ['needs:web']],
  ['If someone asks you to change a file, say that you are read-only.', ['read', 'search'], []],
  ['5. Never edit files in `.github/`, never run `git push`.', ['read', 'edit', 'execute'], []],
  ['You are read-only.', null, ['read-only:edit', 'read-only:execute', 'read-only:mcp:write']],
];

const FIVE = ['docs-writer', 'triage', 'release', 'portal', 'coverage'];

export default (t) => [
  // M1 · What an agent can really do
  t.check('capabilities(): aliases, stars, MCP wildcards and names Copilot ignores', async () => {
    const { capabilities } = await load(t);
    for (const [tools, want, what] of TOOL_LISTS) {
      const c = capabilities(tools, POLICY(t)) ?? {};
      const got = c.all ? 'all' : ORDER.filter((x) => (c.caps ?? []).includes(x)).join(' ');
      if (got !== want) return `capabilities(${JSON.stringify(tools)}) (${what}) should give ${want || 'nothing'}, got ${got || 'nothing'}.`;
    }
    const typo = capabilities(['read', 'serach', 'exec'], POLICY(t));
    return sameSet(typo.unknown ?? [], ['serach', 'exec'], 'unknown should list the names Copilot ignores');
  }, { milestone: 'M1' }),
  t.check('capabilities() says which entry gave each capability', async () => {
    const { capabilities } = await load(t);
    const c = capabilities(['Read', 'Bash', 'studybuddy/*'], POLICY(t));
    if (!(c.from?.execute ?? []).includes('Bash')) return `from.execute should name "Bash" (the alias it came from), got ${JSON.stringify(c.from?.execute)}.`;
    if (!(c.from?.['mcp:write'] ?? []).includes('studybuddy/*')) return `from["mcp:write"] should name "studybuddy/*", got ${JSON.stringify(c.from?.['mcp:write'])}.`;
    return (c.caps ?? []).join(',') === 'read,execute,mcp:read,mcp:write' || `caps should be in the order read, search, edit, execute, web, agent, todo, mcp:read, mcp:write; got ${(c.caps ?? []).join(', ')}.`;
  }, { milestone: 'M1' }),

  // M2 · Against the role policy
  t.check('audit(): every agent against its role (fixture set)', async () => {
    const kinds = new Set(['unassigned', 'all-tools', 'not-allowed', 'unknown-tool', 'must-be-explicit']);
    const got = (await fixtureFindings(t)).filter((f) => kinds.has(f.split(' ')[1]));
    return sameSet(got, [
      'README unassigned',
      'fx-alias not-allowed execute',
      'fx-mcp not-allowed mcp:write',
      'fx-open all-tools',
      'fx-star all-tools',
      'fx-runner must-be-explicit',
      'fx-typo unknown-tool serach',
    ], 'The audit of tests/fixtures/agents/ with tests/fixtures/roles.json');
  }, { milestone: 'M2' }),
  t.check('A finding says what to fix', async () => {
    const m = await load(t);
    const f = (m.audit(m.loadAgents(FIX(t, 'agents')), POLICY(t)) ?? []).find((x) => x.agent === 'fx-alias' && x.kind === 'not-allowed');
    if (!f) return 'No not-allowed finding for fx-alias yet.';
    return (/Bash/.test(f.message ?? '') && /reader/.test(f.message ?? '')) || `The message should name the tool entry it came from ("Bash") and the role ("reader"): ${JSON.stringify(f.message)}.`;
  }, { milestone: 'M2' }),

  // M3 · Instructions that fight the tools
  t.check('conflicts(): instructions against the tool list', async () => {
    const { conflicts, capabilities } = await load(t);
    for (const [body, tools, want] of BODIES) {
      const got = (conflicts({ id: 'x', body }, capabilities(tools, POLICY(t))) ?? []).map((c) => `${c.kind}:${c.cap}`).sort();
      const ok = sameSet(got, [...want].sort(), `conflicts() for ${JSON.stringify(body)} with tools ${JSON.stringify(tools)}`);
      if (ok !== true) return ok;
    }
    return true;
  }, { milestone: 'M3' }),
  t.check("Your reviewer, test-writer and fixer don't fight their tools", async () => {
    const m = await load(t);
    const policy = m.loadPolicy(t.path(ROLES));
    for (const id of ['reviewer', 'test-writer', 'fixer']) {
      const a = m.parseAgentFile(t.need(`.github/agents/${id}.agent.md`), id);
      const got = m.conflicts(a, m.capabilities(a.tools, policy)) ?? [];
      if (got.length) return `${id}: ${got.map((c) => `${c.kind}:${c.cap} ("${c.line}")`).join('; ')}. Fix the line (or the tool list), or make your signals less eager.`;
    }
    return true;
  }, { milestone: 'M3' }),
  t.check('audit() reports the conflicts (fixture set)', async () => {
    const got = (await fixtureFindings(t)).filter((f) => f.split(' ')[1] === 'conflict');
    return sameSet(got, ['fx-alias conflict read-only:execute', 'fx-typo conflict needs:execute'], 'The conflicts in tests/fixtures/agents/');
  }, { milestone: 'M3' }),

  // M4 · The confused deputy
  t.check('reach(): every agent the model may pick, and the built-ins, never an explicit one', async () => {
    const m = await load(t);
    const agents = m.loadAgents(FIX(t, 'agents'));
    const by = (id) => agents.find((a) => a.id === id);
    if ((m.reach(by('fx-reader'), agents, POLICY(t)) ?? []).length) return 'fx-reader has no agent tool, so it reaches nobody.';
    const got = (m.reach(by('fx-deputy'), agents, POLICY(t)) ?? []).map((r) => r.target).sort();
    const want = agents.filter((a) => a.id !== 'fx-deputy' && !['fx-hidden', 'fx-infer'].includes(a.id)).map((a) => a.id).sort();
    const ok = sameSet(got, want, 'fx-deputy (custom-agent) reaches');
    if (ok !== true) return `${ok} disable-model-invocation: true and infer: false keep an agent out of reach; everything else is one hop away.`;
    const withBuiltins = { ...POLICY(t), builtinAgents: { 'general-purpose': ['*'] } };
    const gp = (m.reach(by('fx-deputy'), agents, withBuiltins) ?? []).find((r) => r.target === 'general-purpose');
    return (gp && gp.builtin === true) || 'With policy.builtinAgents, reach() should list general-purpose too, with builtin: true.';
  }, { milestone: 'M4' }),
  t.check('audit(): delegation to a more powerful agent is an escalation (fixture set)', async () => {
    const got = (await fixtureFindings(t)).filter((f) => f.split(' ')[1] === 'escalation');
    return sameSet(got, [
      'fx-deputy escalation README',
      'fx-deputy escalation fx-alias',
      'fx-deputy escalation fx-mcp',
      'fx-deputy escalation fx-mcp-ok',
      'fx-deputy escalation fx-open',
      'fx-deputy escalation fx-runner',
      'fx-deputy escalation fx-star',
    ], 'The escalations in tests/fixtures/agents/ (fx-lead may do everything it reaches, so it has none)');
  }, { milestone: 'M4' }),
  t.check('The built-in general-purpose agent counts too', async () => {
    const m = await load(t);
    const agents = [m.parseAgentFile("---\nname: helper\ndescription: Helps.\ntools: ['read', 'agent']\n---\nHelp.\n", 'helper')];
    const policy = { roles: { helper: { may: ['read', 'agent'] } }, agents: { helper: 'helper' }, builtinAgents: { 'general-purpose': ['*'] } };
    const f = (m.audit(agents, policy) ?? []).find((x) => x.kind === 'escalation');
    return (f && f.detail === 'general-purpose') || 'An agent with `agent` reaches the built-in general-purpose agent (every tool): report it as an escalation.';
  }, { milestone: 'M4' }),

  // M5 · Fix the five agents
  t.check('The CLI: exit 1 with findings on the fixture set, 0 on your agents', () => {
    const bad = t.node([AUDIT, '--agents', FIX(t, 'agents'), '--roles', FIX(t, 'roles.json')]);
    if (bad.code !== 1 || !/fx-alias/.test(bad.stdout)) return `On tests/fixtures/agents/ it should list the findings and exit 1; it exited ${bad.code}.`;
    const good = t.node([AUDIT]);
    return good.code === 0 || `On .github/agents/ it still finds something (exit ${good.code}):\n${good.stdout.split('\n').filter((l) => /❌/.test(l)).slice(0, 4).join('\n')}`;
  }, { milestone: 'M5' }),
  t.check('Your audit and the reference audit find nothing in .github/agents/', async () => {
    const ref = await reference(t);
    const agents = ref.loadAgents(t.path('.github/agents'));
    const policy = ref.loadPolicy(t.path(ROLES));
    const theirs = ref.audit(agents, policy);
    if (theirs.length) return `The reference audit still finds: ${theirs.slice(0, 3).map((f) => f.message).join(' | ')}`;
    const mine = (await load(t)).audit(agents, policy) ?? [];
    return !mine.length || `Your audit finds: ${mine.slice(0, 3).map((f) => f.message ?? `${f.agent} ${f.kind}`).join(' | ')}`;
  }, { milestone: 'M5' }),
  t.check('Least privilege, not no privilege: the five can still do their jobs', async () => {
    const ref = await reference(t);
    const policy = ref.loadPolicy(t.path(ROLES));
    const agent = (id) => ref.parseAgentFile(t.need(`.github/agents/${id}.agent.md`, `Keep .github/agents/${id}.agent.md: fix it, don't delete it.`), id);
    const can = (id) => ref.capabilities(agent(id).tools, policy);
    const tools = (id) => (Array.isArray(agent(id).tools) ? agent(id).tools : String(agent(id).tools ?? '').split(',')).map((x) => x.trim());
    if (!can('docs-writer').caps.includes('edit')) return 'docs-writer has to edit the docs: keep `edit`.';
    if (!can('release').caps.includes('execute')) return 'release has to run `npm test` and `git log`: it needs execute.';
    if (!can('coverage').caps.includes('execute')) return 'coverage has to run the tests: it needs execute (is "exec" a tool name?).';
    if (!tools('portal').some((x) => /^studybuddy\/get_/.test(x)) || can('portal').caps.includes('mcp:write')) return 'portal needs the studybuddy read tools (studybuddy/get_…), and not mark_done.';
    const triage = can('triage');
    if (!(triage.caps.includes('read') && triage.caps.includes('search') && !triage.caps.includes('agent'))) return 'triage reads and searches, and hands nothing on: read, search, no agent.';
    const open = FIVE.filter((id) => !agent(id).explicit);
    return !open.length || `Only a person or a script starts these (the policy says "invocation": "explicit"): add disable-model-invocation: true to ${open.join(', ')}.`;
  }, { milestone: 'M5' }),
  t.check("roles.json still says what the security team wrote", () => {
    const now = t.json(ROLES);
    const orig = JSON.parse(t.sol(ROLES));
    const changed = Object.keys(orig.roles).filter((r) => JSON.stringify([...(now.roles?.[r]?.may ?? [])].sort()) !== JSON.stringify([...orig.roles[r].may].sort()) || (now.roles?.[r]?.invocation ?? 'any') !== (orig.roles[r].invocation ?? 'any'));
    if (changed.length) return `These roles changed: ${changed.join(', ')}. Fix the agents, not the policy.`;
    const moved = FIVE.filter((id) => now.agents?.[id] !== orig.agents[id]);
    return !moved.length || `These agents got another role: ${moved.join(', ')}.`;
  }, { milestone: 'M5' }),
];
