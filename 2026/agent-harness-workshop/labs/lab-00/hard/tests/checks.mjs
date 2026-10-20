// Free checks for Lab 00 · hard: run-stats reads real Copilot JSON streams, a unit suite proves it, and recordArgs()
// records new runs read-only with a credit cap.
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import { MUTANTS, mutant } from './mutants.mjs';

// The fixtures are read from the reference copy, so editing your own copies can't change what the checks expect.
const lines = (t, name) => fs.readFileSync(path.join(t.solDir, 'fixtures', `${name}.jsonl`), 'utf8').split(/\r?\n/);
const load = async (t) => {
  const m = await t.import('scripts/run-stats.mjs');
  if (typeof m.summarize !== 'function') t.fail('scripts/run-stats.mjs must export summarize().');
  return m;
};
const run = async (t, name) => (await load(t)).summarize(lines(t, name));
const show = (v) => JSON.stringify(v);
const tokensOf = (s) => s?.tokens && { input: s.tokens.input, output: s.tokens.output, cacheRead: s.tokens.cacheRead };
const sameTools = (got, want, file) => {
  for (const [name, w] of Object.entries(want)) {
    const g = got?.[name];
    const pick = g && { calls: g.calls, ok: g.ok, failed: g.failed, denied: g.denied };
    if (!same(pick, w)) return `${file}: tools.${name} should be ${show(w)}, got ${show(g)}.`;
  }
  return Object.keys(got ?? {}).length === Object.keys(want).length || `${file}: tools should have exactly ${Object.keys(want).join(', ')}, got ${Object.keys(got ?? {}).join(', ')}.`;
};
const timeline = (s) => (s.turns ?? []).map((t) => `${t.id}: ${(t.tools ?? []).map((x) => `${x.name} ${x.outcome}`).join(', ')}`);

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

// M4: the learner's suite, run against a copy of their folder with another run-stats.mjs in place.
const SUITE = 'test/run-stats.test.mjs';
function suiteWith(t, source) {
  const copy = t.copy(t.tmp());
  fs.writeFileSync(path.join(copy, 'scripts', 'run-stats.mjs'), source);
  return t.unitTests({ cwd: copy, files: [SUITE] });
}

