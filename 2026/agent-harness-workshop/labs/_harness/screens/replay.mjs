// One turn of a replay (replay.mjs) as lines of text, shared by the app (u on the home screen), the command line
// (`replay`) and linear mode. fmt: { green, bright, dim, white, yellow, bold, cyan } colour functions.
import { width, wrap } from '../ui.mjs';

const k = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const SEGMENTS = {
  system: { letter: 'S', harness: false },
  instructions: { letter: 'I', harness: true },
  skills: { letter: 'K', harness: true },
  tools: { letter: 'T', harness: false },
  history: { letter: 'H', harness: false },
  prompt: { letter: 'P', harness: false },
};
const letterOf = (name) => SEGMENTS[name]?.letter ?? name.slice(0, 1).toUpperCase();

/** Bar widths in proportion to the tokens, at least 1 for every non-empty segment, adding up to `cols`. */
function shares(segments, cols) {
  const shown = segments.filter((s) => s.tokens > 0);
  const total = shown.reduce((n, s) => n + s.tokens, 0) || 1;
  const w = shown.map((s) => Math.max(1, Math.round((s.tokens / total) * cols)));
  let over = w.reduce((n, x) => n + x, 0) - cols;
  while (over > 0) { const i = w.indexOf(Math.max(...w)); w[i]--; over--; }
  while (over < 0) { const i = w.indexOf(Math.max(...w)); w[i]++; over++; }
  return shown.map((s, i) => ({ ...s, w: w[i] }));
}

