// Free checks for Lab 03 · hard. The loop never calls the real Copilot here: a fake replays recorded reviewer answers
// (tests/fixtures/reviews.json) and records every call, so the checks see the arguments, the order and the handoff.
import fs from 'node:fs';
import path from 'node:path';
import { norm, flag, cap, REVIEWS, fakeCopilot, greenTests } from './helpers.mjs';
import { capsOf } from '../../../_harness/fixtures/lab-03/aliases.mjs';

const FIXER = '.github/agents/fixer.agent.md';
const REVIEWER = '.github/agents/reviewer.agent.md';
const LOOP_DIR = '.agent-logs/review-loop';
const load = (t) => t.import('scripts/review-loop.mjs');
// Any write or shell permission (shell(x) too), or allow-all.
const writes = (a) => norm(a).some((x) => /^--allow-tool=(write|shell)\b/.test(x)) || a.some((x) => /^--(allow-all|yolo|allow-all-tools)/.test(x));

/**
 * Run the learner's loop with a fake Copilot, inside a temp folder (so a relative dir lands there). The kit refuses a
 * real Copilot session in free checks. Returns { report, fake, dir } (dir: where the loop wrote, absolute).
 */
async function loop(t, answers, options = {}) {
  const { reviewLoop } = await load(t);
  const work = t.tmp();
  const fake = fakeCopilot(answers.map((a) => REVIEWS[a]), { failOn: options.failOn });
  const { failOn, ...rest } = options;
  const here = process.cwd();
  process.chdir(work);
  try {
    const report = await reviewLoop({ file: 'deadlines.js', maxRounds: 3, creditsPerRound: 80, dir: LOOP_DIR, run: fake.run, runTests: greenTests, ...rest });
    return { report, fake, dir: path.join(work, ...LOOP_DIR.split('/')) };
  } finally {
    process.chdir(here);
  }
}
const said = (fake) => fake.agents().join(' → ') || 'no calls';
const stopIs = (report, want) => (report?.stop === want ? true : `It stopped with ${JSON.stringify(report?.stop)}, expected "${want}".`);