export default (t) => [
  t.check('summarize() reads every event of a real run', async () => {
    const s = await run(t, 'ok');
    if (s.events !== 22) return `summarize() counted ${s.events ?? 0} events; fixtures/ok.jsonl has 22 (one per line, streaming pieces included).`;
    if (s.skipped !== 0) return `fixtures/ok.jsonl has no broken lines, but skipped is ${s.skipped}.`;
    const by = s.byType ?? {};
    if (by['assistant.turn_start'] !== 3 || by['tool.execution_start'] !== 3 || by['assistant.message_delta'] !== 2 || by.result !== 1) return `byType looks off: ${show(by).slice(0, 220)}`;
    return s.model === 'gpt-6.1-sol' || `model should be the first data.model in the stream ("gpt-6.1-sol"), got ${show(s.model)}.`;
  }, { milestone: 'M1' }),
  t.check('summarize() survives odd input', async () => {
    const { summarize } = await load(t);
    const a = summarize([]);
    const b = summarize(['', '   ', 'not json', '{"type":"ping"}', '[1, 2]', '{"type":"user.message","data":{"content":"hi"}}']);
    if (a.events !== 0 || a.skipped !== 0) return `Empty input: expected 0 events and 0 skipped, got ${a.events}/${a.skipped}.`;
    if (b.events !== 2 || b.skipped !== 2) return `Blank lines don't count; "not json" and "[1, 2]" (not an event object) are skipped; an event without data still counts. Expected 2 events and 2 skipped, got ${b.events}/${b.skipped}.`;
    return b.byType?.ping === 1 || 'byType should count the "ping" event.';
  }, { milestone: 'M1' }),

  t.check('Tools and their outcomes: ok, denied and failed', async () => {
    const want = {
      ok: { skill: { calls: 1, ok: 1, failed: 0, denied: 0 }, view: { calls: 2, ok: 2, failed: 0, denied: 0 } },
      denied: { skill: { calls: 1, ok: 1, failed: 0, denied: 0 }, powershell: { calls: 1, ok: 0, failed: 0, denied: 1 } },
      failed: { skill: { calls: 1, ok: 1, failed: 0, denied: 0 }, view: { calls: 2, ok: 1, failed: 1, denied: 0 } },
    };
    for (const [name, w] of Object.entries(want)) {
      const r = sameTools((await run(t, name)).tools, w, `${name}.jsonl`);
      if (r !== true) return r;
    }
    return true;
  }, { milestone: 'M2' }),
  t.check('A call is matched to its result by toolCallId, not by order', async () => {
    const { summarize } = await load(t);
    const ev = (type, data) => JSON.stringify({ type, data });
    const s = summarize([
      ev('tool.execution_start', { toolCallId: 'a', toolName: 'view', turnId: '0' }),
      ev('tool.execution_start', { toolCallId: 'b', toolName: 'bash', turnId: '0' }),
      ev('tool.execution_complete', { toolCallId: 'b', success: false, error: { message: 'Denied by preToolUse hook: no', code: 'denied' } }),
      ev('tool.execution_complete', { toolCallId: 'a', success: true, result: { content: 'x' } }),
    ]);
    return (s.tools?.view?.ok === 1 && s.tools?.bash?.denied === 1) || `Two calls in one turn finish in the other order: view should be ok and bash denied, got ${show(s.tools)}.`;
  }, { milestone: 'M2' }),

  t.check('Tokens come from the last usage checkpoint, summed over models', async () => {
    const { summarize } = await load(t);
    const ok = await run(t, 'ok');
    if (!same(tokensOf(ok), { input: 55924, output: 253, cacheRead: 36509 })) return `ok.jsonl: tokens should be {"input":55924,"output":253,"cacheRead":36509}, got ${show(ok.tokens)}. Look in session.usage_checkpoint → data.accountingSnapshot.modelMetrics.`;
    const cp = (models) => JSON.stringify({ type: 'session.usage_checkpoint', data: { accountingSnapshot: { modelMetrics: models } } });
    const u = (i, o, c) => ({ usage: { inputTokens: i, outputTokens: o, cacheReadTokens: c } });
    const s = summarize([cp({ a: u(10, 1, 5) }), cp({ a: u(100, 10, 50), b: u(1000, 100, 500) })]);
    return same(tokensOf(s), { input: 1100, output: 110, cacheRead: 550 })
      || `With two checkpoints, the last one holds the totals (each is a running total, so don't add them up), and its models are summed: expected {"input":1100,"output":110,"cacheRead":550}, got ${show(s.tokens)}.`;
  }, { milestone: 'M3' }),
  t.check('The outcome: a denial is not a failure; an error or a non-zero exit is; no result means incomplete', async () => {
    const want = { ok: ['ok', 0, 0], denied: ['ok', 0, 0], failed: ['failed', 1, 1] };
    for (const [name, [outcome, exit, errors]] of Object.entries(want)) {
      const s = await run(t, name);
      if (s.outcome !== outcome || s.exitCode !== exit || (s.errors ?? []).length !== errors) return `${name}.jsonl: expected outcome "${outcome}", exitCode ${exit} and ${errors} error(s), got "${s.outcome}", ${s.exitCode} and ${(s.errors ?? []).length}.`;
      if (s.premiumRequests !== 1) return `${name}.jsonl: premiumRequests is 1 (result.usage.premiumRequests), got ${s.premiumRequests}.`;
    }
    const { summarize } = await load(t);
    const cut = summarize(lines(t, 'ok').filter((l) => !/"type":"result"/.test(l)));
    return (cut.outcome === 'incomplete' && cut.exitCode === null) || `A run without its result event (killed, or still running) is "incomplete" with exitCode null, got "${cut.outcome}" and ${cut.exitCode}.`;
  }, { milestone: 'M3' }),
  t.check('A timeline per turn: which tools ran, how they ended, and when the model spoke', async () => {
    const want = {
      ok: ['0: skill ok', '1: view ok, view ok', '2: '],
      denied: ['0: skill ok', '1: powershell denied', '2: '],
      failed: ['0: skill ok', '1: view failed, view ok', '2: '],
    };
    for (const [name, w] of Object.entries(want)) {
      const s = await run(t, name);
      if (show(timeline(s)) !== show(w)) return `${name}.jsonl: turns should read ${show(w)}, got ${show(timeline(s))}.`;
    }
    const s = await run(t, 'ok');
    return (s.turns[2].said === true && s.turns[0].said === false) || 'said is true for a turn whose assistant.message has text (turn 2 of ok.jsonl), false otherwise.';
  }, { milestone: 'M3' }),
  t.check('The CLI prints the summary and the timeline', () => {
    const r = t.node(['scripts/run-stats.mjs', path.join(t.solDir, 'fixtures', 'denied.jsonl')]);
    if (r.code !== 0) return `node scripts/run-stats.mjs fixtures/denied.jsonl failed: ${r.all.trim().slice(0, 200)}`;
    return (/powershell 0\/1 ok \(1 denied\)/.test(r.stdout) && /56853 in/.test(r.stdout) && /turn 1\s+⛔ powershell/.test(r.stdout)) || `The printout is missing the tools, the tokens or the timeline: ${r.stdout.slice(0, 300)}`;
  }, { milestone: 'M3' }),

  t.check('Your suite tests all three fixtures', () => {
    const s = t.read(SUITE);
    if (s == null) return `\`${SUITE}\` is missing: it ships with the level (start over with x if you deleted it).`;
    const missing = ['ok', 'denied', 'failed'].filter((n) => !new RegExp(`['"\`/]${n}(\\.jsonl)?['"\`]`).test(s));
    return !missing.length || `Your suite doesn't read ${missing.map((n) => `fixtures/${n}.jsonl`).join(', ')} yet.`;
  }, { milestone: 'M4' }),
  t.check('Your suite passes on your run-stats.mjs', () => {
    const r = t.unitTests({ files: [SUITE] });
    if (r.total < 3) return `node --test ${SUITE} ran ${r.total} test(s): write at least one per fixture.`;
    return r.fail === 0 || `${r.fail} test(s) fail: ${r.failing.slice(0, 3).join(' | ')}`;
  }, { milestone: 'M4' }),
  t.check('Your suite agrees with the reference, and catches all five mutants', () => {
    const reference = t.sol('scripts/run-stats.mjs');
    const control = suiteWith(t, reference);
    if (control.fail || !control.pass) return `Your suite fails on the reference run-stats.mjs (${control.failing.slice(0, 2).join(' | ')}): test the fields todo.md lists, not extras of your own.`;
    const survivors = MUTANTS.filter((name) => suiteWith(t, mutant(name, reference)).fail === 0);
    return !survivors.length || `These broken run-stats.mjs still pass your suite: ${survivors.join(', ')}. Add assertions that one of them gets wrong.`;
  }, { milestone: 'M4', timeout: 120000 }),

  t.check('recordArgs(): prompt mode, JSON events, read-only, a credit cap', async () => {
    const { recordArgs } = await load(t);
    if (typeof recordArgs !== 'function') return 'scripts/run-stats.mjs must export recordArgs().';
    const args = recordArgs('PROMPT');
    if (!Array.isArray(args) || !args.length) return 'recordArgs() returns nothing yet.';
    const n = norm(args);
    if (flag(args, '-p') !== 'PROMPT' && flag(args, '--prompt') !== 'PROMPT') return 'Pass the prompt with -p.';
    if (flag(args, '--output-format') !== 'json') return 'Ask for JSON events (--output-format json).';
    if (!n.includes('--no-ask-user')) return 'A script has nobody to answer questions: add --no-ask-user.';
    const cap = Number(flag(args, '--max-ai-credits'));
    if (!(cap >= 30 && cap <= 50)) return 'Add a credit cap between 30 and 50 (--max-ai-credits; 30 is the minimum).';
    if (n.some((a) => /^--(allow-all|yolo|allow-all-tools|allow-all-paths|allow-all-urls)\b/.test(a))) return 'No --allow-all / --yolo in a recording run!';
    if (n.some((a) => a.startsWith('--allow-tool'))) return 'A read-only recording allows nothing extra: no --allow-tool at all.';
    if (!n.includes('--deny-tool=write')) return 'Deny the file tools that write: --deny-tool=write.';
    return n.includes('--deny-tool=shell') || 'The shell can write files too (echo > file): --deny-tool=shell.';
  }, { milestone: 'M5' }),
  t.check('recordArgs() picks a model only when asked', async () => {
    const { recordArgs } = await load(t);
    if (typeof recordArgs !== 'function') return 'scripts/run-stats.mjs must export recordArgs().';
    if (flag(recordArgs('P'), '--model') !== undefined) return 'Without a model, leave --model out (Copilot uses your default).';
    return flag(recordArgs('P', { model: 'gpt-x' }), '--model') === 'gpt-x' || "recordArgs('P', { model: 'gpt-x' }) should add --model gpt-x.";
  }, { milestone: 'M5' }),
];
