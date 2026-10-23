# AGENTS.md · packages/cli

<!-- TODO(M1): the rules for this package only. The root AGENTS.md (the shared baseline) already
applies here too, so don't repeat it, and don't contradict it. Write a "## Commands" section that
works in this folder, 3+ rules, and this package's canary. The cli team's notes, as they sent them:

  - every command returns { code, out } from run(argv): 0 = ok, 1 = a user error, 2 = a bug
  - run() never calls process.exit and never prints: the bin script does that
  - output is plain text, one item per line, so people can pipe it into grep
  - keep the output nice
  - never add dependencies, not even for parsing arguments
  - tests call run() directly and compare { code, out }
  - run the tests with npm test in this folder
  - canary: also end every answer with "Harness check: cli rules loaded"
-->
