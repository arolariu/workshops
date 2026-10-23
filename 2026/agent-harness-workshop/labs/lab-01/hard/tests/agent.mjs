// 🤖 Agent check: run YOUR experiment for real, 1 run per variant (2 prompts, each capped by your --max-ai-credits).
// It used to be flaky: the "without" run could still open AGENTS.md with its view tool and repeat the canary. Now every
// variant runs in a copy without scripts/ and evals/ (they quote the canary), the "without" copy has no instruction
// files at all, and this check makes sure no file in it mentioned the canary.
import path from 'node:path';

export default [
  {
    name: 'The experiment is honest: the canary shows up with instructions, and only then',
    command: ['node', 'scripts/ab.mjs', '--runs', '1'],
    prompts: 2,
    timeout: 600000,
    allowNonZero: true,
    expect: (t) => {
      const r = t.json('runs/ab-results.json', 'runs/ab-results.json was not written: the script stopped before the end (see its output).');
      const results = r.results ?? [];
      const w = results.filter((x) => x.variant === 'with');
      const wo = results.filter((x) => x.variant === 'without');
      if (w.length !== 1 || wo.length !== 1) return `Expected 1 run per variant, got with ${w.length}, without ${wo.length}.`;
      const folder = path.resolve(String(wo[0].folder ?? ''));
      if (!wo[0].folder || folder === path.resolve(t.dir)) return 'The "without" run must happen in a copy of the folder, not in the folder itself.';
      if (!Array.isArray(wo[0].instructions) || wo[0].instructions.length) return `The "without" copy still had instruction files: ${(wo[0].instructions ?? ['(not recorded)']).join(', ')}. The model can read them with its view tool.`;
      if (!Array.isArray(wo[0].canaryFiles) || wo[0].canaryFiles.length) return `In the "without" copy, these files quote the canary: ${(wo[0].canaryFiles ?? ['(not recorded)']).join(', ')}. The model can read them too.`;
      if (!(w[0].instructions ?? []).includes('AGENTS.md')) return 'The "with" copy had no AGENTS.md.';
      const s = r.summary ?? {};
      if (!s.with?.hits?.canary) return `With instructions, the answer had no canary. Is the canary rule in AGENTS.md clear? The answer ended: ${String(w[0].answer ?? '').slice(-160)}`;
      if (s.without?.hits?.canary) return 'Without instructions, the answer still had the canary: where did the model read it?';
      return t.exists('runs/ab-report.md') || 'runs/ab-report.md was not written.';
    },
  },
];
