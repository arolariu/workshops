// 🤖 Agent check: record one real run with YOUR flight recorder (one Copilot session, capped by your recordArgs()),
// then read it back. The agent-check runner makes the copy a git repository, so meta.json gets a real commit.
import fs from 'node:fs';

const PROMPT = 'Which functions does grades.js export? Answer in one line.';

export default [
  {
    name: 'Record a real run with its metadata',
    command: ['node', 'scripts/flight.mjs', 'record', '--n', '1', PROMPT],
    prompts: 1,
    expect: async (t, { output }) => {
      const metas = t.files('runs').filter((f) => /\/run-1\/meta\.json$/.test(f));
      if (metas.length !== 1) return `Expected one runs/<series>/run-1/meta.json, found ${metas.length}. ${output.trim().slice(-200)}`;
      const meta = JSON.parse(fs.readFileSync(t.path(metas[0]), 'utf8'));
      const flags = (meta.flags ?? []).join(' ');
      if (meta.prompt !== PROMPT) return `meta.prompt is ${JSON.stringify(meta.prompt)}.`;
      if (!/--max-ai-credits[= ](3\d|4\d|50)\b/.test(flags) || !/--deny-tool[= ]write/.test(flags)) return `meta.flags should hold the capped, read-only flags of recordArgs(): ${flags}`;
      if (!/^[0-9a-f]{40}$/.test(String(meta.git?.commit ?? ''))) return `meta.git.commit should be the copy's commit, got ${JSON.stringify(meta.git)}.`;
      if (typeof meta.model !== 'string' || !meta.model) return 'meta.model should name the model the run used (the stream says which).';
      const { loadRun } = await t.import('scripts/flight.mjs');
      const run = loadRun(t.path(metas[0].replace(/\/meta\.json$/, '')));
      return (run.summary?.events > 0 && run.summary.exitCode === 0) || `The recorded events don't read back: ${JSON.stringify(run.problems)}`;
    },
  },
];
