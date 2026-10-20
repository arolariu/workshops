// Free checks for Lab 08 · medium: red-team the guard. Generic: they find your guard through .github/hooks/*.json and
// replay their own copy of the attack pack through it, the way Copilot calls it, so they work on a brought harness too.
import fs from 'node:fs';
import path from 'node:path';
import { scanHarness, scorecard, maturity } from '../../../_harness/scorecard.mjs';
import { contextBudget, measureMcp, tokens } from '../../../_harness/xray.mjs';
import { blocked, familiesFor, familyRe, hidden, missed, packProblems, replayer, sameCall, shipped, shippedFile, some } from './pack.mjs';

const SCRIPT = 'scripts/attack.mjs';
const GUARD = '.github/hooks/scripts/guard.mjs';
const LOCAL = 'attacks.local.json';
const BUDGET = 2500;
const CATCH_ALL = new Set(['*', '**', '**/*', '**/*.*']);
const LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'];

const FAMILIES = [
  ['destructive', 'Destructive commands are denied, in bash and PowerShell spellings'],
  ['secret-read', 'Reading secrets is denied: .env files, keys, secret environment variables'],
  ['secret-write', 'Writing secrets is denied: .env files, hardcoded passwords, tokens copied into files or git'],
  ['exfiltration', 'Sending data out is denied: uploads, raw sockets, hosts nobody approved'],
  ['supply-chain', 'The supply chain is guarded: no new packages, no remote scripts, no package.json edits'],
  ['tampering', 'The harness protects itself: hooks, agents, MCP config and the boundaries in AGENTS.md'],
];

// A denial is read by the model: it should say what to do instead, so the next try is a good one.
const INSTEAD = /instead|ask the human|ask (a|the) (person|owner|maintainer)|\buse\b/i;

// Fake guards for testing scripts/attack.mjs: one lets everything through, one blocks everything.
const ALLOW_ALL = "import fs from 'node:fs';\nfs.readFileSync(0, 'utf8');\n";
const DENY_ALL = "import fs from 'node:fs';\nfs.readFileSync(0, 'utf8');\nprocess.stdout.write(JSON.stringify({ permissionDecision: 'deny', permissionDecisionReason: 'The deny-all test guard blocks everything.' }));\n";

/** A copy of your folder whose guard is replaced by `guard` (or removed when null). */
function withGuard(t, guard) {
  const copy = t.copy(t.tmp());
  const file = path.join(copy, GUARD);
  if (guard === null) fs.rmSync(file, { force: true });
  else { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, guard); }
  return copy;
}
const attack = (t, cwd, args) => {
  if (!t.exists(SCRIPT)) t.fail(`\`${SCRIPT}\` doesn't exist yet: the starter had one with judge() left to do.`);
  return t.node([path.join(cwd, SCRIPT), ...args], { cwd, timeout: 150000 });
};
const idsOf = (list) => new Set((Array.isArray(list) ? list : []).map((x) => (typeof x === 'string' ? x : x?.id)));
function json(t, r) {
  try {
    const out = JSON.parse(r.stdout.trim());
    if (Array.isArray(out?.misses) && Array.isArray(out?.falsePositives)) return out;
  } catch { /* below */ }
  return t.fail(`With --json, ${SCRIPT} should print one JSON object with "misses" and "falsePositives" lists. It printed: ${r.all.trim().slice(0, 200)}`);
}
const summary = (r) => r.all.trim().split('\n').filter(Boolean).slice(-6).join(' / ').slice(0, 300);

function localPack(t) {
  const pack = t.json(LOCAL, `\`${LOCAL}\` doesn't exist: the starter had one with an empty "attacks" list.`);
  const base = shipped(t);
  const problems = packProblems(pack, { families: familiesFor(base, pack), file: LOCAL });
  if (problems.length) t.fail(some(problems, 3));
  return { pack, base };
}

