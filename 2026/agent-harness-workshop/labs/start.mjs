#!/usr/bin/env node
// 🧠 Build Your Agent Harness — lab companion.
//   node labs/start.mjs                         interactive app (pick a lab, read the mission, run checks)
//   node labs/start.mjs open lab-01 easy        interactive app, straight into one level
//   node labs/start.mjs list                    your progress
//   node labs/start.mjs test lab-01 easy        run the free checks on labs/lab-01/easy/src
//   node labs/start.mjs test lab-01 easy --watch   ...and run them again every time you save
//   node labs/start.mjs test lab-01 easy --agent   ...and the 🤖 agent checks (uses AI credits)
//   node labs/start.mjs hint lab-01 easy        reveal the next hint
//   node labs/start.mjs reset lab-01 easy       start a level over (backs up your files first; needs git)
//   node labs/start.mjs verify                  facilitators: every src/ must fail and every sol/ must pass
// Options: --no-intro (skip the welcome screen), --no-anim (no animations).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [major] = process.versions.node.split('.').map(Number);
if (major < 22) {
  console.error(`\n  🛑 This workshop needs Node.js 22 or newer (you have ${process.versions.node}). Get it from https://nodejs.org\n`);
  process.exit(1);
}

const labsDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.dirname(labsDir);
const { green, bright, dim, white, yellow, red, cyan, bold, wrap, inline, bar, style, C } = await import('./_harness/ui.mjs');
const { loadCatalog, findExercise, LEVEL_BADGE } = await import('./_harness/catalog.mjs');
const { progressStore } = await import('./_harness/progress.mjs');
const { runChecks } = await import('./_harness/checks.mjs');
const { runAgentChecks } = await import('./_harness/agent.mjs');
const { BRAND, creditLine } = await import('./_harness/brand.mjs');

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const pos = args.filter((a) => !a.startsWith('--'));
const cmd = pos[0];
const catalog = loadCatalog(labsDir);
const progress = progressStore(labsDir);
const rel = (p) => path.relative(rootDir, p).split(path.sep).join('/');
const say = (s = '') => process.stdout.write(`${style.fg(C.green)}${s}${style.reset}\n`);

const signature = () => {
  say(`  ${dim(`✨ ${creditLine()}`)}`);
  say(`  ${dim(`📧 ${BRAND.email}`)}`);
  say();
};

function usage() {
  say();
  say(`  🧠 ${bold(bright('BUILD YOUR AGENT HARNESS'))} ${dim('· lab companion')}`);
  say();
  say(`  ${cyan('node labs/start.mjs')}                          ${dim('interactive app')}`);
  say(`  ${cyan('node labs/start.mjs open lab-01 easy')}         ${dim('interactive app, straight into one level')}`);
  say(`  ${cyan('node labs/start.mjs list')}                     ${dim('labs and your progress')}`);
  say(`  ${cyan('node labs/start.mjs test lab-01 easy')}         ${dim('run the free checks on src/')}`);
  say(`  ${cyan('node labs/start.mjs test lab-01 easy --watch')} ${dim('run them again every time you save')}`);
  say(`  ${cyan('node labs/start.mjs test lab-01 easy --agent')} ${dim('also run the 🤖 agent checks (AI credits)')}`);
  say(`  ${cyan('node labs/start.mjs hint lab-01 easy')}         ${dim('reveal the next hint')}`);
  say(`  ${cyan('node labs/start.mjs reset lab-01 easy')}        ${dim('start a level over (your files are backed up first)')}`);
  say(`  ${cyan('node labs/start.mjs verify')}                   ${dim('facilitators: src/ fails, sol/ passes')}`);
  say();
  say(`  ${dim('Options:')} ${cyan('--no-intro')} ${dim('skip the welcome screen ·')} ${cyan('--no-anim')} ${dim('no animations')}`);
  if (!(process.stdout.isTTY && process.stdin.isTTY)) say(`  ${yellow('Tip:')} ${dim('the interactive app needs a real terminal (Windows Terminal, PowerShell, macOS Terminal, iTerm, …).')}`);
  say();
  signature();
}

function pickExercise() {
  const found = findExercise(catalog, pos[1], pos[2]);
  if (!found?.lab || !found.ex) {
    say(`  ${red('❌ Which exercise?')} ${dim('Example:')} ${cyan('node labs/start.mjs test lab-01 easy')}`);
    process.exit(2);
  }
  return found;
}

