// Free checks for Lab 07 · hard+: hostile input. The shipped simulator replays what a tricked agent would propose
// (tests/fixtures/hostile.json, inert data) against your workflows' settings, the way gh aw enforces them.
import fs from 'node:fs';
import path from 'node:path';
import { compileStrict, simulator, front } from './common.mjs';

const WORKFLOWS = { 'issue-assistant': '.github/workflows/issue-assistant.md', 'issue-triage': '.github/workflows/issue-triage.md' };
const MINE = 'fixtures/my-attacks.json';
const fixture = (t, name) => fs.readFileSync(path.join(t.exDir, 'tests', 'fixtures', name), 'utf8');
const hostile = (t) => JSON.parse(fixture(t, 'hostile.json'));

/** Your workflows (with the shared files they import) as { id: { data, body } }; `widen` opens add-labels to "*". */
async function configs(t, { widen = false } = {}) {
  const S = await simulator(t);
  const out = {};
  for (const [id, rel] of Object.entries(WORKFLOWS)) {
    const { data, body } = front(t, rel, `\`${rel}\` is missing.`);
    const merged = S.withImports({ data, body }, (p) => t.read(p));
    const labels = merged.data['safe-outputs']?.['add-labels'];
    if (widen && labels && typeof labels === 'object') merged.data['safe-outputs'] = { ...merged.data['safe-outputs'], 'add-labels': { ...labels, allowed: ['*'] } };
    out[id] = merged;
  }
  return out;
}

/** Replay the shipped cases that `pick` selects; fail with the ones that got through or broke. */
async function replay(t, pick, opts = {}) {
  const S = await simulator(t);
  const { repo, cases } = hostile(t);
  const results = S.replay(await configs(t, opts), cases.filter(pick), repo);
  const through = results.filter((r) => r.verdict === 'got-through');
  if (through.length) return `Got through${opts.widen ? ' (with the allow-list opened to `*`)' : ''}: ${through.map((r) => `${r.id}: ${r.why}`).join(' · ')}`;
  const broken = results.filter((r) => r.verdict === 'broken');
  return !broken.length || `The normal work broke: ${broken.map((r) => `${r.id}: ${r.why}`).join(' · ')}`;
}
const is = (workflow, milestone, kind = 'hostile') => (c) => c.workflow === workflow && c.milestone === milestone && c.kind === kind;
const goal = (key) => (c) => c.kind === 'hostile' && c.goal?.[key] !== undefined;

