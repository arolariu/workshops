// 🤖 Agent check: real commits after a tag; the agent writes the notes with YOUR skill.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export default [
  {
    name: 'Release notes from real history, nothing invented',
    prompt: 'Prepare the release notes for the next version.',
    allow: ['write', 'shell(node:*)', 'shell(git:*)'],
    timeout: 360000,
    setup: (t) => {
      const git = (...a) => execFileSync('git', ['-c', 'user.name=Check', '-c', 'user.email=check@example.com', '-c', 'commit.gpgsign=false', ...a], { cwd: t.dir, stdio: 'ignore' });
      git('tag', 'v1.0.0');
      const lines = fs.readFileSync(path.join(t.dir, 'fixtures', 'git-log.txt'), 'utf8').split(/\r?\n/).filter(Boolean);
      for (const line of lines) git('commit', '-q', '--allow-empty', '-m', line.split('\t')[1]);
    },
    expect: (t) => {
      const log = t.read('CHANGELOG.md');
      if (!log) return 'CHANGELOG.md was not written.';
      if (!/Unreleased/i.test(log)) return 'No "Unreleased" section.';
      if (!/gpa/i.test(log) || !/Node 18/i.test(log)) return 'The notes miss the gpa feature or the Node 18 breaking change.';
      if (/cover exam grades|nothing to see here/i.test(log)) return 'Test or chore commits slipped into the notes.';
      return true;
    },
  },
];
