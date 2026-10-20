// 🤖 Agent check: one real eval run of one case with YOUR runner: one Copilot session, capped by YOUR evalArgs()
// and refused by YOUR plan() if the budget can't cover it. The setup adds a neutral case, so the check measures the
// runner, not your harness: whatever the model answers, one run is recorded and reported.
import fs from 'node:fs';

const CASE = {
  id: 'eval-smoke',
  layer: 'instructions',
  prompt: 'Which modules does this project have? Answer in one sentence.',
  expect: [{ answerMatches: '\\w' }],
};

export default [
  {
    name: 'One real run of one case, recorded and reported',
    setup: (t) => {
      const file = t.path('evals/cases.json');
      const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
      const list = Array.isArray(cfg) ? cfg : cfg.cases ?? [];
      const next = [...list.filter((c) => c?.id !== CASE.id), CASE];
      fs.writeFileSync(file, JSON.stringify(Array.isArray(cfg) ? next : { ...cfg, cases: next }, null, 2));
    },
    command: ['node', 'scripts/eval.mjs', '--runs', '1', '--case', CASE.id, '--budget', '30'],
    prompts: 1, // one copilot -p run; its own --max-ai-credits caps it
    timeout: 400000,
    expect: (t, { output, code }) => {
      // The exit code and the runner's own words first: a run that never started reads as one, not as a format problem.
      const said = `exit code ${code}; the output ends with: ${output.trim().slice(-400) || '(nothing)'}`;
      if (code !== 0) return `eval.mjs failed (${said})`;
      const files = t.files('evals/runs').filter((f) => /\/run-[^/]+\/eval-smoke\.jsonl$/.test(f)).sort();
      if (!files.length) return `No evals/runs/run-<stamp>/eval-smoke.jsonl was recorded (${said}).`;
      const events = (t.read(files.at(-1)) ?? '').split('\n').filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } });
      const results = events.filter((e) => e?.type === 'result');
      if (results.length !== 1) return `The recording should hold one run (one result event); it has ${results.length} (${said}).`;
      if (results[0].note || results[0].exitCode !== 0) return `The run failed: Copilot exited with code ${results[0].exitCode}${results[0].note ? ' before its result event (it never started)' : ''} (${said}).`;
      if (!events.some((e) => e?.type === 'user.message' && e.data?.content === CASE.prompt)) return `The run finished, but its recording has no user.message with the case's prompt: is --output-format json in evalArgs()? (${said})`;
      let rep = null;
      try { rep = JSON.parse(t.read('evals/reports/report.json') ?? 'null'); } catch { /* reported below */ }
      const c = rep?.cases?.[CASE.id];
      if (c?.runs !== 1) return `evals/reports/report.json should show 1 run of ${CASE.id}; got ${JSON.stringify(c ?? null).slice(0, 200)}.`;
      if (!(c.tokens?.input > 0)) return 'The report has no tokens for the run: did it end with its usage events?';
      const args = (c.args ?? []).join(' ');
      return (/--max-ai-credits[= ]\d+/.test(args) && /--deny-tool[= ]write/.test(args) && !/--allow-all|--yolo/.test(args)) || `The report's arguments should be capped and read-only: ${args || '(none)'}`;
    },
  },
];
