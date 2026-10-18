// The linear mode (--linear): the lab companion one line at a time, for screen readers and simple terminals.
// No alternate screen, raw input, cursor movement, colors or animation. It uses the same helpers as the app.
import readline from 'node:readline';
import path from 'node:path';
import { loadCatalog, findExercise, levelChoices } from './catalog.mjs';
import { progressStore, captureEvidence } from './progress.mjs';
import { runChecks as realRunChecks } from './checks.mjs';
import { runAgentChecks as realRunAgentChecks, loadAgentChecks as realLoadAgentChecks, listRuns as realListRuns, budgetPreview, specCommand } from './agent.mjs';
import { inspectEnvironment as realInspect, reportLines } from './doctor.mjs';
import { ensureStarter, listRecovery, restoreStarter, restoreSnapshot, createCheckpoint, resetToCommit, compareTrees } from './workspace.mjs';
import { PATHS, pathById, progressView, describeSelection, nextExercise, choosePath, learningReport, writeReport } from './learning.mjs';
import { statusWord, stripAnsi, inline, isAscii, asciiFold } from './ui.mjs';
import { runInteractive as realRunInteractive } from './system.mjs';
import { copilotBin } from './kit.mjs';

const HELP = `Commands (type one and press Enter):
  list [path=ID] [level=L] [status=S] [minutes=N] [bookmarked] [words…]   numbered exercises, filtered
  open N            open exercise number N from the last list (or: open lab-01 easy)
  show              the mission, where to work and when it is done
  checks            run the free checks (Ctrl+C cancels)
  details N         the requirement, files, evidence and output of check N
  output            the full output of the last check run
  hint              reveal the next hint
  agent             run the agent checks: real Copilot, uses AI credits (asks first)
  history           agent run history for this exercise
  compare [FILE]    compare your work with the reference solution
  recovery          the starter, your checkpoints and backups
  checkpoint NAME   save your current work as a checkpoint
  restore starter | restore checkpoint:NAME | restore backup:NAME | restore commit
  bookmark          bookmark this exercise (or remove the bookmark)
  next              open the next unfinished exercise on your path
  path [ID]         show or choose your learning path (${PATHS.map((p) => p.id).join(', ')})
  doctor            what is installed, what is missing and how to fix it
  export [md|json]  save a learning summary in labs/.reports (stays on this computer)
  copilot           start Copilot in this exercise's folder (type /exit to come back)
  help              this list
  quit              leave`;

