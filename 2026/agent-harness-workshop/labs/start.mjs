#!/usr/bin/env node
// 🧠 Build Your Agent Harness — lab companion. Run `node labs/start.mjs help` for every command.
//   node labs/start.mjs                          interactive app (pick a lab, read the mission, run checks)
//   node labs/start.mjs open lab-01 easy         interactive app, straight into one exercise
//   node labs/start.mjs list                     your progress (filters: --path= --status= --level= --query= --max-minutes= --bookmarked)
//   node labs/start.mjs test lab-01 easy         run the free checks on labs/lab-01/easy/src (--watch, --agent)
//   node labs/start.mjs doctor                   what is installed, what is missing, how to fix it (read-only)
//   node labs/start.mjs verify                   facilitators: every src/ must fail and every sol/ must pass
// Options: --no-intro, --no-anim, --ascii, --linear (one line at a time, for screen readers).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [major] = process.versions.node.split('.').map(Number);
if (major < 22) {
  console.error(`\n  🛑 This workshop needs Node.js 22 or newer (you have ${process.versions.node}). Get it from https://nodejs.org, or run start.cmd (Windows) / ./start.sh (macOS, Linux) for a private copy.\n`);
  process.exit(1);
}

// WORKSHOP_LABS_DIR points the companion at another labs folder (used by the automated tests).
const labsDir = process.env.WORKSHOP_LABS_DIR ? path.resolve(process.env.WORKSHOP_LABS_DIR) : path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.dirname(labsDir);
const ui = await import('./_harness/ui.mjs');
const { green, bright, dim, white, yellow, red, cyan, bold, wrap, inline, bar, style, C, statusIcon, statusWord, asciiFold, setAscii } = ui;
const { loadCatalog, findExercise, levelChoices, DIFFICULTIES } = await import('./_harness/catalog.mjs');
const { progressStore, captureEvidence } = await import('./_harness/progress.mjs');
const { BRAND, creditLine } = await import('./_harness/brand.mjs');