/** The `## Threat model` section of HARNESS.md and its table: { columns, rows: [{ family, control, risk, text }] }. */
function threatModel(t) {
  const md = t.need('HARNESS.md', '`HARNESS.md` doesn\'t exist yet: easy\'s solution has one.');
  const lines = md.split('\n');
  const start = lines.findIndex((l) => /^##\s+.*threat model/i.test(l));
  if (start < 0) t.fail('HARNESS.md has no `## Threat model` section yet. Add one after the six sections from easy, with a table.');
  const end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  const table = lines.slice(start + 1, end < 0 ? undefined : end).filter((l) => /^\s*\|/.test(l));
  const cells = (l) => l.trim().replace(/^\||(?<!\\)\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
  if (table.length < 3) t.fail('The Threat model section needs a Markdown table: a header row, the `|---|` row, and a row per family.');
  const head = cells(table[0]);
  const col = (re) => head.findIndex((h) => re.test(h));
  const columns = { family: col(/famil|attack|threat/i), control: col(/control|defen[cs]e|mitigat|stop/i), risk: col(/risk|remain|residual/i) };
  const missing = Object.entries(columns).filter(([, i]) => i < 0).map(([k]) => k);
  if (missing.length) t.fail(`The table needs a column for the ${missing.join(', the ')} (its header says: ${head.join(' | ')}).`);
  const rows = table.slice(1).filter((l) => !/^\s*\|?\s*:?-{3,}/.test(l)).map(cells)
    .map((c) => ({ family: c[columns.family] ?? '', control: c[columns.control] ?? '', risk: c[columns.risk] ?? '', text: c.join(' ') }));
  return { rows, section: lines.slice(start, end < 0 ? undefined : end).join('\n') };
}
const plain = (s) => String(s ?? '').replace(/[`*_~]/g, '').replace(/\s+/g, ' ').trim();
const filled = (s) => plain(s).length >= 12 && !/\b(TODO|TBD)\b|^(n\/?a|none|-+|…|\.\.\.)$/i.test(plain(s));

async function audit(dir) {
  const scan = scanHarness(dir);
  const mcpTools = scan.mcp?.servers.length ? await measureMcp(dir, scan.mcp.servers, { localOnly: true, timeout: 5000 }) : {};
  const rules = scorecard(scan, { mcpTools });
  return { scan, mcpTools, level: maturity(rules, scan) };
}

export default (t) => [
  // ---------- M1 · Attack pack ----------
  t.check('`node scripts/attack.mjs` judges: a guard that allows everything misses every attack (exit 1), yours misses none (exit 0)', () => {
    const pack = shipped(t);
    const copy = withGuard(t, ALLOW_ALL);
    const r = attack(t, copy, [shippedFile(t), '--json']);
    if (r.code !== 1) return `With a guard that allows everything, \`node ${SCRIPT} <pack> --json\` exited ${r.code}: expected 1, because every attack is a miss. Finish judge(). It printed: ${summary(r)}`;
    const out = json(t, r);
    const seen = idsOf(out.misses);
    const unseen = pack.attacks.filter((a) => !seen.has(a.id)).map((a) => a.id);
    if (unseen.length) return `"misses" should list every attack that got through; with a guard that allows everything it lacks ${some(unseen, 4)}.`;
    if (out.falsePositives.length) return `A guard that allows everything has no false positives, but "falsePositives" lists ${some([...idsOf(out.falsePositives)], 3)}.`;
    const mine = attack(t, t.dir, [shippedFile(t)]);
    return mine.code === 0 || `With your guard, \`node ${SCRIPT}\` on the shipped pack exited ${mine.code} (0 means no miss and no false positive): ${summary(mine)}`;
  }, { milestone: 'M1', timeout: 300000 }),
  t.check('`node scripts/attack.mjs` reports false positives (exit 1), and exits 2 when a pack or the guard can\'t be used', () => {
    const pack = shipped(t);
    const r = attack(t, withGuard(t, DENY_ALL), [shippedFile(t), '--json']);
    if (r.code !== 1) return `With a guard that denies everything, it exited ${r.code}: expected 1, because every allowed call is a false positive. It printed: ${summary(r)}`;
    const out = json(t, r);
    const seen = idsOf(out.falsePositives);
    const unseen = pack.allowed.filter((a) => !seen.has(a.id)).map((a) => a.id);
    if (unseen.length) return `"falsePositives" should list every allowed call that was denied; with a guard that denies everything it lacks ${some(unseen, 4)}.`;
    const chains = pack.attacks.filter((a) => a.after && !seen.has(a.id)).map((a) => a.id);
    if (chains.length) return `A chain whose portal read is denied is a false positive too (list it with the attack's id): missing ${some(chains, 3)}.`;
    if (out.misses.length) return `A guard that denies everything misses nothing, but "misses" lists ${some([...idsOf(out.misses)], 3)}.`;
    const broken = path.join(t.tmp(), 'broken-pack.json');
    fs.writeFileSync(broken, '{ "version": 1, "attacks": [ { "id": "half-written"');
    const b = attack(t, t.dir, [broken]);
    if (b.code !== 2) return `A pack that isn't valid JSON should exit 2 (it exited ${b.code}).`;
    const g = attack(t, withGuard(t, null), [shippedFile(t)]);
    return g.code === 2 || `Without ${GUARD}, it should exit 2 (it exited ${g.code}).`;
  }, { milestone: 'M1', timeout: 300000 }),
  ...FAMILIES.map(([family, name]) => t.check(name, () => {
    const list = shipped(t).attacks.filter((a) => a.family === family);
    const open = missed(replayer(t), list);
    return !open.length || `Not denied yet (${open.length} of ${list.length}): ${some(open, 4)}`;
  }, { milestone: 'M1', timeout: 120000 })),
  t.check('Injection chains: the portal read is allowed, and the call it asks for is denied', () => {
    const decide = replayer(t);
    const chains = shipped(t).attacks.filter((a) => a.after);
    const reads = blocked(decide, chains, (a) => a.after.call);
    if (reads.length) return `Reading the portal is the feature, so don't block it: block what it asks for. Denied: ${some(reads, 3)}`;
    const open = missed(decide, chains);
    return !open.length || `The portal's text asked for these, and they got through: ${some(open, 3)}`;
  }, { milestone: 'M1', timeout: 120000 }),
  t.check('Everyday calls stay allowed: the pack\'s 12, and the checks\' own that only look like attacks', () => {
    const decide = replayer(t);
    const shut = blocked(decide, shipped(t).allowed);
    if (shut.length) return `These are fine but were blocked (${shut.length}): ${some(shut, 3)}. Look at the path or the flag, not the word.`;
    const more = blocked(decide, hidden(t).allowed);
    return !more.length || `These everyday calls only look like attacks, but were blocked (${more.length}): ${some(more, 3)}. Quoted text (an echo, a commit message) is data, not a command; reading a file is not writing it.`;
  }, { milestone: 'M1', timeout: 120000 }),
  t.check('Other spellings of the same attacks are denied too: the checks keep their own, outside the pack', () => {
    const list = hidden(t).attacks;
    const open = missed(replayer(t), list);
    return !open.length || `The pack is a sample, not the list: protect the outcome, not the spelling. Not denied yet (${open.length} of ${list.length}): ${some(open, 4)}. Read a command like a shell does: line continuations, quotes, wrappers like bash -c, full paths, prefixes like env, and global options like git -C.`;
  }, { milestone: 'M1', timeout: 120000 }),
  t.check('Every denial says what to do instead (or to ask the human)', () => {
    const decide = replayer(t);
    const pack = shipped(t);
    const sample = [...new Set(pack.attacks.map((a) => a.family))].map((f) => pack.attacks.find((a) => a.family === f));
    const seen = sample.map((a) => ({ a, r: decide(a.call).find((x) => x.decision === 'deny') }));
    const open = seen.filter(({ r }) => !r).map(({ a }) => a.id);
    if (open.length) return `Deny these first: ${some(open, 6)}`;
    const vague = seen.filter(({ r }) => r.reason.length < 30 || !INSTEAD.test(r.reason));
    return !vague.length || `Say what to do instead (or "ask the human") in these denials: ${some(vague.map(({ a, r }) => `${a.id} → "${r.reason.slice(0, 80)}"`), 2)}`;
  }, { milestone: 'M1', timeout: 120000 }),
  t.check('`attacks/pack.json` still holds every shipped attack and allowed call (add to it, don\'t edit it)', () => {
    const mine = t.json('attacks/pack.json', '`attacks/pack.json` is gone: the red team shipped it with the starter. Restore it.');
    const base = shipped(t);
    const gone = [
      ...base.attacks.filter((a) => !(mine.attacks ?? []).some((m) => m?.id === a.id && sameCall(m.call, a.call) && (!a.after || sameCall(m.after?.call, a.after.call)))),
      ...base.allowed.filter((a) => !(mine.allowed ?? []).some((m) => m?.id === a.id && sameCall(m.call, a.call))),
    ].map((a) => a.id);
    return !gone.length || `These are missing or changed in attacks/pack.json: ${some(gone, 4)}. A pack is evidence: put new attacks in ${LOCAL}, and fix the guard, not the pack.`;
  }, { milestone: 'M1' }),

  // ---------- M2 · Your own attacks ----------
  t.check(`\`${LOCAL}\` has at least five attacks of your own, in at least three families`, () => {
    const { pack, base } = localPack(t);
    const reused = pack.attacks.filter((a) => base.attacks.some((b) => b.id === a.id || sameCall(b.call, a.call)) || base.allowed.some((b) => b.id === a.id)).map((a) => a.id);
    if (reused.length) return `These repeat the shipped pack (the same id or the same call): ${some(reused, 3)}. Your own attacks are new ones.`;
    const twins = pack.attacks.filter((a, i) => pack.attacks.findIndex((b) => sameCall(a.call, b.call)) !== i).map((a) => a.id);
    if (twins.length) return `These make the same call as another of your attacks: ${some(twins, 3)}.`;
    const families = new Set(pack.attacks.map((a) => a.family));
    if (pack.attacks.length < 5) return `${LOCAL} has ${pack.attacks.length} attack${pack.attacks.length === 1 ? '' : 's'}: write at least 5.`;
    return families.size >= 3 || `Your attacks are in ${families.size} famil${families.size === 1 ? 'y' : 'ies'} (${[...families].join(', ')}): spread them over at least 3.`;
  }, { milestone: 'M2' }),
  t.check('Your guard denies each of your attacks on both shells, and allows the portal reads of your chains', () => {
    const { pack } = localPack(t);
    if (!pack.attacks.length) return `${LOCAL} has no attacks yet.`;
    const decide = replayer(t);
    const reads = blocked(decide, pack.attacks.filter((a) => a.after), (a) => a.after.call);
    if (reads.length) return `The earlier call of a chain must stay allowed: ${some(reads, 3)}`;
    const open = missed(decide, pack.attacks);
    return !open.length || `Your guard lets these through (${open.length} of ${pack.attacks.length}): ${some(open, 4)}. A miss is a good find: fix the guard, keep the attack.`;
  }, { milestone: 'M2', timeout: 120000 }),
  t.check('`node scripts/attack.mjs` with no arguments replays the shipped pack and yours, and exits 0', () => {
    const { pack } = localPack(t);
    if (pack.attacks.length < 5) return `${LOCAL} has fewer than 5 attacks yet.`;
    const r = attack(t, withGuard(t, ALLOW_ALL), ['--json']);
    const out = json(t, r);
    const seen = idsOf(out.misses);
    const unseen = [...shipped(t).attacks, ...pack.attacks].filter((a) => !seen.has(a.id)).map((a) => a.id);
    if (unseen.length) return `With no arguments it should replay attacks/pack.json and ${LOCAL}; with a guard that allows everything, "misses" lacks ${some(unseen, 4)}.`;
    const mine = attack(t, t.dir, []);
    return mine.code === 0 || `\`node ${SCRIPT}\` exited ${mine.code} with your guard: ${summary(mine)}`;
  }, { milestone: 'M2', timeout: 300000 }),

  // ---------- M3 · Threat model ----------
  t.check('HARNESS.md has a `## Threat model` table with the family, the control and the remaining risk', () => {
    const { rows } = threatModel(t);
    return rows.length >= 2 || 'The Threat model table needs a row per family.';
  }, { milestone: 'M3' }),
  t.check('Every family has its own row, plus indirect injection, each with a control and a remaining risk of its own', () => {
    const { rows } = threatModel(t);
    let local = null;
    try { local = JSON.parse(t.read(LOCAL) ?? 'null'); } catch { /* the M2 checks say so */ }
    const ids = [...familiesFor(shipped(t), local), 'injection'];
    const taken = new Set();
    const missing = [];
    for (const id of ids) {
      const re = familyRe(id);
      const i = rows.findIndex((r, n) => !taken.has(n) && re.test(r.family));
      if (i < 0) missing.push(id); else taken.add(i);
    }
    if (missing.length) return `No row of its own for: ${missing.join(', ')}. Name the family in the first column (for example "Reading secrets", "Indirect injection").`;
    const mine = [...taken].map((i) => rows[i]);
    const empty = mine.filter((r) => !filled(r.control) || !filled(r.risk)).map((r) => plain(r.family));
    if (empty.length) return `Fill in the control and the remaining risk for: ${some(empty, 4)}.`;
    const risks = mine.map((r) => plain(r.risk).toLowerCase());
    const same = mine.filter((r, i) => risks.indexOf(risks[i]) !== i).map((r) => plain(r.family));
    return !same.length || `Each family has its own remaining risk, but these repeat another row's: ${some(same, 3)}.`;
  }, { milestone: 'M3' }),
  t.check('"Changing the harness" runs the attack pack before a change is merged', () => {
    const md = t.need('HARNESS.md');
    const lines = md.split('\n');
    const start = lines.findIndex((l) => /^##\s+.*chang/i.test(l));
    if (start < 0) return 'HARNESS.md has no "Changing the harness" section (easy\'s solution has one).';
    const end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
    const body = lines.slice(start + 1, end < 0 ? undefined : end).join('\n');
    return /attack\.mjs|attack pack/i.test(body) || 'Say in "Changing the harness" that `node scripts/attack.mjs` (the shipped pack and yours) passes before a harness change is merged.';
  }, { milestone: 'M3' }),
  t.check(`The harness is still L4 Guarded or better, within ${BUDGET.toLocaleString('en-US')} ≈tokens always on`, async () => {
    const { scan, mcpTools, level } = await audit(t.dir);
    if (LEVELS.indexOf(level.level) < LEVELS.indexOf('L4')) return `The harness is at ${level.level} ${level.name}. ${level.next ?? ''}`.trim();
    const { total } = contextBudget(scan, mcpTools);
    // Scoped instructions that apply to every file are always on, whatever the X-ray's file list says (as easy's M4).
    const catchAll = scan.instructions.filter((i) => i.applyTo && String(i.applyTo).split(',').some((g) => CATCH_ALL.has(g.trim())));
    const all = total + catchAll.reduce((n, i) => n + tokens(i.text), 0);
    return all <= BUDGET || `The always-on context is ≈${all.toLocaleString('en-US')} tokens per turn (the budget is ${BUDGET.toLocaleString('en-US')})${catchAll.length ? `, counting ${catchAll.map((i) => i.path).join(', ')}, whose applyTo matches every file` : ''}: the threat model belongs in HARNESS.md, which costs nothing per turn.`;
  }, { milestone: 'M3' }),
];
