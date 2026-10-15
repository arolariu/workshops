// Free checks for Lab 00 · hard.
import fs from 'node:fs';
import path from 'node:path';

const sample = (t) => fs.readFileSync(path.join(t.exDir, 'tests', 'sample-run.jsonl'), 'utf8').split(/\r?\n/);
const load = async (t) => {
  const m = await t.import('scripts/run-stats.mjs');
  if (typeof m.summarize !== 'function') t.fail('scripts/run-stats.mjs must export summarize().');
  return m;
};
// Accept both "--flag=value" and "--flag", "value" (two array items).
const VALUE_FLAGS = new Set(['-p', '--prompt', '--agent', '--allow-tool', '--deny-tool', '--max-ai-credits', '--output-format', '--model', '--plugin-dir']);
const norm = (args) => {
  const out = [];
  const list = Array.isArray(args) ? args.map(String) : [];
  for (let i = 0; i < list.length; i++) {
    if (VALUE_FLAGS.has(list[i]) && i + 1 < list.length) out.push(`${list[i]}=${list[++i]}`);
    else out.push(list[i]);
  }
  return out;
};
const flagValue = (args, name) => {
  const hit = norm(args).find((a) => a.startsWith(`${name}=`));
  return hit === undefined ? undefined : hit.slice(name.length + 1);
};

export default (t) => [
  t.check('summarize() counts events and skips broken lines', async () => {
    const { summarize } = await load(t);
    const s = summarize(sample(t));
    return (s.events === 10 && s.skipped === 1) || `Expected 10 events and 1 skipped line, got events=${s.events}, skipped=${s.skipped}. (Blank lines don't count at all.)`;
  }),
  t.check('summarize() counts events per type', async () => {
    const { summarize } = await load(t);
    const s = summarize(sample(t));
    const ok = s.byType?.['tool.execution_start'] === 2 && s.byType?.['assistant.usage'] === 2 && s.byType?.['session.start'] === 1;
    return ok || `byType looks off: ${JSON.stringify(s.byType)}`;
  }),
  t.check('summarize() counts tool calls per tool', async () => {
    const { summarize } = await load(t);
    const s = summarize(sample(t));
    const tools = s.tools ?? {};
    const ok = Object.keys(tools).length === 2 && tools.bash === 1 && tools.view === 1;
    return ok || `Expected tools {"bash":1,"view":1}, got ${JSON.stringify(s.tools)}`;
  }),
  t.check('summarize() adds up the tokens', async () => {
    const { summarize } = await load(t);
    const s = summarize(sample(t));
    return (s.tokens?.input === 7000 && s.tokens?.output === 405) || `Expected 7000 in / 405 out, got ${JSON.stringify(s.tokens)}`;
  }),
  t.check('summarize() survives odd input', async () => {
    const { summarize } = await load(t);
    const a = summarize([]);
    const b = summarize(['', '   ', '{"type":"ping"}']);
    return (a.events === 0 && a.skipped === 0 && b.events === 1 && b.skipped === 0 && b.byType.ping === 1) || 'Empty input should give 0 events; blank lines are ignored; an event without data still counts.';
  }),
  t.check('The CLI prints the summary', () => {
    const r = t.node(['scripts/run-stats.mjs', 'fixtures/sample-run.jsonl']);
    return (r.code === 0 && /bash/.test(r.stdout) && /7000/.test(r.stdout)) || `Running the script did not print the expected summary. ${r.stderr.trim().slice(0, 200)}`;
  }),
  t.check('recordArgs() asks for a safe, scripted run', async () => {
    const { recordArgs } = await load(t);
    if (typeof recordArgs !== 'function') return 'scripts/run-stats.mjs must export recordArgs().';
    const args = recordArgs('PROMPT');
    if (!Array.isArray(args) || !args.length) return 'recordArgs() returns an empty list.';
    if (flagValue(args, '-p') !== 'PROMPT' && flagValue(args, '--prompt') !== 'PROMPT') return 'Pass the prompt with -p.';
    if (flagValue(args, '--output-format') !== 'json') return 'Ask for JSON events (--output-format json).';
    const cap = Number(flagValue(args, '--max-ai-credits'));
    if (!(cap >= 30 && cap <= 50)) return 'Add a credit cap between 30 and 50 (--max-ai-credits).';
    if (!norm(args).some((a) => /^--deny-tool=.*write/.test(a))) return 'Deny file writes (--deny-tool=write).';
    if (args.some((a) => /^--(allow-all|yolo|allow-all-tools)\b/.test(a))) return 'No --allow-all / --yolo in a recording run!';
    return true;
  }),
];