// ---------- arguments ----------
const UI_OPTS = { 'no-intro': 'flag', 'no-anim': 'flag', ascii: 'flag', linear: 'flag' };
const COMMANDS = {
  '': { args: [0, 0], opts: { ...UI_OPTS, path: 'value', exercise: 'value' } },
  open: { args: [2, 2], opts: { ...UI_OPTS, path: 'value' } },
  list: { args: [0, 0], opts: { path: 'value', status: 'value', level: 'value', query: 'value', 'max-minutes': 'value', bookmarked: 'flag', json: 'flag', ascii: 'flag' } },
  next: { args: [0, 0], opts: { path: 'value', json: 'flag', ascii: 'flag' } },
  test: { args: [2, 2], opts: { watch: 'flag', agent: 'flag', sol: 'flag', verbose: 'flag', ascii: 'flag' } },
  hint: { args: [2, 2], opts: { ascii: 'flag' } },
  reset: { args: [2, 2], opts: { yes: 'flag', ascii: 'flag' } },
  restore: { args: [2, 2], opts: { starter: 'flag', checkpoint: 'value', backup: 'value', yes: 'flag', ascii: 'flag' } },
  checkpoint: { args: [3, 3], opts: { ascii: 'flag' } },
  recovery: { args: [2, 2], opts: { ascii: 'flag' } },
  diff: { args: [2, 2], opts: { file: 'value', ascii: 'flag' } },
  history: { args: [2, 2], opts: { json: 'flag', ascii: 'flag' } },
  bookmark: { args: [2, 2], opts: { remove: 'flag', ascii: 'flag' } },
  bring: { args: [2, 2], opts: { 'dry-run': 'flag', ascii: 'flag' } },
  path: { args: [0, 1], opts: { ascii: 'flag' } },
  export: { args: [0, 0], opts: { format: 'value', name: 'value', dir: 'value', path: 'value', ascii: 'flag' } },
  doctor: { args: [0, 0], opts: { full: 'flag', lab: 'value', json: 'flag', ascii: 'flag' } },
  verify: { args: [0, 1], opts: { chain: 'flag', bring: 'flag', verbose: 'flag', ascii: 'flag' } },
  'sync-seeds': { args: [0, 0], opts: { bootstrap: 'flag', 'dry-run': 'flag', verbose: 'flag', ascii: 'flag' } },
  starters: { args: [0, 0], opts: { write: 'flag', ascii: 'flag' } },
  help: { args: [0, 1], opts: { ascii: 'flag' } },
};
const argv = process.argv.slice(2);
const pos = [];
const opt = {};
const optErrors = [];
for (const a of argv) {
  if (a === '-h' || a === '--help') { pos.unshift('help'); continue; }
  const m = a.match(/^--([a-z][a-z-]*)(?:=(.*))?$/);
  if (a.startsWith('-') && a !== '-') {
    if (!m) { optErrors.push(`"${a}" is not a valid option.`); continue; }
    opt[m[1]] = m[2] === undefined ? true : m[2];
  } else pos.push(a);
}
const cmd = pos[0] ?? '';
const spec = COMMANDS[cmd];
if (opt.ascii) setAscii(true);
const rawSay = (s = '') => process.stdout.write(`${style.fg(C.green)}${opt.ascii ? asciiFold(s) : s}${style.reset}\n`);
const say = rawSay;
const fail = (msg, code = 2) => {
  say(`  ${red('❌')} ${msg}`);
  say(`  ${dim('Run')} ${cyan('node labs/start.mjs help')} ${dim('for every command and option.')}`);
  process.exit(code);
};
if (!spec) fail(`Unknown command "${cmd}".`);
for (const e of optErrors) fail(e);
for (const [k, v] of Object.entries(opt)) {
  const kind = spec.opts[k];
  if (!kind) fail(`Unknown option --${k}${cmd ? ` for "${cmd}"` : ''}.`);
  if (kind === 'flag' && v !== true) fail(`--${k} does not take a value.`);
  if (kind === 'value' && (v === true || v === '')) fail(`--${k} needs a value, like --${k}=something.`);
}
const nargs = pos.length - (cmd ? 1 : 0);
if (nargs < spec.args[0] || nargs > spec.args[1]) {
  fail(nargs > spec.args[1] ? `Too many arguments for "${cmd || 'the app'}": ${pos.slice(1 + spec.args[1]).join(' ')}` : `"${cmd}" needs ${spec.args[0] === 3 ? 'a lab, a difficulty and a name' : 'a lab and a difficulty'}, for example: node labs/start.mjs ${cmd} lab-01 easy${spec.args[0] === 3 ? ' my-checkpoint' : ''}`);
}

const catalog = loadCatalog(labsDir);
const progress = progressStore(labsDir);
const rel = (p) => path.relative(rootDir, p).split(path.sep).join('/');
const interactive = process.stdout.isTTY && process.stdin.isTTY;
const signature = () => {
  say(`  ${dim(`✨ ${creditLine()}`)}`);
  say(`  ${dim(`📧 ${BRAND.email}`)}`);
  say();
};
const st = progress.status();
if ((st.warning || st.error) && cmd !== 'help') say(`  ${yellow('⚠️ ')} ${dim(st.error ?? st.warning)}`);

