// 🧠 The lab companion: an interactive, keyboard-driven terminal app (zero dependencies).
import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ESC, C, style, green, bright, dim, white, yellow, red, cyan, bold, width, pad, wrap, bar, box, renderMarkdown, inline, clip, stripAnsi, SPINNER, noColor } from './ui.mjs';
import { loadCatalog, LEVELS, LEVEL_BADGE } from './catalog.mjs';
import { progressStore, captureEvidence } from './progress.mjs';
import { runChecks } from './checks.mjs';
import { runAgentChecks, loadAgentChecks, copilotArgs, displayCommand } from './agent.mjs';
import { listFiles, isTrusted, copilotBin } from './kit.mjs';
import { BRAND, creditLine } from './brand.mjs';
import { runInteractive, openFolder, copyToClipboard } from './system.mjs';
import { changes as gitChanges, resetToCommit } from './workspace.mjs';

const LEVEL_NAME = { easy: 'EASY', medium: 'MEDIUM', hard: 'HARD' };
const CONFETTI = ['🎉', '✨', '🎊', '⭐', '🥳', '💚', '🚀'];
const TIPS = [
  'Press `c` on a level to start Copilot right in its folder. Type `/exit` to come back: your checks run automatically.',
  'Press `w` to watch a level: the checks run again every time you save a file.',
  'Inside Copilot, `!npm test` runs a command yourself: no AI, no credits.',
  'Edited an instruction, skill or agent? Start a new Copilot session (`/new`) so it picks it up.',
  'Stuck? Reveal a hint (`h`) before peeking at the solution (`s`).',
  '`/env` in Copilot shows everything it loaded: instructions, skills, agents, MCP servers, hooks.',
  'Agent checks run on a copy in `labs/.runs/`, so your `src/` stays exactly as you left it.',
  'Commit your progress often: `git add -A && git commit -m "lab 02 medium"`.',
  '`/usage` shows what a session cost. Cap scripted runs with `--max-ai-credits`.',
  'Messed up a level? Press `x` to start it over. Your files are backed up first.',
];
const LOGO = [
  '▄▀█ █▀▀ █▀▀ █▄ █ ▀█▀   █ █ ▄▀█ █▀█ █▄ █ █▀▀ █▀ █▀',
  '█▀█ █▄█ ██▄ █ ▀█  █    █▀█ █▀█ █▀▄ █ ▀█ ██▄ ▄█ ▄█',
];
const GRADIENT = [121, 120, 84, 78, 79, 43, 37];
const BOOT = ['📜 instructions', '🧩 skills', '🎭 agents', '🔌 MCP', '🔒 hooks'];

function detect(cmd, args) {
  return new Promise((resolve) => {
    const winQuote = (a) => (/^[\w\-./:=@,]+$/.test(a) ? a : `"${a}"`);
    const go = (shell) => {
      let out = '';
      let child;
      try {
        child = spawn(cmd, shell ? args.map(winQuote) : args, { shell, stdio: ['ignore', 'pipe', 'pipe'] });
      } catch { resolve(null); return; }
      const timer = setTimeout(() => { try { child.kill(); } catch { /* gone */ } resolve(null); }, 15000);
      child.stdout.on('data', (d) => (out += d));
      child.stderr.on('data', (d) => (out += d));
      child.on('error', (e) => {
        clearTimeout(timer);
        if (e.code === 'ENOENT' && !shell && process.platform === 'win32') go(true);
        else resolve(null);
      });
      child.on('close', (code) => { clearTimeout(timer); resolve(code === 0 ? (out.match(/\d+\.\d+(\.\d+)?/)?.[0] ?? 'ok') : null); });
    };
    go(false);
  });
}

const ease = (k) => 1 - (1 - Math.max(0, Math.min(1, k))) ** 3;
const color256 = (n, s) => (noColor ? s : `${ESC}38;5;${n}m${s}`);

