// Free checks never spend AI credits: whatever your script does, it runs (or loads) where Copilot can't be found.
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const STARTED = /⏳|ENOENT|is not recognized|command not found|copilot: not found/i;
const SPENT = 'It tried to start Copilot during a free check, which would spend AI credits: check how it reads its options (a dry run or --from must never run Copilot).';

/** Run `node <args>` with an empty PATH (and HARNESS_COPILOT pointing nowhere): { code, stdout, stderr, all, triedCopilot, spent }. */
export function freeNode(t, args, { cwd = t.dir, timeout = 60000 } = {}) {
  const empty = t.tmp();
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^path$/i.test(k)));
  env.PATH = empty;
  env.HARNESS_COPILOT = path.join(empty, 'copilot-is-not-here');
  const r = spawnSync(process.execPath, args, { cwd, env, encoding: 'utf8', timeout });
  const all = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', all, triedCopilot: STARTED.test(all), spent: SPENT };
}

/** t.import(rel), with PATH emptied while the module loads (a script that runs its CLI on import can't reach Copilot). */
export async function freeImport(t, rel) {
  const saved = { PATH: process.env.PATH, HARNESS_COPILOT: process.env.HARNESS_COPILOT };
  const empty = t.tmp();
  process.env.PATH = empty;
  process.env.HARNESS_COPILOT = path.join(empty, 'copilot-is-not-here');
  try {
    return await t.import(rel);
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}
