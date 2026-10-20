// Free checks for Lab 08 · easy: bring the harness together, own it, audit it to L4, and put it on a context diet.
// Generic: they read whatever harness is in the folder (yours, brought from earlier levels, or the starter's).
import {
  audit, atLeast, BUDGET, contextBudget, contradictions, harnessSections, HARNESS_SECTIONS, LAYERS, LAYER_WORDS, present,
  repeatedRules, scanHarness, scorecard, textLines, tokens, topics, twinAgents,
} from './harness-rules.mjs';

const pkg = (t) => { try { return JSON.parse(t.read('package.json') ?? '{}'); } catch { return {}; } };
const short = (s, n = 70) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const some = (list, n = 3) => list.slice(0, n).join(' · ') + (list.length > n ? ` (and ${list.length - n} more)` : '');

const harness = (t) => t.need('HARNESS.md', '`HARNESS.md` doesn\'t exist yet: the starter had a skeleton with six sections.');
const UP_TO_L4 = new Set(LAYERS.filter((l) => atLeast('L4', l.level)).map((l) => l.id));

// Calls that every guard in this course denies, one per shell spelling.
const RECURSIVE_DELETE = {
  bash: { toolName: 'bash', toolArgs: { command: 'rm -rf build' } },
  powershell: { toolName: 'powershell', toolArgs: { command: 'Remove-Item -Recurse -Force build' } },
};
const nodeScript = (command) => String(command ?? '').match(/^\s*node(?:\.exe)?\s+("?)([^"\s]+\.[cm]?js)\1/)?.[2] ?? null;

// Scoped instructions that apply to every file are always on, whatever the X-ray's file list says.
const CATCH_ALL = new Set(['*', '**', '**/*', '**/*.*']);
const alwaysOn = (scan) => scan.instructions.filter((i) => !i.applyTo || String(i.applyTo).split(',').some((g) => CATCH_ALL.has(g.trim())));

// The rarely needed rules of the starter's copilot-instructions.md; two markers in one file mean the rules are there.
const RARE = [
  { title: 'The ECTS grade conversion', why: 'the exchange office needs it twice a term', markers: [/\bECTS\b/i, /\bFX\b/, /9\.50/, /exchange office/i, /percentile/i] },
  { title: 'The release checklist', why: 'the team releases once a term', markers: [/release checklist/i, /CHANGELOG\.md/i, /semantic versioning|semver/i, /\bhotfix/i, /release: v/i, /course channel/i] },
];
const holds = (text, topic) => topic.markers.filter((re) => re.test(text ?? '')).length >= 2;