async function printChecks(lab, ex, target, label) {
  say();
  say(`  🧪 ${bold(bright(`Lab ${lab.num} · ${LEVEL_BADGE[ex.level]} ${ex.level}`))} ${white('—')} ${white(ex.title)}`);
  say(`     ${dim(`checking ${label}:`)} ${cyan(rel(target))}`);
  say();
  const res = await runChecks({
    exDir: ex.dir,
    target,
    onEvent: (e) => {
      if (e.type !== 'result') return;
      const icon = e.status === 'pass' ? '✅' : e.status === 'skip' ? '⏩' : e.optional ? '🟠' : '❌';
      say(`   ${icon} ${e.status === 'pass' ? green(e.name) : white(e.name)}${e.optional ? dim(' (optional)') : ''}`);
      if (e.status !== 'pass' && e.message) wrap(inline(e.message), 88).forEach((l, i) => say(`       ${i ? '  ' : dim('↳ ')}${e.status === 'skip' ? dim(l) : yellow(l)}`));
    },
  });
  if (res.fatal) say(`   ❌ ${red(res.fatal)}`);
  say();
  say(res.allPass ? `   🎉 ${bold(bright('All checks passed!'))}` : `   💪 ${white(`${res.passed} of ${res.total} checks pass.`)} ${dim('Fix the ❌ ones and run it again.')}`);
  return res;
}

async function printAgent(lab, ex, target) {
  say();
  say(`  🤖 ${bold(bright('Agent checks'))} ${dim('(real Copilot CLI runs on a copy in labs/.runs/ — uses AI credits)')}`);
  const res = await runAgentChecks({
    exDir: ex.dir, target, labsDir, labId: lab.id, level: ex.level,
    onEvent: (e) => {
      if (e.type === 'start') say(`   ⏳ ${white(e.name)}\n      ${dim('$')} ${cyan(e.command)}`);
      if (e.type === 'result') {
        say(`   ${e.status === 'pass' ? '✅' : '❌'} ${e.status === 'pass' ? green(e.name) : white(e.name)}`);
        if (e.status !== 'pass') wrap(inline(e.message), 88).forEach((l, i) => say(`       ${i ? '  ' : dim('↳ ')}${yellow(l)}`));
        if (e.output && (flags.has('--verbose') || e.status !== 'pass')) e.output.split('\n').slice(-12).forEach((l) => say(`       ${dim(l)}`));
      }
    },
  });
  if (res.none) say(`   🆓 ${dim('This level has no agent check.')}`);
  return res;
}

const interactive = process.stdout.isTTY && process.stdin.isTTY;
const tuiOptions = { labsDir, intro: !flags.has('--no-intro'), anim: !flags.has('--no-anim') };