export function runLinear({
  labsDir, input = process.stdin, output = process.stdout, open = null, path: startPath = null, deps: overrides = {},
}) {
  const deps = { runChecks: realRunChecks, runAgentChecks: realRunAgentChecks, loadAgentChecks: realLoadAgentChecks, listRuns: realListRuns, inspectEnvironment: realInspect, runInteractive: realRunInteractive, ...overrides };
  const rootDir = path.dirname(labsDir);
  const catalog = loadCatalog(labsDir);
  const store = progressStore(labsDir);
  const view = progressView(store, catalog);
  const rel = (p) => path.relative(rootDir, p).split(path.sep).join('/');
  const say = (s = '') => output.write(`${isAscii() ? asciiFold(stripAnsi(s)) : stripAnsi(s)}\n`);
  const plain = (md) => stripAnsi(inline(String(md ?? ''))).split('\n').map((l) => `  ${l}`).join('\n');
  let current = open ?? null;
  let lastList = [];
  let lastRun = null;
  let active = null;
  let pendingAsk = null;
  const ui = store.get('_ui');
  let pathId = pathById(startPath) ? startPath : pathById(ui.path) ? ui.path : 'all';

  const queue = [];
  let ended = false;
  /** Read the next line as an answer: from what was already typed or piped, else wait for it (EOF answers ""). */
  const ask = (question) => {
    say(question);
    if (queue.length) return Promise.resolve(queue.shift());
    if (ended) return Promise.resolve('');
    return new Promise((resolve) => { pendingAsk = resolve; });
  };
  const need = () => { if (!current) { say('No exercise is open. Type "list", then "open N".'); return false; } return true; };
  const label = (lab, ex) => `Lab ${lab.num} ${lab.title}, ${ex.label}: ${ex.title}`;

  function list(args) {
    const opts = { path: pathId };
    const words = [];
    for (const a of args) {
      const m = a.match(/^(path|level|status|minutes)=(.+)$/i);
      if (m) opts[m[1].toLowerCase() === 'minutes' ? 'maxMinutes' : m[1].toLowerCase()] = m[2];
      else if (a === 'bookmarked') opts.bookmarked = true;
      else words.push(a);
    }
    opts.query = words.join(' ');
    view.refresh();
    let sel;
    try { sel = describeSelection(catalog, view, opts); } catch (e) { say(e.message); return; }
    lastList = sel.matches;
    say(`${sel.matches.length} exercise(s) on the ${pathById(sel.selection.path).label} path:`);
    sel.matches.forEach((m, i) => say(`  ${i + 1}. ${label(m.lab, m.ex)}. ${m.ex.minutes ? `${m.ex.minutes} minutes` : 'duration unknown'}. Status: ${statusWord(m.progress.checks)}.${m.progress.bookmarked ? ' Bookmarked.' : ''}`));
    sel.notes.forEach((n) => say(`Note: ${n}`));
  }

  function openArgs(args) {
    if (args.length === 1 && /^\d+$/.test(args[0])) {
      const m = lastList[Number(args[0]) - 1];
      if (!m) { say(`There is no number ${args[0]} in the last list.`); return; }
      current = { lab: m.lab, ex: m.ex };
    } else {
      const found = findExercise(catalog, args[0], args[1]);
      if (!found?.ex) { say(found?.error ?? `Use: open lab-01 easy (difficulties: ${levelChoices()}).`); return; }
      current = { lab: found.lab, ex: found.ex };
    }
    store.set('_ui', { lab: current.lab.id, level: current.ex.level });
    show();
  }

  function show() {
    if (!need()) return;
    const { lab, ex } = current;
    view.refresh();
    say(`Open: ${label(lab, ex)}.`);
    if (ex.meta) say(`  ${stripAnsi(ex.meta)}`);
    say(`Status: checks ${statusWord(view.checks(ex))}; agent check ${statusWord(view.agent(ex))}.`);
    say('Mission:'); say(plain(ex.mission));
    say(`Work here: ${rel(ex.src)}`);
    say('Done when:'); say(plain(ex.done));
    say(`Hints revealed: ${Math.min(view.hints(ex), ex.hints.length)} of ${ex.hints.length}.`);
  }

  async function checks() {
    if (!need()) return;
    const { ex } = current;
    const kept = ensureStarter(labsDir, ex);
    if (kept.problem) say(`Note: could not keep a starter copy: ${kept.problem}`);
    const controller = new AbortController();
    active = controller;
    say(`Running the free checks on ${rel(ex.src)}. Press Ctrl+C to cancel.`);
    const evidence = captureEvidence(ex);
    const res = await deps.runChecks({
      exDir: ex.dir, target: ex.src, signal: controller.signal,
      onEvent: (e) => { if (e.type === 'result') say(`  ${e.idx + 1}. ${e.status === 'skip' ? 'skipped' : e.status === 'blocked' ? 'blocked' : e.status === 'pass' ? 'passed' : 'failed'}: ${e.name}${e.status !== 'pass' && e.message ? `. ${stripAnsi(inline(e.message))}` : ''}`); },
    });
    active = null;
    lastRun = res;
    store.recordChecks(ex.key, res, evidence);
    view.tracker.invalidate(ex.key);
    if (res.state === 'pass') say(`All ${res.total} checks passed.`);
    else if (res.state === 'fail') say(`${res.passed} of ${res.total} checks passed. Type "details N" for a failing check.`);
    else say(`Result: ${statusWord(res.state)}. ${res.fatal ?? ''}`.trim());
  }

  function details(n) {
    if (!lastRun) { say('Run "checks" first.'); return; }
    const r = lastRun.results[Number(n) - 1];
    if (!r) { say(`There is no check number ${n}.`); return; }
    say(`Check ${n}: ${r.name}. Status: ${r.status}${r.optional ? ' (optional)' : ''}.`);
    say(`Requirement: ${r.name}.`);
    if (r.message) say(`Observed: ${stripAnsi(inline(r.message))}`);
    if (Object.hasOwn(r.detail ?? {}, 'expected')) say(`Expected: ${JSON.stringify(r.detail.expected)}`);
    if (Object.hasOwn(r.detail ?? {}, 'actual')) say(`Actual: ${JSON.stringify(r.detail.actual)}`);
    if (r.files?.length) say(`Relevant files: ${r.files.join(', ')}`);
    if (r.output?.trim()) { say('Output from this check:'); say(r.output.trimEnd()); }
  }

  async function agent() {
    if (!need()) return;
    const { lab, ex } = current;
    const specs = await deps.loadAgentChecks(ex.dir);
    if (!specs.length) { say('This exercise has no agent check.'); return; }
    const budget = budgetPreview(specs);
    say('Agent checks run the real Copilot CLI on a copy of your folder and use AI credits.');
    say(budget.configuredCap !== null ? `Configured cap: ${budget.configuredCap} AI credits in total.` : 'Spending bound: unknown, because at least one check runs a script that may call Copilot several times.');
    say('Actual usage is not measured here; check /usage in Copilot.');
    specs.forEach((s, i) => say(`  ${i + 1}. ${s.name}: ${specCommand(s)}`));
    const answer = await ask('Type yes to run them, anything else to cancel.');
    if (answer.trim().toLowerCase() !== 'yes') { say('Cancelled. Nothing was run.'); return; }
    ensureStarter(labsDir, ex);
    const controller = new AbortController();
    active = controller;
    const evidence = captureEvidence(ex, 'agent');
    say('Running. Press Ctrl+C to cancel; no further checks start after that.');
    const res = await deps.runAgentChecks({
      exDir: ex.dir, target: ex.src, labsDir, labId: lab.id, level: ex.level, specs, signal: controller.signal,
      onEvent: (e) => {
        if (e.type === 'start') say(`  Started: ${e.name}`);
        if (e.type === 'result') say(`  ${e.status}: ${e.name}${e.message ? `. ${e.message}` : ''}`);
      },
    });
    active = null;
    if (res.runId) store.recordAgent(ex.key, res, evidence);
    view.tracker.invalidate(ex.key);
    say(`Agent checks: ${statusWord(res.state)}.${res.fatal ? ` ${res.fatal}` : ''}${res.dir ? ` Kept in ${rel(res.dir)}.` : ''}`);
  }

  function recovery() {
    if (!need()) return;
    const r = listRecovery(labsDir, current.ex);
    say(`Starter: ${r.published ? 'published (restored from git when available)' : r.starter ? `first-use copy${r.starter.verified ? ', matches the published starter' : ', not verified'}` : 'none yet'}.`);
    say(`Checkpoints: ${r.checkpoints.map((c) => c.name).join(', ') || 'none'}.`);
    say(`Backups: ${r.backups.map((b) => b.name).join(', ') || 'none'}.`);
    if (r.legacy.length) say(`Older backups: ${r.legacy.map((b) => b.name).join(', ')}.`);
    r.incomplete.forEach((x) => say(`Incomplete, cannot be restored: ${x.name}: ${x.problem}`));
  }

  async function restore(what) {
    if (!need()) return;
    const { ex } = current;
    if (!what) { say('Use: restore starter, restore checkpoint:NAME, restore backup:NAME or restore commit.'); return; }
    const describe = what === 'starter' ? 'the original starter' : what === 'commit' ? 'your latest commit (discarding changes since then)' : what;
    const answer = await ask(`This replaces the files in ${rel(ex.src)} with ${describe}. Your current files are backed up first. Type yes to continue.`);
    if (answer.trim().toLowerCase() !== 'yes') { say('Nothing changed.'); return; }
    const r = what === 'starter' ? restoreStarter(labsDir, ex) : what === 'commit' ? resetToCommit(labsDir, ex) : restoreSnapshot(labsDir, ex, what);
    view.tracker.invalidate(ex.key);
    say(r.ok ? `Done.${r.note ? ` ${r.note}` : ''} Backup: ${rel(r.backup.dir)}` : `Not done: ${r.reason}`);
  }

  function compare(file) {
    if (!need()) return;
    const { ex } = current;
    const { files, summary } = compareTrees(ex.src, ex.sol);
    store.set(ex.key, { peeked: true });
    say('The reference is one possible solution, not a byte-for-byte target.');
    say(`${summary.changed} changed, ${summary.missing} only in the reference, ${summary.extra} only in yours, ${summary.same} identical.`);
    const chosen = file ? files.filter((f) => f.path === file) : files;
    if (file && !chosen.length) { say(`No differences in ${file}.`); return; }
    for (const f of chosen) { say(`File ${f.path}: ${f.status}.${f.note ? ` ${f.note}` : ''}`); if (f.diff) say(f.diff.trimEnd()); }
  }

  async function handle(line) {
    const [cmd = '', ...args] = line.trim().split(/\s+/);
    switch (cmd.toLowerCase()) {
      case '': return;
      case 'help': case '?': say(HELP); return;
      case 'list': list(args); return;
      case 'open': openArgs(args); return;
      case 'show': show(); return;
      case 'checks': case 'test': await checks(); return;
      case 'details': details(args[0]); return;
      case 'output': if (!lastRun) say('Run "checks" first.'); else { if (lastRun.fatal) say(`Why it stopped: ${lastRun.fatal}`); say('Standard output:'); say(lastRun.stdout || '(nothing)'); say('Errors and warnings:'); say(lastRun.stderr || '(nothing)'); } return;
      case 'hint': {
        if (!need()) return;
        const { ex } = current;
        const n = Math.min(view.hints(ex) + 1, ex.hints.length);
        if (!n) { say('This exercise has no hints.'); return; }
        store.set(ex.key, { hints: n });
        say(`Hint ${n} of ${ex.hints.length}: ${ex.hints[n - 1].title}`);
        say(plain(ex.hints[n - 1].body));
        return;
      }
      case 'agent': await agent(); return;
      case 'history': {
        if (!need()) return;
        const runs = deps.listRuns(labsDir, { labId: current.ex.labId, level: current.ex.level });
        say('Run folders stay on this computer and can contain generated or sensitive output.');
        if (!runs.length) say('No agent runs yet.');
        runs.forEach((r) => say(`  ${r.startedAt ?? ''} ${r.state} ${r.runId}: ${(r.cases ?? []).map((c) => `${c.name} ${c.status}`).join('; ')}`));
        return;
      }
      case 'compare': case 'diff': compare(args[0]); return;
      case 'recovery': recovery(); return;
      case 'checkpoint': {
        if (!need()) return;
        const r = createCheckpoint(labsDir, current.ex, args[0]);
        say(r.ok ? `Checkpoint ${args[0]} saved.` : r.reason);
        return;
      }
      case 'restore': await restore(args[0]); return;
      case 'bookmark': {
        if (!need()) return;
        const on = !view.bookmarked(current.ex);
        store.set(current.ex.key, { bookmarked: on });
        say(on ? 'Bookmarked.' : 'Bookmark removed.');
        return;
      }
      case 'next': {
        view.refresh();
        const nu = nextExercise(catalog, view, { path: pathId });
        if (!nu) { say(pathId === 'all' ? 'Every exercise passes.' : `Your ${pathById(pathId).label} path is complete.`); return; }
        current = { lab: nu.lab, ex: nu.ex };
        show();
        return;
      }
      case 'path': {
        if (!args[0]) { say(`Path: ${pathById(pathId).label}. Choose with: path ID (${PATHS.map((p) => p.id).join(', ')}).`); return; }
        try { pathId = choosePath(store, args[0]); say(`Path: ${pathById(pathId).label}. ${pathById(pathId).description}`); } catch (e) { say(e.message); }
        return;
      }
      case 'doctor': {
        say('Checking your setup (read-only)…');
        const report = await deps.inspectEnvironment({ rootDir, lab: current?.ex.labId });
        reportLines(report, { icons: false }).forEach((l) => say(l));
        return;
      }
      case 'export': {
        view.refresh();
        try {
          const { file } = writeReport(learningReport(catalog, view, { path: pathId }), { dir: path.join(labsDir, '.reports'), format: args[0] === 'json' ? 'json' : 'md' });
          say(`Saved ${rel(file)}. It stays on this computer.`);
        } catch (e) { say(e.message); }
        return;
      }
      case 'copilot': {
        if (!need()) return;
        ensureStarter(labsDir, current.ex);
        say(`Starting Copilot in ${rel(current.ex.src)}. Type /exit to come back.`);
        const r = await deps.runInteractive(copilotBin(), [], { cwd: current.ex.src });
        say(r.missing ? 'GitHub Copilot CLI is not installed. Type "doctor" for help.' : 'Back in the lab companion. Type "checks" to check your work.');
        return;
      }
      case 'quit': case 'exit': case 'q': return 'quit';
      default: say(`Unknown command "${cmd}". Type help for the list.`);
    }
    return undefined;
  }

  return new Promise((resolve) => {
    const rl = readline.createInterface({ input, terminal: false });
    let busy = false;
    let finished = false;
    const finish = (code) => {
      if (finished) return;
      finished = true;
      process.off('SIGINT', onSigint);
      say('Goodbye. Continue any time with: node labs/start.mjs --linear');
      rl.close();
      resolve(code);
    };
    const onSigint = () => { if (active) { active.abort(); say('Cancelling…'); } else finish(130); };
    process.on('SIGINT', onSigint);
    const pump = async () => {
      if (busy) return;
      busy = true;
      while (queue.length && !finished) {
        const line = queue.shift();
        let result;
        try { result = await handle(line); } catch (e) { say(`Something went wrong: ${e.message}`); }
        if (result === 'quit') { finish(0); return; }
        if (!finished) output.write('> ');
      }
      busy = false;
      if (ended) finish(0);
    };
    rl.on('line', (line) => {
      if (pendingAsk) { const r = pendingAsk; pendingAsk = null; r(line); return; }
      queue.push(line);
      pump();
    });
    rl.on('close', () => {
      ended = true;
      if (pendingAsk) { const r = pendingAsk; pendingAsk = null; r(''); }
      if (!busy) finish(0);
    });
    say('Build Your Agent Harness: lab companion, linear mode. Type help for commands, list to see exercises, quit to leave.');
    say(`Learning path: ${pathById(pathId).label}.`);
    if (store.status().warning || store.status().error) say(`Warning: ${store.status().error ?? store.status().warning}`);
    if (current) show();
    output.write('> ');
  });
}
