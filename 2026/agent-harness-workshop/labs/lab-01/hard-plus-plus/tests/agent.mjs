// 🤖 Agent check: one case of YOUR canary suite, for real (1 prompt, capped by --max-ai-credits in canaries.mjs).
// Started in packages/cli, Copilot loads the package's AGENTS.md and the root's: the answer must carry both canaries,
// and no other package's.
export default [
  {
    name: 'Started in packages/cli, the answer carries both canaries and no other package\'s',
    command: ['node', 'scripts/canaries.mjs', '--only', 'cli'],
    prompts: 1,
    timeout: 300000,
    allowNonZero: true,
    expect: (t) => {
      const r = t.json('runs/canaries.json', 'runs/canaries.json was not written: the suite stopped before the end (see its output).');
      const cli = (r.results ?? []).find((x) => x.id === 'cli');
      if (!cli) return 'runs/canaries.json has no result for the cli case.';
      if (cli.missing?.length) return `Missing in the answer: ${cli.missing.join(', ')}. Is the canary rule in packages/cli/AGENTS.md clear, and does it say "also", next to the baseline's? The answer ended: ${String(cli.answer ?? '').slice(-160)}`;
      if (cli.leaked?.length) return `Another package's rules leaked into the cli answer: ${cli.leaked.join(', ')}.`;
      return cli.pass === true || 'The cli case did not pass.';
    },
  },
];
