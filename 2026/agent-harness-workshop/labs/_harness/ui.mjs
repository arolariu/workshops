// Terminal styling helpers: 256-colour palette (works in Windows Terminal, macOS Terminal, iTerm, Linux),
// emoji-aware widths, word wrapping, boxes and a tiny Markdown renderer. Zero dependencies.

export const ESC = '\x1b[';
export const isTTY = Boolean(process.stdout.isTTY);
export const noColor = 'NO_COLOR' in process.env || process.env.TERM === 'dumb' || (!process.stdout.isTTY && !process.env.FORCE_COLOR);

const fg = (n) => `${ESC}38;5;${n}m`;
const bgc = (n) => `${ESC}48;5;${n}m`;

export const C = {
  bg: 234, // dark background
  panel: 236,
  green: 78,
  brightGreen: 120,
  dim: 245,
  white: 255,
  yellow: 221,
  red: 203,
  cyan: 81,
  pink: 212,
  orange: 215,
};

export const style = {
  reset: noColor ? '' : `${ESC}0m`,
  bold: (s) => (noColor ? s : `${ESC}1m${s}${ESC}22m`),
  color: (n, s) => (noColor ? s : `${fg(n)}${s}${fg(C.green)}`),
  bg: (n) => (noColor ? '' : bgc(n)),
  fg: (n) => (noColor ? '' : fg(n)),
};

export const green = (s) => style.color(C.green, s);
export const bright = (s) => style.color(C.brightGreen, s);
export const dim = (s) => style.color(C.dim, s);
export const white = (s) => style.color(C.white, s);
export const yellow = (s) => style.color(C.yellow, s);
export const red = (s) => style.color(C.red, s);
export const cyan = (s) => style.color(C.cyan, s);
export const pink = (s) => style.color(C.pink, s);
export const orange = (s) => style.color(C.orange, s);
export const bold = (s) => style.bold(s);

const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
export const stripAnsi = (s) => String(s).replace(ANSI, '');

// ---------- ASCII mode ----------
// With --ascii every symbol is replaced by plain text. Widths are measured on the folded text, so layout stays aligned.
let ASCII = false;
export const setAscii = (on) => { ASCII = Boolean(on); };
export const isAscii = () => ASCII;
const FOLD = new Map(Object.entries({
  '✅': '[ok]', '❌': '[x]', '⬜': '[ ]', '🕓': '[~]', '🚧': '[!]', '⏩': '[-]', '⛔': '[c]', '⚠': '[?]', '🟠': '[o]',
  '🟢': 'E', '🟡': 'M', '🔴': 'H', '🟣': 'H+', '⚫': 'H++', '💎': 'H++', '▰': '#', '▱': '.',
  '🤖': '[ai]', '💡': '*', '🏅': '[medal]', '🏆': '[trophy]', '👉': '->', '🔖': '[bookmark]', '⭐': '*', '🎉': '!', '💪': '', '👀': '', '🧭': '',
  '╭': '+', '╮': '+', '╰': '+', '╯': '+', '─': '-', '│': '|', '┼': '+', '┃': '|', '█': '#', '░': '.', '▄': '#', '▀': '#',
  '❯': '>', '•': '*', '●': '*', '○': 'o', '◻': '.', '↳': '->', '↓': 'v', '↑': '^', '→': '->', '←': '<-', '⏎': 'Enter',
  '·': '-', '—': '-', '–': '-', '…': '...', '✔': 'ok', '▸': '>', '◂': '<', '“': '"', '”': '"', '‘': "'", '’': "'", '✗': 'x', '↪': '>',
}));
/** Plain-ASCII version of a (possibly styled) string. ANSI codes are kept. */
export function asciiFold(s) {
  let out = '';
  for (const ch of String(s)) {
    const cp = ch.codePointAt(0);
    if (cp < 0x80) { out += ch; continue; }
    const hit = FOLD.get(ch);
    if (hit !== undefined) { out += hit; continue; }
    if (cp === 0xfe0f || cp === 0xfe0e || cp === 0x200d) continue;
    if (cp >= 0x2800 && cp <= 0x28ff) { out += '*'; continue; }
    if (cp >= 0x1f000 || (cp >= 0x2190 && cp <= 0x2bff)) continue;
    const plain = ch.normalize('NFKD').replace(/[^\x00-\x7f]/g, '');
    out += plain || '?';
  }
  return out;
}

