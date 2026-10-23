// Free checks for Lab 00 · hard+: a flight recorder for Copilot runs. Nothing here calls Copilot: record() gets a fake
// runner, and compare/variance read the recorded runs in fixtures/flight/ (the reference copies) or broken copies of
// them made when the check runs.
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';

const FLIGHT = 'scripts/flight.mjs';
const fixture = (t, k) => path.join(t.solDir, 'fixtures', 'flight', `run-${k}`);
const events = (t, k) => fs.readFileSync(path.join(fixture(t, k), 'events.jsonl'), 'utf8');
const load = async (t, ...names) => {
  const m = await t.import(FLIGHT);
  for (const n of names) if (typeof m[n] !== 'function') t.fail(`${FLIGHT} must export ${n}().`);
  return m;
};
const show = (v) => JSON.stringify(v);
/** A copy of fixture run k in a temp folder, changed by `edit(dir)`. */
const copyRun = (t, k, name, edit = () => {}) => {
  const dir = path.join(t.tmp(), name);
  fs.cpSync(fixture(t, k), dir, { recursive: true });
  edit(dir);
  return dir;
};
const COMMIT = 'c0ffee0123456789abcdef0123456789abcdef01';
/** record() with a fake Copilot: every run prints `stdouts[k]` (or run 2's events) and exits with `codes[k]`. */
async function fakeRecord(t, { n = 3, model, stdouts = [], codes = [] } = {}) {
  const { record } = await load(t, 'record');
  const dir = t.tmp();
  const calls = [];
  const out = await record({
    prompt: 'Which functions does grades.js export?', n, model, dir,
    run: (args) => { const k = calls.push(args) - 1; return { code: codes[k] ?? 0, stdout: stdouts[k] ?? events(t, 2), stderr: codes[k] ? 'copilot: something went wrong' : '' }; },
    git: () => ({ commit: COMMIT, dirty: true }),
    cli: () => '9.9.9-0',
  });
  const found = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (/^run-\d+$/.test(e.name)) found.push(p); else walk(p); } } };
  walk(dir);
  found.sort((a, b) => Number(a.match(/(\d+)$/)[1]) - Number(b.match(/(\d+)$/)[1]));
  return { out, calls, dir, runs: found };
}
const readMeta = (dir) => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')); } catch { return null; } };