export default (t) => [
  // M1 · Findings as JSON
  t.check('parseReview() reads JSON findings from an answer', async () => {
    const { parseReview } = await load(t);
    for (const [name, verdict, n] of [['issues3', 'ISSUES', 3], ['bare', 'ISSUES', 1], ['twoBlocks', 'ISSUES', 1], ['clean', 'CLEAN', 0]]) {
      const r = parseReview(REVIEWS[name]);
      if (!r?.ok) return `parseReview() rejected the recorded answer "${name}": ${r?.error ?? JSON.stringify(r)}`;
      if (r.verdict !== verdict || r.findings?.length !== n) return `For "${name}" expected ${verdict} with ${n} finding(s), got ${r.verdict} with ${r.findings?.length}.${name === 'twoBlocks' ? ' The answer quotes the format first: the LAST json block is the review.' : ''}`;
    }
    const f = parseReview(REVIEWS.issues3).findings[0];
    return (f.severity === 'high' && f.location === 'deadlines.js:23' && /done/.test(f.problem)) || `A finding should keep severity, location and problem, got ${JSON.stringify(f)}.`;
  }, { milestone: 'M1' }),
  t.check('...and rejects answers the fixer must never see', async () => {
    const { parseReview } = await load(t);
    const why = { table: 'no JSON at all', broken: 'JSON that does not parse', badSeverity: 'severity "critical"', noLocation: 'a finding without a location', cleanWithFindings: 'CLEAN with a finding', issuesEmpty: 'ISSUES without findings' };
    for (const [name, what] of Object.entries(why)) {
      const r = parseReview(REVIEWS[name]);
      if (r?.ok !== false) return `parseReview() accepted ${what} ("${name}"). Return { ok: false, error } for it.`;
      if (!String(r.error ?? '').trim()) return `Say why "${name}" was rejected: { ok: false, error: "…" }.`;
    }
    return true;
  }, { milestone: 'M1' }),
  t.check('The reviewer can answer in JSON, and stays read-only', () => {
    const { data, body } = t.frontmatter(REVIEWER);
    const c = capsOf(data.tools);
    const extra = c.all ? ['every tool'] : [...c.caps].filter((x) => !['read', 'search'].includes(x));
    if (extra.length || !c.caps.size) return `The reviewer must stay read-only (read, search): ${extra.join(', ') || 'no tools'}.`;
    const missing = ['json', 'verdict', 'findings', 'severity', 'location'].filter((w) => !new RegExp(w, 'i').test(body));
    return !missing.length || `Its instructions should give the JSON format (a script reads it): missing ${missing.join(', ')}.`;
  }, { milestone: 'M1' }),
  t.check("reviewerArgs()'s prompt asks for JSON and names the file", async () => {
    const { reviewerArgs } = await load(t);
    const p = flag(reviewerArgs('deadlines.js'), '-p') ?? '';
    if (!/deadlines\.js/.test(p)) return 'The -p prompt should name the file to review.';
    return /json/i.test(p) || 'Ask for the JSON format in the prompt: the loop parses the answer.';
  }, { milestone: 'M1' }),

  // M2 · Two roles, two permission sets
  t.check('The fixer agent can read, edit and run', () => {
    const { data } = t.frontmatter(FIXER, `Create \`${FIXER}\`.`);
    const description = String(data.description ?? '');
    if (description.length < 20 || /\bTODO\b/.test(description)) return 'Write a description: what it does and when to use it.';
    if (data.tools == null) return 'Add a `tools:` list: without one, the agent gets every tool.';
    const c = capsOf(data.tools);
    const missing = ['read', 'edit', 'execute'].filter((x) => !c.all && !c.caps.has(x));
    return !missing.length || `Add these tools: ${missing.join(', ')}.`;
  }, { milestone: 'M2' }),
  t.check('The fixer works from the findings file, tests every fix, never pushes', () => {
    const { body } = t.frontmatter(FIXER);
    const missing = [];
    if (/\bTODO\b/.test(body)) missing.push('(replace the TODO)');
    if (!/only/i.test(body) || !/finding/i.test(body)) missing.push('fix only the findings');
    if (!/json/i.test(body)) missing.push('read the JSON findings file it is given');
    if (!/test/i.test(body)) missing.push('add a test per fix');
    if (!/npm test/.test(body)) missing.push('run npm test');
    if (!/push/i.test(body)) missing.push('never git push');
    return !missing.length || `Its instructions should say: ${missing.join('; ')}.`;
  }, { milestone: 'M2' }),
  t.check('reviewerArgs(): the reviewer, read-only, quiet, with its cap', async () => {
    const { reviewerArgs } = await load(t);
    const a = reviewerArgs('deadlines.js', { credits: 40 });
    if (!a?.length) return 'reviewerArgs() returns nothing yet.';
    if (flag(a, '--agent') !== 'reviewer') return 'Run the reviewer agent (--agent reviewer).';
    if (writes(a)) return 'The reviewer must not get write or shell permission.';
    if (!a.includes('-s')) return 'Add -s: the loop parses the answer, not the stats.';
    if (cap(a) !== 40) return `reviewerArgs(file, { credits: 40 }) should cap the call at 40 (--max-ai-credits=40), got ${flag(a, '--max-ai-credits')}.`;
    return cap(reviewerArgs('deadlines.js')) >= 30 || 'Without options, cap it at 30 (the smallest cap Copilot accepts).';
  }, { milestone: 'M2' }),
  t.check('fixerArgs(): the fixer, the findings file, write and npm, never push', async () => {
    const { fixerArgs } = await load(t);
    const a = fixerArgs('deadlines.js', '.agent-logs/review-loop/round-1.findings.json', { credits: 50 });
    if (!a?.length) return 'fixerArgs() returns nothing yet.';
    if (flag(a, '--agent') !== 'fixer') return 'Run the fixer agent (--agent fixer).';
    if (!(flag(a, '-p') ?? '').includes('.agent-logs/review-loop/round-1.findings.json')) return 'Put the findings file in the -p prompt so the fixer can read it.';
    const n = norm(a);
    if (!n.includes('--allow-tool=write')) return 'The fixer needs --allow-tool=write.';
    if (!n.some((x) => /^--allow-tool=shell\(npm/.test(x))) return 'Allow npm: --allow-tool=shell(npm:*).';
    if (n.some((x) => /^--allow-tool=shell(\(\))?$/.test(x)) || a.some((x) => /^--(allow-all|yolo|allow-all-tools)/.test(x))) return 'No --allow-all and no bare shell permission in a loop!';
    if (!n.includes('--deny-tool=shell(git push)')) return 'Deny pushing: --deny-tool=shell(git push).';
    return cap(a) === 50 || `fixerArgs(…, { credits: 50 }) should cap the call at 50, got ${flag(a, '--max-ai-credits')}.`;
  }, { milestone: 'M2' }),
  t.check('roundBudget() splits a round between two capped calls', async () => {
    const { roundBudget } = await load(t);
    for (const n of [60, 80, 100]) {
      const b = roundBudget(n);
      if (!(Number.isInteger(b?.reviewer) && Number.isInteger(b?.fixer))) return `roundBudget(${n}) should return { reviewer, fixer } as whole credits, got ${JSON.stringify(b)}.`;
      if (b.reviewer < 30 || b.fixer < 30) return `roundBudget(${n}) gives a call less than 30 credits (${JSON.stringify(b)}): Copilot's smallest cap is 30.`;
      if (b.reviewer + b.fixer > n) return `roundBudget(${n}) spends ${b.reviewer + b.fixer}, more than the round's ${n}.`;
    }
    for (const bad of [50, 'lots']) {
      let threw = false;
      try { roundBudget(bad); } catch { threw = true; }
      if (!threw) return `roundBudget(${JSON.stringify(bad)}) should throw: two calls need at least 60 credits.`;
    }
    return true;
  }, { milestone: 'M2' }),

  // M3 · The loop and its stop rules
  t.check('Review, fix, review, fix, review: it stops when the code is clean', async () => {
    const { report, fake } = await loop(t, ['issues3', 'issues1', 'clean']);
    const want = 'reviewer → fixer → reviewer → fixer → reviewer';
    if (said(fake) !== want) return `Expected the calls ${want}, got ${said(fake)}.`;
    if (report?.rounds?.length !== 3) return `Expected 3 rounds in the report, got ${report?.rounds?.length}.`;
    return stopIs(report, 'clean');
  }, { milestone: 'M3' }),
  t.check('Every call has its cap, and a round stays within its budget', async () => {
    const { fake } = await loop(t, ['issues3', 'issues1', 'clean']);
    const missing = fake.calls.filter((c) => !(cap(c.args) >= 30));
    if (missing.length) return `This call has no cap of 30+: ${missing[0].agent} (${flag(missing[0].args, '--max-ai-credits') ?? 'no --max-ai-credits'}).`;
    for (let i = 0; i + 1 < fake.calls.length; i += 2) {
      const sum = cap(fake.calls[i].args) + cap(fake.calls[i + 1].args);
      if (sum > 80) return `Round ${i / 2 + 1} may spend ${sum} credits with creditsPerRound: 80. Use roundBudget().`;
    }
    const writer = fake.calls.find((c) => c.agent === 'reviewer' && writes(c.args));
    return !writer || 'A reviewer call got write or shell permission: build it with reviewerArgs().';
  }, { milestone: 'M3' }),
  t.check("The fixer gets the review's findings as a JSON file", async () => {
    const { parseReview } = await load(t);
    const { fake } = await loop(t, ['issues3', 'issues1', 'clean']);
    const fixes = fake.calls.filter((c) => c.agent === 'fixer');
    for (const [i, name] of ['issues3', 'issues1'].entries()) {
      const c = fixes[i];
      if (!c) return `Expected a fixer call after the review "${name}".`;
      if (!c.findingsFile) return 'The fixer prompt names no .json file: write the findings to a file and give the fixer its path.';
      if (!c.findings) return `The fixer was told to read ${c.findingsFile}, but it doesn't exist (or isn't JSON) when the fixer runs.`;
      const got = (c.findings.findings ?? []).map((f) => `${f.severity} ${f.location}`).join(', ');
      const want = parseReview(REVIEWS[name]).findings.map((f) => `${f.severity} ${f.location}`).join(', ');
      if (got !== want) return `Round ${i + 1}: the findings file should hold the review's findings (${want}), got: ${got || JSON.stringify(c.findings).slice(0, 120)}.`;
    }
    return true;
  }, { milestone: 'M3' }),
  t.check('It stops when the score stops going down (not the count), and at the maximum', async () => {
    const stuck = await loop(t, ['issues3', 'issues3again']);
    if (stuck.report?.stop !== 'no-progress') return `Two reviews with the same score (6, then 6) should stop with "no-progress", got ${JSON.stringify(stuck.report?.stop)} (calls: ${said(stuck.fake)}).`;
    if (said(stuck.fake) !== 'reviewer → fixer → reviewer') return `When nothing improved, don't ask the fixer again: got ${said(stuck.fake)}.`;
    const fewer = await loop(t, ['issues3low', 'issues1high']);
    if (fewer.report?.stop !== 'no-progress') return `Three lows (score 3), then one high (score 3): fewer findings, but nothing got better. Expected "no-progress", got ${JSON.stringify(fewer.report?.stop)} (calls: ${said(fewer.fake)}). Compare scores, not counts.`;
    const better = await loop(t, ['issues3', 'issues3low'], { maxRounds: 2 });
    if (said(better.fake) !== 'reviewer → fixer → reviewer → fixer') return `Three findings (score 6), then three lows (score 3): the same count, but better. With maxRounds: 2 expected reviewer → fixer → reviewer → fixer, got ${said(better.fake)}.`;
    return stopIs(better.report, 'max-rounds');
  }, { milestone: 'M3' }),
  t.check('It never hands an unreadable review to the fixer', async () => {
    const { report, fake } = await loop(t, ['table']);
    if (fake.calls.some((c) => c.agent === 'fixer')) return 'The review had no JSON, and the fixer was called anyway.';
    return stopIs(report, 'unreadable');
  }, { milestone: 'M3' }),
  t.check('It refuses a budget below two calls, and stops on a failed call (with a report)', async () => {
    const poor = await loop(t, ['issues3'], { creditsPerRound: 50 });
    if (poor.fake.calls.length) return `With creditsPerRound: 50 no call can be paid for (2 × 30), but it made ${poor.fake.calls.length}.`;
    if (poor.report?.stop !== 'budget') return `With creditsPerRound: 50 expected the stop "budget", got ${JSON.stringify(poor.report?.stop)}.`;
    const failed = await loop(t, ['issues3', 'clean'], { failOn: 'fixer' });
    if (failed.fake.calls.length !== 2) return `After the fixer's call failed, the loop went on: ${said(failed.fake)}.`;
    const stop = stopIs(failed.report, 'error');
    if (stop !== true) return stop;
    const file = path.join(failed.dir, 'report.json');
    if (!fs.existsSync(file)) return 'A loop that stopped on an error still writes report.json: call finish() at every exit.';
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    return (saved.stop === 'error' && saved.rounds?.length === 1 && Boolean(saved.rounds[0].findingsFile)) || `report.json after the failed fix should say stop "error", with round 1 and its findings file: got ${JSON.stringify({ stop: saved.stop, rounds: saved.rounds?.length })}.`;
  }, { milestone: 'M3' }),

  // M4 · The run report
  t.check('report.json: every round, its caps and tests, and why it stopped', async () => {
    const { report, dir } = await loop(t, ['issues3', 'issues1', 'clean']);
    const file = path.join(dir, 'report.json');
    if (!fs.existsSync(file)) return 'No report.json in the loop\'s folder (dir).';
    let saved;
    try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return 'report.json is not valid JSON.'; }
    if (saved.stop !== 'clean' || saved.file !== 'deadlines.js') return `report.json should say file "deadlines.js" and stop "clean", got ${JSON.stringify({ file: saved.file, stop: saved.stop })}.`;
    const [r1, , r3] = saved.rounds ?? [];
    if (!r1 || !r3) return 'report.json should list every round.';
    const want1 = { round: 1, verdict: 'ISSUES', findings: 3, score: 6 };
    for (const [k, v] of Object.entries(want1)) if (r1[k] !== v) return `Round 1 should have ${k}: ${JSON.stringify(v)}, got ${JSON.stringify(r1[k])}.`;
    if (!(r1.credits?.reviewer >= 30 && r1.credits?.fixer >= 30)) return `Round 1 should record both caps: credits { reviewer, fixer }, got ${JSON.stringify(r1.credits)}.`;
    if (r1.tests?.pass !== 13 || r1.tests?.fail !== 0) return `Round 1 should record the tests after the fix: tests { pass, fail }, got ${JSON.stringify(r1.tests)}.`;
    if (r3.verdict !== 'CLEAN' || r3.credits?.fixer != null) return `Round 3 is clean: no fixer, so credits.fixer is null; got ${JSON.stringify(r3)}.`;
    return JSON.stringify(saved) === JSON.stringify(report) || 'reviewLoop() should return the same report it saved.';
  }, { milestone: 'M4' }),
  t.check('report.md: one row per round, and the stop reason', async () => {
    const { renderReport } = await load(t);
    const { report, dir } = await loop(t, ['issues3', 'issues1', 'clean']);
    const file = path.join(dir, 'report.md');
    if (!fs.existsSync(file)) return 'No report.md in the loop\'s folder (dir).';
    const md = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    if (md !== renderReport(report)) return 'report.md should be exactly renderReport(report).';
    const header = md.split('\n').find((l) => /^\|\s*Round/.test(l)) ?? '';
    const cols = header.split('|').map((c) => c.trim()).filter(Boolean);
    if (cols.join(',') !== 'Round,Verdict,Findings,Score,Credits,Tests') return `The table's columns should be Round, Verdict, Findings, Score, Credits, Tests; got ${cols.join(', ') || 'no table'}.`;
    const rows = md.split('\n').filter((l) => /^\|\s*\d+\s*\|/.test(l));
    if (rows.length !== 3) return `Expected 3 rows (one per round), got ${rows.length}.`;
    if (!/^Stopped: clean\b/m.test(md)) return 'End with a line "Stopped: clean. <why>".';
    const poor = await loop(t, ['issues3'], { creditsPerRound: 50 });
    return /^Stopped: budget\b/m.test(renderReport(poor.report)) || 'A loop that never started still gets a report: "Stopped: budget. …".';
  }, { milestone: 'M4' }),
  t.check('The dry run shows both agents and their caps', () => {
    const r = t.node(['scripts/review-loop.mjs', 'deadlines.js', '--dry-run']);
    const lines = r.stdout.split('\n');
    const rev = lines.find((l) => /--agent reviewer/.test(l));
    const fix = lines.find((l) => /--agent fixer/.test(l));
    if (!rev || !fix) return `The dry run should print both commands. ${r.stderr.trim().slice(0, 200)}`;
    return (/--max-ai-credits/.test(rev) && /--max-ai-credits/.test(fix)) || 'Both commands should show their --max-ai-credits cap.';
  }, { milestone: 'M4' }),
];