function usage() {
  const row = (c, d) => say(`  ${cyan(c.padEnd(50))} ${dim(d)}`);
  say();
  say(`  🧠 ${bold(bright('BUILD YOUR AGENT HARNESS'))} ${dim('· lab companion')}`);
  say();
  say(`  ${white('Learn')}`);
  row('node labs/start.mjs', 'interactive app');
  row('node labs/start.mjs open lab-01 easy', 'interactive app, straight into one exercise');
  row('node labs/start.mjs list', 'exercises and your progress');
  row('   --path=builder --status=unfinished', `filters (also --level= --query= --max-minutes= --bookmarked --json)`);
  row('node labs/start.mjs next [--path=security]', 'the next unfinished exercise on a path');
  row('node labs/start.mjs path [foundations]', 'show or choose your learning path');
  row('node labs/start.mjs test lab-01 easy', 'run the free checks on src/');
  row('node labs/start.mjs test lab-01 easy --watch', 'run them again every time you save');
  row('node labs/start.mjs test lab-01 easy --agent', 'also run the 🤖 agent checks (AI credits)');
  row('node labs/start.mjs hint lab-01 easy', 'reveal the next hint');
  row('node labs/start.mjs diff lab-01 easy', 'compare your work with the reference solution');
  row('node labs/start.mjs bring lab-05 hard [--dry-run]', 'bring your own harness forward from earlier levels');
  row('node labs/start.mjs bookmark lab-01 easy', 'bookmark an exercise (--remove to undo)');
  row('node labs/start.mjs history lab-01 easy', 'agent check runs kept for this exercise');
  say();
  say(`  ${white('Start over (your current files are always backed up first)')}`);
  row('node labs/start.mjs recovery lab-01 easy', 'the starter, your checkpoints and backups');
  row('node labs/start.mjs checkpoint lab-01 easy NAME', 'save your current work as a checkpoint');
  row('node labs/start.mjs restore lab-01 easy --starter', 'back to the original starter (works without git)');
  row('node labs/start.mjs restore lab-01 easy --checkpoint=NAME', 'back to a checkpoint (or --backup=NAME)');
  row('node labs/start.mjs reset lab-01 easy', 'discard changes since your latest commit (git)');
  say(`  ${dim('Restore and reset only show what would happen until you add')} ${cyan('--yes')}${dim('.')}`);
  say();
  say(`  ${white('Setup and sharing')}`);
  row('node labs/start.mjs doctor [--lab=lab-06] [--full]', 'what is installed, what is missing (read-only)');
  row('node labs/start.mjs export [--format=json]', 'save a learning summary in labs/.reports/ (local)');
  say();
  say(`  ${white('Facilitators')}`);
  row('node labs/start.mjs verify', 'every src/ must fail, every sol/ must pass');
  row('node labs/start.mjs verify --chain', '…and the seeded chain has not drifted');
  row('node labs/start.mjs verify --bring', '…and bringing work forward never breaks a level');
  row('node labs/start.mjs sync-seeds [--dry-run]', 'rebuild every level\'s src/ and sol/ from the chain');
  row('node labs/start.mjs starters [--write]', 'check (or rebuild) the published starter manifest');
  row('node labs/start.mjs --path=builder --no-intro', 'start the app on a path, without the welcome screen');
  row('node labs/start.mjs --exercise=lab-03/easy', 'start the app on one exercise');
  say();
  say(`  ${dim('Difficulties:')} ${levelChoices()}`);
  say(`  ${dim('Display:')} ${cyan('--no-intro')} ${dim('·')} ${cyan('--no-anim')} ${dim('(static screen) ·')} ${cyan('--ascii')} ${dim('(plain characters) ·')} ${cyan('--linear')} ${dim('(one line at a time, for screen readers) ·')} ${dim('NO_COLOR=1 turns colors off')}`);
  if (!interactive) say(`  ${yellow('Tip:')} ${dim('the full-screen app needs a real terminal (Windows Terminal, PowerShell, macOS Terminal, iTerm, …); --linear works anywhere.')}`);
  say();
  signature();
}

function pickExercise() {
  const found = findExercise(catalog, pos[1], pos[2]);
  if (!found) fail(`There is no lab "${pos[1]}". Labs: ${catalog.map((l) => l.id).join(', ')}.`);
  if (!found.ex) fail(found.error);
  return found;
}

/** Ctrl+C cancels the running work (and its child processes) instead of leaving them behind. */
function cancellable() {
  const controller = new AbortController();
  let presses = 0;
  const onSigint = () => {
    presses++;
    if (presses > 1) process.exit(130);
    say(`\n   ⛔ ${yellow('Cancelling…')} ${dim('(Ctrl+C again to quit at once)')}`);
    controller.abort();
  };
  process.on('SIGINT', onSigint);
  return { signal: controller.signal, done: () => process.off('SIGINT', onSigint) };
}

