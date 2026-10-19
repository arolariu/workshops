// The X-ray and the inherited checks as lines of text, shared by the app (key u, the checks screen), the command line
// (`xray`, `test`) and linear mode. fmt: { green, bright, dim, white, yellow, bold, cyan } colour functions.
import { LAYERS } from '../scorecard.mjs';
import { clip, pad, width, wrap } from '../ui.mjs';

const k = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const ICON = { true: '✅', false: '❌', null: '➖' };

export function xrayLines(report, { W = 96, fmt }) {
  const L = [];
  const put = (text, indent = '   ', cont = '      ') => wrap(text, Math.max(16, W - width(indent))).forEach((l, i) => L.push(`${i ? cont : indent}${l}`));
  const { scan, budget, maturity: m, rules, marks } = report;

  // 1. The layer tree.
  L.push(`  🌳 ${fmt.bold(fmt.white('YOUR HARNESS'))} ${fmt.dim('· 🆕 you added it · ✏️ you changed it · 🧳 you brought it in')}`);
  const shown = LAYERS.filter((l) => scan.artifacts.some((a) => a.layer === l.id));
  if (!shown.length) put(fmt.dim('Nothing yet: no instructions, skills, agents, MCP servers or hooks in this folder.'));
  for (const l of shown) {
    L.push(`   ${l.icon} ${fmt.white(l.title)}`);
    const files = scan.artifacts.filter((a) => a.layer === l.id).map((a) => a.path);
    files.slice(0, 6).forEach((f) => L.push(`      ${clip(f, Math.max(10, W - 12))}${marks[f] ? ` ${marks[f]}` : ''}`));
    if (files.length > 6) L.push(`      ${fmt.dim(`… and ${files.length - 6} more`)}${files.slice(6).some((f) => marks[f]) ? ` ${[...new Set(files.slice(6).map((f) => marks[f]).filter(Boolean))].join('')}` : ''}`);
  }
  const missing = LAYERS.filter((l) => !shown.includes(l)).map((l) => `${l.title} (Lab ${l.lab.slice(4)})`);
  if (missing.length && shown.length) put(fmt.dim(`Not in this folder: ${missing.join(', ')}.`));
  if (scan.problems.length) scan.problems.forEach((p) => put(`⚠️  ${fmt.yellow(p)}`));

  // 2. The context budget.
  L.push('', `  🪙 ${fmt.bold(fmt.white('CONTEXT BUDGET'))} ${fmt.dim('· ≈ what this harness adds to every turn')}`);
  if (!budget.every.length) put(fmt.dim('Nothing: only the runtime\'s own system prompt and tools.'));
  const labelW = Math.min(34, Math.max(12, ...budget.every.map((x) => width(x.label))));
  const barW = Math.max(6, Math.min(22, W - labelW - 22));
  const max = Math.max(1, ...budget.every.map((x) => x.tokens ?? 0));
  for (const x of budget.every) {
    const label = pad(clip(x.label, labelW), labelW);
    if (x.tokens === null) put(`${label} ${fmt.yellow('➖')} ${fmt.dim(x.note)}`, '   ', `   ${' '.repeat(labelW + 1)}`);
    else if (x.tokens === 0) L.push(`   ${label} ${fmt.bright('0')} ${fmt.dim(`· ${x.note}`)}`);
    else {
      const n = Math.max(1, Math.round((x.tokens / max) * barW));
      L.push(`   ${label} ${fmt.cyan('█'.repeat(n))}${fmt.dim('░'.repeat(barW - n))} ≈${k(x.tokens)}`);
    }
  }
  if (budget.every.length) put(`${fmt.white(`Σ every turn ≈${k(budget.total)} tokens`)}${budget.unmeasured ? fmt.dim(` (+ ${budget.unmeasured} not measured)`) : ''}`);
  if (budget.whenNeeded.length) put(`${fmt.dim('Loaded when needed:')} ${budget.whenNeeded.map((x) => `${x.label} ≈${k(x.tokens)} ${fmt.dim(`(${x.note})`)}`).join(fmt.dim(' · '))}`);
  put(fmt.dim('≈ characters ÷ 4; real tokenizers differ. The runtime\'s own system prompt and tools come on top.'));

  // 3. The scorecard and the maturity level.
  L.push('', `  🏅 ${fmt.bold(fmt.white(`MATURITY · ${m.level} ${m.name}`))}`);
  const applicable = rules.filter((r) => r.ok !== null || /^not measured/.test(r.message));
  const pass = applicable.filter((r) => r.ok === true).length;
  const fail = applicable.filter((r) => r.ok === false);
  const unmeasured = applicable.filter((r) => r.ok === null);
  if (applicable.length) put(fmt.dim(`${pass} rule${pass === 1 ? '' : 's'} pass${fail.length ? ` · ${fail.length} to fix` : ''}${unmeasured.length ? ` · ${unmeasured.length} not measured` : ''}`));
  for (const r of [...fail, ...unmeasured]) put(`${ICON[r.ok]} ${fmt.white(r.id)} ${r.ok === false ? fmt.yellow(r.message) : fmt.dim(r.message)}`);
  if (m.next) put(`👉 ${fmt.white('Next:')} ${fmt.dim(m.next)}`);
  else put(`🏆 ${fmt.bright('L5: governed. Pinned, shared, gated and owned.')}`);
  return L;
}

/** The advisory group under a level's checks. */
export function inheritedLines(group, { W = 96, fmt }) {
  const L = [];
  const put = (text, indent = '   ', cont = '       ') => wrap(text, Math.max(16, W - width(indent))).forEach((l, i) => L.push(`${i ? cont : indent}${l}`));
  L.push(`  🧱 ${fmt.bold(fmt.white('YOUR HARNESS SO FAR'))} ${fmt.dim('· advisory: what earlier labs built still holds (never counted)')}`);
  for (const g of group.layers) {
    if (!g.present) { put(`◻ ${fmt.dim(`${g.icon} ${g.title}: not in this folder (Lab ${g.lab.slice(4)} teaches it)`)}`); continue; }
    if (!g.rules.length) { put(`✅ ${fmt.green(`${g.icon} ${g.title}`)}`); continue; }
    for (const r of g.rules) put(`${r.ok === true ? '✅' : r.ok === false ? '⚠️ ' : '➖'} ${r.ok === true ? fmt.green(`${g.icon} ${g.title}`) : fmt.white(`${g.icon} ${g.title}`)} ${r.ok === true ? fmt.dim(r.message) : r.ok === false ? fmt.yellow(r.message) : fmt.dim(r.message)}`);
  }
  return L;
}
