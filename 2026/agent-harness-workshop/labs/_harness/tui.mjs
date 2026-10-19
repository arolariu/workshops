// 🧠 The lab companion: an interactive, keyboard-driven terminal app (zero dependencies).
// It presents state and dispatches actions; assessment, evidence, recovery, navigation and reports live in the
// shared helpers (checks, agent, progress, workspace, learning, doctor).
import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import {
  ESC, C, style, green, bright, dim, white, yellow, red, cyan, bold, width, pad, wrap, bar, box, renderMarkdown, inline, clip,
  stripAnsi, SPINNER, noColor, setAscii, isAscii, asciiFold, statusIcon, statusWord, hardWrap,
} from './ui.mjs';
import { loadCatalog, DIFFICULTIES } from './catalog.mjs';
import { progressStore, captureEvidence } from './progress.mjs';
import { runChecks as realRunChecks } from './checks.mjs';
import { runAgentChecks as realRunAgentChecks, loadAgentChecks as realLoadAgentChecks, listRuns as realListRuns, budgetPreview, specCommand } from './agent.mjs';
import { copilotBin } from './kit.mjs';
import { BRAND, creditLine } from './brand.mjs';
import { runInteractive as realRunInteractive, openFolder as realOpenFolder, copyToClipboard as realCopy } from './system.mjs';
import { changes as gitChanges, changesDiff as realChangesDiff, ensureStarter, listRecovery, restoreStarter, restoreSnapshot, createCheckpoint, resetToCommit, compareTrees } from './workspace.mjs';
import { inspectEnvironment as realInspect } from './doctor.mjs';
import { PATHS, pathById, pathTime, progressView, describeSelection, nextExercise, choosePath, learningReport, writeReport, STATUS_FILTERS } from './learning.mjs';
import { courseOrder, predecessorOf, loadManifest } from './chain.mjs';
import { loadCourse } from './course.mjs';
import { bringPlan, applyBring } from './bring.mjs';
import { revealNextHint, revealedHints, nextFixName, groupChecks } from './milestones.mjs';
import { bringLines } from './screens/bring.mjs';
import { changesLines } from './screens/changes.mjs';
import { answerQuiz, quizLines, takeawayLines, quizUnlocked } from './screens/learn.mjs';
import { layerMapLines } from './screens/layers.mjs';
import { levelClock, suggestedMinutes, timerText, shouldNudge } from './timer.mjs';
import { creditSummary, meterLine } from './credits.mjs';
import { loadGlossary } from './glossary.mjs';
import { KEYMAP, MENU_KEYS, binding } from './keys.mjs';
import { checkGroupLines, milestoneListLines, hintDots } from './screens/milestones.mjs';

const CONFETTI = ['🎉', '✨', '🎊', '⭐', '🥳', '💚', '🚀'];
const TIPS = [
  'Press `c` on a level to start Copilot right in its folder. Type `/exit` to come back: your checks run automatically.',
  'Press `w` to watch a level: the checks run again every time you save a file.',
  'Inside Copilot, `!npm test` runs a command yourself: no AI, no credits.',
  'Edited an instruction, skill or agent? Start a new Copilot session (`/new`) so it picks it up.',
  'Stuck? Reveal a hint (`h`) before peeking at the solution (`s`).',
  '`/env` in Copilot shows everything it loaded: instructions, skills, agents, MCP servers, hooks.',
  'Agent checks run on a copy in `labs/.runs/`, so your `src/` stays exactly as you left it.',
  'Press `/` to search every exercise, and `p` to follow a learning path.',
  'Every level starts from the reference result of the level before it. Press `i` to bring your own harness forward instead.',
  'Only the 🟢 easy levels are done together. Every other level is optional homework: pick what interests you.',
  '`/usage` shows what a session cost. Cap scripted runs with `--max-ai-credits`.',
  'Messed up a level? Press `x`: restore the starter, a checkpoint or a backup. Your files are backed up first.',
];
const LOGO = [
  '▄▀█ █▀▀ █▀▀ █▄ █ ▀█▀   █ █ ▄▀█ █▀█ █▄ █ █▀▀ █▀ █▀',
  '█▀█ █▄█ ██▄ █ ▀█  █    █▀█ █▀█ █▀▄ █ ▀█ ██▄ ▄█ ▄█',
];
const GRADIENT = [121, 120, 84, 78, 79, 43, 37];
const BOOT = ['📜 instructions', '🧩 skills', '🎭 agents', '🔌 MCP', '🔒 hooks'];
const MINUTE_STEPS = [null, 10, 15, 20, 30];
const LEVEL_FILTERS = [null, ...DIFFICULTIES.map((d) => d.id)];
const STATUS_STEPS = [null, ...STATUS_FILTERS];

const ease = (k) => 1 - (1 - Math.max(0, Math.min(1, k))) ** 3;
const color256 = (n, s) => (noColor ? s : `${ESC}38;5;${n}m${s}`);

/**
 * Start the app. Returns { state, closed } where `closed` resolves with the exit code when the app quits.
 * Input/output and the side-effecting helpers can be replaced (tests drive the app with fake streams).
 */
