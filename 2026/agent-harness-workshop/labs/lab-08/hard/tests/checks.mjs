// Free checks for Lab 08 · hard: golden cases, a read-only, credit-capped runner with statistics, a baseline gate and
// a layer-value report. The case checks are generic (they read your harness through the X-ray's scanner); the math is
// checked on recorded runs (this level's reference recordings), against numbers worked out by hand. Nothing here
// starts Copilot.
import fs from 'node:fs';
import path from 'node:path';
import {
  caseProblems, casesOf, evalCli, flag, flags, LAYERS, near, norm, present, readJson, reference, RUNTIME_LAYERS,
  runEvents, scanHarness, show, tail,
} from './helpers.mjs';

const LAYER_IDS = LAYERS.map((l) => l.id);
const casesIn = (t) => {
  const list = casesOf(t.json('evals/cases.json', '`evals/cases.json` doesn\'t exist yet: the starter had one with two example cases.'));
  if (!list) t.fail('evals/cases.json must be { "cases": [ … ] } (or a plain array of cases).');
  return list;
};
const exportsOf = async (t, names) => {
  const m = await t.import('scripts/eval.mjs');
  const missing = names.filter((n) => typeof m[n] !== 'function');
  if (missing.length) t.fail(`scripts/eval.mjs doesn't export ${missing.join(', ')}.`);
  return m;
};
const rulesOf = (c, key) => (Array.isArray(c?.expect) ? c.expect : []).filter((r) => r && typeof r === 'object' && key in r).map((r) => r[key]);
const report = (rates) => ({ cases: Object.fromEntries(Object.entries(rates).map(([id, passRate]) => [id, { passRate }])) });
const ids = (list) => (list ?? []).map((c) => c?.id ?? c).sort().join(', ');
const treeOf = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).map(String).sort().join('\n') : '');

// The reference recordings (evals/runs/full): passes and runs per case, and why a run fails.
const FULL = {
  'rules-footer': [4, 4], 'rules-pass-rule': [3, 4], 'skill-ects': [3, 4], 'skill-release': [1, 4],
  'reviewer-read-only': [4, 4], 'mcp-deadlines': [4, 4], 'mcp-grades': [2, 4], 'hooks-denied-delete': [4, 4],
};
const WHY = {
  'rules-pass-rule': 'run 3 answers "Yes" and never mentions the exam',
  'skill-ects': 'run 3 never loads ects-grades and writes a plain "B"',
  'skill-release': 'only run 2 loads release-checklist; run 3 mentions the changelog without it',
  'mcp-grades': 'runs 2 and 4 read files instead of calling the portal tool',
  'hooks-denied-delete': 'every run has a call denied with code "denied"',
  'reviewer-read-only': 'the reviewer only views files',
  'mcp-deadlines': 'every run calls studybuddy-get_deadlines successfully',
  'rules-footer': 'every answer ends with the footer line',
};