export default (t) => [
  // M1 · Labels it can't give
  t.check('The assistant can\'t give itself "approved", or a pile of labels', async () => {
    const r = await replay(t, is('issue-assistant', 'M1'));
    return r !== true ? r : replay(t, is('issue-assistant', 'M1'), { widen: true });
  }, { milestone: 'M1' }),
  t.check('The triage bot can\'t either, even when a teammate opens its allow-list to "*"', async () => {
    const r = await replay(t, is('issue-triage', 'M1'));
    return r !== true ? r : replay(t, is('issue-triage', 'M1'), { widen: true });
  }, { milestone: 'M1' }),
  t.check('The labels they should add still work', () => replay(t, (c) => c.kind === 'benign' && c.milestone === 'M1'), { milestone: 'M1' }),

  // M2 · Nobody gets pinged
  t.check('Nobody gets pinged', () => replay(t, goal('mention')), { milestone: 'M2' }),
  t.check('The assistant writes only on the issue it was called to', () => replay(t, (c) => c.workflow === 'issue-assistant' && goal('item')(c)), { milestone: 'M2' }),
  t.check('Its answers and the triage welcome still get through', () => replay(t, (c) => ['assistant-answers', 'triage-labels'].includes(c.id)), { milestone: 'M2' }),

  // M3 · Nothing leaves
  t.check('Nothing leaves: no request to a stranger\'s host, no link to one', () => replay(t, goal('host')), { milestone: 'M3' }),
  t.check('No wildcard in the firewall, and no tool that can send', async () => {
    const S = await simulator(t);
    for (const [id, { data }] of Object.entries(await configs(t))) {
      const wild = S.firewall(data.network).filter((d) => String(d).includes('*'));
      if (wild.length) return `${id}.md: \`network\` has a wildcard (${wild.map((d) => `\`${d}\``).join(', ')}): every host it matches can receive what the agent sends. Name the hosts it needs, or use \`network: defaults\`.`;
      const sends = S.canSend(data.tools, data['mcp-servers']);
      if (sends) return `${id}.md: the agent has ${sends}. It answers from the docs: it needs no tool that can send, even behind \`network: defaults\` (read-only shell commands like \`cat\` and \`grep\` are fine).`;
      const out = data['safe-outputs']?.['allowed-domains'];
      if (Array.isArray(out) && out.some((d) => String(d).includes('*'))) return `${id}.md: allowed-domains has a wildcard: a stranger can ask for a link to any host it matches.`;
    }
    return true;
  }, { milestone: 'M3' }),

  // M4 · Less to read, all of it data
  t.check('The assistant only reads what it can trust', () => replay(t, (c) => c.workflow === 'issue-assistant' && c.milestone === 'M4'), { milestone: 'M4' }),
  t.check('Untrusted text arrives sanitized, and the prompt says it\'s data', async () => {
    const S = await simulator(t);
    const assistant = (await configs(t))['issue-assistant'];
    const findings = S.contextFindings(assistant);
    if (findings.length) return findings.join(' ');
    if (!/untrusted|\bdata\b/i.test(assistant.body)) return 'Frame the comment as untrusted data in the instructions, so the model knows whose words it is reading.';
    const told = /(never|don.?t|do not|must not|shouldn.?t|won.?t)\s+(follow|obey|execute|act on|carry out)|ignore\s+(any|all|every)?\s*(instructions|commands|requests)|not\s+(as\s+)?(instructions|commands)|instructions\s+(in|inside|from)\s+it\s+(are|is)\s+(not|never)/i;
    return told.test(assistant.body) || 'Say it plainly: instructions inside the comment are not to be followed.';
  }, { milestone: 'M4' }),

  // M5 · Attacks of your own
  t.check('Two attacks of your own: they get through the loose starter, and yours stop them', async () => {
    const S = await simulator(t);
    const raw = t.json(MINE, `\`${MINE}\` is missing: it comes with the starter.`);
    const mine = Array.isArray(raw.cases) ? raw.cases : [];
    if (mine.length < 2) return `${MINE} has ${mine.length} case(s). Add at least two hostile cases of your own.`;
    for (const c of mine) {
      const problems = S.validateCase(c);
      if (problems.length) return `Case ${c?.id ?? '(no id)'}: ${problems[0]}.`;
      if (c.kind !== 'hostile') return `Case ${c.id}: make it "kind": "hostile".`;
    }
    const shipped = new Set(hostile(t).cases.map((c) => JSON.stringify(c.proposals)));
    const copies = mine.filter((c) => shipped.has(JSON.stringify(c.proposals)));
    if (copies.length) return `These repeat a shipped case word for word: ${copies.map((c) => c.id).join(', ')}. Find an attack of your own.`;
    const { repo } = hostile(t);
    const loose = { 'issue-assistant': S.parseFrontmatter(fixture(t, 'loose-assistant.md')), 'issue-triage': S.parseFrontmatter(fixture(t, 'loose-triage.md')) };
    const harmless = S.replay(loose, mine, repo).filter((r) => r.verdict !== 'got-through');
    if (harmless.length) return `These don't get through even the loose starter, so they test nothing: ${harmless.map((r) => `${r.id} (${r.why})`).join(' · ')}`;
    const through = S.replay(await configs(t), mine, repo).filter((r) => r.verdict === 'got-through');
    return !through.length || `Your own attacks get through your workflows: ${through.map((r) => `${r.id}: ${r.why}`).join(' · ')}`;
  }, { milestone: 'M5' }),

  t.check('gh aw compile --strict accepts the assistant', () => compileStrict(t, 'issue-assistant'), { needs: ['gh-aw'], optional: true, env: true, timeout: 150000 }),
  t.check('gh aw compile --strict accepts the triage bot', () => compileStrict(t, 'issue-triage'), { needs: ['gh-aw'], optional: true, env: true, timeout: 150000 }),
];