if (!cmd) {
  if (interactive) {
    const { startTui } = await import('./_harness/tui.mjs');
    await startTui(tuiOptions);
  } else usage();
} else if (cmd === 'open') {
  const { lab, ex } = pickExercise();
  if (!interactive) {
    say(`  ${yellow('The interactive app needs a real terminal.')} ${dim('Try:')} ${cyan(`node labs/start.mjs test ${lab.id} ${ex.level}`)}`);
    process.exit(2);
  }
  const { startTui } = await import('./_harness/tui.mjs');
  await startTui({ ...tuiOptions, open: { lab, ex } });
} else if (cmd === 'reset') {
  const { lab, ex } = pickExercise();
  const { changes, resetToCommit } = await import('./_harness/workspace.mjs');
  const list = changes(ex.src);
  say();
  say(`  ♻️  ${bold(bright(`Start Lab ${lab.num} · ${ex.level} over`))} ${dim(`(${rel(ex.src)})`)}`);
  if (list === null) {
    say(`   ${yellow('This needs git and at least one commit.')} ${dim("Without git, extract this level's src/ again from the workshop zip.")}`);
    say();
    process.exit(1);
  }
  if (!list.length) {
    say(`   👍 ${dim('Nothing to undo: src/ already matches your last commit.')}`);
    say();
    process.exit(0);
  }
  say(`   ${white('Changes that will be undone:')} ${list.map((c) => `${c.file}${c.status === 'new' ? dim(' (new)') : ''}`).join(dim(', '))}`);
  if (!flags.has('--yes')) {
    say(`   ${dim('Run again with')} ${cyan('--yes')} ${dim('to do it. Your files are backed up to labs/.backups/ first.')}`);
    say();
    process.exit(0);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const result = resetToCommit(ex.src, path.join(labsDir, '.backups', `${lab.id}-${ex.level}-${stamp}`));
  if (result.ok) {
    progress.set(`${lab.id}/${ex.level}`, { checks: null, agent: null, passed: null, total: null, nextFix: null });
    say(`   ✅ ${bright('Done. This level is back to its starting point.')} ${dim('Backup:')} ${cyan(rel(result.backup))}`);
  } else say(`   ${yellow('Could not reset:')} ${dim(result.reason)}`);
  say();
  process.exit(result.ok ? 0 : 1);
} else if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
  usage();
} else if (cmd === 'list') {
  let done = 0;
  let totalLevels = 0;
  say();
  for (const lab of catalog) {
    const cells = lab.levels.map((ex) => {
      totalLevels++;
      const p = progress.get(`${lab.id}/${ex.level}`);
      if (p.checks === 'pass') done++;
      return `${LEVEL_BADGE[ex.level]} ${p.checks === 'pass' ? '✅' : p.checks === 'fail' ? '❌' : '⬜'}`;
    });
    say(`  ${bright(lab.num)}  ${lab.emoji}  ${white(lab.title.padEnd(30))} ${cells.join('   ')}`);
  }
  say();
  say(`  ${bar(done, totalLevels, 30)}  ${bright(`${done}/${totalLevels}`)} ${dim('levels done')}`);
  say();
  signature();
} else if (cmd === 'hint') {
  const { lab, ex } = pickExercise();
  const key = `${lab.id}/${ex.level}`;
  const n = Math.min((progress.get(key).hints ?? 0) + 1, ex.hints.length);
  progress.set(key, { hints: n });
  const h = ex.hints[n - 1];
  say();
  say(`  💡 ${yellow(bold(`Hint ${n} of ${ex.hints.length} · ${h.title}`))}`);
  const { renderMarkdown } = await import('./_harness/ui.mjs');
  renderMarkdown(h.body, 92).forEach((l) => say(`  ${l}`));
  say();
} else if (cmd === 'test') {
  const { lab, ex } = pickExercise();
  const useSol = flags.has('--sol');
  const target = useSol ? ex.sol : ex.src;
  const label = useSol ? 'the reference solution' : 'your work';
  const record = (r) => {
    if (useSol) return;
    const firstFail = r.results.find((x) => x.status === 'fail');
    progress.set(`${lab.id}/${ex.level}`, { checks: r.allPass ? 'pass' : 'fail', passed: r.passed, total: r.total, nextFix: firstFail?.name ?? null });
  };
  const res = await printChecks(lab, ex, target, label);
  record(res);
  if (flags.has('--watch')) {
    const waiting = () => say(`  👀 ${dim('Watching')} ${cyan(rel(target))} ${dim('— save a file to run the checks again. Ctrl+C to stop.')}`);
    say();
    waiting();
    let timer = null;
    let running = false;
    let pending = false;
    const rerun = async () => {
      if (running) { pending = true; return; }
      running = true;
      if (process.stdout.isTTY) process.stdout.write('\x1b[2J\x1b[H');
      record(await printChecks(lab, ex, target, label));
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
  if (flags.has('--agent')) {
    const a = await printAgent(lab, ex, target);
    if (!a.none) {
      ok = ok && a.allPass;
      if (!useSol) progress.set(`${lab.id}/${ex.level}`, { agent: a.allPass ? 'pass' : 'fail' });
    }
  }
  say();
  process.exit(ok ? 0 : 1);
} else if (cmd === 'verify') {
  process.env.HARNESS_VERIFY = '1';
  const only = pos[1] ? String(pos[1]).replace(/^lab-?/i, '').padStart(2, '0') : null;
  let problems = 0;
  say();
  say(`  🔍 ${bold(bright('Verifying the labs'))} ${dim('— every src/ should fail at least one check, every sol/ should pass them all')}`);
  say();
  for (const lab of catalog.filter((l) => !only || l.num === only)) {
    for (const ex of lab.levels) {
      const s = await runChecks({ exDir: ex.dir, target: ex.src, env: { HARNESS_VERIFY: '1' } });
      const o = await runChecks({ exDir: ex.dir, target: ex.sol, env: { HARNESS_VERIFY: '1' } });
      const srcOk = !s.fatal && s.failed > 0;
      const solOk = !o.fatal && o.allPass;
      if (!srcOk || !solOk) problems++;
      const skipped = o.results.filter((r) => r.status === 'skip').length;
      say(`   ${srcOk && solOk ? '✅' : '❌'} ${white(`${lab.id} ${ex.level.padEnd(6)}`)}  ${dim('src')} ${srcOk ? green(`fails ${s.failed}/${s.total}`) : red(s.fatal ? 'could not run' : 'passes - nothing to do!')}   ${dim('sol')} ${solOk ? green(`passes ${o.passed}/${o.total}`) : red(o.fatal ? `could not run: ${o.fatal}` : `fails ${o.failed}`)}${skipped ? dim(` (${skipped} skipped)`) : ''}`);
      if (!solOk && !o.fatal) o.results.filter((r) => r.status === 'fail').forEach((r) => say(`        ${red('sol ✗')} ${r.name}: ${dim(r.message.slice(0, 220))}`));
      if (flags.has('--verbose') && s.results) s.results.filter((r) => r.status === 'fail').forEach((r) => say(`        ${dim('src ✗')} ${dim(r.name)}`));
    }
  }
  say();
  say(problems ? `  ❌ ${red(`${problems} exercise(s) need attention.`)}` : `  ✅ ${bold(bright('All exercises verified.'))}`);
  say();
  process.exit(problems ? 1 : 0);
} else {
  usage();
  process.exit(2);
}