const CHECK_ICON = { pass: '✅', fail: '❌', blocked: '🚧', skip: '⏩' };
async function printChecks(lab, ex, target, label, signal) {
  const { runChecks } = await import('./_harness/checks.mjs');
  const { groupChecks, milestoneBar } = await import('./_harness/milestones.mjs');
  const milestoneTitle = (id) => ex.milestones?.find((m) => m.id === id)?.title ?? '';
  let lastMilestone = null;
  say();
  say(`  🧪 ${bold(bright(`Lab ${lab.num} · ${ex.badge} ${ex.label}`))} ${white('—')} ${white(ex.title)}`);
  say(`     ${dim(`checking ${label}:`)} ${cyan(rel(target))}`);
  say();
  const res = await runChecks({
    exDir: ex.dir,
    target,
    signal,
    onEvent: (e) => {
      if (e.type !== 'result') return;
      if (e.milestone && e.milestone !== lastMilestone) {
        lastMilestone = e.milestone;
        say(`   🧭 ${bold(white(`${e.milestone}${milestoneTitle(e.milestone) ? ` · ${milestoneTitle(e.milestone)}` : ''}`))}`);
      }
      const icon = e.status === 'fail' && e.optional ? '🟠' : CHECK_ICON[e.status];
      say(`   ${icon} ${e.status === 'pass' ? green(e.name) : white(e.name)}${e.optional ? dim(' (optional)') : ''}`);
      if (e.status !== 'pass' && e.message) wrap(inline(e.message), 88).forEach((l, i) => say(`       ${i ? '  ' : dim('↳ ')}${e.status === 'skip' ? dim(l) : yellow(l)}`));
      if (e.status === 'fail' && e.detail && (Object.hasOwn(e.detail, 'expected') || Object.hasOwn(e.detail, 'actual'))) say(`       ${dim(`expected ${JSON.stringify(e.detail.expected)} · actual ${JSON.stringify(e.detail.actual)}`)}`);
    },
  });
  if (opt.verbose) res.results.filter((r) => r.output?.trim()).forEach((r) => { say(`   ${dim(`output of "${r.name}":`)}`); r.output.trimEnd().split('\n').forEach((l) => say(`       ${dim(l)}`)); });
  const groups = groupChecks({ names: res.results.map((r) => r.name), milestones: res.planMilestones ?? [], results: res.results, defined: ex.milestones ?? [] }).filter((g) => g.id);
  if (res.complete && groups.length) {
    say();
    say(`   ${white('Milestones')}`);
    for (const g of groups) say(`   ${g.done ? '✅' : g.total ? '⬜' : '·'} ${g.done ? green(`${g.id} · ${g.title}`) : white(`${g.id} · ${g.title}`)}  ${bright(milestoneBar(g.passed, g.total))} ${dim(`${g.passed}/${g.total}`)}`);
  }
  say();
  if (res.state === 'pass') say(`   🎉 ${bold(bright('All checks passed!'))}`);
  else if (res.state === 'fail') say(`   💪 ${white(`${res.passed} of ${res.total} checks pass.`)} ${dim('Fix the ❌ ones and run it again.')}`);
  else if (res.state === 'blocked') say(`   🚧 ${yellow('Blocked: a tool these checks need is missing.')} ${dim('That is your setup, not your solution. Run:')} ${cyan('node labs/start.mjs doctor')}`);
  else if (res.state === 'skipped') say(`   ⏩ ${yellow('Not complete: required checks were skipped, so this does not count as done.')}`);
  else if (res.state === 'cancelled') say(`   ⛔ ${yellow('Cancelled.')}`);
  else {
    say(`   ⚠️  ${yellow('The checks stopped early, so this run proves nothing.')}`);
    wrap(res.fatal ?? '', 88).forEach((l) => say(`       ${dim(l)}`));
    if (res.stderr.trim()) res.stderr.trimEnd().split('\n').slice(opt.verbose ? 0 : -6).forEach((l) => say(`       ${dim(l)}`));
  }
  return res;
}

