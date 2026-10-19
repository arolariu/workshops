// The agent trace (spec §5.7 Phase 3): Copilot CLI's `--output-format json` events (one JSON object per line) turned into
// what the agent said (the same text `-s` prints in text mode), a timeline of its tool calls with what the harness decided,
// and the token use Copilot reported. Event names and fields: see the Phase 3 plan's spike findings (Copilot CLI 1.0.99-2).

const ARG_KEYS = ['path', 'command', 'pattern', 'skill', 'query', 'url', 'file', 'name'];
const PATH_KEYS = new Set(['path', 'file']);
const slash = (s) => s.replace(/\\/g, '/').replace(/\/+$/, '');
function relativeTo(p, cwd) {
  if (!cwd) return p;
  const base = slash(cwd).toLowerCase();
  const full = slash(p);
  if (full.toLowerCase() === base) return '.';
  return full.toLowerCase().startsWith(`${base}/`) ? full.slice(base.length + 1) : p;
}
function summary(args, cwd) {
  if (!args || typeof args !== 'object') return '';
  const key = ARG_KEYS.find((k) => typeof args[k] === 'string');
  const v = key ? args[key] : Object.values(args).find((x) => typeof x === 'string') ?? '';
  if (PATH_KEYS.has(key)) {
    const p = slash(relativeTo(v.trim(), cwd)) || '.';
    return p.length > 40 ? `…${p.slice(-39)}` : p;
  }
  const one = String(v).replace(/\s+/g, ' ').trim();
  return one.length > 40 ? `${one.slice(0, 39)}…` : one;
}

/**
 * { ok, events, output, answer, timeline, usage }. ok: at least one event was parsed (else show the raw stdout).
 * answer: the last message. cwd: the folder the agent ran in, so its absolute paths read as relative ones.
 */
export function parseTrace(stdout, { cwd } = {}) {
  const events = [];
  for (const line of String(stdout ?? '').split('\n')) {
    const s = line.trim();
    if (!s.startsWith('{')) continue;
    try {
      const e = JSON.parse(s);
      if (e && typeof e.type === 'string') events.push(e);
    } catch { /* not an event */ }
  }
  if (!events.length) return { ok: false, events: 0, output: '', answer: '', timeline: [], usage: null };
  const texts = [];
  const steps = new Map();
  let checkpoint = null;
  let result = null;
  for (const e of events) {
    const d = e.data ?? {};
    if (e.type === 'assistant.message' && typeof d.content === 'string' && d.content.trim()) texts.push(d.content.trim());
    else if (e.type === 'tool.execution_start' && d.toolCallId) steps.set(d.toolCallId, { kind: 'running', tool: String(d.toolName ?? 'tool'), summary: summary(d.arguments, cwd), by: null, message: '' });
    else if (e.type === 'tool.execution_complete' && d.toolCallId) {
      const step = steps.get(d.toolCallId) ?? { tool: 'tool', summary: '', by: null };
      const msg = String(d.error?.message ?? '');
      if (d.success) Object.assign(step, { kind: 'tool', message: '' });
      else if (d.error?.code === 'denied') {
        const hook = msg.match(/^Denied by (\w+) hook:\s*(.*)$/s);
        Object.assign(step, { kind: 'denied', by: hook ? 'hook' : 'permissions', message: hook ? hook[2].trim() : msg });
      } else Object.assign(step, { kind: 'failed', message: msg });
      steps.set(d.toolCallId, step);
    } else if (e.type === 'session.usage_checkpoint') checkpoint = d;
    else if (e.type === 'result') result = e;
  }
  const output = texts.join('\n\n');
  const timeline = [...steps.values()];
  if (output) timeline.push({ kind: 'answer', tool: null, summary: '', by: null, message: '' });
  let usage = null;
  const metrics = checkpoint?.accountingSnapshot?.modelMetrics;
  if (metrics && typeof metrics === 'object') {
    const sum = (k) => Object.values(metrics).reduce((n, m) => n + (Number(m?.usage?.[k]) || 0), 0);
    usage = { inputTokens: sum('inputTokens'), outputTokens: sum('outputTokens'), cacheReadTokens: sum('cacheReadTokens'), premiumRequests: Number(result?.usage?.premiumRequests ?? NaN) };
    if (Number.isNaN(usage.premiumRequests)) usage.premiumRequests = null;
  }
  return { ok: true, events: events.length, output, answer: texts.at(-1) ?? '', timeline, usage };
}

const k = (n) => `${(n / 1000).toFixed(1)}k`;
const ICON = { tool: '🔧', denied: '⛔', failed: '❌', running: '⏳' };
/** "🔧 view README.md ✓ · ⛔ powershell Remove-Item … (denied by a hook) · 💬 answer · Σ ≈98.6k in / 0.5k out tokens" */
export function timelineText(trace, { max = 8 } = {}) {
  const steps = trace.timeline.filter((x) => x.kind !== 'answer');
  const parts = steps.slice(0, max).map((x) => {
    const head = `${ICON[x.kind]} ${x.tool}${x.summary ? ` ${x.summary}` : ''}`;
    if (x.kind === 'tool') return `${head} ✓`;
    if (x.kind === 'denied') return `${head} (denied${x.by === 'hook' ? ' by a hook' : ''})`;
    if (x.kind === 'failed') return `${head} (failed)`;
    return `${head} (still running)`;
  });
  if (steps.length > max) {
    const hidden = steps.slice(max);
    const count = (kind, word) => { const n = hidden.filter((x) => x.kind === kind).length; return n ? `${n} ${word}` : null; };
    const flags = [count('denied', 'denied'), count('failed', 'failed')].filter(Boolean);
    parts.push(`… ${hidden.length} more${flags.length ? ` (${flags.join(', ')})` : ''}`);
  }
  if (trace.timeline.some((x) => x.kind === 'answer')) parts.push('💬 answer');
  if (trace.usage) parts.push(`Σ ≈${k(trace.usage.inputTokens)} in / ${k(trace.usage.outputTokens)} out tokens`);
  return parts.join(' · ');
}