/** How each assessment state is shown. One table for the app, the CLI and the linear mode. */
export const STATUS = {
  pass: { icon: '✅', word: 'passed' },
  fail: { icon: '❌', word: 'not passing yet' },
  stale: { icon: '🕓', word: 'changed since it was checked' },
  blocked: { icon: '🚧', word: 'blocked: a tool is missing' },
  skipped: { icon: '⏩', word: 'incomplete: some checks were skipped' },
  cancelled: { icon: '⛔', word: 'cancelled' },
  interrupted: { icon: '⚠️', word: 'stopped early' },
  'not-run': { icon: '⬜', word: 'not run yet' },
  none: { icon: '', word: 'no agent check' },
};
export const statusIcon = (s) => STATUS[s]?.icon ?? '⬜';
export const statusWord = (s) => STATUS[s]?.word ?? String(s);

// Display width: emoji count as 2 columns, variation selectors and joiners as 0.
const WIDE_BMP = new Set([0x231a, 0x231b, 0x23e9, 0x23ea, 0x23eb, 0x23ec, 0x23f0, 0x23f3, 0x25fd, 0x25fe, 0x2614, 0x2615, 0x26a1, 0x26aa, 0x26ab, 0x26bd, 0x26be, 0x26c4, 0x26c5, 0x26ce, 0x26d4, 0x26ea, 0x26f2, 0x26f3, 0x26f5, 0x26fa, 0x26fd, 0x2705, 0x270a, 0x270b, 0x2728, 0x274c, 0x274e, 0x2753, 0x2754, 0x2755, 0x2757, 0x2795, 0x2796, 0x2797, 0x27b0, 0x27bf, 0x2b1b, 0x2b1c, 0x2b50, 0x2b55]);
export function width(s) {
  if (ASCII) return asciiFold(stripAnsi(s)).length;
  let w = 0;
  let last = 0;
  for (const ch of stripAnsi(s)) {
    const cp = ch.codePointAt(0);
    if (cp === 0xfe0f) { if (last === 1) { w += 1; last = 2; } continue; } // emoji presentation: ♻️ ⚠️ ✏️ are 2 wide
    if (cp === 0xfe0e || cp === 0x200d || (cp >= 0x300 && cp <= 0x36f)) continue;
    if (cp >= 0x1f000 || WIDE_BMP.has(cp) || (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xff00 && cp <= 0xff60)) { w += 2; last = 2; }
    else { w += 1; last = 1; }
  }
  return w;
}

export const pad = (s, n) => s + ' '.repeat(Math.max(0, n - width(s)));