export async function startTui({ labsDir, open = null, intro = true, anim = true }) {
  const out = process.stdout;
  const inp = process.stdin;
  const rootDir = path.dirname(labsDir);
  const catalog = loadCatalog(labsDir);
  const progress = progressStore(labsDir);
  const total = catalog.reduce((n, l) => n + l.levels.length, 0);
  const keyOf = (lab, ex) => `${lab.id}/${ex.level}`;
  const rel = (p) => path.relative(rootDir, p).split(path.sep).join('/');
  const ANIM = anim && !noColor && !process.env.HARNESS_NO_ANIM;

  const S = {
    screen: 'home', // splash | home | lab | readme | exercise | checks | agent | solution | confirmSolution | confirmReset | help
    helpBack: 'home',
    readmeBack: 'lab',
    lab: 0,
    level: 0,
    scroll: 0,
    env: null,
    run: null,
    agent: null,
    sol: null,
    reset: null,
    celebrate: null,
    toast: null,
    watch: null,
    changes: null,
    suspended: false,
    lastPulse: 0,
    t: { splash: 0, home: 0, lab: 0, flash: 0 },
    splashEnd: 0,
  };

  // Where were we last time?
  const ui = progress.get('_ui');
  const li = catalog.findIndex((l) => l.id === ui.lab);
  if (li >= 0) S.lab = li;
  const lv = catalog[S.lab]?.levels.findIndex((e) => e.level === ui.level) ?? -1;
  if (lv >= 0) S.level = lv;
  if (open) {
    const oi = catalog.findIndex((l) => l.id === open.lab.id);
    const oj = oi >= 0 ? catalog[oi].levels.findIndex((e) => e.level === open.ex.level) : -1;
    if (oi >= 0 && oj >= 0) {
      S.lab = oi;
      S.level = oj;
      S.screen = 'exercise';
    }
  }

  // ---------- terminal plumbing ----------
  let ticker = null;
  const restore = () => {
    if (ticker) clearInterval(ticker);
    stopWatch();
    try { inp.setRawMode?.(false); } catch { /* not a tty */ }
    out.write('\x1b[0m\x1b[?25h\x1b[?1049l');
  };
  const quit = () => {
    restore();
    const { done } = counts();
    const g = (s) => `${style.fg(C.green)}${s}${style.reset}`;
    out.write(`\n${g(`  👋 See you! You have completed ${bold(`${done} of ${total}`)} levels.`)}\n`);
    out.write(`${g(`     Continue any time: ${bold('node labs/start.mjs')}`)}\n`);
    out.write(`${g(dim(`     ✨ ${BRAND.title} · by ${BRAND.author} · ${BRAND.email}`))}\n\n`);
    process.exit(0);
  };
  process.on('uncaughtException', (e) => { restore(); console.error(e); process.exit(1); });

  const cols = () => Math.max(60, out.columns || 100);
  const rows = () => Math.max(16, out.rows || 32);
  const W = () => Math.min(cols() - 4, 96);
  const now = () => Date.now();
  const spin = () => SPINNER[Math.floor(now() / 90) % SPINNER.length];

  function paint(lines, footer) {
    if (S.suspended) return;
    const C_ = cols();
    const R = rows();
    const bodyRows = R - footer.length;
    const maxScroll = Math.max(0, lines.length - bodyRows);
    if (S.scroll > maxScroll) S.scroll = maxScroll;
    if (S.scroll < 0) S.scroll = 0;
    const visible = lines.slice(S.scroll, S.scroll + bodyRows);
    if (S.scroll < maxScroll && footer.length) {
      const lastLine = footer[footer.length - 1];
      const marker = width(lastLine) + 16 <= C_ ? `   ${dim('↓ more below')}` : `  ${bright('↓')}`;
      footer = [...footer.slice(0, -1), `${lastLine}${marker}`];
    }
    let buf = '\x1b[H';
    for (let r = 0; r < R; r++) {
      const isFooter = r >= bodyRows;
      const line = isFooter ? footer[r - bodyRows] ?? '' : visible[r] ?? '';
      buf += `${style.bg(isFooter ? C.panel : C.bg)}${style.fg(C.green)}${clip(line, C_ - 1)}\x1b[K`;
      if (r < R - 1) buf += '\r\n';
    }
    out.write(buf);
  }

  const keycap = (k) => bold(bright(k));
  // Footer: the toast (if any) plus key hints, wrapped over at most two lines.
  function footer(items) {
    const maxW = cols() - 6;
    const lines = [];
    let cur = '';
    for (const [k, d] of items) {
      const part = `${keycap(k)} ${dim(d)}`;
      const next = cur ? `${cur}   ${part}` : part;
      if (cur && width(next) > maxW) { lines.push(cur); cur = part; } else cur = next;
    }
    if (cur) lines.push(cur);
    const keys = lines.slice(0, 2).map((l) => `  ${l}`);
    return S.toast ? [`  ${S.toast.msg}`, ...keys] : keys;
  }
  function toast(msg, ms = 4000) {
    S.toast = { msg, until: now() + ms };
    render();
  }

  // ---------- data helpers ----------
  const labObj = () => catalog[S.lab];
  const exObj = () => labObj().levels[S.level];
  function cell(lab, ex) {
    const p = progress.get(keyOf(lab, ex));
    if (p.checks === 'pass') return p.agent === 'pass' ? '✅🤖' : '✅';
    if (p.checks === 'fail') return '❌';
    if (p.hints) return '💡';
    return '⬜';
  }
  function counts() {
    let done = 0;
    let agents = 0;
    for (const lab of catalog) for (const ex of lab.levels) {
      const p = progress.get(keyOf(lab, ex));
      if (p.checks === 'pass') done++;
      if (p.agent === 'pass') agents++;
    }
    return { done, agents };
  }
  const labDone = (lab) => lab.levels.every((ex) => progress.get(keyOf(lab, ex)).checks === 'pass');
  function nextUp() {
    for (const level of LEVELS) for (const lab of catalog) {
      const ex = lab.levels.find((e) => e.level === level);
      if (ex && progress.get(keyOf(lab, ex)).checks !== 'pass') return { lab, ex };
    }
    return null;
  }
  const header = (title, sub, right) => {
    const inner = W() - 4;
    const top = right ? `${title}${' '.repeat(Math.max(1, inner - width(title) - width(right)))}${right}` : title;
    return box([top, ...(sub ? [sub] : [])], W()).map((l) => `  ${l}`);
  };
  // A long info line, wrapped to the screen with a hanging indent.
  const para = (text, indent = '  ', cont = '     ') => wrap(text, W() - width(indent)).map((l, i) => `${i ? cont : indent}${l}`);
  const saveUi = () => {
    const ex = exObj();
    progress.set('_ui', { lab: labObj().id, level: ex?.level });
  };
  const firstSentence = (md) => {
    const parts = stripAnsi(inline(String(md).replace(/\s+/g, ' '))).split(/(?<=[.!?])\s/);
    return parts[0].length < 60 && parts[1] ? `${parts[0]} ${parts[1]}` : parts[0];
  };

  // ---------- screens ----------
  function splashScreen() {
    const t = now() - S.t.splash;
    const C_ = cols();
    const fixed = (content, finalWidth) => `${' '.repeat(Math.max(0, Math.floor((C_ - finalWidth) / 2)))}${content}`;
    const typed = (text, start, dur) => {
      if (t < start) return '';
      const chars = [...text];
      return chars.slice(0, Math.round(chars.length * Math.min(1, (t - start) / dur))).join('');
    };
    const L = [];
    const head = 'B U I L D   Y O U R';
    L.push(fixed(dim(typed(head, 0, 300)), width(head)));
    L.push('');
    const logoW = [...LOGO[0]].length;
    const k = ease((t - 250) / 750);
    const cut = Math.round(logoW * k);
    const shineAt = t > 1050 && t < 1750 ? Math.round(((t - 1050) / 700) * (logoW + 8)) - 4 : null;
    for (const row of LOGO) {
      let s = '';
      [...row].forEach((ch, i) => {
        if (i > cut + 1 || ch === ' ') { s += ' '; return; }
        const edge = i >= cut - 1 && k < 1;
        const shine = shineAt !== null && Math.abs(i - shineAt) <= 1;
        const c = edge || shine ? 231 : GRADIENT[Math.min(GRADIENT.length - 1, Math.floor((i / logoW) * GRADIENT.length))];
        s += color256(c, ch);
      });
      L.push(fixed(`${bold(s)}${style.fg(C.green)}`, logoW));
    }
    L.push('');
    const tag = `${BRAND.tagline} · hands-on labs`;
    L.push(fixed(t < 950 ? '' : t < 1150 ? dim(tag) : green(tag), width(tag)));
    L.push('');
    const bootW = width(BOOT.map((b) => `${b} ✔`).join('   '));
    const boot = BOOT.map((b, i) => {
      const at = 1150 + i * 110;
      if (t < at) return null;
      return t < at + 100 ? `${bright(spin())} ${dim(b.slice(2).trim())}` : `${green(b)} ${bright('✔')}`;
    }).filter(Boolean);
    L.push(fixed(boot.join('   '), bootW));
    L.push(fixed(t > 1800 ? bright(bold('✔ harness ready')) : '', width('✔ harness ready')));
    L.push('');
    const c1 = `Created by ${BRAND.author}`;
    const c2 = `${BRAND.role} · ${BRAND.year}`;
    const c3 = `📧 ${BRAND.email}`;
    L.push(fixed(white(bold(typed(c1, 1850, 420))), width(c1)));
    L.push(fixed(green(typed(c2, 2150, 300)), width(c2)));
    L.push(fixed(dim(typed(c3, 2400, 300)), width(c3)));
    L.push('');
    const prompt = '▸  press any key to start  ◂';
    L.push(fixed(t > 2750 ? (Math.floor(t / 500) % 2 ? bright(prompt) : dim(prompt)) : '', width(prompt)));
    const top = Math.max(0, Math.floor((rows() - L.length) / 2) - 1);
    return { lines: [...Array(top).fill(''), ...L], footer: [] };
  }

  function homeScreen() {
    const t = ANIM ? now() - S.t.home : 1e9;
    const L = [''];
    L.push(...header(`🧠  ${bold(bright('BUILD YOUR AGENT HARNESS'))}`, dim(`${BRAND.tagline} · hands-on labs`), dim(`✨ by ${BRAND.author}`)));
    const { done, agents } = counts();
    const shown = Math.round(done * ease(t / 800));
    const hour = new Date().getHours();
    const hello = hour >= 5 && hour < 12 ? 'Good morning' : hour >= 12 && hour < 18 ? 'Good afternoon' : 'Good evening';
    L.push('');
    L.push(...para(done === 0
      ? `👋 ${bold(white(`${hello}!`))} ${dim('Welcome to the labs. Pick a lab below, or press')} ${keycap('n')} ${dim('to start with the first easy level.')}`
      : done === total
        ? `🏆 ${bold(white(`${hello}, harness engineer!`))} ${dim('Every level is done. Try the "Going further" ideas, or harness your own project.')}`
        : `👋 ${bold(white(`${hello}! Welcome back.`))} ${dim(`${done} level${done === 1 ? '' : 's'} down, ${total - done} to go.`)}`));
    L.push('');
    L.push(`  ${white('Progress')}  ${bar(shown, total, 30)}  ${bold(bright(`${shown}/${total}`))} ${dim('levels')}${agents ? `   🤖 ${bright(String(agents))} ${dim(`agent check${agents === 1 ? '' : 's'} passed`)}` : ''}`);
    L.push('');
    L.push(`       ${dim(pad('LAB', 36))}${pad(`🟢 ${dim('EASY')}`, 11)}${pad(`🟡 ${dim('MEDIUM')}`, 11)}🔴 ${dim('HARD')}`);
    const pulse = Math.floor(now() / 600) % 2 === 0;
    catalog.forEach((lab, i) => {
      if (t < 150 + i * 55) { L.push(''); return; }
      const sel = i === S.lab;
      const name = `${lab.num}  ${lab.emoji}  ${lab.title}`;
      const cells = lab.levels.map((ex) => pad(`  ${cell(lab, ex)}`, 11)).join('');
      const medal = labDone(lab) ? ' 🏅' : '';
      const row = `  ${sel ? (pulse ? bright('❯') : green('❯')) : ' '}    ${sel ? bold(white(pad(name, 36))) : pad(name, 36)}${cells}${medal}`;
      const bg = now() - S.t.flash < 180 && sel ? 238 : C.panel;
      L.push(sel ? `${style.bg(bg)}${row}` : row);
    });
    L.push('');
    if (S.env) {
      const e = S.env;
      const item = (ok, label, note) => `${ok ? '✅' : '⬜'} ${ok ? green(label) : dim(label)}${ok && ok !== 'ok' ? dim(` ${ok}`) : ''}${!ok && note ? dim(` (${note})`) : ''}`;
      const items = [item(e.copilot, 'Copilot CLI', 'needed'), item(e.node, 'Node.js'), item(e.git, 'git'), item(e.apm, 'APM', 'lab 06'), item(e.ghaw, 'gh aw', 'lab 07')];
      const one = `  🧰 ${white('Your setup')}  ${items.join('  ')}`;
      if (width(one) <= W()) L.push(one);
      else L.push(`  🧰 ${white('Your setup')}  ${items.slice(0, 3).join('  ')}`, `                ${items.slice(3).join('  ')}`);
      if (e.trusted === true) L.push(...para(`🔐 ${green('Workshop folder trusted by Copilot')} ${dim('(MCP servers, hooks and agents will load)')}`));
      else if (e.trusted === false) L.push(...para(`🔐 ${yellow('Trust tip:')} ${dim('run')} ${cyan('copilot')} ${dim('once in the workshop folder and choose')} ${white('"Yes, and remember this folder"')}`));
    } else {
      L.push(`  🧰 ${dim(`${spin()} checking your setup…`)}`);
    }
    const nu = nextUp();
    L.push(...para(nu ? `👉 ${white('Next up')}  ${dim(`Lab ${nu.lab.num} ·`)} ${LEVEL_BADGE[nu.ex.level]} ${bright(nu.ex.title)} ${dim('— press n')}` : `🏆 ${bold(bright('All 24 levels done. You are an agent-harness engineer!'))}`));
    L.push('');
    L.push(`  ${dim('─'.repeat(Math.max(10, W() - 2)))}`);
    const tip = TIPS[Math.floor(now() / 12000) % TIPS.length];
    wrap(`💡 ${inline(tip)}`, W() - 2).forEach((l) => L.push(`  ${dim(l)}`));
    L.push(...para(dim(`✨ ${creditLine()}`), '  ', '     '));
    L.push(...para(dim(`📧 Questions, ideas or feedback? ${BRAND.email}`), '  ', '     '));
    return { lines: L, footer: footer([['↑↓', 'choose'], ['⏎', 'open'], ['0-7', 'jump'], ['n', 'next up'], ['?', 'help'], ['q', 'quit']]) };
  }

  function labScreen() {
    const lab = labObj();
    const t = ANIM ? now() - S.t.lab : 1e9;
    const L = [''];
    L.push(...header(`${bold(bright(`LAB ${lab.num} · ${lab.emoji}  ${lab.title.toUpperCase()}`))}`, lab.tagline ? dim(lab.tagline) : null, labDone(lab) ? '🏅 complete' : null));
    L.push('');
    for (const l of renderMarkdown(lab.intro, W())) L.push(l);
    L.push('');
    L.push(`  ${white(bold('CHOOSE YOUR LEVEL'))}`);
    L.push('');
    const pulse = Math.floor(now() / 600) % 2 === 0;
    lab.levels.forEach((ex, i) => {
      if (t < 80 + i * 90) { L.push('', '', ''); return; }
      const sel = i === S.level;
      const name = `${LEVEL_BADGE[ex.level]} ${pad(LEVEL_NAME[ex.level], 7)} ${ex.title}`;
      const row = `  ${sel ? (pulse ? bright('❯') : green('❯')) : ' '}  ${sel ? bold(white(pad(name, 58))) : pad(name, 58)}  ${cell(lab, ex)}  ${dim(ex.meta.replace(/·.*$/, '').trim())}`;
      const bg = now() - S.t.flash < 180 && sel ? 238 : C.panel;
      L.push(sel ? `${style.bg(bg)}${row}` : row);
      const sentence = firstSentence(ex.mission);
      const room = W() - 10;
      const preview = `      ${dim(width(sentence) > room ? `${clip(sentence, room - 1)}…` : sentence)}`;
      L.push(sel ? `${style.bg(bg)}${preview}` : preview);
      L.push('');
    });
    L.push(...para(`📖 ${dim('Full lab guide:')} ${cyan(rel(lab.readmePath))} ${dim('— press g to read it here')}`));
    return { lines: L, footer: footer([['↑↓', 'choose'], ['⏎', 'open'], ['1-3', 'level'], ['g', 'lab guide'], ['b', 'back'], ['?', 'help'], ['q', 'quit']]) };
  }

  function readmeScreen() {
    const lab = labObj();
    const md = fs.readFileSync(lab.readmePath, 'utf8');
    const L = [''];
    L.push(...header(`📖 ${bold(bright(`LAB ${lab.num} GUIDE · ${lab.title}`))}`, dim(rel(lab.readmePath))));
    L.push(...renderMarkdown(md.replace(/^#\s+.*\n/, ''), W()));
    L.push('');
    return { lines: L, footer: footer([['↑↓', 'scroll'], ['PgUp/PgDn', 'page'], ['b', 'back'], ['q', 'quit']]) };
  }

  function statusLines(lab, ex) {
    const p = progress.get(keyOf(lab, ex));
    const L = [];
    const checkLine = p.checks === 'pass' ? `✅ ${bright('all checks passed')}` : p.checks === 'fail' ? `❌ ${yellow(`${p.passed ?? 0}/${p.total ?? '?'} checks pass`)} ${dim('— press t to re-run')}` : `⬜ ${dim('not run yet — press t')}`;
    const agentLine = !ex.hasAgent ? dim('no agent check here — this level is free 🆓') : p.agent === 'pass' ? `✅ ${bright('passed')}` : p.agent === 'fail' ? `❌ ${yellow('failed')} ${dim('— press a to retry')}` : dim('not run — press a (uses AI credits 💳)');
    const one = `  🏁 ${bold(white('STATUS'))}  🧪 ${checkLine}    🤖 ${agentLine}`;
    if (width(one) <= W() + 2) L.push(one);
    else L.push(`  🏁 ${bold(white('STATUS'))}  🧪 ${checkLine}`, `             🤖 ${agentLine}`);
    if (p.checks === 'fail' && p.nextFix) L.push(...para(`🎯 ${white('Next to fix:')} ${yellow(p.nextFix)}`));
    if (S.watch) L.push(...para(`👀 ${bright('Watching src/')} ${dim('— the checks run again every time you save (w to stop)')}`));
    if (Array.isArray(S.changes)) {
      if (!S.changes.length) L.push(`  📝 ${dim('No changes in src/ yet.')}`);
      else {
        const names = S.changes.slice(0, 4).map((c) => `${c.file}${c.status === 'new' ? dim(' (new)') : c.status === 'deleted' ? dim(' (deleted)') : ''}`);
        L.push(`  📝 ${white('Your changes:')} ${names.join(dim(', '))}${S.changes.length > 4 ? dim(` +${S.changes.length - 4} more`) : ''}`);
      }
    }
    return L;
  }

  function exerciseScreen() {
    const lab = labObj();
    const ex = exObj();
    const p = progress.get(keyOf(lab, ex));
    const shown = Math.min(p.hints ?? 0, ex.hints.length);
    const L = [''];
    L.push(...header(`${LEVEL_BADGE[ex.level]} ${bold(bright(`${LEVEL_NAME[ex.level]} · ${ex.title}`))}`, dim(`Lab ${lab.num} · ${lab.emoji} ${lab.title}`), lab.levels.map((e, i) => `${LEVEL_BADGE[e.level]} ${i === S.level ? bold(bright(String(i + 1))) : dim(String(i + 1))}`).join('  ')));
    if (ex.meta) L.push(`  ${dim(ex.meta.replace(/\*\*/g, ''))}`);
    L.push(...para(`📖 ${dim('Press')} ${keycap('g')} ${dim(`for the lab guide: ${lab.title} explained, with examples and links.`)}`));
    const section = (icon, title, md, dimmed = false) => {
      if (!md) return;
      L.push('');
      L.push(`  ${icon} ${bold(white(title))}`);
      L.push(...renderMarkdown(md, W()).map((l) => (dimmed ? dim(stripAnsi(l)) : l)));
    };
    section('🎯', 'MISSION', ex.mission);
    section('📂', 'WORK HERE', ex.where);
    L.push(...para(`💻 ${keycap('c')} ${dim('start Copilot here')}   📂 ${keycap('o')} ${dim('open the folder')}   📋 ${keycap('y')} ${dim('copy the cd command')}`));
    section('✅', 'DONE WHEN', ex.done);
    L.push('');
    const dots = ex.hints.map((_, i) => (i < shown ? yellow('●') : dim('○'))).join('');
    L.push(`  💡 ${bold(white('HINTS'))}  ${dots}  ${dim(shown < ex.hints.length ? `${shown} of ${ex.hints.length} revealed — press h for ${shown ? 'the next one' : 'the first one'}` : 'all revealed')}`);
    for (let i = 0; i < shown; i++) {
      const h = ex.hints[i];
      L.push('');
      L.push(`   ${yellow(`${i + 1}.`)} ${yellow(bold(h.title))}`);
      L.push(...renderMarkdown(h.body, W() - 4).map((l) => (l ? `   ${l}` : l)));
    }
    L.push('');
    L.push(...statusLines(lab, ex));
    if (ex.further) {
      L.push('');
      L.push(`  🚀 ${bold(white('GOING FURTHER'))} ${dim('— for when you are done early')}`);
      L.push(...renderMarkdown(ex.further, W()));
    }
    L.push('');
    return {
      lines: L,
      footer: footer([['t', 'checks'], ['w', 'watch'], ['h', 'hint'], ['a', 'agent check'], ['c', 'Copilot here'], ['g', 'guide'], ['s', 'solution'], ['x', 'start over'], ['1-3', 'level'], ['b', 'back'], ['?', 'help'], ['q', 'quit']]),
    };
  }

  function resultLines(results, running, plan) {
    const L = [];
    (plan ?? []).forEach((name, i) => {
      const r = results[i];
      if (r) {
        const icon = r.status === 'pass' ? '✅' : r.status === 'skip' ? '⏩' : r.optional ? '🟠' : '❌';
        L.push(`   ${icon} ${r.status === 'pass' ? green(name) : r.status === 'skip' ? dim(name) : white(name)}${r.optional ? dim(' (optional)') : ''}`);
        if (r.status !== 'pass' && r.message) wrap(inline(r.message), W() - 10).forEach((l, j) => L.push(`       ${j === 0 ? dim('↳ ') : '  '}${r.status === 'skip' ? dim(l) : yellow(l)}`));
      } else if (running && i === results.filter(Boolean).length) {
        L.push(`   ${bright(spin())}  ${white(name)}`);
      } else {
        L.push(`   ${dim('◻')}  ${dim(name)}`);
      }
    });
    return L;
  }

  function celebration(lines, lab, ex) {
    const c = S.celebrate;
    const t = now() - (c?.at ?? 0);
    const moving = ANIM && t < 3500;
    const n = 18;
    const shift = moving ? Math.floor(t / 110) : 0;
    const confetti = (o) => Array.from({ length: n }, (_, i) => CONFETTI[(i + shift + o) % CONFETTI.length]).join(' ');
    const { done } = counts();
    const from = c?.from ?? done;
    const shownDone = moving ? Math.round(from + (done - from) * ease(t / 900)) : done;
    lines.push('');
    lines.push(`   ${confetti(0)}`);
    lines.push('');
    lines.push(`        ${bold(bright('A L L   C H E C K S   P A S S E D !'))}`);
    lines.push(`        ${white(`Lab ${lab.num} · ${LEVEL_NAME[ex.level]} is done.`)}`);
    lines.push(`        ${bar(shownDone, total, 24)}  ${bold(bright(`${shownDone}/${total}`))} ${dim('levels')}`);
    lines.push('');
    lines.push(`   ${confetti(3)}`);
    if (done === total) {
      lines.push('', `   🏆 ${bold(bright('ALL 24 LEVELS DONE. You are an agent-harness engineer!'))}`);
      lines.push(`      ${dim(`Tell ${BRAND.author.split('-')[0]} how it went: ${BRAND.email}`)}`);
    } else if (labDone(lab)) {
      lines.push('', `   🏅 ${bold(bright(`LAB ${lab.num} COMPLETE`))} ${white(`· ${lab.title} mastered!`)}`);
    }
    const nu = nextUp();
    if (nu) lines.push('', `   👉 ${white('Next up:')} Lab ${nu.lab.num} · ${LEVEL_BADGE[nu.ex.level]} ${bright(nu.ex.title)} ${dim('— press n')}`);
    if (ex.hasAgent && progress.get(keyOf(lab, ex)).agent !== 'pass') lines.push(`   🤖 ${white('Want proof from the real agent?')} ${dim('Press a to run the agent check (uses AI credits).')}`);
    if (ex.further) lines.push(`   🚀 ${white('Done early?')} ${dim('The mission screen (b) has "Going further" ideas.')}`);
  }

  function checksScreen() {
    const lab = labObj();
    const ex = exObj();
    const R = S.run;
    const L = [''];
    L.push(...header(`🧪 ${bold(bright(`CHECKING · Lab ${lab.num} · ${LEVEL_NAME[ex.level]}`))}  ${dim(ex.title)}`, dim(`Folder: ${rel(ex.src)}`), S.watch ? bright('👀 watching') : null));
    if (S.watch) L.push(`  ${dim('👀 The checks run again every time you save a file in src/. Press w to stop watching.')}`);
    L.push('');
    if (R.fatal) {
      L.push(`   ❌ ${red('The checks could not run:')}`);
      wrap(R.fatal, W() - 8).forEach((l) => L.push(`      ${yellow(l)}`));
    }
    L.push(...resultLines(R.results, R.running, R.plan));
    if (!R.running && !R.fatal && R.summary) {
      const s = R.summary;
      if (s.allPass && R.firstPass) celebration(L, lab, ex);
      else if (s.allPass) {
        L.push('', `   ✅ ${bold(bright('Still green.'))} ${dim('All checks pass.')}`);
      } else {
        L.push('');
        L.push(`   💪 ${white(`${s.passed} of ${s.total} checks pass.`)} ${dim('Fix the ❌ ones, then press t again')}${S.watch ? dim(' (or just save a file)') : dim('.')}`);
        L.push(`   💡 ${dim('Stuck? Go back (b) and press h for a hint, or c to ask Copilot right in this folder.')}`);
      }
    }
    L.push('');
    return { lines: L, footer: footer(R.running ? [['…', 'checking'], ['q', 'quit']] : [['t', 'run again'], ['w', S.watch ? 'stop watching' : 'watch'], ['c', 'Copilot here'], ['a', 'agent check'], ['n', 'next up'], ['b', 'back to the mission'], ['q', 'quit']]) };
  }

  function agentScreen() {
    const lab = labObj();
    const ex = exObj();
    const A = S.agent;
    const L = [''];
    L.push(...header(`🤖 ${bold(bright(`AGENT CHECK · Lab ${lab.num} · ${LEVEL_NAME[ex.level]}`))}  ${dim(ex.title)}`, dim('Runs the real Copilot CLI on a copy of your folder: labs/.runs/')));
    L.push('');
    if (A.phase === 'none') {
      L.push(`   🆓 ${white('This level has no agent check — the free checks (t) are all you need.')}`);
    } else if (A.phase === 'confirm') {
      L.push(`   ${white('This sends real prompts to Copilot and checks what the agent says and does.')}`);
      L.push(`   💳 ${yellow(`It uses AI credits — about ${A.specs.reduce((n, s) => n + (s.prompts ?? 1), 0)} prompt(s).`)} ${dim('Student plan: 200 AI credits per month.')}`);
      L.push('');
      A.specs.forEach((s, i) => {
        L.push(`   ${bright(`${i + 1}.`)} ${white(s.name)}`);
        const cmd = s.command ? displayCommand(s.command[0], s.command.slice(1)) : displayCommand('copilot', copilotArgs(s));
        wrap(cmd, W() - 10).forEach((l) => L.push(`      ${cyan(l)}`));
        L.push('');
      });
      L.push(`   ${bold(white('Run it now?'))}  ${keycap('y')} ${dim('yes')}   ${keycap('n')} ${dim('no')}`);
    } else {
      A.specs.forEach((s, i) => {
        const r = A.results[i];
        if (r) {
          L.push(`   ${r.status === 'pass' ? '✅' : '❌'} ${r.status === 'pass' ? green(s.name) : white(s.name)}`);
          if (r.status !== 'pass') wrap(inline(r.message), W() - 10).forEach((l, j) => L.push(`       ${j === 0 ? dim('↳ ') : '  '}${yellow(l)}`));
          if (r.output) {
            L.push(`       ${dim('Copilot said:')}`);
            r.output.split('\n').filter((l) => l.trim()).slice(-8).forEach((l) => wrap(l, W() - 12).forEach((w) => L.push(`         ${dim(w)}`)));
          }
        } else if (A.phase === 'running' && A.current === i) {
          L.push(`   ${bright(spin())}  ${white(s.name)}  ${dim(`${A.seconds ?? 0}s — the agent is working…`)}`);
        } else L.push(`   ${dim('◻')}  ${dim(s.name)}`);
      });
      if (A.phase === 'done') {
        L.push('');
        if (A.allPass) L.push(`   🤖✨ ${bold(bright('The real agent proved it. Agent check passed!'))}`);
        else wrap(`💪 ${white('Not yet.')} ${dim('Read the ↳ reason, tweak your files, and try again. The last test copy stays in labs/.runs/ so you can look at it.')}`, W() - 4).forEach((l) => L.push(`   ${l}`));
      }
    }
    L.push('');
    const keys = A.phase === 'confirm' ? [['y', 'run'], ['n', 'cancel']] : A.phase === 'running' ? [['…', 'the agent is working'], ['c', 'cancel']] : [['a', 'run again'], ['b', 'back to the mission'], ['q', 'quit']];
    return { lines: L, footer: footer(keys) };
  }

  function solutionScreen() {
    const lab = labObj();
    const ex = exObj();
    const Sol = S.sol;
    const L = [''];
    L.push(...header(`👀 ${bold(bright(`SOLUTION · Lab ${lab.num} · ${LEVEL_NAME[ex.level]}`))}  ${dim(ex.title)}`, dim(`Reference: ${rel(ex.sol)}`)));
    L.push('');
    if (!Sol.files.length) {
      L.push(`   🎉 ${bright('Your folder already matches the reference solution in every file it has.')}`);
      return { lines: L, footer: footer([['b', 'back'], ['q', 'quit']]) };
    }
    L.push(`   ${white('Files where your src/ differs from the reference:')}`);
    Sol.files.forEach((f, i) => {
      const sel = i === Sol.idx;
      const row = `   ${sel ? bright('❯') : ' '} ${f.status === 'new' ? '🆕' : '📝'} ${sel ? bold(white(f.rel)) : f.rel} ${dim(f.status === 'new' ? '(not in your src yet)' : '(different)')}`;
      L.push(sel ? `${style.bg(C.panel)}${row}` : row);
    });
    L.push('');
    const f = Sol.files[Sol.idx];
    L.push(`   ${dim('─'.repeat(Math.max(10, W() - 6)))}`);
    L.push(`   📄 ${bold(white(f.rel))} ${dim('(reference version)')}`);
    const text = fs.readFileSync(path.join(ex.sol, f.rel), 'utf8').replace(/\r/g, '');
    text.split('\n').forEach((line, i) => L.push(`   ${dim(String(i + 1).padStart(3))}  ${cyan(line.replace(/\t/g, '  '))}`));
    L.push('');
    return { lines: L, footer: footer([['←→', 'switch file'], ['↑↓', 'scroll'], ['b', 'back'], ['q', 'quit']]) };
  }

  function confirmSolutionScreen() {
    const lab = labObj();
    const ex = exObj();
    const L = [''];
    L.push(...header(`👀 ${bold(bright('PEEK AT THE SOLUTION?'))}`, dim(`Lab ${lab.num} · ${LEVEL_NAME[ex.level]} · ${ex.title}`)));
    L.push('');
    L.push(`   ${white('It is way more fun (and you learn more) if you try a hint first 😉')}`);
    L.push(`   ${dim('You can always compare later with:')} ${cyan(`git diff --no-index ${rel(ex.src)} ${rel(ex.sol)}`)}`);
    L.push('');
    L.push(`   ${keycap('y')} ${dim('show me')}    ${keycap('h')} ${dim('give me a hint instead')}    ${keycap('n')} ${dim('back')}`);
    return { lines: L, footer: footer([['y', 'show'], ['h', 'hint'], ['n', 'back']]) };
  }

  function confirmResetScreen() {
    const lab = labObj();
    const ex = exObj();
    const Rs = S.reset;
    const L = [''];
    L.push(...header(`♻️  ${bold(bright('START THIS LEVEL OVER?'))}`, dim(`Lab ${lab.num} · ${LEVEL_NAME[ex.level]} · ${ex.title}`)));
    L.push('');
    if (Rs.result) {
      if (Rs.result.ok) {
        L.push(`   ✅ ${bright('Done. This level is back to its starting point.')}`);
        L.push(`   💾 ${dim('Your previous files are safe in')} ${cyan(rel(Rs.result.backup))}`);
      } else {
        wrap(`${Rs.result.clean ? '👍' : '⚠️ '} ${Rs.result.clean ? white('Nothing to do:') : yellow('Could not reset:')} ${dim(Rs.result.reason)}`, W() - 4).forEach((l) => L.push(`   ${l}`));
        if (!Rs.result.clean) wrap(dim('No git? Extract this level\'s src/ folder again from the workshop zip to get a fresh copy.'), W() - 4).forEach((l) => L.push(`   ${l}`));
      }
      L.push('');
      L.push(`   ${keycap('b')} ${dim('back to the mission')}`);
      return { lines: L, footer: footer([['b', 'back'], ['q', 'quit']]) };
    }
    L.push(`   ${white('This puts')} ${cyan(rel(ex.src))} ${white('back to your last git commit.')}`);
    L.push(`   ${dim('Your current files are copied to')} ${cyan('labs/.backups/')} ${dim('first, so nothing is lost.')}`);
    L.push('');
    if (Array.isArray(S.changes)) {
      if (S.changes.length) {
        L.push(`   📝 ${white('Changes that will be undone:')}`);
        S.changes.slice(0, 12).forEach((c) => L.push(`      ${c.status === 'new' ? '🆕' : c.status === 'deleted' ? '🗑️ ' : '📝'} ${c.file}`));
        if (S.changes.length > 12) L.push(`      ${dim(`… and ${S.changes.length - 12} more`)}`);
      } else L.push(`   👍 ${dim('There is nothing to undo: src/ matches your last commit.')}`);
      L.push('');
    }
    L.push(`   ${keycap('y')} ${dim('yes, start over')}    ${keycap('n')} ${dim('no, keep my work')}`);
    return { lines: L, footer: footer([['y', 'start over'], ['n', 'keep my work']]) };
  }

  function helpScreen() {
    const L = [''];
    L.push(...header(`❓ ${bold(bright('HOW THE LABS WORK'))}`, dim(`${BRAND.title} · lab companion`)));
    L.push(...renderMarkdown(`
Each lab has three levels: 🟢 **easy** (we do it together), 🟡 **medium** and 🔴 **hard** (you do them during lab time). Every level is a small standalone project:
- \`todo.md\` - your mission. It is short on purpose, with hints you reveal one at a time.
- \`src/\` - where you work. Press **c** to start Copilot right there.
- \`tests/\` - the checks. Press **t** to run them - they are free.
- \`sol/\` - a reference solution, for when you are really stuck (press **s**).

## Keys on a level
| Key | What it does |
|---|---|
| **t** | run the free checks (✅ or ❌, with a reason) |
| **w** | watch: run the checks again every time you save a file |
| **h** | reveal the next hint |
| **c** | start Copilot in this level's folder; type /exit to come back (your checks run automatically) |
| **o** / **y** | open the folder (VS Code or your file manager) / copy its cd command |
| **g** | read the lab guide: concepts, examples, links |
| **a** | 🤖 agent check: the real Copilot on a copy of your folder (uses AI credits) |
| **s** | peek at the reference solution |
| **x** | start the level over (your files are backed up first; needs git) |
| **1 2 3** | switch between easy, medium and hard |
| **n** | jump to the next unfinished level |

## Good to know
- 🔐 **Trust the workshop folder once**: run \`copilot\` in the workshop root and choose "Yes, and remember this folder". Copilot only loads MCP servers, hooks and agents from trusted folders.
- 💻 **Without this app**: \`node labs/start.mjs test lab-01 easy\` runs the checks; add \`--watch\` to re-run them on save, or \`--agent\` for the agent checks.
- 🎬 Calmer screen? Start with \`--no-anim\` (no animations) or \`--no-intro\` (no welcome screen).

## About
- ✨ ${creditLine()}
- 📧 Questions, ideas or feedback: **${BRAND.email}**
`, W()));
    L.push('');
    return { lines: L, footer: footer([['↑↓', 'scroll'], ['b', 'back'], ['q', 'quit']]) };
  }

  // ---------- actions ----------
  const SCREENS = { splash: splashScreen, home: homeScreen, lab: labScreen, readme: readmeScreen, exercise: exerciseScreen, checks: checksScreen, agent: agentScreen, solution: solutionScreen, confirmSolution: confirmSolutionScreen, confirmReset: confirmResetScreen, help: helpScreen };
  function render() {
    if (S.suspended) return;
    const { lines, footer: f } = SCREENS[S.screen]();
    paint(lines, f);
  }

  function go(screen) {
    if (screen !== S.screen) S.scroll = 0;
    if ((screen === 'home' || screen === 'lab') && S.screen !== screen && S.watch) stopWatch();
    if (screen === 'lab' && S.screen !== 'exercise' && S.screen !== 'readme' && S.screen !== 'help') S.t.lab = now();
    S.screen = screen;
    if (screen === 'exercise' || screen === 'lab') saveUi();
    if (screen === 'exercise') S.changes = gitChanges(exObj().src);
    render();
  }

  function enterHome() {
    S.screen = 'home';
    S.scroll = 0;
    S.t.home = now();
    render();
  }

  async function runFreeChecks({ silent = false } = {}) {
    const lab = labObj();
    const ex = exObj();
    const key = keyOf(lab, ex);
    const before = progress.get(key).checks;
    const doneBefore = counts().done;
    S.run = { running: true, results: [], plan: [], fatal: null, summary: null, firstPass: false };
    if (!silent || S.screen === 'checks') go('checks');
    else render();
    const evidence = captureEvidence(ex);
    const summary = await runChecks({
      exDir: ex.dir,
      target: ex.src,
      onEvent: (e) => {
        if (e.type === 'plan') S.run.plan = e.names;
        if (e.type === 'result') S.run.results[e.idx] = e;
        if (e.type === 'fatal') S.run.fatal = e.message;
        render();
      },
    });
    S.run.running = false;
    S.run.summary = summary;
    if (summary.fatal) S.run.fatal = summary.fatal;
    const firstFail = summary.results.find((r) => r.status === 'fail');
    progress.recordChecks(key, summary, evidence);
    if (summary.allPass && before !== 'pass') {
      S.run.firstPass = true;
      S.celebrate = { at: now(), from: doneBefore };
    }
    S.changes = gitChanges(ex.src);
    if (silent && S.screen !== 'checks') toast(summary.allPass ? `👀 Re-checked: ✅ all ${summary.total} checks pass` : `👀 Re-checked: ${summary.passed}/${summary.total} pass${firstFail ? ` · next: ${firstFail.name}` : ''}`);
    render();
    if (S.watch?.pending) { S.watch.pending = false; runFreeChecks({ silent: true }); }
  }

  function startWatch() {
    const ex = exObj();
    stopWatch();
    let watcher;
    try {
      watcher = fs.watch(ex.src, { recursive: true }, (evt, file) => {
        if (/(^|[\\/])(\.agent-logs|node_modules|\.git)([\\/]|$)/.test(String(file ?? ''))) return;
        if (!S.watch) return;
        clearTimeout(S.watch.timer);
        S.watch.timer = setTimeout(() => {
          if (!S.watch || S.suspended) return;
          if (S.run?.running) S.watch.pending = true;
          else runFreeChecks({ silent: true });
        }, 700);
      });
    } catch (e) {
      toast(`👀 ${yellow('Watching does not work here:')} ${dim(e.message)}`);
      return false;
    }
    watcher.on('error', () => stopWatch());
    S.watch = { watcher, timer: null, pending: false };
    return true;
  }
  function stopWatch() {
    if (!S.watch) return;
    clearTimeout(S.watch.timer);
    try { S.watch.watcher.close(); } catch { /* closed */ }
    S.watch = null;
  }
  function toggleWatch() {
    if (S.watch) { stopWatch(); toast('👀 Stopped watching.'); render(); return; }
    if (startWatch()) {
      if (S.screen !== 'checks') runFreeChecks();
      else render();
      toast('👀 Watching src/ — save a file and the checks run again.');
    }
  }

  async function openAgent() {
    const ex = exObj();
    const specs = await loadAgentChecks(ex.dir);
    S.agent = { phase: specs.length ? 'confirm' : 'none', specs, results: [], current: -1 };
    go('agent');
  }

  async function startAgent() {
    const lab = labObj();
    const ex = exObj();
    const doneBefore = counts().done;
    S.agent.phase = 'running';
    S.agent.results = [];
    render();
    const res = await runAgentChecks({
      exDir: ex.dir,
      target: ex.src,
      labsDir,
      labId: lab.id,
      level: ex.level,
      onEvent: (e) => {
        if (e.type === 'start') { S.agent.current = e.idx; S.agent.seconds = 0; }
        if (e.type === 'tick') S.agent.seconds = e.seconds;
        if (e.type === 'result') S.agent.results[e.idx ?? S.agent.results.length] = e;
        render();
      },
    });
    S.agent.phase = 'done';
    S.agent.allPass = res.results.length > 0 && res.results.every((r) => r.status === 'pass');
    progress.set(keyOf(lab, ex), { agent: S.agent.allPass ? 'pass' : 'fail' });
    if (S.agent.allPass) S.celebrate = { at: now(), from: doneBefore };
    render();
  }

  function openSolution() {
    const ex = exObj();
    const files = listFiles(ex.sol).filter((f) => !/(^|\/)(node_modules|\.agent-logs)\//.test(f)).map((f) => {
      const mine = path.join(ex.src, f);
      if (!fs.existsSync(mine)) return { rel: f, status: 'new' };
      const a = fs.readFileSync(mine, 'utf8').replace(/\r\n/g, '\n').trim();
      const b = fs.readFileSync(path.join(ex.sol, f), 'utf8').replace(/\r\n/g, '\n').trim();
      return a === b ? null : { rel: f, status: 'changed' };
    }).filter(Boolean);
    S.sol = { files, idx: 0 };
    progress.set(keyOf(labObj(), ex), { peeked: true });
    go('solution');
  }

  function revealHint() {
    const lab = labObj();
    const ex = exObj();
    const p = progress.get(keyOf(lab, ex));
    if ((p.hints ?? 0) >= ex.hints.length) { toast('💡 All hints are already revealed. Still stuck? Press s for the solution.'); go('exercise'); return; }
    progress.set(keyOf(lab, ex), { hints: (p.hints ?? 0) + 1 });
    go('exercise');
    S.scroll = 9999;
    render();
  }

  function jumpNext() {
    const nu = nextUp();
    if (!nu) { toast('🏆 Every level is done!'); return; }
    stopWatch();
    S.lab = catalog.indexOf(nu.lab);
    S.level = nu.lab.levels.indexOf(nu.ex);
    go('exercise');
  }

  function switchLevel(i) {
    const lab = labObj();
    if (i < 0 || i >= lab.levels.length || i === S.level) return;
    stopWatch();
    S.level = i;
    go('exercise');
  }

  function suspend() {
    S.suspended = true;
    try { inp.setRawMode?.(false); } catch { /* not a tty */ }
    inp.pause();
    out.write('\x1b[0m\x1b[?25h\x1b[?1049l');
  }
  function resume() {
    out.write('\x1b[?1049h\x1b[?25l\x1b[2J');
    try { inp.setRawMode?.(true); } catch { /* not a tty */ }
    inp.resume();
    S.suspended = false;
    render();
  }
  function waitKey() {
    return new Promise((resolve) => {
      try { inp.setRawMode?.(true); } catch { /* not a tty */ }
      inp.resume();
      inp.once('keypress', () => { inp.pause(); try { inp.setRawMode?.(false); } catch { /* not a tty */ } resolve(); });
    });
  }

  async function launchCopilot() {
    const ex = exObj();
    stopWatch();
    suspend();
    const g = (s) => `${style.fg(C.green)}${s}${style.reset}`;
    out.write(`\n${g(`  💻 Copilot is starting in ${bold(rel(ex.src))}`)}\n${g(dim('     When you are done, type /exit and you come straight back to the lab app.'))}\n\n`);
    const ignore = () => {};
    process.on('SIGINT', ignore);
    const res = await runInteractive(copilotBin(), [], { cwd: ex.src });
    process.off('SIGINT', ignore);
    if (res.missing || res.code !== 0) {
      out.write(`\n${g(res.missing ? '  ⚠️  GitHub Copilot CLI is not installed: npm install -g @github/copilot' : `  Copilot stopped with exit code ${res.code}.`)}\n${g(dim('  Press any key to go back to the lab app…'))}`);
      await waitKey();
    }
    resume();
    if (!res.missing) {
      toast('👋 Welcome back! Checking your work…');
      runFreeChecks();
    }
  }

  async function openFolderAction() {
    const ex = exObj();
    const where = await openFolder(ex.src, { hasCode: Boolean(S.env?.code) });
    toast(where ? `📂 Opened ${cyan(rel(ex.src))} in ${where}.` : `📂 ${yellow('Could not open the folder.')} ${dim('It is')} ${cyan(ex.src)}`);
  }

  async function copyCd() {
    const ex = exObj();
    const cmd = `cd "${ex.src}"`;
    const how = await copyToClipboard(cmd, (seq) => out.write(seq));
    toast(how === 'system' ? `📋 Copied: ${cyan(cmd)}` : `📋 Sent to your clipboard (if your terminal allows it): ${cyan(cmd)}`, 6000);
  }

  function askReset() {
    S.reset = { result: null };
    S.changes = gitChanges(exObj().src);
    go('confirmReset');
  }
  function doReset() {
    const lab = labObj();
    const ex = exObj();
    stopWatch();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backup = path.join(labsDir, '.backups', `${lab.id}-${ex.level}-${stamp}`);
    const result = resetToCommit(ex.src, backup);
    if (result.ok) progress.set(keyOf(lab, ex), { checks: null, agent: null, passed: null, total: null, nextFix: null });
    S.reset = { result };
    S.changes = gitChanges(ex.src);
    render();
  }

  // ---------- timing ----------
  const animating = (t) => !S.env
    || S.screen === 'splash'
    || S.run?.running
    || S.agent?.phase === 'running'
    || (ANIM && S.celebrate && t - S.celebrate.at < 3600)
    || (ANIM && S.screen === 'home' && t - S.t.home < 1000)
    || (ANIM && S.screen === 'lab' && t - S.t.lab < 450)
    || (ANIM && t - S.t.flash < 220);
  function tick() {
    if (S.suspended) return;
    const t = now();
    if (S.screen === 'splash' && t - S.t.splash > S.splashEnd) { enterHome(); return; }
    if (S.toast && t > S.toast.until) { S.toast = null; render(); return; }
    if (animating(t)) { render(); return; }
    if ((S.screen === 'home' || S.screen === 'lab') && t - S.lastPulse >= 600) { S.lastPulse = t; render(); }
  }

  // ---------- keyboard ----------
  readline.emitKeypressEvents(inp);
  inp.setRawMode?.(true);
  inp.resume();
  out.write('\x1b[?1049h\x1b[?25l\x1b[2J');
  out.on('resize', () => { if (!S.suspended) { out.write('\x1b[2J'); render(); } });

  const moveFlash = () => { S.t.flash = ANIM ? now() : 0; };

  inp.on('keypress', (str, k = {}) => {
    if (S.suspended) return;
    const name = k.name ?? str;
    if (k.ctrl && name === 'c') {
      if (S.agent?.phase === 'running' && S.screen === 'agent') { process.emit('harness:cancel'); return; }
      quit();
    }
    if (S.screen === 'splash') { enterHome(); return; }
    const page = rows() - 4;
    const scrollKeys = () => {
      if (name === 'up' || name === 'k') { S.scroll--; render(); return true; }
      if (name === 'down' || name === 'j') { S.scroll++; render(); return true; }
      if (name === 'pageup') { S.scroll -= page; render(); return true; }
      if (name === 'pagedown' || name === 'space') { S.scroll += page; render(); return true; }
      if (name === 'home') { S.scroll = 0; render(); return true; }
      if (name === 'end') { S.scroll = 99999; render(); return true; }
      return false;
    };
    const busy = (S.screen === 'agent' && S.agent?.phase === 'running') || (S.run?.running && S.screen === 'checks');
    if (name === 'q' && !busy) quit();
    if (str === '?' && !busy && S.screen !== 'help') { S.helpBack = S.screen; go('help'); return; }
    switch (S.screen) {
      case 'home': {
        if (name === 'up' || name === 'k') { S.lab = (S.lab + catalog.length - 1) % catalog.length; moveFlash(); }
        else if (name === 'down' || name === 'j') { S.lab = (S.lab + 1) % catalog.length; moveFlash(); }
        else if (/^[0-9]$/.test(str ?? '') && catalog.findIndex((l) => Number(l.num) === Number(str)) >= 0) { S.lab = catalog.findIndex((l) => Number(l.num) === Number(str)); moveFlash(); }
        else if (name === 'return' || name === 'right' || name === 'l') { if (labObj().id !== progress.get('_ui').lab) S.level = 0; go('lab'); return; }
        else if (name === 'n') { jumpNext(); return; }
        render();
        return;
      }
      case 'lab': {
        const lab = labObj();
        if (name === 'up' || name === 'k') { S.level = (S.level + lab.levels.length - 1) % lab.levels.length; moveFlash(); }
        else if (name === 'down' || name === 'j') { S.level = (S.level + 1) % lab.levels.length; moveFlash(); }
        else if (['1', '2', '3'].includes(str)) { S.level = Math.min(Number(str) - 1, lab.levels.length - 1); go('exercise'); return; }
        else if (name === 'return' || name === 'right' || name === 'l') { go('exercise'); return; }
        else if (name === 'r' || name === 'g') { S.readmeBack = 'lab'; go('readme'); return; }
        else if (name === 'b' || name === 'escape' || name === 'left' || name === 'backspace') { go('home'); return; }
        render();
        return;
      }
      case 'readme':
      case 'help': {
        if (scrollKeys()) return;
        if (['b', 'escape', 'left', 'backspace', 'return'].includes(name)) go((S.screen === 'help' ? S.helpBack : S.readmeBack) || 'home');
        return;
      }
      case 'exercise': {
        if (scrollKeys()) return;
        if (name === 't') runFreeChecks();
        else if (name === 'w') toggleWatch();
        else if (name === 'a') openAgent();
        else if (name === 'h') revealHint();
        else if (name === 's') go('confirmSolution');
        else if (name === 'c') launchCopilot();
        else if (name === 'o') openFolderAction();
        else if (name === 'y') copyCd();
        else if (name === 'g' || name === 'r') { S.readmeBack = 'exercise'; go('readme'); }
        else if (name === 'x') askReset();
        else if (['1', '2', '3'].includes(str)) switchLevel(Number(str) - 1);
        else if (name === 'n') jumpNext();
        else if (name === 'b' || name === 'escape' || name === 'left' || name === 'backspace') { stopWatch(); go('lab'); }
        return;
      }
      case 'checks': {
        if (S.run?.running) return;
        if (scrollKeys()) return;
        if (name === 't') runFreeChecks();
        else if (name === 'w') toggleWatch();
        else if (name === 'c') launchCopilot();
        else if (name === 'a') openAgent();
        else if (name === 'n') jumpNext();
        else if (['b', 'escape', 'return', 'left', 'backspace'].includes(name)) go('exercise');
        return;
      }
      case 'agent': {
        const A = S.agent;
        if (A.phase === 'running') { if (name === 'c') process.emit('harness:cancel'); return; }
        if (A.phase === 'confirm') {
          if (name === 'y') startAgent();
          else if (['n', 'b', 'escape'].includes(name)) go('exercise');
          return;
        }
        if (scrollKeys()) return;
        if (name === 'a') openAgent();
        else if (['b', 'escape', 'return', 'left', 'backspace'].includes(name)) go('exercise');
        return;
      }
      case 'confirmSolution': {
        if (name === 'y') openSolution();
        else if (name === 'h') revealHint();
        else go('exercise');
        return;
      }
      case 'confirmReset': {
        if (S.reset?.result) { if (['b', 'escape', 'return', 'left', 'n', 'backspace'].includes(name)) go('exercise'); return; }
        if (name === 'y') doReset();
        else go('exercise');
        return;
      }
      case 'solution': {
        const Sol = S.sol;
        if (Sol.files.length && (name === 'right' || name === 'tab')) { Sol.idx = (Sol.idx + 1) % Sol.files.length; S.scroll = 0; render(); return; }
        if (Sol.files.length && name === 'left') { Sol.idx = (Sol.idx + Sol.files.length - 1) % Sol.files.length; S.scroll = 0; render(); return; }
        if (scrollKeys()) return;
        if (['b', 'escape', 'backspace'].includes(name)) go('exercise');
        return;
      }
      default:
    }
  });

  // ---------- start ----------
  const meta = progress.get('_meta');
  const longAgo = !meta.introAt || now() - Date.parse(meta.introAt) > 6 * 3600 * 1000;
  if (S.screen === 'exercise') {
    S.changes = gitChanges(exObj().src);
  } else if (intro && ANIM) {
    S.screen = 'splash';
    S.t.splash = longAgo ? now() : now() - 2400;
    S.splashEnd = longAgo ? 5200 : 3700;
    progress.set('_meta', { introAt: new Date().toISOString() });
  } else {
    S.t.home = ANIM ? now() : 0;
  }
  ticker = setInterval(tick, 45);
  render();
  const [copilot, git, apm, ghaw, code] = await Promise.all([
    detect(copilotBin(), ['--version']),
    detect('git', ['--version']),
    detect('apm', ['--version']),
    detect('gh', ['aw', 'version']),
    detect('code', ['--version']),
  ]);
  S.env = { copilot, node: process.versions.node, git, apm, ghaw, code, trusted: isTrusted(rootDir) };
  render();
}
