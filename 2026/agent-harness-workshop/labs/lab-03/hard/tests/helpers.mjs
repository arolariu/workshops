// Shared helpers for the Lab 03 hard checks: read Copilot arguments, and a fake Copilot that replays recorded answers.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Accept both "--flag=value" and "--flag", "value" (two array items).
const VALUE_FLAGS = new Set(['-p', '--prompt', '--agent', '--allow-tool', '--deny-tool', '--max-ai-credits', '--output-format', '--model', '--plugin-dir']);
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
export const cap = (args) => Number(flag(args, '--max-ai-credits'));

export const REVIEWS = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'reviews.json'), 'utf8'));

/**
 * A fake Copilot: the reviewer replays `answers` in order; the fixer "fixes" and reads the findings file its prompt
 * names (at call time, like the real fixer would). `failOn: 'fixer'` makes the fixer's call fail.
 */
export function fakeCopilot(answers, { failOn } = {}) {
  const queue = [...answers];
  const calls = [];
  const run = (args) => {
    const agent = flag(args, '--agent');
    const call = { agent, args: [...args] };
    calls.push(call);
    if (agent === failOn) throw new Error('copilot exited with 1: the fake was told to fail');
    if (agent === 'reviewer') {
      if (!queue.length) throw new Error('the fake reviewer has no more recorded answers');
      return queue.shift();
    }
    const file = (flag(args, '-p') ?? '').match(/([^\s`'"(]+\.json)\b/)?.[1];
    call.findingsFile = file ?? null;
    try { call.findings = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { call.findings = null; }
    return 'Fixed the findings and added a regression test for each. npm test: all green.';
  };
  return { run, calls, agents: () => calls.map((c) => c.agent) };
}
export const greenTests = () => ({ pass: 13, fail: 0 });