// Word-wrap plain or styled text to `cols` columns. Words longer than a line are broken. The active colour and
// bold state carry over to the next line, so a dim sentence stays dim after a line break.
export function wrap(text, cols, indent = '') {
  const out = [];
  let fgCode = '';
  let boldOn = false;
  const track = (str) => {
    for (const m of String(str).matchAll(/\x1b\[([0-9;]*)m/g)) {
      const p = m[1];
      if (/^38;5;\d+$/.test(p)) fgCode = m[0];
      else if (p === '1') boldOn = true;
      else if (p === '22' || p === '0' || p === '') { boldOn = false; if (p !== '22') fgCode = ''; }
    }
  };
  const carry = () => `${boldOn ? `${ESC}1m` : ''}${fgCode}`;
  for (const para of String(text).split('\n')) {
    const words = para.split(/(\s+)/).filter((w) => w.length);
    let line = '';
    let gap = '';
    for (const word of words) {
      if (/^\s+$/.test(word)) {
        gap = stripAnsi(line).trim() ? word : '';
        continue;
      }
      if (width(word) > cols) {
        if (stripAnsi(line).trim()) { out.push(line.trimEnd()); line = indent + carry(); }
        gap = '';
        let chunk = line;
        let used = width(line);
        for (const m of word.matchAll(/\x1b\[[0-9;?]*[ -/]*[@-~]|./gsu)) {
          const tok = m[0];
          if (tok.startsWith('\x1b')) { chunk += tok; track(tok); continue; }
          const tw = width(tok);
          if (used + tw > cols) { out.push(chunk); chunk = indent + carry(); used = width(indent); }
          chunk += tok;
          used += tw;
        }
        line = chunk;
        continue;
      }
      if (width(line) + width(gap) + width(word) > cols && stripAnsi(line).trim()) {
        out.push(line.trimEnd());
        line = indent + carry();
        gap = '';
      }
      line += gap + word;
      gap = '';
      track(word);
    }
    out.push(line.trimEnd());
  }
  return out;
}

export function bar(done, total, cols = 24) {
  const filled = total ? Math.round((done / total) * cols) : 0;
  return bright('█'.repeat(filled)) + dim('░'.repeat(Math.max(0, cols - filled)));
}

export function box(lines, cols, color = C.green) {
  const c = (s) => style.color(color, s);
  const inner = cols - 4;
  const out = [c(`╭${'─'.repeat(cols - 2)}╮`)];
  for (const l of lines) out.push(`${c('│')} ${pad(clip(l, inner), inner)} ${c('│')}`);
  out.push(c(`╰${'─'.repeat(cols - 2)}╯`));
  return out;
}

// Inline Markdown: `code`, **bold**, *italic*, [text](link) → styled text. Code spans are left untouched.
// Links keep their destination: "text (url)".
export function inline(s) {
  return String(s)
    .split(/(`[^`]+`)/)
    .map((part) => {
      if (/^`[^`]+`$/.test(part)) return cyan(part.slice(1, -1));
      return part
        .replace(/\*\*([^*]+)\*\*/g, (_, t) => bold(white(t)))
        .replace(/(^|[\s("'])\*([^*\s][^*]*?)\*(?=[\s).,:;!?"']|$)/g, (_, pre, t) => `${pre}${noColor ? t : `${ESC}3m${t}${ESC}23m`}`)
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, url) => (t === url ? cyan(url) : `${white(t)} ${dim(`(${url})`)}`))
        .replace(/\*(?=")|(?<=")\*/g, '');
    })
    .join('');
}

/** Break a line at exactly `cols` display columns, keeping its spaces (for code). */
export function hardWrap(text, cols) {
  const out = [];
  let line = '';
  let used = 0;
  for (const m of String(text).matchAll(/\x1b\[[0-9;?]*[ -/]*[@-~]|./gsu)) {
    const tok = m[0];
    const tw = tok.startsWith('\x1b') ? 0 : width(tok);
    if (used + tw > cols && used > 0) { out.push(line); line = ''; used = 0; }
    line += tok;
    used += tw;
  }
  out.push(line);
  return out;
}

function renderTable(rows, cols) {
  const cells = rows
    .filter((r) => !/^\s*\|?\s*:?-{3,}/.test(r))
    .map((r) => r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split(/(?<!\\)\|/).map((c) => inline(c.trim().replace(/<br>/g, ' ').replace(/\\\|/g, '|'))));
  if (!cells.length) return [];
  const n = Math.max(...cells.map((r) => r.length));
  const widths = Array.from({ length: n }, (_, i) => Math.max(...cells.map((r) => width(r[i] ?? ''))));
  const budget = cols - 4 - (n - 1) * 3;
  while (widths.reduce((a, b) => a + b, 0) > budget) {
    const i = widths.indexOf(Math.max(...widths));
    if (widths[i] <= 10) break;
    widths[i]--;
  }
  const out = [];
  if (widths.reduce((a, b) => a + b, 0) > budget) {
    // Too narrow for columns: one block per row, "Header: value".
    const [head, ...body] = cells;
    for (const r of body) {
      r.forEach((c, i) => {
        if (!stripAnsi(c).trim()) return;
        wrap(`${bold(stripAnsi(head[i] ?? ''))}: ${c}`, cols - 6).forEach((l, j) => out.push(`  ${j ? '  ' : ''}${l}`));
      });
      out.push('');
    }
    if (out[out.length - 1] === '') out.pop();
    return out;
  }
  cells.forEach((r, ri) => {
    const wrapped = widths.map((wd, i) => wrap(r[i] ?? '', wd));
    const height = Math.max(...wrapped.map((c) => c.length));
    for (let k = 0; k < height; k++) {
      const line = widths.map((wd, i) => pad(clip(wrapped[i][k] ?? '', wd), wd)).join(dim(' │ '));
      out.push(`  ${ri === 0 ? bold(line) : line}`);
    }
    if (ri === 0) out.push(`  ${dim(widths.map((wd) => '─'.repeat(wd)).join('─┼─'))}`);
  });
  return out;
}

// Small Markdown → terminal lines renderer: headings, paragraphs (soft-wrapped lines are joined),
// bullets, numbered lists, code blocks, quotes and tables.
export function renderMarkdown(md, cols) {
  const blocks = [];
  let inCode = false;
  for (const raw of String(md).replace(/\r/g, '').split('\n')) {
    if (/^\s*```/.test(raw)) { inCode = !inCode; continue; }
    if (inCode) { blocks.push({ type: 'code', text: raw }); continue; }
    if (/^\s*<\/?(details|summary)/.test(raw)) continue;
    if (!raw.trim()) { blocks.push({ type: 'blank' }); continue; }
    let m;
    if ((m = raw.match(/^(#{1,4})\s+(.*)$/))) { blocks.push({ type: 'h', text: m[2] }); continue; }
    if ((m = raw.match(/^(\s*)[-*]\s+(.*)$/))) { blocks.push({ type: 'li', indent: m[1].length, text: m[2] }); continue; }
    if ((m = raw.match(/^(\s*)(\d+)[.)]\s+(.*)$/))) { blocks.push({ type: 'ol', indent: m[1].length, num: m[2], text: m[3] }); continue; }
    if ((m = raw.match(/^>\s?(.*)$/))) { blocks.push({ type: 'quote', text: m[1] }); continue; }
    if (/^\s*\|/.test(raw)) { blocks.push({ type: 'table', text: raw.trim() }); continue; }
    const prev = blocks[blocks.length - 1];
    if (prev && ['p', 'li', 'ol', 'quote'].includes(prev.type)) { prev.text += ` ${raw.trim()}`; continue; }
    blocks.push({ type: 'p', text: raw.trim() });
  }
  const lines = [];
  const blank = () => { if (lines.length && lines[lines.length - 1] !== '') lines.push(''); };
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === 'blank') { blank(); continue; }
    if (b.type === 'h') { blank(); lines.push(`  ${bold(bright(stripAnsi(inline(b.text)).toUpperCase()))}`); continue; }
    if (b.type === 'code') { hardWrap(b.text.replace(/\t/g, '  '), Math.max(10, cols - 5)).forEach((l, j) => lines.push(`${j ? `  ${dim('↪')}` : '   '}${cyan(l)}`)); continue; }
    if (b.type === 'table') {
      const rows = [b.text];
      while (blocks[i + 1]?.type === 'table') rows.push(blocks[++i].text);
      lines.push(...renderTable(rows, cols));
      continue;
    }
    if (b.type === 'li' || b.type === 'ol') {
      const ind = ' '.repeat(Math.min(b.indent, 6));
      const marker = b.type === 'li' ? '• ' : `${b.num}. `;
      wrap(inline(b.text), cols - 4 - ind.length - marker.length).forEach((l, j) => lines.push(`  ${ind}${j === 0 ? bright(marker) : ' '.repeat(marker.length)}${l}`));
      continue;
    }
    if (b.type === 'quote') { wrap(inline(b.text), cols - 6).forEach((l) => lines.push(`  ${dim('┃')} ${l}`)); continue; }
    wrap(inline(b.text), cols - 4).forEach((l) => lines.push(`  ${l}`));
  }
  while (lines.length && lines[0] === '') lines.shift();
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

// Cut a styled string to `w` display columns (keeps the ANSI codes).
export function clip(s, w) {
  let out = '';
  let cur = 0;
  for (const m of String(s).matchAll(/\x1b\[[0-9;?]*[ -/]*[@-~]|./gsu)) {
    const tok = m[0];
    if (tok.startsWith('\x1b')) { out += tok; continue; }
    const tw = width(tok);
    if (cur + tw > w) break;
    out += tok;
    cur += tw;
  }
  return out;
}

export const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
