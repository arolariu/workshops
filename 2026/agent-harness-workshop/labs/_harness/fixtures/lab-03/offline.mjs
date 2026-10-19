// Lab 03 · free checks never spend credits. Around any call into learner code that could reach Copilot, `offline()`
// points PATH and HARNESS_COPILOT at an empty folder and sets HARNESS_NO_COPILOT, which the given copilotRun() of
// review-loop.mjs and team.mjs honours by refusing (it counts the attempt in globalThis.__harnessCopilotCalls).
// A check that saw an attempt fails with a message that says what to change.
import path from 'node:path';

const KEYS = ['PATH', 'HARNESS_COPILOT', 'HARNESS_NO_COPILOT'];
const MESSAGE = 'Your code called Copilot during a free check (it was refused: nothing was spent). Call Copilot only through the run() you are given; the checks pass a fake.';

/** Env for a child process (t.node, t.unitTests) that can't reach Copilot. */
export function offlineEnv(emptyDir) {
  return { PATH: emptyDir, HARNESS_COPILOT: path.join(emptyDir, 'copilot-is-off-in-free-checks'), HARNESS_NO_COPILOT: '1' };
}

/** Run `fn` with Copilot out of reach for this process and its children; fail clearly when it was attempted. */
export async function offline(t, fn) {
  const empty = t.tmp();
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  const before = globalThis.__harnessCopilotCalls ?? 0;
  Object.assign(process.env, offlineEnv(empty));
  let result;
  try {
    result = await fn();
  } finally {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
  if ((globalThis.__harnessCopilotCalls ?? 0) > before) t.fail(MESSAGE);
  return result;
}