export default (t) => [
  // ---------- M1 · Bring ----------
  t.check('No two agents with the same job', () => {
    const twins = twinAgents(scanHarness(t.dir));
    return !twins.length || `These agents do the same job: ${some(twins.map((x) => `${x.a} and ${x.b} (${x.shared.length ? `both: ${x.shared.slice(0, 5).join(', ')}` : 'the same name'})`), 2)}. Keep one: merge what is useful into it and delete the other.`;
  }, { milestone: 'M1' }),
  t.check('No rule twice: every rule lives in one instruction file, once', () => {
    const dup = repeatedRules(scanHarness(t.dir));
    return !dup.length || `${dup.length} rule${dup.length === 1 ? ' is' : 's are'} written more than once, so the model reads ${dup.length === 1 ? 'it' : 'them'} twice: ${some(dup.map((d) => `"${short(d.text, 60)}" (${d.places.join(', ')})`))}. Keep each rule in one place.`;
  }, { milestone: 'M1' }),
  ...topics({ type: 'module', scripts: { test: 'node --test' } }).map((topic) => t.check(`No contradiction about ${topic.title}`, () => {
    const live = topics(pkg(t)).find((x) => x.id === topic.id);
    if (!live) return true;
    const wrong = contradictions(scanHarness(t.dir), live);
    return !wrong.length || `${some(wrong.map((w) => `${w.place} says "${short(w.text)}"`), 2)}, but ${live.truth}. Keep the rule that matches the project, and delete the other.`;
  }, { milestone: 'M1' })),

  // ---------- M2 · Own ----------
  t.check('HARNESS.md has the six sections, and none is empty', () => {
    const found = harnessSections(harness(t));
    const missing = HARNESS_SECTIONS.filter((s) => !found[s.id]).map((s) => s.title);
    if (missing.length) return `HARNESS.md needs a \`## \` section for: ${missing.join(', ')}.`;
    const empty = HARNESS_SECTIONS.filter((s) => found[s.id].body.trim().length < 20).map((s) => s.title);
    return !empty.length || `Write these sections (the comments don't count): ${empty.join(', ')}.`;
  }, { milestone: 'M2' }),
  t.check('The scorecard\'s governance rule passes: an owner, the layers, the threat model and the budget', () => {
    harness(t);
    const rule = scorecard(scanHarness(t.dir)).find((r) => r.id === 'harness-owner');
    return rule?.ok === true || `${rule?.message ?? 'The scorecard found no HARNESS.md.'} (The X-ray's scorecard looks for these words; the Trust boundaries section is the place for the threat model.)`;
  }, { milestone: 'M2' }),
  t.check('The owner is named, and the Layers section lists every layer this harness has', () => {
    const found = harnessSections(harness(t));
    const owner = found.owner?.body ?? '';
    if (!owner.trim() || /\bTODO\b|\bTBD\b|<[^>]+>/i.test(owner)) return 'Name the owner in the Owner section: a person (or a GitHub @handle) and their team, not a placeholder.';
    if (!/@[\w-]+|\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+|\bteam\b/.test(owner)) return `The Owner section should name someone: a person, a GitHub @handle or a team. It says: "${short(owner.replace(/\n/g, ' '), 80)}"`;
    const scan = scanHarness(t.dir);
    const layers = found.layers?.body ?? '';
    const missing = LAYERS.filter((l) => LAYER_WORDS[l.id] && present(scan, l.id) && !LAYER_WORDS[l.id].test(layers)).map((l) => l.title);
    return !missing.length || `The Layers section is the inventory, but it doesn't mention these layers, which this harness has: ${missing.join(', ')}.`;
  }, { milestone: 'M2' }),
  t.check('Trust boundaries, Budget, Changing the harness and Rollback are concrete', () => {
    const s = harnessSections(harness(t));
    const body = (id) => s[id]?.body ?? '';
    const vague = [
      !(/untrusted|hostile|inject/i.test(body('trust')) && /guard|hook|den(y|ies|ied)/i.test(body('trust'))) && 'Trust boundaries: say which input is untrusted (portal data, issues, files) and what stops an attack (the guard)',
      !/\d[\d,.]*\s*(≈\s*)?tokens?\b/i.test(body('budget')) && 'Budget: give the always-on limit as a number of ≈tokens',
      !/\d[\d,.]*\s*(AI\s+)?credits?\b|credits?\D{0,30}\d/i.test(body('budget')) && 'Budget: give a credit limit (a number of AI credits per run)',
      !(/pull request|\bPR\b|review/i.test(body('change')) && /scorecard|check|test|x-?ray/i.test(body('change'))) && 'Changing the harness: say how a change is reviewed (a pull request) and checked (the checks, the scorecard)',
      !/revert|\btag\b|previous|last good|backup|restore/i.test(body('rollback')) && 'Rollback: say how to get the last good harness back (git revert, a tag)',
    ].filter(Boolean);
    return !vague.length || `${vague.join('. ')}.`;
  }, { milestone: 'M2' }),

  // ---------- M3 · Audit ----------
  t.check('The harness reaches L4 Guarded (the X-ray\'s maturity, MCP tools measured)', async () => {
    const { level } = await audit(t.dir);
    return atLeast(level.level, 'L4') || `The harness is at ${level.level} ${level.name}. ${level.next ?? ''}`.trim();
  }, { milestone: 'M3' }),
  t.check('Every scorecard rule of the layers up to L4 is green: instructions, skills, MCP, agents and hooks', async () => {
    const { rules } = await audit(t.dir);
    const red = rules.filter((r) => UP_TO_L4.has(r.layer) && r.ok === false);
    return !red.length || `Fix: ${some(red.map((r) => `${r.id}: ${r.message}`), 4)}`;
  }, { milestone: 'M3' }),
  t.check('Both shells reach the guard, and it blocks a recursive delete in each', () => {
    const pre = scanHarness(t.dir).hooks.flatMap((h) => h.preToolUse);
    const problems = [];
    for (const [shell, call] of Object.entries(RECURSIVE_DELETE)) {
      const scripts = pre.map((e) => ({ script: nodeScript(e?.[shell]), cwd: e?.cwd ?? '.' })).filter((x) => x.script);
      if (!pre.some((e) => e?.[shell])) { problems.push(`no preToolUse hook has a "${shell}" command, so nothing guards the ${shell} tool (Copilot uses it on ${shell === 'bash' ? 'macOS and Linux' : 'Windows'})`); continue; }
      if (!scripts.length) { problems.push(`the "${shell}" command is not \`node <script>\`, so the checks can't run it`); continue; }
      const denied = scripts.some(({ script, cwd }) => t.hook(`${cwd}/${script}`.replace(/^\.\//, ''), call).decision === 'deny');
      if (!denied) problems.push(`the ${shell} guard let \`${call.toolArgs.command}\` through`);
    }
    return !problems.length || `${problems.join('; and ')}.`;
  }, { milestone: 'M3' }),

  // ---------- M4 · Diet ----------
  t.check(`The always-on context fits in ${BUDGET.toLocaleString('en-US')} ≈tokens per turn (as the X-ray measures it)`, async () => {
    const { scan, mcpTools } = await audit(t.dir);
    const b = contextBudget(scan, mcpTools);
    const extra = alwaysOn(scan).filter((i) => i.applyTo).map((i) => ({ label: `${i.path} (applyTo: ${i.applyTo})`, tokens: tokens(i.text) }));
    const total = b.total + extra.reduce((n, x) => n + x.tokens, 0);
    if (total <= BUDGET) return true;
    const items = [...b.every.filter((x) => x.tokens), ...extra].sort((x, y) => y.tokens - x.tokens);
    const unmeasured = b.every.filter((x) => x.tokens === null).map((x) => `${x.label}: ${x.note}`);
    return `The harness puts ≈${total.toLocaleString('en-US')} tokens into every turn (the budget is ${BUDGET.toLocaleString('en-US')}). The biggest: ${some(items.map((x) => `${x.label} ≈${x.tokens}`), 4)}.${unmeasured.length ? ` Judged on the files only for ${unmeasured.join('; ')}.` : ''}`;
  }, { milestone: 'M4' }),
  t.check('The rarely needed rules live in a skill: the ECTS conversion and the release checklist', () => {
    const scan = scanHarness(t.dir);
    const on = alwaysOn(scan);
    const skills = scan.skills.map((s) => ({ path: s.path, text: t.read(s.path) }));
    const problems = [];
    for (const topic of RARE) {
      const still = on.filter((i) => holds(textLines(i.text).map((l) => l.text).join('\n'), topic)).map((i) => i.path);
      if (still.length) problems.push(`${topic.title} is still in ${still.join(' and ')}, so it is sent on every turn although ${topic.why}`);
      else if (!skills.some((s) => holds(s.text, topic))) problems.push(`${topic.title} is in no skill: ${topic.why}, so move it into one (.github/skills/<name>/SKILL.md), don't delete it`);
    }
    return !problems.length || `${problems.join('. ')}.`;
  }, { milestone: 'M4' }),
];
