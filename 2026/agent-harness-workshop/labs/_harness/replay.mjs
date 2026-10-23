// The agent-loop replay (spec §5.7 Phase 3): step through a recorded Copilot CLI run (`--output-format json`, one event
// per line), turn by turn: what the model read, what it wrote, what the harness decided, and what went back into the
// history. Two scripted recordings ship in replays/ (the same task without and with a harness); any real recording works.
// Recordings may carry two annotation events of our own, each for the turn that follows it:
//   { "type": "harness.context", "data": { "segments": [{ "name": "system", "tokens": 9800 }, …] } }
//   { "type": "harness.note", "data": { "text": "…" } }
import fs from 'node:fs';
import path from 'node:path';

export const REPLAYS_DIR = path.join(import.meta.dirname, 'replays');
export const REPLAYS = [
  { id: 'bare', file: 'bare.jsonl', title: 'No harness' },
  { id: 'harnessed', file: 'harnessed.jsonl', title: 'With a harness' },
];

/** { events, problems }: every line that is a JSON event; problems name the lines that are not (blank lines are fine). */
export function parseRecording(text) {
  const events = [];
  const problems = [];
  String(text ?? '').split('\n').forEach((line, i) => {
    const s = line.trim();
    if (!s) return;
    try {
      const e = JSON.parse(s);
      if (e && typeof e.type === 'string') events.push(e);
      else problems.push(`line ${i + 1}: not an event (no "type")`);
    } catch {
      problems.push(`line ${i + 1}: not JSON`);
    }
  });
  return { events, problems };
}

const textOf = (result) => {
  if (result == null) return '';
  if (typeof result === 'string') return result;
  return String(result.content ?? result.detailedContent ?? '');
};

/**
 * [{ n, prompt, context, notes, said, calls: [{ id, tool, arguments }], decisions: [{ id, tool, ok, by, message }],
 *    results: [{ id, text }], answer }]
 * A turn runs from assistant.turn_start to assistant.turn_end (or the next start). Tool events outside a turn open one.
 * decisions: ok = the tool ran and succeeded; by = 'hook' | 'permissions' when the harness denied it (else null).
 * said: what the model wrote along the way. answer: its last message, when no tool event came after it.
 */
export function replayTurns(events) {
  const turns = [];
  let prompt = null;
  let pending = { context: null, notes: [] };
  let cur = null;
  const open = () => {
    cur = { n: turns.length + 1, prompt, context: pending.context, notes: pending.notes, said: null, calls: [], decisions: [], results: [], answer: null };
    pending = { context: null, notes: [] };
    turns.push(cur);
    return cur;
  };
  const turn = () => cur ?? open();
  const toolName = (id) => turns.flatMap((t) => t.calls).find((c) => c.id === id)?.tool ?? 'tool';
  // A message without tool requests is the answer if nothing happens after it; otherwise it was a remark on the way.
  let lastText = null;
  const remark = (t, text) => { t.said = t.said ? `${t.said}\n\n${text}` : text; };
  const flush = () => { if (lastText) remark(lastText.t, lastText.text); lastText = null; };
  for (const e of events) {
    const d = e.data ?? {};
    switch (e.type) {
      case 'user.message': if (prompt === null && typeof d.content === 'string') prompt = d.content; break;
      case 'harness.context': if (Array.isArray(d.segments)) pending.context = d.segments.filter((s) => s && typeof s.name === 'string').map((s) => ({ name: s.name, tokens: Number(s.tokens) || 0 })); break;
      case 'harness.note': if (typeof d.text === 'string') pending.notes = [...pending.notes, d.text]; break;
      case 'assistant.turn_start': open(); break;
      case 'assistant.turn_end': cur = null; break;
      case 'assistant.message': {
        const t = turn();
        const requests = Array.isArray(d.toolRequests) ? d.toolRequests : [];
        const text = typeof d.content === 'string' ? d.content.trim() : '';
        if (requests.length) { flush(); if (text) remark(t, text); } else if (text) { flush(); lastText = { t, text }; }
        for (const r of requests) {
          if (r?.toolCallId && !t.calls.some((c) => c.id === r.toolCallId)) t.calls.push({ id: r.toolCallId, tool: String(r.name ?? 'tool'), arguments: r.arguments ?? {} });
        }
        break;
      }
      case 'tool.execution_start': {
        flush();
        const t = turn();
        if (d.toolCallId && !t.calls.some((c) => c.id === d.toolCallId)) t.calls.push({ id: d.toolCallId, tool: String(d.toolName ?? 'tool'), arguments: d.arguments ?? {} });
        break;
      }
      case 'tool.execution_complete': {
        if (!d.toolCallId) break;
        flush();
        const t = turn();
        const msg = String(d.error?.message ?? '');
        const hook = msg.match(/^Denied by (\w+) hook:\s*(.*)$/s);
        const denied = !d.success && d.error?.code === 'denied';
        t.decisions.push({ id: d.toolCallId, tool: toolName(d.toolCallId), ok: Boolean(d.success), by: denied ? (hook ? 'hook' : 'permissions') : null, message: hook ? hook[2].trim() : msg });
        t.results.push({ id: d.toolCallId, text: d.success ? textOf(d.result) : msg });
        break;
      }
      default: break;
    }
  }
  if (pending.notes.length && turns.length) turns.at(-1).notes.push(...pending.notes);
  if (lastText) lastText.t.answer = lastText.text;
  for (const t of turns) t.prompt = prompt;
  return turns;
}

/**
 * A recording by id ('bare', 'harnessed') or file path: { id, title, file, scripted, prompt, turns, problems } or { error }.
 * scripted: one of ours (the token numbers are illustrative); a file you recorded yourself is not.
 */
export function loadReplay(which = 'bare') {
  const known = REPLAYS.find((r) => r.id === which);
  if (!known && !/\.jsonl?$/i.test(String(which)) && !fs.existsSync(String(which))) {
    return { error: `There is no recording "${which}". Use bare, harnessed, or a .jsonl file from \`copilot -p … --output-format json\`.` };
  }
  const file = known ? path.join(REPLAYS_DIR, known.file) : path.resolve(String(which));
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    return { error: `Could not read ${file}: ${e.code === 'EISDIR' ? 'it is a folder' : e.message}` };
  }
  const { events, problems } = parseRecording(text);
  const turns = replayTurns(events);
  if (!turns.length) return { error: `${file} has no turns to replay${problems.length ? ` (${problems.length} unreadable line${problems.length === 1 ? '' : 's'})` : ''}.` };
  return { id: known?.id ?? path.basename(file), title: known?.title ?? path.basename(file), file, scripted: Boolean(known), prompt: turns[0].prompt, turns, problems };
}

/** The other shipped recording (tab on the replay screen); a file of your own switches to the bare one. */
export const otherReplay = (id) => (id === 'bare' ? 'harnessed' : 'bare');