async function printAgent(lab, ex, target, signal) {
  const { runAgentChecks, loadAgentChecks, budgetPreview } = await import('./_harness/agent.mjs');
  say();
  say(`  🤖 ${bold(bright('Agent checks'))} ${dim('(real Copilot CLI runs on a copy in labs/.runs/ — uses AI credits)')}`);
  const specs = await loadAgentChecks(ex.dir);
  if (specs.length) {
    const b = budgetPreview(specs);
    say(`   💳 ${b.configuredCap !== null ? yellow(`Configured cap: ${b.configuredCap} AI credits in total.`) : yellow('Spending bound: unknown (a script may call Copilot several times).')} ${dim('Actual usage is not measured here: check /usage.')}`);
  }
  const res = await runAgentChecks({
    exDir: ex.dir, target, labsDir, labId: lab.id, level: ex.level, specs, signal,
    onEvent: (e) => {
      if (e.type === 'start') say(`   ⏳ ${white(e.name)}\n      ${dim('$')} ${cyan(e.command)}`);
      if (e.type === 'result') {
        say(`   ${statusIcon(e.status === 'not-run' ? 'not-run' : e.status)} ${e.status === 'pass' ? green(e.name) : white(e.name)}`);
        if (e.status !== 'pass' && e.message) wrap(inline(e.message), 88).forEach((l, i) => say(`       ${i ? '  ' : dim('↳ ')}${yellow(l)}`));
        if (e.output && (opt.verbose || e.status !== 'pass')) e.output.split('\n').slice(-12).forEach((l) => say(`       ${dim(l)}`));
      }
    },
  });
  if (res.none) say(`   🆓 ${dim('This level has no agent check.')}`);
  else {
    if (res.fatal) say(`   ${statusIcon(res.state)} ${yellow(res.fatal)}`);
    say(`   ${statusIcon(res.state)} ${white(`Agent checks: ${statusWord(res.state)}.`)}${res.dir ? ` ${dim('Kept in')} ${cyan(rel(res.dir))}` : ''}`);
  }
  return res;
}

const filters = () => ({ path: opt.path, status: opt.status, level: opt.level, query: opt.query, maxMinutes: opt['max-minutes'], bookmarked: Boolean(opt.bookmarked) });
async function learningView() {
  const learning = await import('./_harness/learning.mjs');
  return { ...learning, view: learning.progressView(progress, catalog) };
}