export default (t) => [
  t.check('record() records N runs: events.jsonl as it came, and meta.json next to it', async () => {
    const { runs, calls } = await fakeRecord(t);
    if (runs.length !== 3) return `record() wrote ${runs.length} run folder(s); expected 3 (runs/<series>/run-1 … run-3).`;
    if (calls.length !== 3) return `record() called Copilot ${calls.length} time(s); expected 3.`;
    if (new Set(runs.map((r) => path.dirname(r))).size !== 1) return 'The three runs of one series belong in one folder: runs/<series>/run-1 … run-3.';
    for (const r of runs) {
      const file = path.join(r, 'events.jsonl');
      if (!fs.existsSync(file)) return `${path.basename(r)} has no events.jsonl.`;
      if (fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') !== events(t, 2).replace(/\r\n/g, '\n')) return `${path.basename(r)}/events.jsonl is not exactly what Copilot printed: save stdout as it came.`;
      if (!readMeta(r)) return `${path.basename(r)} has no readable meta.json.`;
    }
    return true;
  }, { milestone: 'M1' }),
  t.check('meta.json says what ran: prompt, model, flags, commit, CLI, start time, exit code', async () => {
    const { runs, calls } = await fakeRecord(t, { n: 1 });
    const m = readMeta(runs[0] ?? '.');
    if (!m) return 'record() wrote no meta.json yet.';
    if (m.prompt !== 'Which functions does grades.js export?') return `meta.prompt should be the prompt, got ${show(m.prompt)}.`;
    if (m.model !== 'gpt-6.1-sol') return `meta.model should be the model the stream names ("gpt-6.1-sol"), got ${show(m.model)}.`;
    const flags = calls[0].filter((a, i, all) => !(a === '-p' || a === '--prompt' || all[i - 1] === '-p' || all[i - 1] === '--prompt'));
    if (show(m.flags) !== show(flags)) return `meta.flags should be the arguments without the prompt: ${show(flags)}, got ${show(m.flags)}.`;
    if (m.git?.commit !== COMMIT || m.git?.dirty !== true) return `meta.git should be what git() returned ({ commit, dirty }), got ${show(m.git)}.`;
    if (m.cli !== '9.9.9-0') return `meta.cli should be what cli() returned, got ${show(m.cli)}.`;
    if (Number.isNaN(Date.parse(m.startedAt ?? ''))) return `meta.startedAt should be an ISO date, got ${show(m.startedAt)}.`;
    return m.exitCode === 0 || `meta.exitCode should be Copilot's exit code (0), got ${show(m.exitCode)}.`;
  }, { milestone: 'M1' }),
  t.check('Every run is recorded read-only and capped (recordArgs), with --model when asked', async () => {
    const { calls, runs } = await fakeRecord(t, { n: 1, model: 'claude-x', stdouts: [''], codes: [0] });
    const args = (calls[0] ?? []).map(String);
    if (!args.includes('--deny-tool=write') && !args.join(' ').includes('--deny-tool write')) return `record() should run Copilot with recordArgs() (read-only, capped); it passed ${show(args)}.`;
    if (!args.some((a, i) => (a === '--model' && args[i + 1] === 'claude-x') || a === '--model=claude-x')) return 'record({ model }) should pass the model on: --model claude-x.';
    const m = readMeta(runs[0] ?? '.');
    return m?.model === 'claude-x' || `When the stream names no model (here it is empty), meta.model falls back to the --model you asked for; got ${show(m?.model)}.`;
  }, { milestone: 'M1' }),
  t.check('A run that fails is recorded too, and the series goes on', async () => {
    const { runs } = await fakeRecord(t, { stdouts: [undefined, '', undefined], codes: [0, 1, 0] });
    if (runs.length !== 3) return `A failed run must not stop the series: expected 3 run folders, got ${runs.length}.`;
    const m = readMeta(runs[1]);
    return m?.exitCode === 1 || `run-2 failed (exit 1): its meta.exitCode should say so, got ${show(m?.exitCode)}.`;
  }, { milestone: 'M1' }),

  t.check('loadRun() reads a recorded run: meta and summary', async () => {
    const { loadRun } = await load(t, 'loadRun');
    const r = loadRun(fixture(t, 2));
    if (r?.meta?.git?.commit !== '2e56d97e5c431397db6acc26994bd189ede69d82') return `loadRun(run-2).meta should be its meta.json, got ${show(r?.meta).slice(0, 160)}.`;
    if (r.summary?.events !== 33) return `loadRun(run-2).summary should be summarize() of its events.jsonl (33 events), got ${show(r.summary?.events)}.`;
    return (r.id === 'run-2' && Array.isArray(r.problems) && r.problems.length === 0) || `Expected id "run-2" and no problems, got ${show({ id: r.id, problems: r.problems })}.`;
  }, { milestone: 'M2' }),
  t.check('compare() two runs of one setup: tools, turns, tokens, outcome', async () => {
    const { loadRun, compare } = await load(t, 'loadRun', 'compare');
    const c = compare(loadRun(fixture(t, 2)), loadRun(fixture(t, 3)));
    if (!c) return 'compare() returns nothing yet.';
    const want = {
      setup: { same: true, differs: [] },
      tools: { a: ['skill', 'powershell', 'powershell', 'skill', 'powershell'], b: ['powershell', 'powershell'], same: false },
      turns: { a: 6, b: 3 }, toolCalls: { a: 5, b: 2 },
      tokens: { a: { input: 119891, output: 478 }, b: { input: 61840, output: 311 } },
      outcome: { a: 'denied', b: 'denied' },
    };
    for (const [k, w] of Object.entries(want)) if (!same(c[k], w)) return `compare(run-2, run-3).${k} should be ${show(w)}, got ${show(c[k])}.`;
    return true;
  }, { milestone: 'M2' }),
  t.check('compare() says when the setup differs', async () => {
    const { loadRun, compare } = await load(t, 'loadRun', 'compare');
    const c = compare(loadRun(fixture(t, 1)), loadRun(fixture(t, 2)));
    return same(c?.setup, { same: false, differs: ['commit'] }) || `run-1 ran on another commit: compare(run-1, run-2).setup should be {"same":false,"differs":["commit"]}, got ${show(c?.setup)}.`;
  }, { milestone: 'M2' }),
  t.check('node scripts/flight.mjs compare prints both runs, and warns about a different setup', () => {
    const same = t.node([FLIGHT, 'compare', fixture(t, 2), fixture(t, 3)]);
    if (same.code !== 0) return `compare failed: ${same.all.trim().slice(0, 200)}`;
    if (!/6 vs 3/.test(same.stdout) || /⚠/.test(same.stdout)) return `compare run-2 run-3 should print "6 vs 3" turns and no ⚠ (same setup). It printed: ${same.stdout.slice(0, 300)}`;
    const diff = t.node([FLIGHT, 'compare', fixture(t, 1), fixture(t, 2)]);
    return (/⚠/.test(diff.stdout) && /commit/.test(diff.stdout)) || `compare run-1 run-2 should warn (⚠) that the commit differs. It printed: ${diff.stdout.slice(0, 300)}`;
  }, { milestone: 'M2' }),

  t.check('variance() across the three recorded runs', async () => {
    const { loadRun, variance } = await load(t, 'loadRun', 'variance');
    const v = variance([1, 2, 3].map((k) => loadRun(fixture(t, k))));
    if (!v) return 'variance() returns nothing yet.';
    const want = {
      n: 3, measured: 3, turns: { min: 3, median: 5, max: 6 }, toolCalls: { min: 2, median: 4, max: 5 },
      tokens: { input: { min: 61840, median: 86609, max: 119891 }, output: { min: 311, median: 478, max: 558 } },
      tools: { powershell: 3, skill: 1 }, sequences: 3, outcomes: { denied: 3 },
    };
    for (const [k, w] of Object.entries(want)) {
      if (!same(v[k], w)) return `variance().${k} should be ${show(w)}, got ${show(v[k])}.`;
    }
    return same(v.setup, { same: false, differs: ['commit'] }) || `variance().setup should say the commit differs, got ${show(v.setup)}.`;
  }, { milestone: 'M3' }),
  t.check('The median of an even number of runs is the mean of the middle two', async () => {
    const { loadRun, variance } = await load(t, 'loadRun', 'variance');
    const v = variance([loadRun(fixture(t, 2)), loadRun(fixture(t, 3))]);
    return (v?.turns?.median === 4.5 && v.n === 2) || `variance(run-2, run-3).turns should be { min: 3, median: 4.5, max: 6 }, got ${show(v?.turns)}.`;
  }, { milestone: 'M3' }),
  t.check('node scripts/flight.mjs variance prints the report', () => {
    const dir = t.tmp();
    for (const k of [1, 2, 3]) fs.cpSync(fixture(t, k), path.join(dir, `run-${k}`), { recursive: true });
    const r = t.node([FLIGHT, 'variance', dir]);
    if (r.code !== 0) return `variance failed: ${r.all.trim().slice(0, 200)}`;
    const rows = [/\|\s*Turns\s*\|\s*3\s*\|\s*5\s*\|\s*6\s*\|/, /\|\s*Input tokens\s*\|\s*61840\s*\|\s*86609\s*\|\s*119891\s*\|/, /\|\s*powershell\s*\|\s*3\/3\s*\|/, /⚠[^\n]*commit/];
    const missing = rows.filter((re) => !re.test(r.stdout));
    return !missing.length || `The report is missing ${missing.map(String).join(', ')}. It printed: ${r.stdout.slice(0, 300)}`;
  }, { milestone: 'M3' }),

  t.check('A run that was cut off: broken last line, no result, named as a problem', async () => {
    const { loadRun, variance } = await load(t, 'loadRun', 'variance');
    const cut = copyRun(t, 2, 'run-cut', (d) => {
      const f = path.join(d, 'events.jsonl');
      const text = fs.readFileSync(f, 'utf8');
      fs.writeFileSync(f, text.slice(0, Math.floor(text.length * 0.6)));
    });
    const r = loadRun(cut);
    if (!r?.summary || r.summary.outcome !== 'incomplete' || r.summary.skipped < 1) return `A stream cut in the middle of a line: expected a summary with outcome "incomplete" and 1 skipped line, got ${show(r?.summary && { outcome: r.summary.outcome, skipped: r.summary.skipped })}.`;
    if (!r.problems?.length) return 'loadRun() should list what is wrong with the cut run in problems (a broken line, no result event).';
    const v = variance([loadRun(fixture(t, 1)), r, loadRun(fixture(t, 3))]);
    if (!(v?.outcomes?.incomplete === 1 && v.problems?.some((p) => p.run === 'run-cut'))) return `variance() should count the cut run as "incomplete" and list its problems with run "run-cut"; got outcomes ${show(v?.outcomes)}, problems ${show(v?.problems)}.`;
    return (v.measured === 2 && same(v.tokens?.input, { min: 61840, median: 74224.5, max: 86609 }) && same(v.turns, { min: 3, median: 4, max: 5 }))
      || `A run that stopped halfway would drag the spread down (its tokens stop at 0): keep it out of turns, toolCalls and tokens, and set measured to 2. Got measured ${show(v.measured)}, turns ${show(v.turns)}, input tokens ${show(v.tokens?.input)}.`;
  }, { milestone: 'M4' }),
  t.check('A run without meta.json: no crash, and the setup is unknown', async () => {
    const { loadRun, compare } = await load(t, 'loadRun', 'compare');
    const bare = copyRun(t, 3, 'run-bare', (d) => fs.rmSync(path.join(d, 'meta.json')));
    let r;
    try { r = loadRun(bare); } catch (e) { return `loadRun() threw on a run without meta.json (${e.message}): make it a problem instead.`; }
    if (r.meta !== null || !r.problems?.some((p) => /meta/i.test(p))) return `Expected meta null and a problem that mentions meta.json, got ${show({ meta: r.meta, problems: r.problems })}.`;
    const c = compare(loadRun(fixture(t, 2)), r);
    return (c?.setup?.same === false && c.setup.differs?.[0] === 'meta') || `Without meta.json nobody can say it's the same setup: setup should be { same: false, differs: ['meta', …] }, got ${show(c?.setup)}.`;
  }, { milestone: 'M4' }),
  t.check('A run without events is left out, and fewer than 2 runs is an error', async () => {
    const { loadRun, variance } = await load(t, 'loadRun', 'variance');
    const empty = copyRun(t, 1, 'run-empty', (d) => fs.rmSync(path.join(d, 'events.jsonl')));
    let r;
    try { r = loadRun(empty); } catch (e) { return `loadRun() threw on a run without events.jsonl (${e.message}): make it a problem instead.`; }
    if (r.summary !== null || !r.problems?.some((p) => /events/i.test(p))) return `Expected summary null and a problem that mentions events.jsonl, got ${show({ summary: r.summary, problems: r.problems })}.`;
    const v = variance([loadRun(fixture(t, 2)), loadRun(fixture(t, 3)), r]);
    if (v?.n !== 2 || !v.problems?.some((p) => p.run === 'run-empty')) return `variance() should leave the empty run out (n = 2) and list it in problems; got n ${show(v?.n)}, problems ${show(v?.problems)}.`;
    try { variance([loadRun(fixture(t, 2)), r]); } catch (e) { return /at least 2/i.test(e.message) || `Say "at least 2" in the error, got: ${e.message}`; }
    return 'variance() with one usable run should throw an Error that says it needs at least 2 runs.';
  }, { milestone: 'M4' }),
  t.check('The CLI refuses one run, and warns when the model differs', () => {
    const one = t.node([FLIGHT, 'variance', fixture(t, 1)]);
    if (one.code !== 1 || !/at least 2/i.test(one.all)) return `variance on a single run should exit 1 and say it needs at least 2 runs; it exited ${one.code}: ${one.all.trim().slice(0, 160)}`;
    const other = copyRun(t, 3, 'run-other-model', (d) => {
      const f = path.join(d, 'meta.json');
      fs.writeFileSync(f, JSON.stringify({ ...JSON.parse(fs.readFileSync(f, 'utf8')), model: 'claude-sonnet-5' }));
    });
    const r = t.node([FLIGHT, 'compare', fixture(t, 2), other]);
    return (r.code === 0 && /⚠/.test(r.stdout) && /model/.test(r.stdout)) || `compare with a run on another model should warn (⚠ … model). It printed: ${r.all.trim().slice(0, 300)}`;
  }, { milestone: 'M4' }),

  t.check('VARIANCE.md: the setup and the results', () => {
    const s = t.need('VARIANCE.md', 'VARIANCE.md is missing: it ships with the level.').replace(/<!--[\s\S]*?-->/g, '');
    const part = (title) => (s.split(/^##\s+/m).find((p) => p.toLowerCase().startsWith(title)) ?? '').split('\n').slice(1).join('\n');
    const setup = part('setup');
    const missing = [[/["“`].{10,}["”`]/, 'the prompt, in quotes'], [/\b([2-9]|\d{2,})\b[^\n]*\bruns?\b|\bN\s*=\s*\d/i, 'how many runs (N)'], [/\bmodel\b/i, 'the model'], [/\b[0-9a-f]{7,40}\b/, 'the commit']]
      .filter(([re]) => !re.test(setup)).map(([, w]) => w);
    if (missing.length) return `The Setup section should name ${missing.join(', ')}.`;
    const results = part('results');
    return (/\|\s*Turns\s*\|(\s*[\d.]+\s*\|){3}/.test(results) && /\|\s*Input tokens\s*\|/.test(results)) || 'Paste the report of `node scripts/flight.mjs variance <folder>` under Results (the Turns and Input tokens rows).';
  }, { milestone: 'M5' }),
  t.check('VARIANCE.md explains why one prompt gives different runs', () => {
    const s = (t.read('VARIANCE.md') ?? '').replace(/<!--[\s\S]*?-->/g, '');
    const part = (title) => (s.split(/^##\s+/m).find((p) => p.toLowerCase().startsWith(title)) ?? '').split('\n').slice(1).join('\n');
    const why = part('why');
    if (why.replace(/\s+/g, ' ').length < 200) return 'The "Why the runs differ" section needs a real explanation (a few sentences, with numbers from your results).';
    const ideas = [
      ['how the model picks each step (sampling, probabilities)', /sampl|temperature|probab|random|nondetermin|stochastic/i],
      ['what the harness sends every turn (the whole context, the history)', /context|history|stateless|re-?sent|whole conversation/i],
      ['how one different step changes the rest (it compounds)', /compound|diverg|snowball|drift|earl(y|ier) step|first step|changes? (the|every) (rest|later)/i],
      ['what in the setup can change (model, commit, flags, plugins)', /\bmodel\b|\bauto\b|commit|flag|plugin|skill|version/i],
    ];
    const missed = ideas.filter(([, re]) => !re.test(why)).map(([w]) => w);
    if (missed.length > 1) return `Explain more of what's going on. Not covered yet: ${missed.join('; ')}.`;
    if ((why.match(/\d{2,}/g) ?? []).length < 2) return 'Back the explanation with numbers from your results (turns, tokens).';
    const todo = part('what');
    const bullets = todo.split('\n').filter((l) => /^\s*[-*]\s+\S/.test(l));
    return (bullets.length >= 2 && /runs|\bN\b|median|average|spread|outcome|test|check|pin|eval/i.test(todo)) || 'Under "What I\'d do about it", 2+ bullets: how you\'d measure or test an agent whose runs differ.';
  }, { milestone: 'M5' }),
];