export async function startTui({
  labsDir, open = null, intro = true, anim = true, ascii = false, path: startPath = null,
  input = process.stdin, output = process.stdout, deps: overrides = {}, onExit = (code) => process.exit(code),
}) {
  const deps = {
    runChecks: realRunChecks, runAgentChecks: realRunAgentChecks, loadAgentChecks: realLoadAgentChecks, listRuns: realListRuns,
    inspectEnvironment: realInspect, runInteractive: realRunInteractive, openFolder: realOpenFolder, copyToClipboard: realCopy,
    changesDiff: realChangesDiff,
    now: () => Date.now(),
    ...overrides,
  };
  setAscii(ascii);
  const out = output;
  const inp = input;
  const rootDir = path.dirname(labsDir);
  const catalog = loadCatalog(labsDir);
  const glossary = loadGlossary(labsDir);
  const store = progressStore(labsDir);
  const view = progressView(store, catalog);
  const order = courseOrder(catalog);
  const total = catalog.reduce((n, l) => n + l.levels.length, 0);
  const tiers = DIFFICULTIES.filter((d) => catalog.some((l) => l.levels.some((e) => e.level === d.id)));
  const rel = (p) => path.relative(rootDir, p).split(path.sep).join('/');
  const ANIM = anim && !noColor && !process.env.HARNESS_NO_ANIM;
  let resolveClosed;
  const closed = new Promise((r) => { resolveClosed = r; });

  const S = {
    screen: 'home',
    back: {},
    lab: 0,
    level: 0,
    scroll: 0,
    follow: true,
    env: null,
    run: null,
    agent: null,
    agentRun: null,
    agentToken: 0,
    credits: null,
    sol: null,
    celebrate: null,
    toast: null,
    watch: null,
    changes: null,
    suspended: false,
    lastPulse: 0,
    t: { splash: 0, home: 0, lab: 0, flash: 0 },
    splashEnd: 0,
    path: 'all',
    browse: { query: '', level: null, status: null, maxMinutes: null, bookmarked: false, idx: 0, editing: false },
    menu: { idx: 0 },
    detail: { idx: 0 },
    history: { runs: [], idx: 0, open: false },
    recovery: { list: null, idx: 0, confirm: null, result: null, naming: null },
    doctor: { running: false },
    exported: null,
    bring: null,
    diff: null,
    quizChoice: null,
    tip: Math.floor(Math.random() * TIPS.length),
  };

  // Where were we last time? And did the facilitator pick a path or an exercise?
  const ui = store.get('_ui');
  if (pathById(ui.path)) S.path = ui.path;
  if (startPath && pathById(startPath)) S.path = startPath;
  const li = catalog.findIndex((l) => l.id === ui.lab);
  if (li >= 0) S.lab = li;
  const lv = catalog[S.lab]?.levels.findIndex((e) => e.level === ui.level) ?? -1;
  if (lv >= 0) S.level = lv;
  if (open) {
    const oi = catalog.findIndex((l) => l.id === open.lab.id);
    const oj = oi >= 0 ? catalog[oi].levels.findIndex((e) => e.level === open.ex.level) : -1;
    if (oi >= 0 && oj >= 0) { S.lab = oi; S.level = oj; S.screen = 'exercise'; }
  }

  // ---------- terminal plumbing ----------
  let ticker = null;
  let toastTimer = null;
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
  const restore = () => {
    if (ticker) clearInterval(ticker);
    clearTimeout(toastTimer);
    for (const t of timers) clearTimeout(t);
    stopWatch();
    S.run?.controller?.abort();
    S.agentRun?.controller.abort();
    try { inp.setRawMode?.(false); } catch { /* not a tty */ }
    out.write('\x1b[0m\x1b[?25h\x1b[?1049l');
  };
  let quitting = false;
  const quit = (code = 0) => {
    if (quitting) return;
    quitting = true;
    try { credit(clock.touch(null)); } catch { /* progress could not be saved: the time is lost, nothing else */ }
    restore();
    const { done } = counts();
    const g = (s) => `${style.fg(C.green)}${s}${style.reset}`;
    const say = (s) => out.write(isAscii() ? asciiFold(s) : s);
    say(`\n${g(`  👋 See you! ${done} of ${total} exercises pass on their current files.`)}\n`);
    say(`${g(`     Continue any time: ${bold('node labs/start.mjs')}`)}\n`);
    say(`${g(dim(`     ✨ ${BRAND.title} · by ${BRAND.author} · ${BRAND.email}`))}\n\n`);
    inp.removeListener('keypress', onKey);
    out.removeListener?.('resize', onResize);
    resolveClosed(code);
    onExit(code);
  };
  if (inp === process.stdin) process.on('uncaughtException', (e) => { restore(); console.error(e); process.exit(1); });

  const cols = () => Math.max(20, out.columns || 100);
  const rows = () => Math.max(8, out.rows || 32);
  const W = () => Math.max(16, Math.min(cols() - 4, 96));
  const now = () => Date.now();
  const spin = () => (ANIM ? SPINNER[Math.floor(now() / 90) % SPINNER.length] : '…');

  /** Draw a full frame. `focus` = [firstRow, lastRow] of the selected item: it is scrolled into view when the selection moves. */
  function paint(lines, footerLines, focus) {
    if (S.suspended) return;
    const C_ = cols();
    const R = rows();
    const bodyRows = Math.max(1, R - footerLines.length);
    const maxScroll = Math.max(0, lines.length - bodyRows);
    if (focus && S.follow) {
      if (focus[0] < S.scroll) S.scroll = focus[0];
      else if (focus[1] >= S.scroll + bodyRows) S.scroll = focus[1] - bodyRows + 1;
    }
    S.follow = false;
    if (S.scroll > maxScroll) S.scroll = maxScroll;
    if (S.scroll < 0) S.scroll = 0;
    const visible = lines.slice(S.scroll, S.scroll + bodyRows);
    let foot = footerLines;
    if (S.scroll < maxScroll && foot.length) {
      const lastLine = foot[foot.length - 1];
      const marker = width(lastLine) + 16 <= C_ ? `   ${dim('↓ more below')}` : `  ${bright('↓')}`;
      foot = [...foot.slice(0, -1), `${lastLine}${marker}`];
    }
    let buf = '\x1b[H';
    for (let r = 0; r < R; r++) {
      const isFooter = r >= bodyRows;
      const line = isFooter ? foot[r - bodyRows] ?? '' : visible[r] ?? '';
      const body = clip(line, C_ - 1);
      buf += `${style.bg(isFooter ? C.panel : C.bg)}${style.fg(C.green)}${isAscii() ? asciiFold(body) : body}\x1b[K`;
      if (r < R - 1) buf += '\r\n';
    }
    out.write(buf);
  }

  const keycap = (k) => bold(bright(k));
  // Footer: the toast (if any) plus every key hint, reflowed over as many lines as needed (up to a third of the screen).
  function footer(items) {
    const maxW = cols() - 4;
    const lines = [];
    let cur = '';
    for (const [k, d] of items) {
      const part = `${keycap(k)} ${dim(d)}`;
      const next = cur ? `${cur}   ${part}` : part;
      if (cur && width(next) > maxW) { lines.push(cur); cur = part; } else cur = next;
    }
    if (cur) lines.push(cur);
    const room = Math.max(1, Math.floor(rows() / 3) - (S.toast ? 1 : 0));
    let keys = lines;
    if (lines.length > room) {
      keys = lines.slice(0, room);
      keys[room - 1] = `${clip(keys[room - 1], Math.max(0, maxW - 14))}  ${keycap('?')} ${dim('all keys')}`;
    }
    const toastLines = S.toast ? wrap(S.toast.msg, maxW).slice(0, 2).map((l) => `  ${l}`) : [];
    return [...toastLines, ...keys.map((l) => `  ${l}`)];
  }
  function toast(msg, ms = 4000) {
    S.toast = { msg, until: now() + ms };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { if (S.toast && now() >= S.toast.until) { S.toast = null; render(); } }, ms + 20);
    render();
  }

  // ---------- data helpers ----------
  const labObj = () => catalog[S.lab];
  const exObj = () => labObj().levels[S.level];
  const LABEL = (ex) => ex.label.toUpperCase();
  function cell(lab, ex) {
    const s = view.checks(ex);
    const icon = s === 'not-run' && view.hints(ex) ? '💡' : statusIcon(s);
    return `${icon}${s === 'pass' && view.agent(ex) === 'pass' ? '🤖' : ''}`;
  }
  function counts() {
    let done = 0;
    let agents = 0;
    let stale = 0;
    const workshop = { done: 0, total: 0 };
    const homework = { done: 0, total: 0 };
    for (const lab of catalog) for (const ex of lab.levels) {
      const s = view.checks(ex);
      const bucket = ex.mode === 'together' ? workshop : homework;
      bucket.total++;
      if (s === 'pass') { done++; bucket.done++; }
      if (s === 'stale') stale++;
      if (view.agent(ex) === 'pass') agents++;
    }
    return { done, agents, stale, workshop, homework };
  }
  const labDone = (lab) => lab.levels.length > 0 && lab.levels.every((ex) => view.checks(ex) === 'pass');
  const ON_LEVEL = new Set(['exercise', 'checks', 'checkDetail', 'output', 'agent', 'history', 'solution', 'confirmSolution', 'menu', 'recovery', 'bring', 'changes', 'learn']);
  const lastKey = () => { const u = store.get('_ui'); return u.lab && u.level ? `${u.lab}/${u.level}` : null; };
  const nextUp = () => nextExercise(catalog, view, { path: S.path, current: ON_LEVEL.has(S.screen) ? exObj()?.key ?? null : null, last: lastKey() });
  const fmt = { green, bright, dim, white, yellow, bold, cyan };
  const shortDate = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };
  /** Where this level starts: the reference result of the level before it, plus your brought-in work. */
  const startsFrom = (ex) => {
    const pred = predecessorOf(order, ex.key);
    if (!pred) return `🧱 ${dim('Starts from: the plain app, the start of the chain.')}`;
    const brought = view.entry(ex).brought;
    return `🧱 ${dim('Starts from:')} ${white(`Lab ${pred.lab.num} · ${pred.ex.badge} ${pred.ex.label}`)} ${dim(brought ? `(the reference, plus your work brought in on ${shortDate(brought.at)})` : '(reference)')}`;
  };
  const header = (title, sub, right) => {
    const inner = W() - 4;
    const top = right && width(title) + width(right) + 1 <= inner ? `${title}${' '.repeat(Math.max(1, inner - width(title) - width(right)))}${right}` : title;
    return box([top, ...(sub ? [sub] : [])], W()).map((l) => `  ${l}`);
  };
  // A long info line, wrapped to the screen with a hanging indent.
  const para = (text, indent = '  ', cont = '     ') => wrap(text, Math.max(8, W() - width(indent))).map((l, i) => `${i ? cont : indent}${l}`);
  const saveUi = () => store.set('_ui', { lab: labObj().id, level: exObj()?.level });
  const firstSentence = (md) => {
    const parts = stripAnsi(inline(String(md).replace(/\s+/g, ' '))).split(/(?<=[.!?])\s/);
    return parts[0].length < 60 && parts[1] ? `${parts[0]} ${parts[1]}` : parts[0];
  };
  const pathLabel = () => pathById(S.path)?.label ?? 'All exercises';
  /** Make sure the original starter is kept before the app checks or edits an exercise. */
  const keepStarter = (ex) => {
    const r = ensureStarter(labsDir, ex);
    if (r.problem) toast(`♻️ ${yellow('Could not keep a starter copy:')} ${dim(r.problem)}`, 8000);
  };
  /** The takeaway and the check-yourself question. `answering`: digits answer here (checks and learn screens). */
  const learnBlock = (ex, { answering }) => {
    const recorded = view.entry(ex).quiz ?? null;
    const chosen = answering && S.quizChoice?.key === ex.key ? S.quizChoice.choice : null;
    const n = ex.quiz?.options.length ?? 0;
    const prompt = answering ? `press 1-${n} to ${recorded ? 'answer again' : 'answer'}` : recorded ? null : 'press l to answer';
    return [...takeawayLines(ex, { W: W(), fmt }), ...quizLines(ex, { W: W(), fmt, recorded, chosen, prompt })];
  };
  const answer = (str) => {
    const ex = exObj();
    const n = Number(str);
    if (!ex.quiz || !(n >= 1 && n <= ex.quiz.options.length)) return;
    answerQuiz(store, ex, n);
    S.quizChoice = { key: ex.key, choice: n };
    render();
  };

  // ---------- the credit meter (credits.mjs): read from the run history on the home screen, never per frame ----------
  function loadCredits() {
    try { S.credits = creditSummary(deps.listRuns(labsDir), { now: new Date(deps.now()) }); } catch { S.credits = null; }
  }

  // ---------- the level timer (timer.mjs) ----------
  const clock = levelClock({ now: () => deps.now() });
  const levelKey = () => (ON_LEVEL.has(S.screen) ? exObj()?.key ?? null : null);
  const credit = (list) => { for (const { key, ms } of list) store.set(key, { activeMs: (store.get(key).activeMs ?? 0) + ms }); };
  const firstVisit = () => { const ex = exObj(); if (ex && !view.entry(ex).firstOpened) store.set(ex.key, { firstOpened: new Date(deps.now()).toISOString() }); };
  const activeMs = (ex) => (view.entry(ex).activeMs ?? 0) + clock.pending(ex.key);
  /** Note an action on the current level (or none). Saves the time now and then, and nudges once toward a hint. */
  function tickClock({ flush = false } = {}) {
    const key = levelKey();
    credit(clock.touch(key));
    if (!key) return;
    if (flush || clock.pending(key) >= 60_000) credit(clock.take());
    const ex = exObj();
    const entry = view.entry(ex);
    const hintsLeft = ex.hints.length - revealedHints(ex, entry).size;
    if (shouldNudge({ activeMs: activeMs(ex), suggested: suggestedMinutes(ex), hintsLeft, nudged: entry.nudged })) {
      store.set(key, { nudged: true });
      toast(`⏱ ${yellow('A hint (h) could save you time.')}`, 8000);
    }
  }

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

  function setupLines() {
    const L = [];
    const e = S.env;
    if (!e) { L.push(`  🧰 ${dim(`${spin()} checking your setup…`)}`); return L; }
    const pick = (id, note) => {
      const it = e.items.find((x) => x.id === id);
      if (!it) return null;
      const ok = it.status === 'ready';
      return `${ok ? '✅' : it.status === 'optional' ? '⬜' : it.status === 'manual' ? '🙋' : '❌'} ${ok ? green(it.label) : dim(it.label)}${!ok && note ? dim(` (${note})`) : ''}`;
    };
    const items = [pick('copilot', 'needed'), pick('node'), pick('pwsh', 'needed'), pick('git'), pick('apm', 'lab 06'), pick('gh-aw', 'lab 07')].filter(Boolean);
    const lead = `  🧰 ${white('Your setup')}  `;
    let cur = lead;
    for (const it of items) {
      if (width(cur) + width(it) + 2 > W() && cur !== lead) { L.push(cur); cur = `${' '.repeat(width(lead))}`; }
      cur += `${it}  `;
    }
    L.push(cur.trimEnd());
    const blocking = e.items.filter((x) => x.required && !['ready', 'manual'].includes(x.status));
    if (blocking.length) L.push(...para(`⚠️  ${yellow(`${blocking.map((x) => x.label).join(', ')} ${blocking.length === 1 ? 'needs' : 'need'} attention`)} ${dim('— press d for the setup doctor')}`));
    const trust = e.items.find((x) => x.id === 'folder-trust');
    if (trust?.status === 'ready') L.push(...para(`🔐 ${green('Workshop folder trusted by Copilot')} ${dim('(MCP servers, hooks and agents will load)')}`));
    else if (trust) L.push(...para(`🔐 ${yellow('Trust tip:')} ${dim('run')} ${cyan('copilot')} ${dim('once in the workshop folder and choose')} ${white('"Yes, and remember this folder"')}`));
    return L;
  }

  function homeScreen() {
    const t = ANIM ? now() - S.t.home : 1e9;
    const L = [''];
    L.push(...header(`🧠  ${bold(bright('BUILD YOUR AGENT HARNESS'))}`, dim(`${BRAND.tagline} · hands-on labs`), dim(`✨ by ${BRAND.author}`)));
    const { done, agents, stale, workshop, homework } = counts();
    const shown = Math.round(done * ease(t / 800));
    const hour = new Date().getHours();
    const hello = hour >= 5 && hour < 12 ? 'Good morning' : hour >= 12 && hour < 18 ? 'Good afternoon' : 'Good evening';
    L.push('');
    const st = store.status();
    if (st.warning || st.error) L.push(...para(`⚠️  ${yellow(st.error ?? st.warning)}`));
    L.push(...para(done === 0
      ? `👋 ${bold(white(`${hello}!`))} ${dim('Welcome to the labs. Pick a lab below, or press')} ${keycap('n')} ${dim('for the next exercise on your path.')}`
      : done === total
        ? `🏆 ${bold(white(`${hello}, harness engineer!`))} ${dim('Every exercise passes. Try the "Going further" ideas, or harness your own project.')}`
        : `👋 ${bold(white(`${hello}! Welcome back.`))} ${dim(`${done} exercise${done === 1 ? '' : 's'} passing, ${total - done} to go.`)}`));
    L.push('');
    const barW = Math.max(8, Math.min(30, W() - 66));
    const split = `👥 ${white('Workshop')} ${bold(bright(`${workshop.done}/${workshop.total}`))} ${dim('·')} 🏠 ${white('Homework')} ${bold(bright(`${homework.done}/${homework.total}`))}`;
    const extra = `${agents ? `  🤖 ${bright(String(agents))}` : ''}${stale ? `  🕓 ${yellow(String(stale))} ${dim('stale')}` : ''}`;
    const progressLine = `  ${white('Progress')}  ${bar(shown, total, barW)}  ${bold(bright(`${shown}/${total}`))}  ${split}`;
    if (width(progressLine + extra) <= W() + 2) L.push(progressLine + extra);
    else { L.push(progressLine); if (extra) L.push(`            ${extra.trim()}`); }
    L.push(...para(`🧭 ${white('Path:')} ${bright(pathLabel())} ${dim('— press p to change, / to search')}`));
    if (S.credits) L.push(...para(dim(meterLine(S.credits))));
    L.push('');
    const wide = W() >= 36 + tiers.length * 11;
    const cellW = wide ? 11 : 5;
    const nameW = Math.max(8, Math.min(36, W() - 6 - tiers.length * cellW));
    const homeworkW = Math.max(0, tiers.length - 1) * cellW;
    L.push(`       ${pad('', nameW)}${pad(wide ? `👥 ${dim('together')}` : ' 👥', cellW)}${homeworkW ? clip(` 🏠 ${dim(wide ? 'homework, optional' : 'homework')}`, homeworkW) : ''}`);
    L.push(`       ${dim(pad('LAB', nameW))}${tiers.map((d) => pad(wide ? `${d.badge} ${dim(d.label.toUpperCase())}` : ` ${d.badge}`, cellW)).join('')}`);
    const pulse = ANIM && Math.floor(now() / 600) % 2 === 0;
    let focus = null;
    catalog.forEach((lab, i) => {
      if (t < 150 + i * 55) { L.push(''); return; }
      const sel = i === S.lab;
      const name = clip(`${lab.num}  ${lab.emoji}  ${lab.title}`, nameW);
      const cells = tiers.map((d) => {
        const ex = lab.levels.find((e) => e.level === d.id);
        return pad(ex ? `${wide ? '  ' : ' '}${cell(lab, ex)}` : dim(wide ? '  ·' : ' ·'), cellW);
      }).join('');
      const medal = labDone(lab) ? ' 🏅' : '';
      const row = `  ${sel ? (pulse ? bright('❯') : green('❯')) : ' '}    ${sel ? bold(white(pad(name, nameW))) : pad(name, nameW)}${cells}${medal}`;
      const bg = now() - S.t.flash < 180 && sel ? 238 : C.panel;
      if (sel) focus = [L.length, L.length];
      L.push(sel ? `${style.bg(bg)}${row}` : row);
    });
    L.push('');
    L.push(...setupLines());
    const nu = nextUp();
    L.push(...para(nu
      ? `👉 ${white('Next up')}  ${dim(`Lab ${nu.lab.num} ·`)} ${nu.ex.badge} ${bright(nu.ex.title)} ${dim('— press n')}`
      : S.path === 'all' ? `🏆 ${bold(bright('Every exercise passes. You are an agent-harness engineer!'))}` : `🏁 ${bold(bright(`Your ${pathLabel()} path is complete.`))} ${dim('Press p to pick another path.')}`));
    L.push('');
    L.push(`  ${dim('─'.repeat(Math.max(10, W() - 2)))}`);
    const tip = TIPS[ANIM ? Math.floor(now() / 12000) % TIPS.length : S.tip];
    wrap(`💡 ${inline(tip)}`, W() - 2).forEach((l) => L.push(`  ${dim(l)}`));
    L.push(...para(dim(`✨ ${creditLine()}`), '  ', '     '));
    L.push(...para(dim(`📧 Questions, ideas or feedback? ${BRAND.email}`), '  ', '     '));
    return { lines: L, focus, footer: footer([['↑↓', 'choose'], ['⏎', 'open'], [`0-${Number(catalog.at(-1)?.num ?? 7)}`, 'jump'], ['n', 'next up'], ['/', 'search'], ['p', 'path'], ['d', 'doctor'], ['e', 'export'], ['?', 'help'], ['q', 'quit']]) };
  }

  function labScreen() {
    const lab = labObj();
    const t = ANIM ? now() - S.t.lab : 1e9;
    const L = [''];
    L.push(...header(`${bold(bright(`LAB ${lab.num} · ${lab.emoji}  ${lab.title.toUpperCase()}`))}`, lab.tagline ? dim(lab.tagline) : null, labDone(lab) ? '🏅 complete' : null));
    L.push('');
    for (const l of renderMarkdown(lab.intro, W())) L.push(l);
    L.push('');
    if (catalog.some((l) => l.layer)) L.push(...layerMapLines(catalog, lab, { W: W(), fmt }), '');
    L.push(`  ${white(bold('CHOOSE YOUR LEVEL'))}`);
    L.push('');
    const pulse = ANIM && Math.floor(now() / 600) % 2 === 0;
    let focus = null;
    const narrow = W() < 60;
    const nameW = Math.max(10, Math.min(58, W() - 20));
    lab.levels.forEach((ex, i) => {
      if (t < 80 + i * 90) { L.push('', '', '', ''); return; }
      const sel = i === S.level;
      const mins = `🕐 ${ex.time ?? (ex.minutes ? `${ex.minutes} min` : '?')}`;
      const bg = now() - S.t.flash < 180 && sel ? 238 : C.panel;
      const mark = `  ${sel ? (pulse ? bright('❯') : green('❯')) : ' '}  `;
      const start = L.length;
      if (narrow) {
        L.push(`${mark}${ex.badge} ${sel ? bold(white(LABEL(ex))) : LABEL(ex)}  ${cell(lab, ex)}${view.bookmarked(ex) ? ' 🔖' : ''}`);
        wrap(ex.title, Math.max(8, W() - 6)).forEach((l) => L.push(`      ${sel ? bold(white(l)) : l}`));
      } else {
        const name = clip(`${ex.badge} ${pad(LABEL(ex), 7)} ${ex.title}`, nameW);
        L.push(`${mark}${sel ? bold(white(pad(name, nameW))) : pad(name, nameW)}  ${cell(lab, ex)}${view.bookmarked(ex) ? ' 🔖' : ''}`);
      }
      L.push(...para(dim(`${ex.theme ?? ''} · ${mins} · ${ex.mode === 'together' ? '👥 together, live' : '🏠 homework'}`), '      ', '      '));
      const sentence = firstSentence(ex.mission);
      const room = Math.max(8, W() - 10);
      L.push(`      ${dim(width(sentence) > room ? `${clip(sentence, room - 1)}…` : sentence)}`);
      if (sel) {
        focus = [start, L.length - 1];
        for (let r = start; r < L.length; r++) L[r] = `${style.bg(bg)}${L[r]}`;
      }
      L.push('');
    });
    L.push(...para(`📖 ${dim('Full lab guide:')} ${cyan(rel(lab.readmePath))} ${dim('— press g to read it here')}`));
    return { lines: L, focus, footer: footer([['↑↓', 'choose'], ['⏎', 'open'], ['1-5', 'tier'], ['g', 'lab guide'], ['b', 'back'], ['?', 'help'], ['q', 'quit']]) };
  }

  function readmeScreen() {
    const lab = labObj();
    let md = '';
    try { md = fs.readFileSync(lab.readmePath, 'utf8'); } catch { md = '_This lab has no guide yet._'; }
    const L = [''];
    L.push(...header(`📖 ${bold(bright(`LAB ${lab.num} GUIDE · ${lab.title}`))}`, dim(rel(lab.readmePath))));
    L.push(...renderMarkdown(md.replace(/^#\s+.*\n/, ''), W()));
    L.push('');
    return { lines: L, footer: footer([['↑↓', 'scroll'], ['PgUp/PgDn', 'page'], ['b', 'back'], ['q', 'quit']]) };
  }

  function browseSelection() {
    const B = S.browse;
    try {
      return describeSelection(catalog, view, { query: B.query, level: B.level, status: B.status, maxMinutes: B.maxMinutes, bookmarked: B.bookmarked, path: S.path });
    } catch (e) {
      return { matches: [], notes: [e.message] };
    }
  }

  function browseScreen() {
    const B = S.browse;
    const { matches, notes } = browseSelection();
    if (B.idx >= matches.length) B.idx = Math.max(0, matches.length - 1);
    const L = [''];
    L.push(...header(`🔎 ${bold(bright('FIND AN EXERCISE'))}`, dim(`${matches.length} match${matches.length === 1 ? '' : 'es'} · path: ${pathLabel()}`)));
    L.push('');
    const q = B.editing ? `${white(B.query)}${bright('▏')}` : B.query ? white(B.query) : dim('(none — press / to type)');
    L.push(...para(`🔎 ${white('Search:')} ${q}`));
    const chip = (k, label, value) => `${keycap(k)} ${dim(label)} ${value ? bright(value) : dim('any')}`;
    L.push(...para([
      chip('v', 'level', B.level ? DIFFICULTIES.find((d) => d.id === B.level)?.label : null),
      chip('f', 'status', B.status),
      chip('m', 'time', B.maxMinutes ? `≤ ${B.maxMinutes} min` : null),
      chip('p', 'path', pathLabel()),
      chip('*', 'bookmarked', B.bookmarked ? 'only' : null),
    ].join('   ')));
    notes.forEach((n) => L.push(...para(`ℹ️  ${dim(n)}`)));
    L.push('');
    let focus = null;
    matches.forEach((m, i) => {
      const sel = i === B.idx;
      const mins = m.ex.minutes ? `${m.ex.minutes} min` : '? min';
      const row = `  ${sel ? bright('❯') : ' '} ${statusIcon(m.progress.checks)} ${m.ex.badge} ${sel ? bold(white(`Lab ${m.lab.num} · ${m.ex.title}`)) : `Lab ${m.lab.num} · ${m.ex.title}`} ${dim(`· ${m.ex.label} · ${mins}`)}${m.progress.bookmarked ? ' 🔖' : ''}`;
      if (sel) focus = [L.length, L.length];
      wrap(row, W()).forEach((l, j) => L.push(`${sel ? style.bg(C.panel) : ''}${j ? '      ' : ''}${l}`));
    });
    const keys = B.editing
      ? [['type', 'search'], ['⏎', 'done'], ['Esc', 'clear']]
      : [['↑↓', 'choose'], ['⏎', 'open'], ['/', 'search'], ['v', 'level'], ['f', 'status'], ['m', 'time'], ['p', 'path'], ['*', 'bookmarked'], ['n', 'next on path'], ['b', 'back']];
    return { lines: L, focus, footer: footer(keys) };
  }

  function statusLines(lab, ex) {
    const p = view.entry(ex);
    const s = view.checks(ex);
    const L = [];
    const checkLine = s === 'pass' ? `✅ ${bright('all checks pass')}`
      : s === 'fail' ? `❌ ${yellow(`${p.passed ?? 0}/${p.total ?? '?'} checks pass`)} ${dim('— press t to re-run')}`
      : s === 'not-run' ? `⬜ ${dim('not run yet — press t')}`
      : `${statusIcon(s)} ${yellow(statusWord(s))} ${dim('— press t to check again')}`;
    const a = view.agent(ex);
    const agentLine = !ex.hasAgent ? dim('no agent check here — this level is free 🆓') : a === 'pass' ? `✅ ${bright('passed')}` : a === 'not-run' ? dim('not run — press a (uses AI credits 💳)') : `${statusIcon(a)} ${yellow(statusWord(a))} ${dim('— press a')}`;
    const one = `  🏁 ${bold(white('STATUS'))}  🧪 ${checkLine}    🤖 ${agentLine}`;
    if (width(one) <= W() + 2) L.push(one);
    else L.push(...para(`🏁 ${bold(white('STATUS'))}  🧪 ${checkLine}`), ...para(`   🤖 ${agentLine}`));
    if (s === 'fail' && p.nextFix) L.push(...para(`🎯 ${white('Next to fix:')} ${yellow(p.nextFix)}`));
    if (p.lastAttempt?.state === 'cancelled' && s !== 'not-run') L.push(...para(`⛔ ${dim('Your last run was cancelled; the status above is from the run before it.')}`));
    if (view.bookmarked(ex)) L.push(`  🔖 ${dim('Bookmarked')}`);
    if (S.watch) L.push(...para(`👀 ${bright('Watching src/')} ${dim('— the checks run again every time you save (w to stop)')}`));
    if (Array.isArray(S.changes)) {
      if (!S.changes.length) L.push(`  📝 ${dim('No changes since your latest commit.')}`);
      else {
        const names = S.changes.slice(0, 4).map((c) => `${c.file}${c.status === 'new' ? dim(' (new)') : c.status === 'deleted' ? dim(' (deleted)') : ''}`);
        L.push(...para(`📝 ${white('Your changes:')} ${names.join(dim(', '))}${S.changes.length > 4 ? dim(` +${S.changes.length - 4} more`) : ''} ${dim('— press v to see them')}`));
      }
    }
    return L;
  }

  function exerciseScreen() {
    const lab = labObj();
    const ex = exObj();
    const entry = view.entry(ex);
    const shownSet = revealedHints(ex, entry);
    const shown = shownSet.size;
    const L = [''];
    const switcher = lab.levels.map((e, i) => `${e.badge}${i === S.level ? bold(bright(DIFFICULTIES.find((d) => d.id === e.level)?.key ?? '')) : dim(DIFFICULTIES.find((d) => d.id === e.level)?.key ?? '')}`).join(' ');
    L.push(...header(`${ex.badge} ${bold(bright(`${LABEL(ex)} · ${ex.title}`))}`, dim(`Lab ${lab.num} · ${lab.emoji} ${lab.title} · ${ex.theme} · ${ex.mode === 'together' ? '👥 together' : '🏠 homework'}`), switcher));
    if (ex.meta) L.push(...para(dim(ex.meta.replace(/\*\*/g, ''))));
    L.push(...para(dim(timerText(activeMs(ex), suggestedMinutes(ex)))));
    L.push(...para(startsFrom(ex)));
    L.push(...para(`📖 ${dim('Press')} ${keycap('g')} ${dim(`for the lab guide: ${lab.title} explained, with examples and links.`)}`));
    const section = (icon, title, md) => {
      if (!md) return;
      L.push('');
      L.push(`  ${icon} ${bold(white(title))}`);
      L.push(...renderMarkdown(md, W()));
    };
    section('🎯', 'MISSION', ex.mission);
    section('📋', 'REQUIREMENTS', ex.requirements);
    if (ex.milestones?.length) {
      const fresh = ['pass', 'fail'].includes(view.checks(ex));
      L.push('');
      L.push(`  🧭 ${bold(white('MILESTONES'))} ${dim(fresh ? '— from your last check run' : '— press t to see where you are')}`);
      L.push(...milestoneListLines(ex, entry, { W: W(), fmt, renderMarkdown, fresh }));
    }
    section('📂', 'WORK HERE', ex.where);
    L.push(...para(`💻 ${keycap('c')} ${dim('start Copilot here')}   📂 ${keycap('o')} ${dim('open the folder')}   📋 ${keycap('y')} ${dim('copy the cd command')}   🧳 ${keycap('i')} ${dim('bring your work')}`));
    section('✅', 'DONE WHEN', ex.done);
    if (quizUnlocked(view, ex)) L.push(...learnBlock(ex, { answering: false }));
    L.push('');
    const dots = hintDots(ex, entry, fmt);
    L.push(...para(`💡 ${bold(white('HINTS'))}  ${dots}  ${dim(shown < ex.hints.length ? `${shown} of ${ex.hints.length} revealed — press h for ${ex.milestones?.length ? 'a hint for the milestone you are on' : shown ? 'the next one' : 'the first one'}` : 'all revealed')}`));
    let n = 0;
    ex.hints.forEach((h, i) => {
      if (!shownSet.has(i)) return;
      n++;
      L.push('');
      L.push(`   ${yellow(`${n}.`)} ${yellow(bold(`${h.milestone ? `${h.milestone} · ` : ''}${h.title}`))}`);
      L.push(...renderMarkdown(h.body, W() - 4).map((l) => (l ? `   ${l}` : l)));
    });
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
      footer: footer([['t', 'checks'], ['c', 'Copilot here'], ['h', 'hint'], ['a', 'agent check'], ['v', 'your changes'], ...(quizUnlocked(view, ex) ? [['l', 'learn']] : []), ['i', 'bring your work'], ['m', 'more'], ['b', 'back'], ['?', 'help'], ['q', 'quit']]),
    };
  }

  function resultRow(r, sel) {
    const icon = r.status === 'pass' ? '✅' : r.status === 'skip' ? '⏩' : r.status === 'blocked' ? '🚧' : r.optional ? '🟠' : '❌';
    const name = r.status === 'pass' ? green(r.name) : r.status === 'skip' ? dim(r.name) : white(r.name);
    return `   ${sel ? bright('❯') : ' '} ${icon} ${sel ? bold(name) : name}${r.optional ? dim(' (optional)') : ''}`;
  }

  function resultLines(R, L) {
    const renderItem = (i, name, r) => {
      const out = [];
      let focus = null;
      if (r) {
        const sel = !R.running && i === S.detail.idx;
        if (sel) focus = [0, 0];
        out.push(resultRow(r, sel));
        if (r.status !== 'pass' && r.message) wrap(inline(r.message), Math.max(8, W() - 12)).slice(0, sel ? 6 : 2).forEach((l, j) => out.push(`       ${j === 0 ? dim('↳ ') : '  '}${r.status === 'skip' ? dim(l) : yellow(l)}`));
      } else if (R.running && i === R.results.filter(Boolean).length) {
        out.push(`     ${bright(spin())} ${white(name)}`);
      } else {
        out.push(`     ${dim('◻')} ${dim(name)}`);
      }
      return { lines: out, focus };
    };
    const { lines, focus } = checkGroupLines({ R, ex: exObj(), fmt, renderItem, selected: R.running ? -1 : S.detail.idx });
    const offset = L.length;
    L.push(...lines);
    return focus ? [focus[0] + offset, focus[1] + offset] : null;
  }

  function celebration(lines, lab, ex) {
    const c = S.celebrate;
    const t = now() - (c?.at ?? 0);
    const moving = ANIM && t < 3500;
    const n = Math.max(4, Math.min(18, Math.floor((W() - 6) / 3)));
    const shift = moving ? Math.floor(t / 110) : 0;
    const confetti = (o) => Array.from({ length: n }, (_, i) => CONFETTI[(i + shift + o) % CONFETTI.length]).join(' ');
    const { done } = counts();
    const from = c?.from ?? done;
    const shownDone = moving ? Math.round(from + (done - from) * ease(t / 900)) : done;
    lines.push('');
    lines.push(`   ${confetti(0)}`);
    lines.push('');
    lines.push(`        ${bold(bright(W() > 50 ? 'A L L   C H E C K S   P A S S E D !' : 'ALL CHECKS PASSED!'))}`);
    lines.push(...para(white(`Lab ${lab.num} · ${ex.label} is done.`), '        ', '        '));
    lines.push(`        ${bar(shownDone, total, Math.max(8, Math.min(24, W() - 30)))}  ${bold(bright(`${shownDone}/${total}`))}`);
    lines.push('');
    lines.push(`   ${confetti(3)}`);
    if (done === total) {
      lines.push('', `   🏆 ${bold(bright('EVERY EXERCISE PASSES. You are an agent-harness engineer!'))}`);
      lines.push(`      ${dim(`Tell ${BRAND.author.split('-')[0]} how it went: ${BRAND.email}`)}`);
    } else if (labDone(lab)) {
      lines.push('', `   🏅 ${bold(bright(`LAB ${lab.num} COMPLETE`))} ${white(`· ${lab.title} mastered!`)}`);
    }
    const nu = nextUp();
    if (nu) lines.push('', ...para(`👉 ${white('Next up:')} Lab ${nu.lab.num} · ${nu.ex.badge} ${bright(nu.ex.title)} ${dim('— press n')}`, '   ', '      '));
    if (ex.hasAgent && view.agent(ex) !== 'pass') lines.push(...para(`🤖 ${white('Want proof from the real agent?')} ${dim('Press a to run the agent check (uses AI credits).')}`, '   ', '      '));
  }

  /** The banner under the results: the runner's authoritative state, never a separate approximation. */
  function verdictLines(R, lab, ex, L) {
    const s = R.summary;
    const say = (text) => L.push('', ...para(text, '   ', '      '));
    if (s.state === 'pass') {
      if (R.firstPass) { celebration(L, lab, ex); L.push(...learnBlock(ex, { answering: true })); }
      else say(`✅ ${bold(bright('Still green.'))} ${dim('All checks pass on your current files.')}`);
    } else if (s.state === 'fail') {
      say(`💪 ${white(`${s.passed} of ${s.total} checks pass.`)} ${dim('Fix the ❌ ones, then press t again')}${S.watch ? dim(' (or just save a file)') : dim('.')} ${dim('Select a check and press ⏎ for details.')}`);
    } else if (s.state === 'blocked') {
      say(`🚧 ${yellow('Blocked: a tool these checks need is missing.')} ${dim('This is about your setup, not your solution. Press d for the setup doctor.')}`);
    } else if (s.state === 'skipped') {
      say(`⏩ ${yellow('Not complete: some required checks were skipped,')} ${dim('so this level is not marked as done.')}`);
    } else if (s.state === 'cancelled') {
      say(`⛔ ${yellow('Cancelled.')} ${dim('Nothing was recorded; press t to run the checks again.')}`);
    } else {
      say(`⚠️  ${yellow('The checks stopped early, so this run proves nothing.')} ${dim(s.fatal ?? '')}`);
      L.push(...para(dim('Press o to read the full output.'), '   ', '   '));
    }
  }

  function checksScreen() {
    const lab = labObj();
    const ex = exObj();
    const R = S.run;
    const L = [''];
    L.push(...header(`🧪 ${bold(bright(`CHECKING · Lab ${lab.num} · ${LABEL(ex)}`))}  ${dim(ex.title)}`, dim(`Folder: ${rel(ex.src)}`), S.watch ? bright('👀 watching') : null));
    if (S.watch) L.push(...para(dim('👀 The checks run again every time you save a file in src/. Press w to stop watching.')));
    L.push('');
    if (R.fatal && !R.running) {
      L.push(`   ⚠️  ${red('The checks could not finish:')}`);
      wrap(R.fatal, W() - 8).forEach((l) => L.push(`      ${yellow(l)}`));
    }
    const focus = resultLines(R, L);
    if (!R.running && R.summary) verdictLines(R, lab, ex, L);
    L.push('');
    const answering = R.firstPass && exObj().quiz ? [[`1-${exObj().quiz.options.length}`, 'answer']] : [];
    const keys = R.running
      ? [['…', 'checking'], ['c/Esc', 'cancel']]
      : [...answering, ['↑↓', 'select'], ['⏎', 'details'], ['t', 'run again'], ['o', 'full output'], ['w', S.watch ? 'stop watching' : 'watch'], ['c', 'Copilot here'], ['a', 'agent check'], ['n', 'next up'], ['b', 'back'], ['q', 'quit']];
    return { lines: L, focus, footer: footer(keys) };
  }

  function checkDetailScreen() {
    const lab = labObj();
    const ex = exObj();
    const R = S.run;
    const r = R.results[S.detail.idx];
    const L = [''];
    L.push(...header(`🔍 ${bold(bright('CHECK DETAILS'))}  ${dim(`${S.detail.idx + 1} of ${R.results.length}`)}`, dim(`Lab ${lab.num} · ${ex.label} · ${ex.title}`)));
    if (!r) return { lines: L, footer: footer([['b', 'back']]) };
    const statusText = r.status === 'pass' ? `✅ ${bright('passes')}` : r.status === 'blocked' ? `🚧 ${yellow(`blocked: needs ${r.needs ?? 'a tool'}`)}` : r.status === 'skip' ? `⏩ ${dim('skipped')}` : `❌ ${yellow(r.optional ? 'fails (optional)' : 'fails')}`;
    L.push('');
    L.push(...para(`${bold(white(r.name))}   ${statusText}`));
    L.push('');
    L.push(`  🎯 ${bold(white('REQUIREMENT'))}`);
    L.push(...para(`${dim('This check verifies:')} ${white(r.name)}`, '   ', '   '));
    if (ex.done) { L.push(...para(dim('From "Done when":'), '   ', '   ')); L.push(...renderMarkdown(ex.done, W() - 2).map((l) => ` ${l}`)); }
    if (r.message) {
      L.push('', `  👀 ${bold(white(r.status === 'pass' ? 'NOTE' : 'WHAT WAS OBSERVED'))}`);
      wrap(inline(r.message), W() - 4).forEach((l) => L.push(`   ${r.status === 'pass' ? l : yellow(l)}`));
    }
    const d = r.detail ?? {};
    if (Object.hasOwn(d, 'expected') || Object.hasOwn(d, 'actual')) {
      L.push('', `  ⚖️  ${bold(white('EXPECTED AND ACTUAL'))}`);
      const show = (label, v) => hardWrap(typeof v === 'string' ? v : JSON.stringify(v, null, 1).replace(/\n\s*/g, ' '), W() - 16).forEach((l, j) => L.push(`   ${j ? ' '.repeat(10) : dim(pad(label, 10))}${cyan(l)}`));
      if (Object.hasOwn(d, 'expected')) show('expected', d.expected);
      if (Object.hasOwn(d, 'actual')) show('actual', d.actual);
    }
    if (r.files?.length) {
      L.push('', `  📄 ${bold(white('RELEVANT FILES'))}`);
      r.files.forEach((f) => L.push(...para(`• ${white(f)} ${dim(`(${rel(path.join(ex.src, f))})`)}`, '   ', '     ')));
    }
    if (r.status === 'blocked') {
      L.push('', ...para(`🧰 ${dim('This is a setup problem, not a mistake in your work. Press d to open the setup doctor.')}`));
    }
    if (r.output?.trim()) {
      const lines = r.output.trimEnd().split('\n');
      L.push('', `  🖨️  ${bold(white('OUTPUT FROM THIS CHECK'))} ${dim(lines.length > 12 ? `(last 12 of ${lines.length} lines — o for everything)` : '')}`);
      lines.slice(-12).forEach((l) => hardWrap(l, W() - 4).forEach((w) => L.push(`   ${dim(w)}`)));
    }
    const shown = Math.min(view.hints(ex), ex.hints.length);
    L.push('', ...para(`💡 ${bold(white('HINTS'))} ${dim(shown < ex.hints.length ? `${shown} of ${ex.hints.length} revealed — press h for ${shown ? 'the next one' : 'the first one'}` : 'all revealed')}`));
    for (let i = 0; i < shown; i++) {
      L.push(`   ${yellow(`${i + 1}.`)} ${yellow(bold(ex.hints[i].title))}`);
      L.push(...renderMarkdown(ex.hints[i].body, W() - 4).map((l) => (l ? `   ${l}` : l)));
    }
    L.push('');
    return { lines: L, footer: footer([['↑↓', 'scroll'], ['←→', 'other checks'], ['h', 'hint'], ['o', 'full output'], ['c', 'Copilot here'], ['b', 'back'], ['q', 'quit']]) };
  }

  function outputScreen() {
    const R = S.run;
    const L = [''];
    L.push(...header(`🖨️  ${bold(bright('FULL OUTPUT OF THE LAST CHECK RUN'))}`, dim(R?.summary ? `state: ${R.summary.state}${R.summary.exitCode !== null ? ` · exit code ${R.summary.exitCode}` : ''}` : 'no run yet')));
    const s = R?.summary;
    const block = (title, text) => {
      L.push('', `  ${bold(white(title))}`);
      if (!text?.trim()) { L.push(`   ${dim('(nothing)')}`); return; }
      text.trimEnd().split('\n').forEach((l) => hardWrap(l.replace(/\t/g, '  '), W() - 4).forEach((w) => L.push(`   ${dim(w)}`)));
    };
    if (s?.fatal) { L.push('', `  ${bold(white('WHY IT STOPPED'))}`); wrap(s.fatal, W() - 4).forEach((l) => L.push(`   ${yellow(l)}`)); }
    block('STANDARD OUTPUT', s?.stdout);
    block('ERRORS AND WARNINGS (stderr)', s?.stderr);
    L.push('');
    return { lines: L, footer: footer([['↑↓', 'scroll'], ['PgUp/PgDn', 'page'], ['b', 'back'], ['q', 'quit']]) };
  }

  function budgetLines(budget, L) {
    const capped = budget.configuredCap !== null;
    if (capped) L.push(...para(`💳 ${yellow(`Configured cap: ${budget.configuredCap} AI credits in total`)} ${dim(`(${budget.cases.map((c) => c.configuredCap).join(' + ')}, passed to Copilot with --max-ai-credits).`)}`, '   ', '      '));
    else {
      const est = budget.cases.reduce((n, c) => n + (c.estimatedPrompts ?? 0), 0);
      L.push(...para(`💳 ${yellow('Spending bound: unknown.')} ${dim(`At least one check runs a script that may call Copilot several times, so the lab app cannot promise a limit.${est ? ` The exercise estimates about ${est} prompt(s); that is not a guarantee.` : ''}`)}`, '   ', '      '));
    }
    L.push(...para(dim('Actual usage is not measured here: check /usage in Copilot or your GitHub billing page. Student plan: 200 AI credits per month.'), '   ', '      '));
  }

  function agentScreen() {
    const lab = labObj();
    const ex = exObj();
    const A = S.agent;
    const L = [''];
    L.push(...header(`🤖 ${bold(bright(`AGENT CHECK · Lab ${lab.num} · ${LABEL(ex)}`))}  ${dim(ex.title)}`, dim('Runs the real Copilot CLI on a copy of your folder: labs/.runs/')));
    L.push('');
    if (A.phase === 'loading') L.push(`   ${bright(spin())} ${dim('Reading the agent checks…')}`);
    else if (A.phase === 'error') L.push(...para(`⚠️  ${yellow('The agent checks could not be read:')} ${dim(A.message)}`, '   ', '      '));
    else if (A.phase === 'none') L.push(...para(`🆓 ${white('This level has no agent check — the free checks (t) are all you need.')}`, '   ', '      '));
    else if (A.phase === 'confirm') {
      L.push(...para(white('This sends real prompts to Copilot and checks what the agent says and does.'), '   ', '   '));
      budgetLines(A.budget, L);
      L.push('');
      A.specs.forEach((s, i) => {
        const b = A.budget.cases[i];
        L.push(...para(`${bright(`${i + 1}.`)} ${white(s.name)} ${dim(b.kind === 'copilot' ? `· cap ${b.configuredCap ?? 'unknown'} credits` : '· script: bound unknown')}`, '   ', '      '));
        wrap(specCommand(s), W() - 10).forEach((l) => L.push(`      ${cyan(l)}`));
        L.push('');
      });
      L.push(`   ${bold(white('Run it now?'))}  ${keycap('y')} ${dim('yes')}   ${keycap('n')} ${dim('no')}`);
    } else {
      A.specs.forEach((s, i) => {
        const r = A.results[i];
        if (r && r.status !== 'not-run') {
          L.push(`   ${statusIcon(r.status === 'pass' ? 'pass' : r.status === 'fail' ? 'fail' : r.status)} ${r.status === 'pass' ? green(s.name) : white(s.name)}`);
          if (r.status !== 'pass' && r.message) wrap(inline(r.message), W() - 10).forEach((l, j) => L.push(`       ${j === 0 ? dim('↳ ') : '  '}${yellow(l)}`));
          if (r.note) L.push(...para(dim(`ℹ️  ${r.note}`), '       ', '       '));
          if (r.output) {
            L.push(`       ${dim('Copilot said:')}`);
            r.output.split('\n').filter((l) => l.trim()).slice(-8).forEach((l) => wrap(l, W() - 12).forEach((w) => L.push(`         ${dim(w)}`)));
          }
        } else if (A.phase === 'running' && A.current === i) {
          L.push(`   ${bright(spin())}  ${white(s.name)}  ${dim(ANIM ? `${A.seconds ?? 0}s — the agent is working…` : 'the agent is working…')}`);
        } else L.push(`   ${dim('◻')}  ${dim(s.name)}`);
      });
      if (A.phase === 'done') {
        const res = A.result ?? {};
        L.push('');
        const say = (t) => L.push(...para(t, '   ', '      '));
        if (res.state === 'pass') say(`🤖✨ ${bold(bright('The real agent proved it. Agent check passed!'))}`);
        else if (res.state === 'cancelled') say(`⛔ ${yellow('Cancelled.')} ${dim('No further checks were started. Anything already sent to Copilot may still have used credits.')}`);
        else if (res.state === 'blocked') say(`🚧 ${yellow('Blocked.')} ${dim(res.fatal ?? 'Something your setup needs is missing; see the reasons above.')}`);
        else if (res.state === 'interrupted') say(`⚠️  ${yellow('The agent checks could not run.')} ${dim(res.fatal ?? '')}`);
        else say(`💪 ${white('Not yet.')} ${dim('Read the ↳ reason, tweak your files, and try again.')}`);
        if (res.dir) say(dim(`🗂️  This run is kept in ${rel(res.dir)} (press H for the history).`));
      }
    }
    L.push('');
    const keys = A.phase === 'confirm' ? [['y', 'run'], ['n', 'cancel']]
      : A.phase === 'running' ? [['…', 'the agent is working'], ['c/Esc', 'cancel']]
      : A.phase === 'loading' ? [['b', 'back']]
      : [['a', 'run again'], ['H', 'history'], ['b', 'back to the mission'], ['q', 'quit']];
    return { lines: L, footer: footer(keys) };
  }

  function historyScreen() {
    const lab = labObj();
    const ex = exObj();
    const Hs = S.history;
    const L = [''];
    L.push(...header(`🕘 ${bold(bright('AGENT RUN HISTORY'))}`, dim(`Lab ${lab.num} · ${ex.label} · ${ex.title}`)));
    L.push('');
    L.push(...para(dim('Every agent check run is kept in its own folder under labs/.runs/. These folders can contain generated or sensitive output (what the agent wrote and said). They stay on this computer and are never uploaded or attached to exports.')));
    L.push('');
    if (!Hs.runs.length) L.push(`   ${dim('No agent runs yet for this exercise.')}`);
    let focus = null;
    Hs.runs.forEach((r, i) => {
      const sel = i === Hs.idx;
      const when = String(r.startedAt ?? '').replace('T', ' ').slice(0, 16);
      if (sel) focus = [L.length, L.length];
      L.push(`${sel ? style.bg(C.panel) : ''}   ${sel ? bright('❯') : ' '} ${statusIcon(r.state === 'unreadable' ? 'interrupted' : r.state)} ${white(when || r.runId)} ${dim(`· ${r.state} · ${r.cases?.length ?? 0} check(s) · ${r.runId}`)}`);
      if (sel && Hs.open) {
        L.push(...para(dim(`Folder: ${rel(r.dir)}`), '       ', '       '));
        if (r.error) L.push(...para(yellow(r.error), '       ', '       '));
        (r.cases ?? []).forEach((c) => {
          L.push(...para(`${statusIcon(c.status === 'not-run' ? 'not-run' : c.status)} ${white(c.name)} ${dim(c.status)}`, '       ', '         '));
          if (c.message) L.push(...para(yellow(c.message), '         ', '         '));
          if (c.command) L.push(...para(cyan(c.command), '         ', '         '));
        });
      }
    });
    L.push('');
    return { lines: L, focus, footer: footer([['↑↓', 'choose'], ['⏎', Hs.open ? 'hide details' : 'details'], ['b', 'back'], ['q', 'quit']]) };
  }

  function confirmSolutionScreen() {
    const lab = labObj();
    const ex = exObj();
    const L = [''];
    L.push(...header(`👀 ${bold(bright('COMPARE WITH THE REFERENCE?'))}`, dim(`Lab ${lab.num} · ${ex.label} · ${ex.title}`)));
    L.push('');
    L.push(...para(white('It is way more fun (and you learn more) if you try a hint first 😉'), '   ', '   '));
    L.push(...para(dim('The comparison shows what differs between your src/ and one reference solution. It does not change your files or your progress.'), '   ', '   '));
    L.push('');
    L.push(`   ${keycap('y')} ${dim('show me')}    ${keycap('h')} ${dim('give me a hint instead')}    ${keycap('n')} ${dim('back')}`);
    return { lines: L, footer: footer([['y', 'show'], ['h', 'hint'], ['n', 'back']]) };
  }

  function solutionScreen() {
    const lab = labObj();
    const ex = exObj();
    const Sol = S.sol;
    const L = [''];
    L.push(...header(`🔍 ${bold(bright(`YOUR WORK VS THE REFERENCE · Lab ${lab.num} · ${LABEL(ex)}`))}`, dim(`${rel(ex.src)}  ↔  ${rel(ex.sol)}`)));
    L.push('');
    L.push(...para(dim('The reference is one possible solution, not a byte-for-byte target: your work can pass the checks and still look different. Use the differences to understand an approach, then write it your way.')));
    const sm = Sol.summary;
    L.push(...para(`${white(`${sm.changed} changed`)} ${dim('·')} ${white(`${sm.missing} only in the reference`)} ${dim('·')} ${white(`${sm.extra} only in yours`)} ${dim('·')} ${dim(`${sm.same} identical`)}`));
    L.push('');
    if (!Sol.files.length) {
      L.push(`   🎉 ${bright('Your folder has the same files, with the same content, as the reference.')}`);
      return { lines: L, footer: footer([['b', 'back'], ['q', 'quit']]) };
    }
    const label = { changed: '📝 different', missing: '🆕 only in the reference', extra: '➕ only in yours' };
    Sol.files.forEach((f, i) => {
      const sel = i === Sol.idx;
      const row = `   ${sel ? bright('❯') : ' '} ${sel ? bold(white(f.path)) : f.path} ${dim(`(${label[f.status]}${f.binary ? ', binary' : ''})`)}`;
      L.push(sel ? `${style.bg(C.panel)}${row}` : row);
    });
    L.push('');
    const f = Sol.files[Sol.idx];
    L.push(`   ${dim('─'.repeat(Math.max(10, W() - 6)))}`);
    if (Sol.full && f.status !== 'extra' && !f.binary) {
      L.push(`   📄 ${bold(white(f.path))} ${dim('(the whole reference file — r for the differences)')}`);
      const text = fs.readFileSync(path.join(ex.sol, ...f.path.split('/')), 'utf8').replace(/\r/g, '');
      text.split('\n').forEach((line, i) => hardWrap(line.replace(/\t/g, '  '), W() - 10).forEach((w, j) => L.push(`   ${dim(j ? '   ' : String(i + 1).padStart(3))}  ${cyan(w)}`)));
    } else {
      L.push(`   📄 ${bold(white(f.path))} ${dim(f.status === 'extra' ? '(only in your folder)' : '(− yours  + reference — r for the whole reference file)')}`);
      if (f.note) L.push(...para(dim(f.note), '   ', '   '));
      for (const line of f.diff.split('\n').filter((l, i, a) => l || i < a.length - 1)) {
        const color = line.startsWith('@@') ? cyan : line.startsWith('+') && !line.startsWith('+++') ? bright : line.startsWith('-') && !line.startsWith('---') ? yellow : line.startsWith('\\') ? dim : white;
        hardWrap(line.replace(/\t/g, '  '), W() - 4).forEach((w, j) => L.push(`   ${j ? dim('↪') : ''}${color(w)}`));
      }
    }
    L.push('');
    return { lines: L, footer: footer([['←→', 'switch file'], ['↑↓', 'scroll'], ['r', Sol.full ? 'differences' : 'whole reference file'], ['b', 'back'], ['q', 'quit']]) };
  }

  function changesScreen() {
    const lab = labObj();
    const ex = exObj();
    const L = [''];
    L.push(...header(`📝 ${bold(bright('YOUR CHANGES SINCE YOUR LATEST COMMIT'))}`, dim(`Lab ${lab.num} · ${LABEL(ex)} · ${rel(ex.src)}`)));
    L.push('');
    L.push(...changesLines(S.diff.result, { idx: S.diff.idx, W: W(), fmt, panel: (s) => `${style.bg(C.panel)}${s}` }));
    L.push('');
    const many = S.diff.result.ok && S.diff.result.files.length > 1;
    return { lines: L, footer: footer([...(many ? [['←→', 'switch file']] : []), ['↑↓', 'scroll'], ['b', 'back'], ['q', 'quit']]) };
  }

  function learnScreen() {
    const lab = labObj();
    const ex = exObj();
    const L = [''];
    L.push(...header(`🧠 ${bold(bright(`LEARN · Lab ${lab.num} · ${LABEL(ex)}`))}`, dim(ex.title)));
    L.push(...learnBlock(ex, { answering: true }));
    L.push('');
    const n = ex.quiz?.options.length ?? 0;
    return { lines: L, footer: footer([...(n ? [[`1-${n}`, 'answer']] : []), ['↑↓', 'scroll'], ['b', 'back'], ['q', 'quit']]) };
  }

  const MENU = [
    { key: 'w', icon: '👀', label: () => (S.watch ? 'Stop watching src/' : 'Watch src/: run the checks every time you save') },
    { key: 'g', icon: '📖', label: () => 'Read the lab guide' },
    { key: 'i', icon: '🧳', label: () => 'Bring your work forward from earlier levels' },
    { key: 'v', icon: '📝', label: () => 'Your changes since your latest commit' },
    { key: 's', icon: '🔍', label: () => 'Compare your work with the reference' },
    { key: 'f', icon: '🔖', label: () => (view.bookmarked(exObj()) ? 'Remove the bookmark' : 'Bookmark this exercise') },
    { key: 'x', icon: '♻️', label: () => 'Start over: restore the starter, a checkpoint or a backup' },
    { key: 'H', icon: '🕘', label: () => 'Agent run history' },
    { key: 'o', icon: '📂', label: () => 'Open the folder' },
    { key: 'y', icon: '📋', label: () => 'Copy the cd command' },
    { key: 'd', icon: '🧰', label: () => 'Setup doctor: what is installed, what is missing' },
    { key: 'e', icon: '📤', label: () => 'Export a learning summary (stays on this computer)' },
  ];

  function menuScreen() {
    const lab = labObj();
    const ex = exObj();
    const L = [''];
    L.push(...header(`☰ ${bold(bright('MORE'))} ${dim('·')} ${white(`Lab ${lab.num} · ${ex.badge} ${ex.label}`)}`, dim(ex.title)));
    L.push('');
    let focus = null;
    MENU.forEach((m, i) => {
      const sel = i === S.menu.idx;
      if (sel) focus = [L.length, L.length];
      const row = `  ${sel ? bright('❯') : ' '} ${keycap(m.key)}  ${m.icon} ${sel ? bold(white(m.label())) : m.label()}`;
      L.push(sel ? `${style.bg(C.panel)}${row}` : row);
    });
    L.push('');
    return { lines: L, focus, footer: footer([['↑↓', 'choose'], ['⏎', 'do it'], ['b', 'back'], ['q', 'quit']]) };
  }

  function recoveryEntries() {
    const Rl = S.recovery.list;
    if (!Rl) return [];
    const list = [];
    const st = Rl.starter;
    const starterDesc = Rl.published
      ? 'as the workshop published it (from git), or your first-use copy when git cannot provide it'
      : st ? (st.verified ? 'the copy taken the first time you opened this exercise (it matches the published starter)' : 'the copy taken the first time you opened this exercise (without git it cannot be verified: it may include earlier edits)')
      : 'no starter copy is available yet';
    list.push({ id: 'starter', icon: '♻️', title: 'The original starter', desc: starterDesc, restorable: Rl.published || Boolean(st) });
    for (const c of Rl.checkpoints) list.push({ id: c.id, icon: '💾', title: `Checkpoint "${c.name}"`, desc: `saved ${String(c.createdAt).replace('T', ' ').slice(0, 16)} · ${c.fileCount} file(s)`, restorable: true });
    for (const b of Rl.backups) list.push({ id: b.id, icon: '🛟', title: `Backup ${b.name}`, desc: `taken ${String(b.createdAt).replace('T', ' ').slice(0, 16)} before ${b.reason ?? 'a restore'}`, restorable: true });
    for (const b of Rl.legacy) list.push({ id: b.id, icon: '📦', title: `Older backup ${b.name}`, desc: b.note, restorable: true });
    list.push({ id: 'commit', icon: '⏪', title: 'Discard my changes since my latest commit', desc: 'needs git; your current files are backed up first', restorable: true });
    return list;
  }

  function recoveryScreen() {
    const lab = labObj();
    const ex = exObj();
    const Rc = S.recovery;
    const L = [''];
    L.push(...header(`♻️  ${bold(bright('START OVER OR GO BACK'))}`, dim(`Lab ${lab.num} · ${ex.label} · ${ex.title}`)));
    L.push('');
    L.push(...para(`${dim('Your work folder:')} ${cyan(rel(ex.src))}`));
    L.push(...para(dim('Restoring replaces the files in that folder. Your current files are always backed up first, and node_modules and git data are left alone.')));
    L.push('');
    if (Rc.result) {
      const r = Rc.result;
      if (r.ok) {
        L.push(...para(`✅ ${bright(r.title ?? 'Done.')}`, '   ', '      '));
        if (r.note) L.push(...para(dim(r.note), '   ', '   '));
        if (r.backup) L.push(...para(`💾 ${dim('Your previous files are safe in')} ${cyan(rel(r.backup.dir))}`, '   ', '      '));
      } else {
        L.push(...para(`${r.clean ? '👍' : '⚠️ '} ${r.clean ? white('Nothing to do:') : yellow('Not done:')} ${dim(r.reason)}`, '   ', '      '));
        if (r.backup) L.push(...para(`💾 ${dim('Your files are safe in')} ${cyan(rel(r.backup.dir))}`, '   ', '      '));
      }
      L.push('', `   ${keycap('b')} ${dim('back')}`);
      return { lines: L, footer: footer([['b', 'back'], ['q', 'quit']]) };
    }
    if (Rc.naming) {
      L.push(...para(`💾 ${white('Name this checkpoint:')} ${white(Rc.naming.text)}${bright('▏')}`, '   ', '      '));
      L.push(...para(dim('Letters, digits, dots, dashes or underscores, for example: before-refactor'), '   ', '   '));
      return { lines: L, footer: footer([['type', 'name'], ['⏎', 'save'], ['Esc', 'cancel']]) };
    }
    if (Rc.confirm) {
      const e = Rc.confirm;
      L.push(...para(`${e.icon} ${bold(white(e.id === 'commit' ? 'Discard everything since your latest commit?' : `Restore ${e.title.toLowerCase()}?`))}`, '   ', '      '));
      L.push(...para(dim(e.id === 'commit'
        ? `Files in ${rel(ex.src)} go back to your latest git commit, and new files there are removed.`
        : `The files in ${rel(ex.src)} are replaced with ${e.title.toLowerCase()} (${e.desc}).`), '   ', '   '));
      if (e.id === 'commit' && Array.isArray(S.changes)) {
        if (S.changes.length) {
          L.push(`   📝 ${white('Changes that will be undone:')}`);
          S.changes.slice(0, 12).forEach((c) => L.push(`      ${c.status === 'new' ? '🆕' : c.status === 'deleted' ? '🗑️ ' : '📝'} ${c.file}`));
          if (S.changes.length > 12) L.push(`      ${dim(`… and ${S.changes.length - 12} more`)}`);
        } else L.push(`   👍 ${dim('There is nothing to undo: src/ matches your latest commit.')}`);
      }
      L.push(...para(`💾 ${dim('Your current files are backed up first to')} ${cyan(rel(path.join(labsDir, '.recovery', `${ex.labId}-${ex.level}`, 'backups')))}`, '   ', '      '));
      L.push('', `   ${keycap('y')} ${dim(e.id === 'commit' ? 'yes, discard' : 'yes, restore')}    ${dim('any other key: keep my work')}`);
      return { lines: L, footer: footer([['y', e.id === 'commit' ? 'discard' : 'restore'], ['any key', 'keep my work']]) };
    }
    let focus = null;
    recoveryEntries().forEach((e, i) => {
      const sel = i === Rc.idx;
      if (sel) focus = [L.length, L.length + 1];
      L.push(`${sel ? style.bg(C.panel) : ''}  ${sel ? bright('❯') : ' '} ${e.icon} ${sel ? bold(white(e.title)) : white(e.title)}`);
      L.push(...para(dim(e.desc), '       ', '       '));
    });
    if (S.recovery.list?.incomplete.length) {
      L.push('', `  ⚠️  ${bold(white('INCOMPLETE — cannot be restored'))}`);
      for (const x of S.recovery.list.incomplete) L.push(...para(`${white(x.name)} ${dim(`— ${x.problem}`)} ${dim(`(${rel(x.dir)})`)}`, '     ', '       '));
    }
    L.push('');
    return { lines: L, focus, footer: footer([['↑↓', 'choose'], ['⏎', 'restore…'], ['s', 'save a checkpoint'], ['b', 'back'], ['q', 'quit']]) };
  }

  function doctorScreen() {
    const L = [''];
    L.push(...header(`🧰 ${bold(bright('SETUP DOCTOR'))}`, dim('Read-only: nothing is installed, downloaded or signed in from here.')));
    const e = S.env;
    if (!e || S.doctor.running) { L.push('', `   ${bright(spin())} ${dim('Checking your setup…')}`); return { lines: L, footer: footer([['b', 'back']]) }; }
    L.push('', ...para(e.ready ? `✅ ${bright('Everything the workshop needs is ready.')}` : `⚠️  ${yellow('Something the workshop needs is missing or too old.')} ${dim('Missing tools block checks: they never mean your solution is wrong.')}`));
    const groups = [['core', 'THE LAB COMPANION'], ['workshop', 'THE WORKSHOP'], ['lab', 'FOR SOME LABS'], ['manual', 'ONLY YOU CAN CHECK']];
    const icon = { ready: '✅', missing: '❌', incompatible: '⚠️', manual: '🙋', optional: '⬜' };
    for (const [cat, title] of groups) {
      const items = e.items.filter((x) => x.category === cat);
      if (!items.length) continue;
      L.push('', `  ${bold(white(title))}`);
      for (const it of items) {
        L.push(...para(`${icon[it.status]} ${it.status === 'ready' ? green(it.label) : white(it.label)}${it.version ? dim(` ${it.version}`) : ''}${it.required || cat === 'manual' ? '' : dim(' (optional)')}  ${dim(it.message)}`, '   ', '      '));
        if (it.status !== 'ready' && it.recovery) L.push(...para(`→ ${it.recovery}`, '      ', '        '));
      }
    }
    L.push('', ...para(dim('To prepare missing tools in a private folder (no admin rights, no global changes): run start.cmd (Windows) or ./start.sh (macOS/Linux) from the workshop folder. See SETUP.md.')));
    L.push('');
    return { lines: L, footer: footer([['r', 'check again'], ['↑↓', 'scroll'], ['b', 'back'], ['q', 'quit']]) };
  }

  function exportScreen() {
    const L = [''];
    L.push(...header(`📤 ${bold(bright('EXPORT A LEARNING SUMMARY'))}`, dim(`Path: ${pathLabel()} · saved in labs/.reports/ · nothing is sent anywhere`)));
    L.push('');
    L.push(...para(dim('The summary lists every exercise with its current status (pass only when the checks passed on your current files), when it was last checked, hints revealed, whether you viewed the solution, and your bookmarks. Raw run logs are not included.')));
    L.push('');
    if (S.exported?.file) L.push(...para(`✅ ${bright('Saved:')} ${cyan(rel(S.exported.file))}`));
    if (S.exported?.error) L.push(...para(`⚠️  ${yellow(S.exported.error)}`));
    L.push('', `   ${keycap('m')} ${dim('Markdown')}    ${keycap('j')} ${dim('JSON')}    ${keycap('b')} ${dim('back')}`);
    return { lines: L, footer: footer([['m', 'Markdown'], ['j', 'JSON'], ['b', 'back'], ['q', 'quit']]) };
  }

  /** The help screen's level keys, straight from keys.mjs (the "Everywhere" keys and navigation are listed apart). */
  const levelKeyRows = () => KEYMAP.exercise
    .filter((b) => !['scroll', 'back', 'tier', 'search', 'doctor', 'export'].includes(b.id))
    .map((b) => `| ${b.keys.map((k) => `**${k}**`).join(' / ')} | ${b.does.replace(/\|/g, '\\|')} |`)
    .join('\n');

  function helpScreen() {
    const L = [''];
    L.push(...header(`❓ ${bold(bright('HOW THE LABS WORK'))}`, dim(`${BRAND.title} · lab companion`)));
    const levels = tiers.map((d) => `- ${d.badge} **${d.label}** · ${d.theme} · ${d.time} · ${d.mode === 'together' ? '👥 together, live' : '🏠 homework (optional)'}`).join('\n');
    L.push(...renderMarkdown(`
Each lab has up to five tiers. Only 🟢 easy is done together in the workshop; every other tier is optional homework that goes deeper:
${levels}

Every level starts from the reference result of the level before it (down the easy column, and along each lab's row), so you can start anywhere. Each level has:
- \`todo.md\` - your mission. Long levels are split into milestones, each with its own checks and hints.
- \`src/\` - where you work. Press **c** to start Copilot right there.
- \`tests/\` - the checks. Press **t** to run them - they are free.
- \`sol/\` - a reference solution, for when you are really stuck (press **s** to compare).

## Keys on a level
| Key | What it does |
|---|---|
${levelKeyRows()}
| **${DIFFICULTIES.map((d) => d.key).join(' ')}** | switch tier: ${DIFFICULTIES.map((d) => `${d.key} ${d.label.toLowerCase()}`).join(', ')} |

## Everywhere
| Key | What it does |
|---|---|
| **/** | search every exercise (filter by level, status, time, path, bookmarks) |
| **p** | choose a learning path: ${PATHS.map((p) => p.label).join(', ')} |
| **d** | setup doctor: what is installed, what is missing and how to fix it |
| **e** | export a learning summary (Markdown or JSON, stays on this computer) |

## What the statuses mean
- ✅ passes on your current files · ❌ not passing yet · 🕓 changed since it was checked (run it again)
- 🚧 blocked: a tool is missing (not your fault) · ⏩ incomplete: required checks were skipped · ⚠️ stopped early · ⛔ cancelled

## Good to know
- 🔐 **Trust the workshop folder once**: run \`copilot\` in the workshop root and choose "Yes, and remember this folder".
- 💻 **Without this app**: \`node labs/start.mjs test lab-01 easy\` runs the checks; \`node labs/start.mjs help\` lists every command; \`node labs/start.mjs glossary\` prints the glossary below.
- 🎬 Calmer screen? \`--no-anim\` (no animations), \`--no-intro\` (no welcome screen), \`--ascii\` (plain characters) or \`--linear\` (one line at a time, for screen readers).

## About
- ✨ ${creditLine()}
- 📧 Questions, ideas or feedback: **${BRAND.email}**
${glossary.length ? `
## 📖 Glossary
${glossary.map((e) => `- **${e.term}**: ${e.text}${e.lab ? ` (Lab ${e.lab.slice(4)})` : ''}`).join('\n')}
` : ''}`, W()));
    L.push('');
    return { lines: L, footer: footer([['↑↓', 'scroll'], ['b', 'back'], ['q', 'quit']]) };
  }

  // ---------- actions ----------
  const SCREENS = {
    splash: splashScreen, home: homeScreen, lab: labScreen, readme: readmeScreen, browse: browseScreen, exercise: exerciseScreen,
    checks: checksScreen, checkDetail: checkDetailScreen, output: outputScreen, agent: agentScreen, history: historyScreen,
    solution: solutionScreen, confirmSolution: confirmSolutionScreen, menu: menuScreen, recovery: recoveryScreen,
    doctor: doctorScreen, export: exportScreen, help: helpScreen, bring: bringScreen, changes: changesScreen, learn: learnScreen,
  };
  function render() {
    if (S.suspended || quitting) return;
    const { lines, footer: f, focus } = SCREENS[S.screen]();
    paint(lines, f, focus);
  }
  /** Refresh boundary: re-read progress written by other processes and re-fingerprint the work folders. */
  const refresh = () => view.refresh();

  function go(screen, { from } = {}) {
    if (screen !== S.screen) { S.scroll = 0; S.follow = true; S.back[screen] = from ?? S.screen; }
    if ((screen === 'home' || screen === 'lab') && S.screen !== screen && S.watch) stopWatch();
    if (screen === 'lab' && !['exercise', 'readme', 'help'].includes(S.screen)) S.t.lab = now();
    if (['home', 'lab', 'browse', 'exercise'].includes(screen) && screen !== S.screen) refresh();
    if (screen === 'home' && screen !== S.screen) loadCredits();
    S.screen = screen;
    if (screen === 'exercise' || screen === 'lab') saveUi();
    if (screen === 'exercise') { S.changes = gitChanges(exObj().src); firstVisit(); }
    tickClock();
    render();
  }
  const goBack = (fallback = 'home') => go(S.back[S.screen] && S.back[S.screen] !== S.screen ? S.back[S.screen] : fallback);
  const moveSel = () => { S.follow = true; S.t.flash = ANIM ? now() : 0; };

  function enterHome() {
    S.screen = 'home';
    S.scroll = 0;
    S.follow = true;
    S.t.home = now();
    refresh();
    loadCredits();
    render();
  }

  async function runFreeChecks({ silent = false } = {}) {
    if (S.run?.running) { if (S.watch) S.watch.pending = true; return; }
    const lab = labObj();
    const ex = exObj();
    keepStarter(ex);
    const before = view.checks(ex);
    const milestonesBefore = view.entry(ex).milestones ?? {};
    const doneBefore = counts().done;
    const controller = new AbortController();
    S.run = { running: true, results: [], plan: [], planMilestones: [], fatal: null, summary: null, firstPass: false, controller };
    S.quizChoice = null;
    S.detail.idx = 0;
    if (!silent || S.screen === 'checks') go('checks');
    else render();
    const evidence = captureEvidence(ex);
    const summary = await deps.runChecks({
      exDir: ex.dir,
      target: ex.src,
      signal: controller.signal,
      onEvent: (e) => {
        if (e.type === 'plan') { S.run.plan = e.names; S.run.planMilestones = e.milestones ?? []; }
        if (e.type === 'result') S.run.results[e.idx] = { detail: {}, files: [], output: '', ...e };
        if (e.type === 'fatal') S.run.fatal = e.message;
        if (['plan', 'result', 'fatal'].includes(e.type)) render();
      },
    });
    if (quitting) return;
    S.run.running = false;
    S.run.summary = summary;
    S.run.results = summary.results;
    S.run.fatal = summary.complete ? null : summary.fatal;
    if (!S.run.plan.length) S.run.plan = summary.results.map((r) => r.name);
    if (summary.planMilestones?.length) S.run.planMilestones = summary.planMilestones;
    store.recordChecks(ex.key, summary, evidence);
    view.tracker.invalidate(ex.key);
    tickClock({ flush: true });
    const fixName = nextFixName(summary.results);
    const firstFail = fixName ? summary.results.findIndex((r) => r.name === fixName) : summary.results.findIndex((r) => r.status !== 'pass');
    S.detail.idx = Math.max(0, firstFail);
    if (summary.state === 'pass' && before !== 'pass') {
      S.run.firstPass = true;
      S.celebrate = { at: now(), from: doneBefore };
    } else if (summary.complete) {
      const finished = groupChecks({ names: S.run.plan, milestones: S.run.planMilestones, results: summary.results, defined: ex.milestones ?? [] })
        .filter((g) => g.id && g.done && milestonesBefore[g.id] !== 'pass');
      if (finished.length && !silent) toast(`🎉 ${finished.map((g) => `${g.id}${g.title ? ` · ${g.title}` : ''}`).join(', ')} ${finished.length === 1 ? 'is' : 'are'} done!${fixName ? ` Next: ${fixName}` : ''}`, 6000);
    }
    S.changes = gitChanges(ex.src);
    if (silent && S.screen !== 'checks') {
      const msg = summary.state === 'pass' ? `👀 Re-checked: ✅ all ${summary.total} checks pass` : summary.state === 'fail' ? `👀 Re-checked: ${summary.passed}/${summary.total} pass${summary.results[firstFail] ? ` · next: ${summary.results[firstFail].name}` : ''}` : `👀 Re-checked: ${statusIcon(summary.state)} ${statusWord(summary.state)}`;
      toast(msg);
    }
    render();
    if (S.watch?.pending) { S.watch.pending = false; runFreeChecks({ silent: true }); }
  }
  const cancelChecks = () => { if (S.run?.running) { S.run.controller.abort(); toast('⛔ Cancelling the checks…'); } };

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
          view.tracker.invalidate(ex.key);
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
    if (S.watch) { stopWatch(); toast('👀 Stopped watching.'); return; }
    keepStarter(exObj());
    if (startWatch()) {
      if (S.screen !== 'checks') runFreeChecks();
      else render();
      toast('👀 Watching src/ — save a file and the checks run again.');
    }
  }

  async function openAgent() {
    const ex = exObj();
    const token = ++S.agentToken;
    S.agent = { phase: 'loading', specs: [], results: [], current: -1 };
    go('agent');
    let specs;
    try { specs = await deps.loadAgentChecks(ex.dir); } catch (e) {
      if (token === S.agentToken && S.screen === 'agent') { S.agent = { phase: 'error', message: e.message, specs: [], results: [] }; render(); }
      return;
    }
    // The student may have left (or asked again) while the checks were loading: never resurrect a stale confirmation.
    if (token !== S.agentToken || S.screen !== 'agent' || S.agent?.phase !== 'loading') return;
    const capItem = S.env?.items.find((x) => x.id === 'copilot');
    S.agent = { phase: specs.length ? 'confirm' : 'none', specs, budget: budgetPreview(specs, { capSupported: capItem ? capItem.status === 'ready' : true }), results: [], current: -1 };
    render();
  }

  /** Synchronous admission: at most one paid suite, decided before anything asynchronous is queued. */
  function admitAgent() {
    if (S.agentRun || S.agent?.phase !== 'confirm' || S.screen !== 'agent') return false;
    const controller = new AbortController();
    const ex = exObj();
    const lab = labObj();
    S.agentRun = { controller, key: ex.key };
    S.agent.phase = 'running';
    S.agent.results = [];
    render();
    void runAgentSuite(controller, lab, ex);
    return true;
  }

  async function runAgentSuite(controller, lab, ex) {
    keepStarter(ex);
    const doneBefore = counts().done;
    const evidence = captureEvidence(ex, 'agent');
    let res;
    try {
      res = await deps.runAgentChecks({
        exDir: ex.dir, target: ex.src, labsDir, labId: lab.id, level: ex.level, specs: S.agent.specs, signal: controller.signal,
        onEvent: (e) => {
          if (quitting || !S.agent) return;
          if (e.type === 'start') { S.agent.current = e.idx; S.agent.seconds = 0; }
          if (e.type === 'tick') { S.agent.seconds = e.seconds; if (!ANIM) return; }
          if (e.type === 'result') S.agent.results[e.idx] = e;
          render();
        },
      });
    } catch (e) {
      res = { state: 'interrupted', allPass: false, results: [], fatal: e.message, runId: null };
    }
    S.agentRun = null;
    if (quitting) return;
    S.agent.phase = 'done';
    S.agent.result = res;
    (res.results ?? []).forEach((r, i) => { S.agent.results[i] = r; });
    if (res.runId) store.recordAgent(ex.key, res, evidence);
    view.tracker.invalidate(ex.key);
    loadCredits();
    if (res.state === 'pass') S.celebrate = { at: now(), from: doneBefore };
    render();
  }
  const cancelAgent = () => {
    if (!S.agentRun) return;
    S.agentRun.controller.abort();
    toast('⛔ Cancelling: no further agent checks will start.');
  };

  function openHistory() {
    const ex = exObj();
    S.history = { runs: deps.listRuns(labsDir, { labId: ex.labId, level: ex.level }), idx: 0, open: false };
    go('history');
  }

  function openSolution() {
    const ex = exObj();
    const { files, summary } = compareTrees(ex.src, ex.sol);
    S.sol = { files, summary, idx: 0, full: false };
    store.set(ex.key, { peeked: true });
    go('solution');
  }

  function revealHint() {
    const ex = exObj();
    const r = ex.hints.length ? revealNextHint(store, ex) : { none: true, milestone: null };
    if (r.none) {
      toast(`💡 ${!ex.hints.length ? 'This level has no hints.' : r.milestone ? `All hints for ${r.milestone} are revealed.` : 'All hints are already revealed.'} Still stuck? Press s to compare with the reference.`);
      if (S.screen !== 'checkDetail') go('exercise');
      return;
    }
    if (S.screen === 'checkDetail') { S.scroll = 99999; render(); return; }
    go('exercise');
    S.scroll = 99999;
    render();
  }

  function jumpNext() {
    refresh();
    const nu = nextUp();
    if (!nu) { toast(S.path === 'all' ? '🏆 Every exercise passes!' : `🏁 Your ${pathLabel()} path is complete. Press p on the home screen to pick another.`); return; }
    stopWatch();
    S.lab = catalog.indexOf(nu.lab);
    S.level = nu.lab.levels.indexOf(nu.ex);
    go('exercise');
  }

  function openExercise(lab, ex) {
    stopWatch();
    S.lab = catalog.indexOf(lab);
    S.level = lab.levels.indexOf(ex);
    go('exercise');
  }

  function switchLevel(i) {
    const lab = labObj();
    if (i < 0 || i >= lab.levels.length || i === S.level) return;
    stopWatch();
    S.level = i;
    go('exercise');
  }
  /** Keys 1-5 pick a tier (1 easy … 5 hard++), whichever levels this lab has. */
  function pickTier(str) {
    const d = DIFFICULTIES.find((x) => x.key === str);
    if (!d) return false;
    const lab = labObj();
    const i = lab.levels.findIndex((e) => e.level === d.id);
    if (i < 0) { toast(`${d.badge} Lab ${lab.num} has no ${d.label} level yet.`); return true; }
    if (S.screen === 'lab') { S.level = i; go('exercise'); } else switchLevel(i);
    return true;
  }

  // ---------- bring your work forward ----------
  function openBring() {
    const ex = exObj();
    refresh();
    const target = order.find((n) => n.key === ex.key);
    S.bring = { plan: bringPlan({ catalog, course: loadCourse(labsDir, { strict: false }), manifest: loadManifest(labsDir), view, target }), target, result: null };
    go('bring');
  }
  function doBring() {
    const B = S.bring;
    if (!B?.plan?.items.length || B.result) return;
    stopWatch();
    const r = applyBring({ labsDir, target: B.target, plan: B.plan });
    B.result = r;
    if (!r.ok) { render(); return; }
    store.set(B.target.key, { brought: { at: new Date().toISOString(), files: r.files } });
    view.tracker.invalidate(B.target.key);
    toast(`🧳 Brought ${r.files.length} file(s) in. Your previous files are backed up (x restores them). Checking…`, 6000);
    runFreeChecks();
  }
  function bringScreen() {
    const lab = labObj();
    const ex = exObj();
    const B = S.bring;
    const L = [''];
    L.push(...header(`🧳 ${bold(bright('BRING YOUR WORK FORWARD'))}`, dim(`Into Lab ${lab.num} · ${ex.badge} ${ex.label} · ${ex.title}`)));
    L.push('');
    L.push(...para(dim('Your harness grows with you: the harness files you changed in earlier levels that pass on their current files come into this level. App code never travels.'), '   ', '   '));
    L.push('');
    L.push(...bringLines(B.plan, { W: W(), fmt }));
    L.push('');
    if (B.result && !B.result.ok) L.push(...para(`⚠️  ${yellow('Not done:')} ${dim(B.result.reason)}`, '   ', '      '));
    if (B.plan.items.length && !B.result) {
      L.push(...para(`${keycap('y')} ${dim('bring it in')}   ${keycap('n')} ${dim('cancel')}   ${dim('· your current src/ is backed up first, and x can restore it')}`, '   ', '   '));
      return { lines: L, footer: footer([['y', 'bring it in'], ['n', 'cancel'], ['↑↓', 'scroll'], ['q', 'quit']]) };
    }
    return { lines: L, footer: footer([['b', 'back'], ['↑↓', 'scroll'], ['q', 'quit']]) };
  }

  function cyclePath() {
    const i = PATHS.findIndex((p) => p.id === S.path);
    S.path = choosePath(store, PATHS[(i + 1) % PATHS.length].id);
    S.browse.idx = 0;
    toast(`🧭 Path: ${pathLabel()}${pathTime(catalog, S.path) ? ` (${pathTime(catalog, S.path)})` : ''} — ${pathById(S.path).description}`);
  }

  function toggleBookmark() {
    const ex = exObj();
    const on = !view.bookmarked(ex);
    store.set(ex.key, { bookmarked: on });
    toast(on ? '🔖 Bookmarked. Find it again with / then *.' : '🔖 Bookmark removed.');
  }

  function suspend() {
    S.suspended = true;
    try { inp.setRawMode?.(false); } catch { /* not a tty */ }
    inp.pause?.();
    out.write('\x1b[0m\x1b[?25h\x1b[?1049l');
  }
  function resume() {
    out.write('\x1b[?1049h\x1b[?25l\x1b[2J');
    try { inp.setRawMode?.(true); } catch { /* not a tty */ }
    inp.resume?.();
    S.suspended = false;
    render();
  }
  function waitKey() {
    return new Promise((resolve) => {
      try { inp.setRawMode?.(true); } catch { /* not a tty */ }
      inp.resume?.();
      inp.once('keypress', () => { inp.pause?.(); try { inp.setRawMode?.(false); } catch { /* not a tty */ } resolve(); });
    });
  }

  async function launchCopilot() {
    const ex = exObj();
    keepStarter(ex);
    stopWatch();
    tickClock({ flush: true });
    suspend();
    const g = (s) => `${style.fg(C.green)}${s}${style.reset}`;
    out.write(`\n${g(`  💻 Copilot is starting in ${bold(rel(ex.src))}`)}\n${g(dim('     When you are done, type /exit and you come straight back to the lab app.'))}\n\n`);
    const ignore = () => {};
    process.on('SIGINT', ignore);
    const res = await deps.runInteractive(copilotBin(), [], { cwd: ex.src });
    process.off('SIGINT', ignore);
    if (res.missing || res.code !== 0) {
      out.write(`\n${g(res.missing ? '  ⚠️  GitHub Copilot CLI is not installed. Press d in the lab app for the setup doctor.' : `  Copilot stopped with exit code ${res.code}.`)}\n${g(dim('  Press any key to go back to the lab app…'))}`);
      await waitKey();
    }
    resume();
    tickClock({ flush: true });
    if (!res.missing) {
      view.tracker.invalidate(ex.key);
      toast('👋 Welcome back! Checking your work…');
      runFreeChecks();
    }
  }

  async function openFolderAction() {
    const ex = exObj();
    const where = await deps.openFolder(ex.src, { hasCode: true });
    toast(where ? `📂 Opened ${cyan(rel(ex.src))} in ${where}.` : `📂 ${yellow('Could not open the folder.')} ${dim('It is')} ${cyan(ex.src)}`);
  }

  async function copyCd() {
    const ex = exObj();
    const cmd = `cd "${ex.src}"`;
    const how = await deps.copyToClipboard(cmd, (seq) => out.write(seq));
    toast(how === 'system' ? `📋 Copied: ${cyan(cmd)}` : `📋 Sent to your clipboard (if your terminal allows it): ${cyan(cmd)}`, 6000);
  }

  function openRecovery() {
    const ex = exObj();
    keepStarter(ex);
    S.recovery = { list: listRecovery(labsDir, ex), idx: 0, confirm: null, result: null, naming: null };
    S.changes = gitChanges(ex.src);
    go('recovery');
  }
  function doRestore(entry) {
    const ex = exObj();
    stopWatch();
    let r;
    if (entry.id === 'starter') r = { ...restoreStarter(labsDir, ex), title: 'This level is back to its original starter.' };
    else if (entry.id === 'commit') r = { ...resetToCommit(labsDir, ex), title: 'Your changes since the latest commit were discarded.' };
    else r = { ...restoreSnapshot(labsDir, ex, entry.id), title: `Restored ${entry.title.toLowerCase()}.` };
    view.tracker.invalidate(ex.key);
    S.recovery.result = r;
    S.recovery.confirm = null;
    S.recovery.list = listRecovery(labsDir, ex);
    S.changes = gitChanges(ex.src);
    render();
  }
  function saveCheckpoint(name) {
    const ex = exObj();
    const r = createCheckpoint(labsDir, ex, name);
    S.recovery.naming = null;
    S.recovery.list = listRecovery(labsDir, ex);
    toast(r.ok ? `💾 Checkpoint "${name}" saved.` : `💾 ${yellow(r.reason)}`, 6000);
  }

  async function runDoctor() {
    S.doctor.running = true;
    render();
    try { S.env = await deps.inspectEnvironment({ rootDir, lab: S.screen === 'doctor' ? exObj()?.labId : null }); } catch (e) {
      toast(`🧰 ${yellow('The setup doctor failed:')} ${dim(e.message)}`);
    }
    S.doctor.running = false;
    render();
  }

  function doExport(format) {
    refresh();
    try {
      S.exported = writeReport(learningReport(catalog, view, { path: S.path }), { dir: path.join(labsDir, '.reports'), format });
    } catch (e) {
      S.exported = { error: e.message };
    }
    render();
  }

  // ---------- timing (animated mode only; with --no-anim the screen changes only when the state does) ----------
  const animating = (t) => !S.env
    || S.screen === 'splash'
    || S.run?.running
    || S.agent?.phase === 'running'
    || (S.celebrate && t - S.celebrate.at < 3600)
    || (S.screen === 'home' && t - S.t.home < 1000)
    || (S.screen === 'lab' && t - S.t.lab < 450)
    || t - S.t.flash < 220;
  function tick() {
    if (S.suspended || quitting) return;
    const t = now();
    if (S.screen === 'splash' && t - S.t.splash > S.splashEnd) { enterHome(); return; }
    if (animating(t)) { render(); return; }
    if ((S.screen === 'home' || S.screen === 'lab') && t - S.lastPulse >= 600) { S.lastPulse = t; render(); }
  }

  // ---------- keyboard ----------
  // keys.mjs says what every key means on every screen; HANDLERS says what each meaning does.
  const printable = (str, k) => typeof str === 'string' && str.length === 1 && str >= ' ' && !k.ctrl && !k.meta;
  const page = () => Math.max(1, rows() - 4);
  function scrollKey(name) {
    if (name === 'up' || name === 'k') S.scroll--;
    else if (name === 'down' || name === 'j') S.scroll++;
    else if (name === 'pageup') S.scroll -= page();
    else if (name === 'pagedown' || name === 'space') S.scroll += page();
    else if (name === 'home') S.scroll = 0;
    else if (name === 'end') S.scroll = 99999;
    else return;
    render();
  }
  const select = (obj, key, delta, count) => { obj[key] = Math.min(Math.max(0, count - 1), Math.max(0, obj[key] + delta)); S.follow = true; render(); };
  const toBrowse = () => { S.browse.editing = true; S.browse.idx = 0; go('browse'); };
  const toDoctor = () => { go('doctor'); runDoctor(); };
  const toExport = () => { S.exported = null; go('export'); };
  const scroll = ({ name }) => scrollKey(name);
  const leaveAgent = () => { S.agent = null; S.agentToken++; go('exercise'); };
  const runMenuItem = (item) => {
    if (!item) return;
    S.screen = 'exercise';
    const b = binding('exercise', item.key, item.key);
    if (b) HANDLERS.exercise[b.id]({ name: item.key, str: item.key });
  };
  const moveLab = (delta) => { S.lab = (S.lab + catalog.length + delta) % catalog.length; moveSel(); render(); };
  const moveLevel = (delta) => { const n = labObj().levels.length; S.level = (S.level + n + delta) % n; moveSel(); render(); };
  const moveMenu = (delta) => { S.menu.idx = (S.menu.idx + MENU.length + delta) % MENU.length; S.follow = true; render(); };
  const cycle = (list, value) => list[(list.indexOf(value) + 1) % list.length];
  const browseFilter = (key, list) => { S.browse[key] = cycle(list, S.browse[key]); S.browse.idx = 0; render(); };
  const moveCheck = (delta) => { const n = Math.max(1, S.run?.results.length ?? 0); S.detail.idx = (S.detail.idx + n + delta) % n; S.scroll = 0; render(); };
  const moveFile = (delta) => { const Sol = S.sol; if (!Sol.files.length) return; Sol.idx = (Sol.idx + Sol.files.length + delta) % Sol.files.length; S.scroll = 0; render(); };
  const moveDiff = (delta) => { const n = S.diff.result.ok ? S.diff.result.files.length : 0; if (n < 2) return; S.diff.idx = (S.diff.idx + n + delta) % n; S.scroll = 0; render(); };

  const HANDLERS = {
    home: {
      prev: () => moveLab(-1),
      nextItem: () => moveLab(1),
      jump: ({ str }) => { const i = catalog.findIndex((l) => Number(l.num) === Number(str)); if (i >= 0) { S.lab = i; moveSel(); } render(); },
      open: () => { if (labObj().id !== store.get('_ui').lab) S.level = 0; go('lab'); },
      next: () => jumpNext(),
      search: toBrowse,
      path: () => cyclePath(),
      doctor: toDoctor,
      export: toExport,
      page: scroll,
    },
    lab: {
      prev: () => moveLevel(-1),
      nextItem: () => moveLevel(1),
      tier: ({ str }) => { if (!pickTier(str)) render(); },
      open: () => go('exercise'),
      guide: () => go('readme'),
      search: () => { S.browse.editing = true; go('browse'); },
      back: () => go('home'),
      page: scroll,
    },
    browse: {
      prev: () => select(S.browse, 'idx', -1, browseSelection().matches.length),
      nextItem: () => select(S.browse, 'idx', 1, browseSelection().matches.length),
      open: () => { const m = browseSelection().matches[S.browse.idx]; if (m) openExercise(m.lab, m.ex); else render(); },
      search: () => { S.browse.editing = true; render(); },
      level: () => browseFilter('level', LEVEL_FILTERS),
      status: () => browseFilter('status', STATUS_STEPS),
      time: () => browseFilter('maxMinutes', MINUTE_STEPS),
      path: () => cyclePath(),
      bookmarked: () => { S.browse.bookmarked = !S.browse.bookmarked; S.browse.idx = 0; render(); },
      next: () => jumpNext(),
      back: () => goBack('home'),
      page: scroll,
    },
    scroll: { scroll, back: () => goBack(S.screen === 'readme' ? 'lab' : 'home') },
    doctor: { scroll, again: () => runDoctor(), back: () => goBack('home') },
    export: { markdown: () => doExport('md'), json: () => doExport('json'), back: () => goBack('home') },
    exercise: {
      scroll,
      checks: () => runFreeChecks(),
      copilot: () => launchCopilot(),
      hint: () => revealHint(),
      agent: () => openAgent(),
      bring: () => openBring(),
      changes: () => { S.diff = { result: deps.changesDiff(exObj().src), idx: 0 }; go('changes'); },
      learn: () => {
        if (quizUnlocked(view, exObj())) { S.quizChoice = null; go('learn'); } else toast('🧠 The takeaway and a check-yourself question unlock when your checks pass (press t).');
      },
      more: () => { S.menu.idx = 0; go('menu'); },
      watch: () => toggleWatch(),
      guide: () => go('readme'),
      solution: () => go('confirmSolution'),
      recovery: () => openRecovery(),
      bookmark: () => toggleBookmark(),
      history: () => openHistory(),
      open: () => openFolderAction(),
      copy: () => copyCd(),
      doctor: toDoctor,
      export: toExport,
      next: () => jumpNext(),
      tier: ({ str }) => pickTier(str),
      search: () => { S.browse.editing = true; go('browse'); },
      back: () => { stopWatch(); go('lab'); },
    },
    menu: {
      prev: () => moveMenu(-1),
      nextItem: () => moveMenu(1),
      doIt: () => runMenuItem(MENU[S.menu.idx]),
      item: ({ name, str }) => runMenuItem(MENU.find((m) => m.key === str) ?? MENU.find((m) => m.key === name)),
      back: () => go('exercise'),
    },
    checks: {
      prev: () => select(S.detail, 'idx', -1, S.run.results.length),
      nextItem: () => select(S.detail, 'idx', 1, S.run.results.length),
      page: scroll,
      details: () => { if (S.run.results[S.detail.idx]) go('checkDetail'); },
      again: () => runFreeChecks(),
      output: () => go('output'),
      watch: () => toggleWatch(),
      copilot: () => launchCopilot(),
      agent: () => openAgent(),
      next: () => jumpNext(),
      doctor: toDoctor,
      back: () => go('exercise'),
      answer: ({ str }) => { if (S.run?.firstPass) answer(str); },
    },
    checksRunning: { cancel: () => cancelChecks() },
    checkDetail: {
      scroll,
      nextCheck: () => moveCheck(1),
      prevCheck: () => moveCheck(-1),
      hint: () => revealHint(),
      output: () => go('output'),
      copilot: () => launchCopilot(),
      doctor: toDoctor,
      back: () => go('checks'),
    },
    agent: { scroll, again: () => openAgent(), history: () => openHistory(), back: () => go('exercise') },
    agentConfirm: { yes: () => admitAgent(), no: leaveAgent },
    agentLoading: { no: leaveAgent },
    agentRunning: { cancel: () => cancelAgent() },
    history: {
      prev: () => select(S.history, 'idx', -1, S.history.runs.length),
      nextItem: () => select(S.history, 'idx', 1, S.history.runs.length),
      page: scroll,
      toggle: () => { S.history.open = !S.history.open; render(); },
      back: () => goBack('exercise'),
    },
    confirmSolution: { show: () => openSolution(), hint: () => revealHint(), back: () => go('exercise') },
    bring: {
      scroll,
      yes: () => { if (S.bring?.plan.items.length && !S.bring.result) doBring(); },
      back: () => go('exercise'),
    },
    solution: {
      nextFile: () => moveFile(1),
      prevFile: () => moveFile(-1),
      toggle: () => { S.sol.full = !S.sol.full; S.scroll = 0; render(); },
      scroll,
      back: () => go('exercise'),
    },
    recovery: {
      prev: () => select(S.recovery, 'idx', -1, recoveryEntries().length),
      nextItem: () => select(S.recovery, 'idx', 1, recoveryEntries().length),
      page: scroll,
      restore: () => { const e = recoveryEntries()[S.recovery.idx]; if (e?.restorable) { S.recovery.confirm = e; render(); } },
      save: () => { S.recovery.naming = { text: '' }; render(); },
      back: () => go('exercise'),
    },
    // Only an explicit "y" restores; every other key keeps the work as it is.
    recoveryConfirm: { yes: () => doRestore(S.recovery.confirm), keep: () => { S.recovery.confirm = null; toast('👍 Nothing changed.'); } },
    recoveryResult: { back: () => { S.recovery.result = null; go('exercise'); } },
    changes: {
      nextFile: () => moveDiff(1),
      prevFile: () => moveDiff(-1),
      scroll,
      back: () => go('exercise'),
    },
    learn: { answer: ({ str }) => answer(str), scroll, back: () => go('exercise') },
  };
  /** Bindings in keys.mjs without a handler here ([] when complete). */
  const unhandled = () => Object.entries(KEYMAP).flatMap(([state, list]) => list.filter((b) => typeof HANDLERS[state]?.[b.id] !== 'function').map((b) => `${state}.${b.id}`));
  if (MENU.map((m) => m.key).join() !== MENU_KEYS.join()) throw new Error(`The "more" menu (${MENU.map((m) => m.key).join(' ')}) must list keys.mjs MENU_KEYS (${MENU_KEYS.join(' ')}).`);

  /** The key state of the current screen: the name of its row in keys.mjs. */
  function keyState() {
    if (S.screen === 'checks') return S.run?.running ? 'checksRunning' : 'checks';
    if (S.screen === 'agent') return { confirm: 'agentConfirm', loading: 'agentLoading', running: 'agentRunning' }[S.agent?.phase] ?? 'agent';
    if (S.screen === 'recovery') return S.recovery.result ? 'recoveryResult' : S.recovery.confirm ? 'recoveryConfirm' : 'recovery';
    if (['readme', 'help', 'output'].includes(S.screen)) return 'scroll';
    return S.screen;
  }

  function onKey(str, k = {}) {
    if (S.suspended || quitting) return;
    const name = k.name ?? str;
    tickClock();
    if (k.ctrl && name === 'c') {
      if (S.agentRun) { cancelAgent(); return; }
      if (S.run?.running) { cancelChecks(); return; }
      quit(0);
      return;
    }
    if (S.screen === 'splash') { enterHome(); return; }
    if (S.screen === 'browse' && S.browse.editing) {
      const B = S.browse;
      if (name === 'return') B.editing = false;
      else if (name === 'escape') { B.query = ''; B.editing = false; }
      else if (name === 'backspace') B.query = B.query.slice(0, -1);
      else if (name === 'up' || name === 'down') { B.editing = false; return onKey(str, k); }
      else if (printable(str, k)) { B.query += str; B.idx = 0; }
      S.follow = true;
      render();
      return;
    }
    if (S.screen === 'recovery' && S.recovery.naming) {
      const Nm = S.recovery.naming;
      if (name === 'return') { if (Nm.text) saveCheckpoint(Nm.text); else { S.recovery.naming = null; render(); } }
      else if (name === 'escape') { S.recovery.naming = null; render(); }
      else if (name === 'backspace') { Nm.text = Nm.text.slice(0, -1); render(); }
      else if (printable(str, k) && Nm.text.length < 64) { Nm.text += str; render(); }
      return;
    }
    const busy = Boolean(S.agentRun) || (S.run?.running && S.screen === 'checks');
    if (name === 'q' && !busy) { quit(0); return; }
    if (str === '?' && !busy && S.screen !== 'help') { go('help'); return; }
    const state = keyState();
    const b = binding(state, name, str);
    if (b) HANDLERS[state][b.id]({ name, str });
    else if (['home', 'lab', 'browse'].includes(state)) render();
  }

  // ---------- start ----------
  readline.emitKeypressEvents(inp);
  try { inp.setRawMode?.(true); } catch { /* not a tty */ }
  inp.resume?.();
  out.write('\x1b[?1049h\x1b[?25l\x1b[2J');
  const onResize = () => { if (!S.suspended) { out.write('\x1b[2J'); S.follow = true; render(); } };
  out.on?.('resize', onResize);
  inp.on('keypress', onKey);

  const meta = store.get('_meta');
  const longAgo = !meta.introAt || now() - Date.parse(meta.introAt) > 6 * 3600 * 1000;
  if (S.screen === 'exercise') {
    S.changes = gitChanges(exObj().src);
    firstVisit();
    tickClock();
  } else if (intro && ANIM && !isAscii()) {
    S.screen = 'splash';
    S.t.splash = longAgo ? now() : now() - 2400;
    S.splashEnd = longAgo ? 5200 : 3700;
    store.set('_meta', { introAt: new Date().toISOString() });
  } else {
    S.t.home = ANIM ? now() : 0;
  }
  const st = store.status();
  loadCredits();
  if (st.error || st.warning) toast(`⚠️  ${yellow(st.error ?? st.warning)}`, 12000);
  if (ANIM) ticker = setInterval(tick, 45);
  render();
  Promise.resolve()
    .then(() => deps.inspectEnvironment({ rootDir }))
    .then((report) => { S.env = report; }, () => { S.env = { ready: false, coreReady: true, items: [] }; })
    .then(() => { if (!quitting) render(); });
  return { state: S, closed, render, quit, unhandled };
}