if (cmd === '' || cmd === 'open') {
  let open = null;
  if (cmd === 'open') open = pickExercise();
  if (opt.exercise) {
    const [labId, level] = String(opt.exercise).split('/');
    const found = findExercise(catalog, labId, level);
    if (!found?.ex) fail(found?.error ?? `There is no exercise "${opt.exercise}". Use a key like lab-03/easy.`);
    open = found;
  }
  if (opt.path) {
    const { pathById, PATHS } = await import('./_harness/learning.mjs');
    if (!pathById(opt.path)) fail(`"${opt.path}" is not a learning path. Use one of: ${PATHS.map((p) => p.id).join(', ')}.`);
  }
  if (opt.linear) {
    const { runLinear } = await import('./_harness/linear.mjs');
    process.exit(await runLinear({ labsDir, open, path: opt.path }));
  }
  if (!interactive) {
    if (cmd === 'open') {
      say(`  ${yellow('The full-screen app needs a real terminal.')} ${dim('Try:')} ${cyan(`node labs/start.mjs test ${open.lab.id} ${open.ex.level}`)} ${dim('or add --linear.')}`);
      process.exit(2);
    }
    usage();
    process.exit(0);
  }
  const { startTui } = await import('./_harness/tui.mjs');
  const app = await startTui({ labsDir, open, intro: !opt['no-intro'], anim: !opt['no-anim'], ascii: Boolean(opt.ascii), path: opt.path ?? null });
  await app.closed;
} else if (cmd === 'help') {
  usage();
} else if (cmd === 'list') {
  const L = await learningView();
  const filtered = ['path', 'status', 'level', 'query', 'max-minutes', 'bookmarked'].some((k) => opt[k] !== undefined);
  let sel;
  try { sel = L.describeSelection(catalog, L.view, filters()); } catch (e) { fail(e.message); }
  if (opt.json) {
    process.stdout.write(`${JSON.stringify(sel.matches.map((m) => ({ key: m.key, lab: m.lab.id, level: m.ex.level, title: m.ex.title, minutes: m.ex.minutes, checks: m.progress.checks, agent: m.progress.agent, bookmarked: m.progress.bookmarked })), null, 2)}\n`);
    process.exit(0);
  }
  say();
  if (filtered) {
    say(`  🔎 ${white(`${sel.matches.length} exercise(s)`)} ${dim(`· path: ${L.pathById(sel.selection.path).label}`)}`);
    for (const m of sel.matches) say(`   ${statusIcon(m.progress.checks)} ${pad2(m.key, 22)} ${m.ex.badge} ${white(m.ex.title)} ${dim(`· ${m.ex.label} · ${m.ex.minutes ? `${m.ex.minutes} min` : 'duration unknown'}`)}${m.progress.bookmarked ? ' 🔖' : ''}`);
    sel.notes.forEach((n) => say(`   ${dim(`ℹ️  ${n}`)}`));
  } else {
    const tiers = DIFFICULTIES.filter((d) => catalog.some((l) => l.levels.some((e) => e.level === d.id)));
    for (const lab of catalog) {
      const cells = tiers.map((d) => {
        const ex = lab.levels.find((e) => e.level === d.id);
        if (!ex) return `${d.badge} ${dim('·')} `;
        const s = L.view.checks(ex);
        return `${d.badge} ${statusIcon(s)}`;
      });
      say(`  ${bright(lab.num)}  ${lab.emoji}  ${white(lab.title.padEnd(30))} ${cells.join('   ')}`);
    }
  }
  const all = L.selectExercises(catalog, L.view, {});
  const done = all.filter((m) => m.progress.checks === 'pass').length;
  const stale = all.filter((m) => m.progress.checks === 'stale').length;
  say();
  say(`  ${bar(done, all.length, 30)}  ${bright(`${done}/${all.length}`)} ${dim('exercises pass on their current files')}${stale ? `  ${yellow(`🕓 ${stale} changed since checked`)}` : ''}`);
  say(`  ${dim('Legend:')} ${['pass', 'fail', 'stale', 'blocked', 'not-run'].map((s) => `${statusIcon(s)} ${dim(statusWord(s))}`).join('  ')}`);
  say();
  signature();
} else if (cmd === 'next') {
  const L = await learningView();
  let nu;
  const ui = progress.get('_ui');
  try { nu = L.nextExercise(catalog, L.view, { path: opt.path ?? ui.path ?? 'all', last: ui.lab && ui.level ? `${ui.lab}/${ui.level}` : null }); } catch (e) { fail(e.message); }
  if (opt.json) { process.stdout.write(`${JSON.stringify(nu ? { key: nu.key, title: nu.ex.title, checks: nu.progress.checks } : null)}\n`); process.exit(0); }
  say();
  if (!nu) say(`  🏁 ${bright('Everything on this path passes on your current files.')}`);
  else {
    say(`  👉 ${white(`Lab ${nu.lab.num} · ${nu.ex.badge} ${nu.ex.label}`)} ${dim('—')} ${bright(nu.ex.title)} ${dim(`(${nu.key}, ${statusWord(nu.progress.checks)})`)}`);
    say(`     ${cyan(`node labs/start.mjs open ${nu.lab.id} ${nu.ex.level}`)}`);
  }
  say();
} else if (cmd === 'path') {
  const L = await learningView();
  if (pos[1]) {
    try { L.choosePath(progress, pos[1]); } catch (e) { fail(e.message); }
  }
  const current = progress.get('_ui').path ?? 'all';
  say();
  for (const p of L.PATHS) say(`  ${p.id === current ? bright('❯') : ' '} ${p.id === current ? bold(bright(p.label)) : white(p.label)} ${dim(`(${p.id}) — ${p.description}`)}`);
  say();
} else if (cmd === 'hint') {
  const { lab, ex } = pickExercise();
  if (!ex.hints.length) fail('This exercise has no hints.', 1);
  const { revealNextHint } = await import('./_harness/milestones.mjs');
  const r = revealNextHint(progress, ex);
  say();
  if (r.none) {
    say(`  💡 ${yellow(r.milestone ? `All hints for ${r.milestone} are revealed.` : 'All hints are revealed.')} ${dim('Still stuck? Compare with the reference:')} ${cyan(`node labs/start.mjs diff ${lab.id} ${ex.level}`)}`);
    say();
    process.exit(0);
  }
  say(`  💡 ${yellow(bold(`Lab ${lab.num} · ${ex.label} · ${r.milestone ? `${r.milestone} · ` : ''}Hint ${r.shown} of ${r.total} · ${r.hint.title}`))}`);
  ui.renderMarkdown(r.hint.body, 92).forEach((l) => say(`  ${l}`));
  say();
} else if (cmd === 'test') {
  const { lab, ex } = pickExercise();
  const { ensureStarter } = await import('./_harness/workspace.mjs');
  const useSol = Boolean(opt.sol);
  const target = useSol ? ex.sol : ex.src;
  const label = useSol ? 'the reference solution' : 'your work';
  if (!useSol) {
    const kept = ensureStarter(labsDir, ex);
    if (kept.problem) say(`  ${yellow('♻️  Could not keep a starter copy:')} ${dim(kept.problem)}`);
  }
  const c = cancellable();
  const evidence = captureEvidence(ex);
  const res = await printChecks(lab, ex, target, label, c.signal);
  if (!useSol) progress.recordChecks(ex.key, res, evidence);
  if (opt.watch) {
    const waiting = () => say(`  👀 ${dim('Watching')} ${cyan(rel(target))} ${dim('— save a file to run the checks again. Ctrl+C to stop.')}`);
    c.done();
    process.on('SIGINT', () => process.exit(0));
    say();
    waiting();
    let timer = null;
    let running = false;
    let pending = false;
    const rerun = async () => {
      if (running) { pending = true; return; }
      running = true;
      if (process.stdout.isTTY) process.stdout.write('\x1b[2J\x1b[H');
      const ev = captureEvidence(ex);
      const r = await printChecks(lab, ex, target, label);
      if (!useSol) progress.recordChecks(ex.key, r, ev);
      say();
      waiting();
      running = false;
      if (pending) { pending = false; rerun(); }
    };
    fs.watch(target, { recursive: true }, (evt, file) => {
      if (/(^|[\\/])(\.agent-logs|node_modules|\.git)([\\/]|$)/.test(String(file ?? ''))) return;
      clearTimeout(timer);
      timer = setTimeout(rerun, 700);
    });
    await new Promise(() => {});
  }
  let ok = res.allPass;
  if (opt.agent && !c.signal.aborted) {
    const agentEvidence = captureEvidence(ex, 'agent');
    const a = await printAgent(lab, ex, target, c.signal);
    if (!a.none) {
      ok = ok && a.allPass;
      if (!useSol && a.runId) progress.recordAgent(ex.key, a, agentEvidence);
    }
  }
  c.done();
  say();
  process.exit(ok ? 0 : c.signal.aborted ? 130 : 1);
} else {
  await import('./_harness/commands.mjs').then((m) => m.run({ cmd, pos, opt, say, fail, labsDir, rootDir, catalog, progress, rel, pickExercise, signature }));
}

function pad2(s, n) { return `${s}${' '.repeat(Math.max(0, n - s.length))}`; }