export default (t) => [
  // ---------- M1 · Cases ----------
  t.check('evals/cases.json: 8+ cases, each with an id, a layer, a prompt and rules the runner can score', () => {
    const list = casesIn(t);
    const seen = new Set();
    const problems = list.flatMap((c, i) => caseProblems(c, i, seen, LAYER_IDS));
    if (problems.length) return `${problems.slice(0, 3).join(' ')}${problems.length > 3 ? ` (and ${problems.length - 3} more)` : ''}`;
    return list.length >= 8 || `evals/cases.json has ${list.length} case${list.length === 1 ? '' : 's'}; write at least 8 golden cases.`;
  }, { milestone: 'M1' }),
  t.check('Every layer your harness has is measured by at least one case', () => {
    const list = casesIn(t);
    const scan = scanHarness(t.dir);
    const missing = RUNTIME_LAYERS.filter((l) => present(scan, l) && !list.some((c) => c?.layer === l));
    return !missing.length || `Your harness has ${missing.join(', ')}, but no case measures ${missing.length === 1 ? 'it' : 'them'}: add a case with "layer": "${missing[0]}".`;
  }, { milestone: 'M1' }),
  t.check('The cases check behaviour: a rule followed, the right skill, a read-only agent, an MCP tool used, a denial handled gracefully', () => {
    const list = casesIn(t);
    const scan = scanHarness(t.dir);
    const need = [];
    if (present(scan, 'instructions') && !list.some((c) => c?.layer === 'instructions' && rulesOf(c, 'answerMatches').length)) need.push('a rule followed (an instructions case with an answerMatches rule)');
    if (present(scan, 'skills')) {
      const names = new Set(scan.skills.flatMap((s) => [s.name, s.folder]).filter(Boolean));
      if (!list.some((c) => rulesOf(c, 'skill').some((n) => names.has(n)))) need.push(`the right skill (a { "skill": … } rule naming one of yours: ${[...new Set(scan.skills.map((s) => s.name || s.folder))].join(', ')})`);
    }
    if (present(scan, 'agents')) {
      const names = scan.agents.map((a) => a.name);
      if (!list.some((c) => names.includes(c?.agent) && rulesOf(c, 'noTool').some((x) => /edit|create|write|\*/i.test(String(x))))) need.push(`a read-only agent (a case with "agent": "${names[0]}" and { "noTool": "edit" })`);
    }
    if (present(scan, 'mcp')) {
      const servers = scan.mcp.servers.map((s) => s.name);
      if (!list.some((c) => rulesOf(c, 'tool').some((x) => servers.some((s) => String(x).startsWith(`${s}-`))))) need.push(`an MCP tool used (a { "tool": "<server>-<tool>" } rule, like "${servers[0]}-…")`);
    }
    if (present(scan, 'hooks') && !list.some((c) => rulesOf(c, 'denied').includes(true) && (rulesOf(c, 'answerMatches').length || rulesOf(c, 'answerNotMatches').length))) need.push('a denial handled gracefully ({ "denied": true } and a rule about the answer)');
    return !need.length || `Add ${need.join('; ')}.`;
  }, { milestone: 'M1' }),

  // ---------- M2 · Runner ----------
  t.check('passRate() and variance(): the numbers worked out by hand', async () => {
    const { passRate, variance } = await exportsOf(t, ['passRate', 'variance']);
    const rows = [
      ['passRate([true, true, false, true])', () => passRate([true, true, false, true]), 0.75, '3 of 4 runs'],
      ['passRate([false, false])', () => passRate([false, false]), 0, 'no run passed'],
      ['variance([1, 0, 1, 1])', () => variance([1, 0, 1, 1]), 0.1875, 'mean .75; (3 · .0625 + .5625) / 4, which is p(1 − p)'],
      ['variance([1, 0, 1, 0])', () => variance([1, 0, 1, 0]), 0.25, 'a coin flip: .5 · .5'],
      ['variance([1, 1, 1])', () => variance([1, 1, 1]), 0, 'a stable case'],
      ['variance([3, 5, 7])', () => variance([3, 5, 7]), 8 / 3, 'mean 5; (4 + 0 + 4) / 3: divide by n, the population variance'],
    ];
    for (const [label, f, want, why] of rows) {
      let got;
      try { got = f(); } catch (e) { return `${label} throws: ${e.message}`; }
      if (!near(got, want, 1e-4)) return `${label} is ${show(got)}; expected ${show(want)} (${why}).`;
    }
    return true;
  }, { milestone: 'M2' }),
  t.check('passAtK(): the unbiased estimator, 1 − C(n − c, k) / C(n, k)', async () => {
    const { passAtK } = await exportsOf(t, ['passAtK']);
    const rows = [
      [4, 1, 1, 0.25, '1 − 3/4'], [4, 1, 2, 0.5, '1 − C(3,2)/C(4,2) = 1 − 3/6'], [4, 1, 3, 0.75, '1 − C(3,3)/C(4,3) = 1 − 1/4'],
      [4, 2, 2, 5 / 6, '1 − C(2,2)/C(4,2) = 1 − 1/6'], [4, 3, 2, 1, 'n − c = 1 < k = 2: a draw of 2 always holds a pass'],
      [5, 2, 3, 0.9, '1 − C(3,3)/C(5,3) = 1 − 1/10'], [10, 3, 5, 1 - 21 / 252, '1 − C(7,5)/C(10,5) = 1 − 21/252'],
      [4, 0, 3, 0, 'no run passed'], [4, 4, 1, 1, 'every run passed'],
    ];
    for (const [n, c, k, want, why] of rows) {
      let got;
      try { got = passAtK(n, c, k); } catch (e) { return `passAtK(${n}, ${c}, ${k}) throws: ${e.message}`; }
      if (!near(got, want, 1e-4)) return `passAtK(${n}, ${c}, ${k}) is ${show(got)}; expected ${show(want)} (${why}).`;
    }
    return true;
  }, { milestone: 'M2' }),
  t.check('score(): every rule of the vocabulary, judged from one run\'s events', async () => {
    const { score } = await exportsOf(t, ['score']);
    const good = runEvents({ tools: [{ name: 'skill', args: { skill: 'ects-grades' } }, { name: 'studybuddy-get_deadlines', args: { days: 7 } }, { name: 'view', args: { path: 'grades.js' } }], answers: ['Let me look at the portal.', '', 'You get 8.75 (B).\n\nHarness check: AGENTS.md loaded'] });
    const denied = runEvents({ tools: [{ name: 'edit', args: { path: 'deadlines.js' }, outcome: 'denied' }, { name: 'skill', args: { skill: 'release-checklist' }, outcome: 'failed' }], answers: ['That was blocked, so nothing changed.'] });
    const unfinished = runEvents({ answers: ['Harness check: AGENTS.md loaded'], finished: false });
    const crashed = runEvents({ answers: ['Harness check: AGENTS.md loaded'], exitCode: 1 });
    const table = [
      [good, { tool: 'studybuddy-get_deadlines' }, true, 'the tool was called and succeeded'],
      [good, { tool: 'studybuddy-*' }, true, '* matches any name, so every tool of the server counts'],
      [good, { tool: 'studybuddy-get_grades' }, false, 'that tool was never called'],
      [denied, { tool: 'edit' }, false, 'a denied call is not a tool used'],
      [good, { noTool: 'edit' }, true, 'no edit at all'],
      [denied, { noTool: 'edit' }, false, 'an attempt counts, even a denied one'],
      [good, { skill: 'ects-grades' }, true, 'the skill tool loaded it'],
      [good, { skill: 'release-checklist' }, false, 'another skill was loaded'],
      [denied, { skill: 'release-checklist' }, false, 'the skill failed to load'],
      [denied, { denied: true }, true, 'one call was denied'],
      [good, { denied: true }, false, 'nothing was denied'],
      [good, { denied: false }, true, 'nothing was denied'],
      [good, { answerMatches: '8\\.75 \\(B\\)' }, true, 'the final answer has it'],
      [good, { answerMatches: 'harness check: agents\\.md' }, true, 'answer rules are case-insensitive'],
      [good, { answerMatches: 'look at the portal' }, false, 'the answer is the last message with text, not an earlier one'],
      [good, { answerNotMatches: '\\(B\\)' }, false, 'the answer has it'],
      [denied, { answerNotMatches: 'deleted|removed' }, true, 'the answer doesn\'t claim it'],
      [unfinished, { answerMatches: 'Harness check' }, false, 'a run without its result event never finished'],
      [crashed, { answerMatches: 'Harness check' }, false, 'a run that exited with code 1 failed'],
    ];
    for (const [events, rule, want, why] of table) {
      let r;
      try { r = score(events, [rule]); } catch (e) { return `score(events, [${JSON.stringify(rule)}]) throws: ${e.message}`; }
      if (!r || typeof r.pass !== 'boolean') return 'score() should return { pass: true | false, failed: [...] }.';
      if (r.pass !== want) return `score() says ${JSON.stringify(rule)} ${r.pass ? 'holds' : 'fails'}, but it ${want ? 'holds' : 'fails'}: ${why}.`;
      if (!want && !(Array.isArray(r.failed) && r.failed.length)) return `When ${JSON.stringify(rule)} fails, failed should say what didn't hold.`;
    }
    const both = score(good, [{ skill: 'ects-grades' }, { tool: 'studybuddy-get_grades' }]);
    return (both?.pass === false && both.failed?.length === 1) || 'With two rules, a run passes only when both hold, and failed lists only the one that didn\'t.';
  }, { milestone: 'M2' }),
  t.check('evalArgs(): one quiet, read-only, credit-capped run, never --allow-all', async () => {
    const { evalArgs } = await exportsOf(t, ['evalArgs']);
    const base = { id: 'x', layer: 'mcp', prompt: 'TASK', allow: ['studybuddy(get_deadlines)'], expect: [{ tool: 'studybuddy-get_deadlines' }] };
    let a;
    try { a = evalArgs(base); } catch (e) { return `evalArgs() throws on a read-only case: ${e.message}`; }
    if (!Array.isArray(a) || !a.length) return 'evalArgs() returns nothing yet.';
    const n = norm(a);
    if ((flag(a, '-p') ?? flag(a, '--prompt')) !== 'TASK') return 'Pass the case\'s prompt with -p.';
    if (!n.includes('-s') && !n.includes('--silent')) return 'Quiet: add -s (no stats, only the run).';
    if (!n.includes('--no-ask-user')) return 'Unattended: add --no-ask-user, or a run can wait for an answer nobody gives.';
    if (flag(a, '--output-format') !== 'json') return 'The runner scores JSON events: --output-format json.';
    const cap = flags(a, '--max-ai-credits');
    if (cap.length !== 1 || Number(cap[0]) !== 30) return `Cap every run with one --max-ai-credits: 30 when the case sets no credits, the smallest cap the CLI accepts (got ${cap.join(', ') || 'none'}).`;
    if (n.some((x) => /^--(allow-all|yolo)/.test(x))) return 'An eval run never gets --allow-all, --allow-all-tools or --yolo.';
    const allowed = flags(a, '--allow-tool');
    const wide = allowed.find((x) => /^(write|shell|bash|powershell)\b/i.test(x) || x === '*');
    if (wide) return `An eval run is read-only: no --allow-tool=${wide}.`;
    if (!allowed.includes('studybuddy(get_deadlines)')) return 'Pass the case\'s allow list on: --allow-tool=studybuddy(get_deadlines).';
    const deny = flags(a, '--deny-tool');
    if (!deny.includes('write') || !deny.includes('shell')) return 'Read-only whatever the prompt says: --deny-tool=write and --deny-tool=shell.';
    let own;
    try { own = evalArgs({ ...base, allow: [], credits: 45, agent: 'reviewer' }); } catch (e) { return `evalArgs() throws on a case with credits and an agent: ${e.message}`; }
    if (Number(flag(own, '--max-ai-credits')) !== 45) return 'A case\'s credits replace the default cap: { "credits": 45 } → --max-ai-credits=45.';
    if (flag(own, '--agent') !== 'reviewer') return 'A case\'s agent runs it: { "agent": "reviewer" } → --agent reviewer.';
    for (const [credits, why] of [[15, 'under 30, the smallest cap the CLI accepts (`copilot help limits`): the run would fail before it starts'], [90, 'over 60, the most one eval run may spend']]) {
      let threw = false;
      try { evalArgs({ ...base, credits }); } catch { threw = true; }
      if (!threw) return `evalArgs() must refuse (throw) { "credits": ${credits} }: ${why}.`;
    }
    for (const bad of ['shell(rm)', 'write', 'shell(npm:*)']) {
      let threw = false;
      try { evalArgs({ ...base, allow: [bad] }); } catch { threw = true; }
      if (!threw) return `evalArgs() must refuse (throw) a case that allows ${bad}: an eval run stays read-only.`;
    }
    return true;
  }, { milestone: 'M2' }),
  t.check('--dry-run prints the plan and its worst case, and --budget refuses a plan over it (nothing runs)', () => {
    const dir = t.copy(t.tmp());
    const file = path.join(dir, 'plan-cases.json');
    fs.writeFileSync(file, JSON.stringify({ cases: [
      { id: 'case-a', layer: 'instructions', prompt: 'A', expect: [{ answerMatches: 'a' }] },
      { id: 'case-b', layer: 'skills', prompt: 'B', expect: [{ skill: 'b' }] },
      { id: 'case-c', layer: 'mcp', prompt: 'C', credits: 45, expect: [{ tool: 'studybuddy-c' }] },
    ] }));
    const before = treeOf(path.join(dir, 'evals'));
    const ok = evalCli(t, ['--dry-run', '--cases', file, '--runs', '2', '--budget', '210'], { cwd: dir });
    if (ok.code !== 0) return `--dry-run --runs 2 --budget 210 on 3 cases (one with "credits": 45) should exit 0; it exited ${ok.code}: ${tail(ok.out)}`;
    if (!/\b210\b/.test(ok.out)) return `Print the worst case: 2 runs × (30 + 30 + 45) = 210 credits. The dry run printed: ${tail(ok.out)}`;
    const over = evalCli(t, ['--dry-run', '--cases', file, '--runs', '2', '--budget', '200'], { cwd: dir });
    if (over.code !== 2) return `A plan whose worst case (210) is over --budget 200 is refused with exit code 2; it exited ${over.code}.`;
    const one = evalCli(t, ['--dry-run', '--cases', file, '--runs', '3', '--case', 'case-b', '--budget', '90'], { cwd: dir });
    if (one.code !== 0 || !/\b90\b/.test(one.out)) return `--case case-b --runs 3 plans one case: 3 × 30 = 90 credits (exit ${one.code}): ${tail(one.out)}`;
    return treeOf(path.join(dir, 'evals')) === before || 'A dry run must not write anything, but evals/ changed.';
  }, { milestone: 'M2' }),
  t.check('A run that fails is recorded and shown, and a plan where no run starts exits 2 (a fake CLI, no Copilot)', () => {
    const fakes = t.tmp();
    const broken = path.join(fakes, 'broken-cli.mjs');
    fs.writeFileSync(broken, "process.stderr.write('error: --max-ai-credits is below the minimum (fake CLI)\\n');\nprocess.exit(1);\n");
    const mixed = path.join(fakes, 'mixed-cli.mjs');
    const events = runEvents({ prompt: 'A', answers: ['All fine.'] }).map((e) => JSON.stringify(e)).join('\n');
    fs.writeFileSync(mixed, `const prompt = process.argv[process.argv.indexOf('-p') + 1];\nif (prompt === 'B') { process.stderr.write('error: the session did not start (fake CLI)\\n'); process.exit(1); }\nconsole.log(${JSON.stringify(events)});\n`);
    const cases = (dir) => {
      const file = path.join(dir, 'fake-cases.json');
      fs.writeFileSync(file, JSON.stringify({ cases: ['a', 'b'].map((x) => ({ id: `case-${x}`, layer: 'instructions', prompt: x.toUpperCase(), expect: [{ answerMatches: 'fine' }] })) }));
      return file;
    };
    // EVAL_COPILOT points the runner at the fake (the plumbing of scripts/eval.mjs reads it).
    const some = t.copy(t.tmp());
    const out = t.tmp();
    const r = evalCli(t, ['--cases', cases(some), '--runs', '2', '--budget', '120', '--report', out], { cwd: some, env: { EVAL_COPILOT: mixed } });
    if (r.code !== 0) return `2 cases × 2 runs with a fake CLI where case-b never starts: the runs of case-a still count, so exit 0 (got ${r.code}): ${tail(r.out)}`;
    if (!/the session did not start \(fake CLI\)/.test(r.out)) return `Print the CLI's error (its stderr) for a run that failed. The output was: ${tail(r.out)}`;
    const rep = readJson(path.join(out, 'report.json'));
    const a = rep?.cases?.['case-a'];
    const b = rep?.cases?.['case-b'];
    if (a?.runs !== 2 || a?.passed !== 2) return `case-a ran fine twice: runs 2, passed 2 (got ${JSON.stringify(a ?? null).slice(0, 120)}).`;
    if (b?.runs !== 2 || b?.passed !== 0) return `A run that never started is a failed run, not a missing one: case-b should show runs 2, passed 0 (got ${JSON.stringify(b ?? null).slice(0, 120)}).`;
    const none = t.copy(t.tmp());
    const n = evalCli(t, ['--cases', cases(none), '--runs', '2', '--budget', '120'], { cwd: none, env: { EVAL_COPILOT: broken } });
    if (n.code !== 2) return `When no run starts (the CLI fails at once, every time), nothing was measured: exit 2, not ${n.code}. ${tail(n.out, 200)}`;
    if (!/below the minimum \(fake CLI\)/.test(n.out)) return `Say why nothing started: print the CLI's error. The output was: ${tail(n.out, 200)}`;
    const recorded = fs.existsSync(path.join(none, 'evals', 'runs')) ? fs.readdirSync(path.join(none, 'evals', 'runs'), { recursive: true }).map(String).filter((f) => /run-[^\\/]+[\\/]case-a\.jsonl$/.test(f)) : [];
    if (recorded.length !== 1) return 'Record the failed runs too (evals/runs/run-<stamp>/case-a.jsonl), so the attempt leaves a trace.';
    const results = fs.readFileSync(path.join(none, 'evals', 'runs', recorded[0]), 'utf8').split('\n').filter((l) => /"type"\s*:\s*"result"/.test(l));
    return (results.length === 2 && results.every((l) => !/"exitCode"\s*:\s*0\b/.test(l))) || `case-a.jsonl should end each of its 2 failed runs with a result event whose exitCode isn't 0; it has ${results.length}.`;
  }, { milestone: 'M2' }),
  t.check('The report of the recorded runs: pass rate, pass@k, variance and tokens per case', () => {
    const ref = reference(t);
    const out = t.tmp();
    const r = evalCli(t, ['--cases', ref.cases, '--from', ref.full, '--report', out]);
    if (r.code !== 0) return `node scripts/eval.mjs --from <recorded suite> --report <dir> should exit 0; it exited ${r.code}: ${tail(r.out)}`;
    const rep = readJson(path.join(out, 'report.json'));
    if (!rep?.cases) return 'No report.json with a "cases" object in the --report folder.';
    for (const [id, [passed, runs]] of Object.entries(FULL)) {
      const c = rep.cases[id];
      if (!c) return `report.json has nothing for ${id}: caseReport() returns nothing yet?`;
      if (c.runs !== runs) return `${id}: runs is ${show(c.runs)}; its recording has ${runs} runs.`;
      if (c.passed !== passed) return `${id}: ${show(c.passed)} of ${runs} runs pass; expected ${passed} (${WHY[id]}). Check score().`;
      if (!near(c.passRate, passed / runs)) return `${id}: passRate is ${show(c.passRate)}; expected ${passed}/${runs} = ${passed / runs}.`;
    }
    const at = (id, k) => rep.cases[id].passAtK?.[k];
    const rows = [
      ['skill-release', 'passAtK[2]', at('skill-release', 2), 0.5, '1 − C(3,2)/C(4,2)'],
      ['skill-release', 'passAtK[3]', at('skill-release', 3), 0.75, '1 − C(3,3)/C(4,3)'],
      ['mcp-grades', 'passAtK[2]', at('mcp-grades', 2), 5 / 6, '1 − C(2,2)/C(4,2)'],
      ['rules-pass-rule', 'passAtK[2]', at('rules-pass-rule', 2), 1, 'only 1 failing run, so any 2 hold a pass'],
      ['rules-footer', 'variance', rep.cases['rules-footer'].variance, 0, 'always passes'],
      ['rules-pass-rule', 'variance', rep.cases['rules-pass-rule'].variance, 0.1875, '.75 · .25'],
      ['mcp-grades', 'variance', rep.cases['mcp-grades'].variance, 0.25, '.5 · .5'],
      ['rules-footer', 'tokens.input', rep.cases['rules-footer'].tokens?.input, 18000, '(18200 + 17800 + 18100 + 17900) / 4'],
      ['rules-footer', 'tokens.output', rep.cases['rules-footer'].tokens?.output, 60, '(62 + 58 + 61 + 59) / 4'],
      ['skill-ects', 'tokens.input', rep.cases['skill-ects'].tokens?.input, 22500, '(24100 + 23900 + 18200 + 23800) / 4'],
      ['skill-ects', 'tokens.output', rep.cases['skill-ects'].tokens?.output, 130, '(140 + 150 + 80 + 150) / 4'],
    ];
    for (const [id, what, got, want, why] of rows) if (!near(got, want, what.startsWith('tokens') ? 0.5 : 1e-4)) return `${id}: ${what} is ${show(got)}; expected ${show(want)} (${why}).`;
    if (!near(rep.passRate, 0.78125)) return `The suite's passRate is ${show(rep.passRate)}; expected 0.78125 (the mean of the cases' pass rates: 6.25 / 8).`;
    const md = fs.existsSync(path.join(out, 'report.md')) ? fs.readFileSync(path.join(out, 'report.md'), 'utf8') : null;
    if (!md) return 'No report.md next to report.json.';
    const missing = Object.keys(FULL).filter((id) => !md.includes(id));
    return !missing.length || `report.md doesn't mention ${missing.join(', ')}.`;
  }, { milestone: 'M2' }),
  t.check('Your recordings parse, and the runner gives every case of your cases.json a row', () => {
    const files = t.find(/^evals\/runs\/.+\.jsonl$/);
    if (!files.length) return 'No recorded runs in evals/runs/ (the starter shipped some in evals/runs/full/).';
    const bad = [];
    for (const f of files) {
      const lines = (t.read(f) ?? '').split('\n').filter((l) => l.trim());
      const events = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } });
      if (!lines.length) bad.push(`${f} is empty`);
      else if (events.some((e) => !e || typeof e.type !== 'string')) bad.push(`${f} has a line that is not a JSON event`);
      else if (!events.some((e) => e.type === 'result')) bad.push(`${f} has no finished run (no result event)`);
    }
    if (bad.length) return `${bad.slice(0, 3).join('; ')}.`;
    const list = casesIn(t);
    const suite = t.exists('evals/runs/full') ? 'evals/runs/full' : path.posix.dirname(files[0]);
    const out = t.tmp();
    const r = evalCli(t, ['--from', suite, '--report', out]);
    if (r.code !== 0) return `node scripts/eval.mjs --from ${suite} exited ${r.code}: ${tail(r.out)}`;
    const rep = readJson(path.join(out, 'report.json'));
    const missing = list.map((c) => c?.id).filter((id) => typeof rep?.cases?.[id]?.runs !== 'number');
    return !missing.length || `report.json has no row (with its number of runs) for ${missing.join(', ')}.`;
  }, { milestone: 'M2' }),

  // ---------- M3 · Baseline ----------
  t.check('compare(): case by case, a drop beyond the threshold is a regression', async () => {
    const { compare } = await exportsOf(t, ['compare']);
    const base = report({ a: 1, b: 0.8, c: 0.5, d: 1 });
    const cur = report({ a: 0.75, b: 0.7, c: 0.75, e: 0 });
    let r;
    try { r = compare(base, cur, { threshold: 10 }); } catch (e) { return `compare() throws: ${e.message}`; }
    if (!r || typeof r.ok !== 'boolean' || !Array.isArray(r.regressions)) return 'compare() should return { ok, regressions: [{ id, before, after, dropPp }], improvements, missing, added }.';
    if (ids(r.regressions) !== 'a') return `With a 10 pp threshold only a regresses (100% → 75%: 25 pp). b drops exactly 10 pp, which is not beyond it (but 0.8 − 0.7 is 0.10000000000000009 in floating point: round), c improves, d and e aren't on both sides. Got [${ids(r.regressions)}].`;
    if (r.ok !== false) return 'A regression means ok: false.';
    if (!near(r.regressions[0].dropPp, 25, 0.1)) return `a dropped 25 percentage points; its dropPp is ${show(r.regressions[0].dropPp)}.`;
    if (!(r.missing ?? []).includes('d') || !(r.added ?? []).includes('e')) return 'List the cases on one side only, without judging them: missing (only in the baseline) ["d"], added (only in this run) ["e"].';
    if (compare(base, cur, { threshold: 25 })?.ok !== true) return 'With a 25 pp threshold, a 25 pp drop is not beyond it: ok is true.';
    if (ids(compare(base, cur)?.regressions) !== 'a') return 'Without options, the threshold is 10 pp.';
    return compare(base, base)?.ok === true || 'A suite compared with itself has no regression.';
  }, { milestone: 'M3' }),
  t.check('--baseline: exit 1 naming the cases that dropped, exit 0 within the threshold', () => {
    const ref = reference(t);
    const first = t.tmp();
    const b = evalCli(t, ['--cases', ref.cases, '--from', ref.full, '--report', first]);
    const baseline = path.join(first, 'report.json');
    if (b.code !== 0 || !fs.existsSync(baseline)) return `Scoring the recorded suite should exit 0 and write report.json (exit ${b.code}): ${tail(b.out)}`;
    const run = (threshold) => {
      const out = t.tmp();
      const r = evalCli(t, ['--cases', ref.cases, '--from', path.join(ref.runs, 'ablate-skills'), '--baseline', baseline, '--threshold', String(threshold), '--report', out]);
      return { ...r, regressions: ids(readJson(path.join(out, 'report.json'))?.comparison?.regressions) };
    };
    const r10 = run(10);
    if (r10.code !== 1) return `Without the skills layer, skill-ects drops 75 pp and skill-release 25 pp: --baseline with --threshold 10 must exit 1 (it exited ${r10.code}). ${tail(r10.out, 200)}`;
    if (r10.regressions !== 'skill-ects, skill-release') return `report.json's comparison.regressions should be skill-ects and skill-release; got [${r10.regressions}].`;
    const r30 = run(30);
    if (r30.code !== 1 || r30.regressions !== 'skill-ects') return `With --threshold 30 only skill-ects (75 pp) is beyond it: exit 1 and [skill-ects]; got exit ${r30.code} and [${r30.regressions}].`;
    const r80 = run(80);
    return r80.code === 0 || `With --threshold 80 no case drops beyond it, so exit 0 (got ${r80.code}).`;
  }, { milestone: 'M3' }),
  t.check('evals/baseline.json: a saved report of your suite, with every case', () => {
    const base = t.json('evals/baseline.json', '`evals/baseline.json` doesn\'t exist yet: save a report of your recorded suite as the baseline.');
    if (!base?.cases || typeof base.cases !== 'object' || Array.isArray(base.cases)) return 'evals/baseline.json should be a report: { "passRate", "cases": { "<id>": { "passRate", … } } }.';
    const bad = Object.entries(base.cases).filter(([, c]) => !(c && (c.passRate === null || (typeof c.passRate === 'number' && c.passRate >= 0 && c.passRate <= 1)))).map(([id]) => id);
    if (bad.length) return `Every case in the baseline needs a passRate from 0 to 1: ${bad.join(', ')}.`;
    if (!Object.values(base.cases).some((c) => typeof c.passRate === 'number')) return 'No case in the baseline has recorded runs: an empty baseline catches nothing.';
    const missing = casesIn(t).map((c) => c?.id).filter((id) => id && !(id in base.cases));
    return !missing.length || `The baseline has no row for ${missing.join(', ')}: score the suite again and save the new report (a new case needs a new baseline).`;
  }, { milestone: 'M3' }),

  // ---------- M4 · Ablation ----------
  t.check('ablation(): each layer\'s drop and the cases that depend on it, most valuable first', async () => {
    const { ablation } = await exportsOf(t, ['ablation']);
    const full = report({ a: 1, b: 0.5, c: 1 });
    let r;
    try { r = ablation(full, { x: report({ a: 1, b: 0.5, c: 0 }), y: report({ a: 0, b: 0, c: 1 }) }, { threshold: 10 }); } catch (e) { return `ablation() throws: ${e.message}`; }
    if (!Array.isArray(r) || r.length !== 2) return 'ablation(full, { x: report, y: report }) returns one entry per layer removed: [{ layer, before, after, dropPp, cases }, …].';
    if (r.map((l) => l?.layer).join() !== 'y,x') return `Most valuable first: without y the suite drops 50 pp (83.3% → 33.3%), without x 33.33 pp; got [${r.map((l) => l?.layer).join(', ')}].`;
    if (!near(r[0].dropPp, 50, 0.1) || !near(r[1].dropPp, 33.33, 0.1)) return `dropPp: y 50, x 33.33 (the drop of the suite's pass rate, in percentage points); got ${show(r[0].dropPp)} and ${show(r[1].dropPp)}.`;
    if (ids(r[0].cases) !== 'a, b' || ids(r[1].cases) !== 'c') return `A case depends on a layer when it drops by more than the threshold: y → a, b; x → c. Got y → [${ids(r[0].cases)}], x → [${ids(r[1].cases)}].`;
    const strict = ablation(full, { y: report({ a: 0, b: 0, c: 1 }) }, { threshold: 60 });
    return ids(strict?.[0]?.cases) === 'a' || 'With a 60 pp threshold only a (100 pp) depends on y; b drops 50 pp.';
  }, { milestone: 'M4' }),
  t.check('--ablate: the layer-value report of the recorded "layer removed" suites', () => {
    const ref = reference(t);
    const out = t.tmp();
    const r = evalCli(t, ['--cases', ref.cases, '--from', ref.full, '--ablate', 'all', '--report', out]);
    if (r.code !== 0) return `--ablate all should exit 0; it exited ${r.code}: ${tail(r.out)}`;
    const layers = readJson(path.join(out, 'layer-value.json'))?.layers;
    if (!Array.isArray(layers)) return 'No layer-value.json with a "layers" list in the --report folder.';
    const want = [['instructions', 15.625, 'rules-footer, rules-pass-rule'], ['skills', 9.375, 'skill-ects, skill-release'], ['hooks', -9.375, '']];
    if (layers.map((l) => l?.layer).join() !== want.map((w) => w[0]).join()) return `Three recorded suites without a layer, most valuable first: instructions, skills, hooks. Got [${layers.map((l) => l?.layer).join(', ')}].`;
    for (const [i, [layer, drop, deps]] of want.entries()) {
      if (!near(layers[i].dropPp, drop, 0.1)) return `Without ${layer} the suite goes from 78.125% to ${78.125 - drop}%: a drop of ${drop} pp. Got ${show(layers[i].dropPp)}.`;
      if (ids(layers[i].cases) !== deps) return `The cases that depend on ${layer} (more than 10 pp lost): [${deps || 'none'}]. Got [${ids(layers[i].cases)}].`;
    }
    if (!fs.existsSync(path.join(out, 'layer-value.md'))) return 'No layer-value.md next to layer-value.json.';
    const one = t.tmp();
    const s = evalCli(t, ['--cases', ref.cases, '--from', ref.full, '--ablate', 'skills', '--report', one]);
    const only = readJson(path.join(one, 'layer-value.json'))?.layers;
    return (s.code === 0 && only?.length === 1 && only[0]?.layer === 'skills') || `--ablate skills reports the skills layer only (exit ${s.code}).`;
  }, { milestone: 'M4' }),
];
