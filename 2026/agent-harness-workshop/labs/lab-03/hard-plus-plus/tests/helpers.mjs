// Shared helpers for the Lab 03 hard++ checks: the recorded run, and a fake Copilot that replays it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyFixes } from '../../../_harness/fixtures/lab-03/deadlines-fixes.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const RUN = path.join(HERE, 'fixtures', 'run');
export const AGENTS = ['planner', 'implementer', 'tester', 'reviewer'];
/** What each agent answered in the recorded run (tests/fixtures/run/answers/<agent>.md). */
export const ANSWERS = Object.fromEntries(AGENTS.map((a) => [a, fs.readFileSync(path.join(RUN, 'answers', `${a}.md`), 'utf8')]));
/** The artifacts the recorded run left behind (tests/fixtures/run/artifacts/), LF line endings. */
export const artifact = (name) => fs.readFileSync(path.join(RUN, 'artifacts', name), 'utf8').replace(/\r\n/g, '\n');
export const GOAL = 'Fix the three bugs in BUGS.md so that the red tests in deadlines.test.js pass';

// Accept both "--flag=value" and "--flag", "value" (two array items).
const VALUE_FLAGS = new Set(['-p', '--prompt', '--agent', '--allow-tool', '--deny-tool', '--max-ai-credits']);
export const norm = (args) => {
  const out = [];
  const list = Array.isArray(args) ? args.map(String) : [];
  for (let i = 0; i < list.length; i++) {
    if (VALUE_FLAGS.has(list[i]) && i + 1 < list.length) out.push(`${list[i]}=${list[++i]}`);
    else out.push(list[i]);
  }
  return out;
};
export const flag = (args, name) => {
  const hit = norm(args).find((a) => a.startsWith(`${name}=`));
  return hit === undefined ? undefined : hit.slice(name.length + 1);
};

/**
 * A fake Copilot for the team, working in `work`: each agent replays its recorded answer (or one from `answers`); the
 * implementer also makes the recorded edit (the review's three fixes in deadlines.js) and any `extraEdits`, and the
 * tester makes any `testerEdits` (paths relative to `work`).
 */
export function fakeTeam(work, reference, { answers = {}, extraEdits = {}, testerEdits = {} } = {}) {
  const calls = [];
  const write = (edits) => {
    for (const [file, text] of Object.entries(edits)) fs.writeFileSync(path.join(work, file), typeof text === 'function' ? text(fs.readFileSync(path.join(work, file), 'utf8')) : text);
  };
  const run = (args) => {
    const agent = flag(args, '--agent');
    calls.push({ agent, args: [...args] });
    if (agent === 'implementer') {
      fs.writeFileSync(path.join(work, 'deadlines.js'), applyFixes(reference));
      write(extraEdits);
    }
    if (agent === 'tester') write(testerEdits);
    const answer = answers[agent] ?? ANSWERS[agent];
    if (answer === undefined) throw new Error(`the fake team has no agent called ${agent}`);
    return answer;
  };
  return { run, calls, agents: () => calls.map((c) => c.agent).join(' → ') || 'no calls' };
}