/** The lines for turn `idx` (clamped) of a loaded replay: { title, scripted, prompt, turns, problems }. */
export function replayLines(rec, idx, { W = 96, fmt }) {
  const L = [];
  const put = (text, indent = '     ', cont = indent) => wrap(text, Math.max(16, W - width(indent))).forEach((l, i) => L.push(`${i ? cont : indent}${l}`));
  const head = (icon, title, sub = '') => { L.push(''); L.push(`  ${icon} ${fmt.bold(fmt.white(title))}${sub ? ` ${fmt.dim(sub)}` : ''}`); };
  const n = rec.turns.length;
  const i = Math.max(0, Math.min(n - 1, idx));
  const t = rec.turns[i];

  L.push(`  🎬 ${fmt.bold(fmt.bright(`TURN ${i + 1} OF ${n}`))} ${fmt.dim(`· ${rec.title}`)}`);
  if (t.prompt) put(`👤 ${fmt.white('You:')} "${t.prompt}"`, '  ', '     ');
  const strip = rec.turns.map((x, j) => {
    const icon = x.decisions.some((d) => !d.ok && d.by) ? '⛔' : x.answer ? '💬' : x.calls.length ? '🔧' : '·';
    return j === i ? fmt.bold(fmt.bright(`[${j + 1} ${icon}]`)) : fmt.dim(`${j + 1} ${icon}`);
  });
  put(strip.join(' '), '  ', '  ');
  if (rec.scripted) put(fmt.dim('ℹ️  A scripted run in the Copilot CLI\'s real event format. The token numbers are illustrative, sized from a real run.'), '  ', '     ');
  if (rec.problems?.length) put(fmt.yellow(`⚠️  ${rec.problems.length} line${rec.problems.length === 1 ? '' : 's'} could not be read and ${rec.problems.length === 1 ? 'was' : 'were'} skipped.`), '  ', '     ');

  // 1. What the model reads.
  if (t.context) {
    const total = t.context.reduce((s, x) => s + x.tokens, 0);
    head('🧠', 'CONTEXT WINDOW', `· what the model reads this turn: ≈${k(total)} tokens`);
    const colour = (s, text) => (SEGMENTS[s.name]?.harness ? fmt.green(text) : s.name === 'history' ? fmt.white(text) : s.name === 'prompt' ? fmt.yellow(text) : fmt.dim(text));
    const bar = shares(t.context, Math.max(12, Math.min(64, W - 8)));
    L.push(`     ${bar.map((s) => colour(s, `${letterOf(s.name)}${'█'.repeat(s.w - 1)}`)).join('')}`);
    put(t.context.map((s) => colour(s, `${letterOf(s.name)} ${s.name} ≈${k(s.tokens)}`)).join(fmt.dim(' · ')));
    const harness = t.context.filter((s) => SEGMENTS[s.name]?.harness);
    put(fmt.dim(harness.length
      ? `Your harness is the green part: ≈${k(harness.reduce((s, x) => s + x.tokens, 0))} tokens, sent again on every turn.`
      : 'No harness here: everything the model knows about your project is in the history.'));
  } else {
    head('🧠', 'CONTEXT WINDOW');
    put(fmt.dim('This recording has no annotations: it shows what the model wrote and what the harness did.'));
  }

  // 2. What the model wrote.
  head('📨', 'THE MODEL WROTE');
  if (t.said && t.said !== t.answer) put(`💭 ${fmt.white(`"${t.said}"`)}`, '     ', '        ');
  if (!t.calls.length) put(fmt.dim(t.answer ? 'No tool call this time: it answered.' : 'No tool call in this turn.'));
  for (const c of t.calls) {
    const json = JSON.stringify({ tool: c.tool, arguments: c.arguments }, null, 2).split('\n');
    const shown = [];
    for (const line of json) {
      const lead = line.match(/^ */)[0];
      wrap(line.slice(lead.length), Math.max(16, W - 5 - lead.length - 2)).forEach((w, j) => shown.push(`${lead}${j ? '  ' : ''}${w}`));
    }
    shown.slice(0, 14).forEach((l) => L.push(`     ${fmt.cyan(l)}`));
    if (shown.length > 14) L.push(`     ${fmt.dim(`… ${shown.length - 14} more lines`)}`);
  }

  // 3. What the harness decided, and 4. what went back into the history.
  if (t.calls.length) {
    head('🛡️', 'THE HARNESS DECIDED');
    for (const c of t.calls) {
      const d = t.decisions.find((x) => x.id === c.id);
      if (!d) put(`⏳ ${fmt.dim(`${c.tool}: no result recorded`)}`);
      else if (d.ok) put(`✅ ${fmt.green(`allowed: ${c.tool} ran`)}`);
      else if (d.by === 'hook') put(`⛔ ${fmt.yellow('denied by a hook:')} ${d.message}`, '     ', '        ');
      else if (d.by === 'permissions') put(`⛔ ${fmt.yellow('denied by the permission system:')} ${d.message}`, '     ', '        ');
      else put(`✅ ${fmt.green(`allowed: ${c.tool} ran,`)} ${fmt.yellow('but it failed:')} ${d.message}`, '     ', '        ');
    }
    head('📥', 'ADDED TO THE HISTORY', '· the model reads this next turn');
    for (const c of t.calls) {
      const r = t.results.find((x) => x.id === c.id);
      if (t.calls.length > 1) put(fmt.white(`${c.tool}:`));
      const lines = String(r?.text ?? '').split('\n').filter((l) => l.trim());
      if (!lines.length) { put(fmt.dim('(nothing)')); continue; }
      const wrapped = lines.slice(0, 4).flatMap((l) => wrap(l, Math.max(16, W - 5)));
      wrapped.slice(0, 6).forEach((l) => L.push(`     ${fmt.dim(l)}`));
      const more = lines.length - 4;
      if (more > 0 || wrapped.length > 6) L.push(`     ${fmt.dim(`… ${more > 0 ? `${more} more line${more === 1 ? '' : 's'}` : 'more'}`)}`);
    }
  }

  if (t.answer) {
    head('💬', 'THE ANSWER');
    t.answer.split('\n').forEach((l) => (l.trim() ? put(fmt.white(l)) : L.push('')));
  }
  for (const note of t.notes) { L.push(''); put(`📝 ${fmt.bright(note)}`, '  ', '     '); }
  return L;
}
