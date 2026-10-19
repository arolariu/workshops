// The non-interactive commands of `node labs/start.mjs` that manage recovery, history, comparison, sharing, setup
// and facilitator checks. start.mjs parses and validates the arguments; everything here uses the shared helpers.
import fs from 'node:fs';
import path from 'node:path';
import { green, bright, dim, white, yellow, red, cyan, bold, wrap, statusIcon, statusWord } from './ui.mjs';

export async function run(ctx) {
  const { cmd, pos, opt, say, fail, labsDir, rootDir, catalog, progress, rel, pickExercise, signature } = ctx;
  const ws = await import('./workspace.mjs');

  if (cmd === 'reset') {
    const { lab, ex } = pickExercise();
    const list = ws.changes(ex.src);
    say();
    say(`  ⏪ ${bold(bright(`Discard changes since your latest commit · Lab ${lab.num} · ${ex.label}`))} ${dim(`(${rel(ex.src)})`)}`);
    if (list === null) {
      say(`   ${yellow('This needs git and at least one commit.')} ${dim('To go back to the original starter (works without git):')} ${cyan(`node labs/start.mjs restore ${lab.id} ${ex.level} --starter`)}`);
      say();
      process.exit(1);
    }
    if (!list.length) {
      say(`   👍 ${dim('Nothing to discard: src/ already matches your latest commit.')}`);
      say(`   ${dim('Want the original starter instead?')} ${cyan(`node labs/start.mjs restore ${lab.id} ${ex.level} --starter`)}`);
      say();
      process.exit(0);
    }
    say(`   ${white('Changes that will be discarded:')} ${list.map((c) => `${c.file}${c.status === 'new' ? dim(' (new)') : ''}`).join(dim(', '))}`);
    if (!opt.yes) {
      say(`   ${dim('Run again with')} ${cyan('--yes')} ${dim('to do it. Your files are backed up to labs/.recovery/ first.')}`);
      say();
      process.exit(0);
    }
    const result = ws.resetToCommit(labsDir, ex);
    if (result.ok) say(`   ✅ ${bright('Done. This level is back to your latest commit.')} ${dim('Backup:')} ${cyan(rel(result.backup.dir))}`);
    else say(`   ${yellow('Could not reset:')} ${dim(result.reason)}`);
    say();
    process.exit(result.ok ? 0 : 1);
  }

  if (cmd === 'restore') {
    const { lab, ex } = pickExercise();
    const picked = [opt.starter && 'starter', opt.checkpoint && `checkpoint:${opt.checkpoint}`, opt.backup && `backup:${opt.backup}`].filter(Boolean);
    if (picked.length !== 1) fail('Choose exactly one: --starter, --checkpoint=NAME or --backup=NAME. List them with: node labs/start.mjs recovery LAB LEVEL');
    const what = picked[0];
    const label = what === 'starter' ? 'the original starter' : what.replace(':', ' ');
    say();
    say(`  ♻️  ${bold(bright(`Restore ${label} · Lab ${lab.num} · ${ex.label}`))}`);
    if (!opt.yes) {
      say(`   ${white(`This would replace the files in ${rel(ex.src)} with ${label}.`)}`);
      say(`   ${dim('Your current files are backed up first; node_modules and git data are kept. Run again with')} ${cyan('--yes')} ${dim('to do it.')}`);
      say();
      process.exit(0);
    }
    const r = what === 'starter' ? ws.restoreStarter(labsDir, ex) : ws.restoreSnapshot(labsDir, ex, what);
    if (r.ok) {
      say(`   ✅ ${bright(`Restored ${label}.`)} ${dim('Backup of what you had:')} ${cyan(rel(r.backup.dir))}`);
      if (r.note) wrap(r.note, 88).forEach((l) => say(`      ${dim(l)}`));
    } else {
      say(`   ${yellow('Not done:')} ${dim(r.reason)}`);
      if (r.backup) say(`   ${dim('Your files are safe in')} ${cyan(rel(r.backup.dir))}`);
    }
    say();
    process.exit(r.ok ? 0 : 1);
  }

  if (cmd === 'checkpoint') {
    const { ex } = pickExercise();
    const r = ws.createCheckpoint(labsDir, ex, pos[3]);
    say(r.ok ? `  💾 ${bright(`Checkpoint "${pos[3]}" saved.`)} ${dim('Restore it with:')} ${cyan(`node labs/start.mjs restore ${ex.labId} ${ex.level} --checkpoint=${pos[3]}`)}` : `  ${yellow('Not saved:')} ${dim(r.reason)}`);
    process.exit(r.ok ? 0 : 1);
  }

  if (cmd === 'recovery') {
    const { lab, ex } = pickExercise();
    const r = ws.listRecovery(labsDir, ex);
    say();
    say(`  ♻️  ${bold(bright(`Recovery · Lab ${lab.num} · ${ex.label}`))} ${dim(`(${rel(ex.src)})`)}`);
    say(`   ${white('Starter:')} ${r.published ? 'published by the workshop (restored from git when this checkout has it)' : ''}${r.published && r.starter ? '; ' : ''}${r.starter ? `first-use copy from ${String(r.starter.createdAt).slice(0, 16).replace('T', ' ')}${r.starter.verified ? ' (matches the published starter)' : ' (not verified)'}` : r.published ? '' : dim('none yet (one is kept the first time the lab app checks or opens this exercise)')}`);
    say(`   ${white('Checkpoints:')} ${r.checkpoints.length ? r.checkpoints.map((c) => `${c.name} ${dim(`(${String(c.createdAt).slice(0, 16).replace('T', ' ')})`)}`).join(', ') : dim('none')}`);
    say(`   ${white('Backups:')} ${r.backups.length ? r.backups.map((b) => `${b.name} ${dim(`(before ${b.reason})`)}`).join(', ') : dim('none')}`);
    if (r.legacy.length) say(`   ${white('Older backups:')} ${r.legacy.map((b) => b.name).join(', ')} ${dim('(not verified)')}`);
    for (const x of r.incomplete) say(`   ⚠️  ${yellow(`Incomplete, cannot be restored: ${x.name}`)} ${dim(`— ${x.problem}`)}`);
    say(`   ${dim('Restore with:')} ${cyan(`node labs/start.mjs restore ${lab.id} ${ex.level} --starter | --checkpoint=NAME | --backup=NAME`)}`);
    say();
    return;
  }

  if (cmd === 'diff') {
    const { lab, ex } = pickExercise();
    const { files, summary } = ws.compareTrees(ex.src, ex.sol);
    progress.set(ex.key, { peeked: true });
    say();
    say(`  🔍 ${bold(bright(`Your work vs the reference · Lab ${lab.num} · ${ex.label}`))}`);
    say(`   ${dim('The reference is one possible solution, not a byte-for-byte target. Use the differences to understand an approach.')}`);
    say(`   ${white(`${summary.changed} changed · ${summary.missing} only in the reference · ${summary.extra} only in yours · ${summary.same} identical`)}`);
    const shown = opt.file ? files.filter((f) => f.path === opt.file) : files;
    if (opt.file && !shown.length) say(`   ${dim(`No differences in ${opt.file}.`)}`);
    for (const f of shown) {
      say();
      say(`   📄 ${bold(white(f.path))} ${dim(`(${f.status === 'missing' ? 'only in the reference' : f.status === 'extra' ? 'only in yours' : 'different'})`)}`);
      if (f.note) say(`   ${dim(f.note)}`);
      for (const line of f.diff.split('\n').filter(Boolean)) {
        const color = line.startsWith('@@') ? cyan : line.startsWith('+') && !line.startsWith('+++') ? green : line.startsWith('-') && !line.startsWith('---') ? yellow : dim;
        say(`   ${color(line)}`);
      }
    }
    say();
    return;
  }

  if (cmd === 'history') {
    const { lab, ex } = pickExercise();
    const { listRuns } = await import('./agent.mjs');
    const runs = listRuns(labsDir, { labId: lab.id, level: ex.level });
    if (opt.json) { process.stdout.write(`${JSON.stringify(runs, null, 2)}\n`); return; }
    say();
    say(`  🕘 ${bold(bright(`Agent runs · Lab ${lab.num} · ${ex.label}`))}`);
    say(`   ${dim('Run folders stay on this computer and can contain generated or sensitive output; they are never uploaded or exported.')}`);
    if (!runs.length) say(`   ${dim('No agent runs yet.')}`);
    for (const r of runs) {
      say(`   ${statusIcon(r.state === 'unreadable' ? 'interrupted' : r.state)} ${white(String(r.startedAt ?? '').replace('T', ' ').slice(0, 19))} ${dim(`${r.state} · ${r.runId} · ${rel(r.dir)}`)}`);
      for (const c of r.cases ?? []) say(`       ${statusIcon(c.status)} ${c.name}${c.message ? dim(` — ${c.message.slice(0, 160)}`) : ''}`);
    }
    say();
    return;
  }

  if (cmd === 'bookmark') {
    const { ex } = pickExercise();
    progress.set(ex.key, { bookmarked: !opt.remove });
    say(`  🔖 ${opt.remove ? dim(`Bookmark removed: ${ex.key}`) : bright(`Bookmarked: ${ex.key}`)} ${dim('— list them with: node labs/start.mjs list --bookmarked')}`);
    return;
  }

  if (cmd === 'export') {
    const L = await import('./learning.mjs');
    const view = L.progressView(progress, catalog);
    const format = opt.format ?? 'md';
    try {
      const report = L.learningReport(catalog, view, { path: opt.path ?? 'all' });
      const { file } = L.writeReport(report, { dir: opt.dir ? path.resolve(opt.dir) : path.join(labsDir, '.reports'), format, name: opt.name });
      say(`  📤 ${bright('Saved')} ${cyan(file)} ${dim('— it stays on this computer; nothing was sent anywhere.')}`);
    } catch (e) {
      fail(e.message, 1);
    }
    return;
  }

  if (cmd === 'doctor') {
    const { inspectEnvironment, reportLines } = await import('./doctor.mjs');
    if (opt.lab && !catalog.some((l) => l.id === opt.lab)) fail(`There is no lab "${opt.lab}".`);
    const report = await inspectEnvironment({ rootDir, full: Boolean(opt.full), lab: opt.lab ?? null });
    if (opt.json) { process.stdout.write(`${JSON.stringify(report, null, 2)}\n`); process.exit(report.ready ? 0 : 1); }
    say();
    say(`  🧰 ${bold(bright('Setup doctor'))} ${dim('— read-only: nothing is installed, downloaded or signed in.')}`);
    say();
    reportLines(report).forEach((l) => say(`   ${l.startsWith('    →') ? dim(l) : l}`));
    say();
    say(report.ready ? `  ✅ ${bright('Ready for the workshop.')}` : `  ⚠️  ${yellow('Something the workshop needs is missing or too old.')} ${dim('Run start.cmd (Windows) or ./start.sh (macOS/Linux) to prepare tools privately, or follow the → steps.')}`);
    say();
    process.exit(report.ready ? 0 : 1);
  }

  if (cmd === 'sync-seeds') {
    const ch = await import('./chain.mjs');
    const { loadCourse, saveCourse } = await import('./course.mjs');
    const course = loadCourse(labsDir);
    const result = ch.computeChain({ catalog, course, manifest: ch.loadManifest(labsDir), bootstrap: Boolean(opt.bootstrap) });
    const dry = Boolean(opt['dry-run']);
    say();
    say(`  🔗 ${bold(bright('Sync the seeded chain'))} ${dim(dry ? '— dry run: nothing is written' : '— every level starts from the reference result of the level before it')}`);
    say();
    chainLines(result, { overrides: result.overridesFound, verbose: Boolean(opt.verbose) }).forEach((l) => say(l));
    say();
    if (result.problems.length) {
      say(`  ❌ ${red(`${result.problems.length} problem(s), so nothing was written:`)}`);
      for (const p of result.problems) wrap(`${p.key} · ${p.message}`, 96).forEach((l, i) => say(`     ${i ? '  ' : dim('• ')}${yellow(l)}`));
      say();
      process.exit(1);
    }
    const changes = result.levels.reduce((n, l) => n + l.src.write.length + l.src.remove.length + l.sol.write.length + l.sol.remove.length, 0);
    const found = Object.entries(result.overridesFound);
    if (dry) {
      say(`  👀 ${white(`${changes} file change(s)${found.length ? ` and ${found.length} level(s) with new overrides` : ''} would be written.`)} ${dim('Run again without --dry-run to do it.')}`);
      say();
      return;
    }
    if (found.length) {
      const raw = { ...course };
      delete raw.file;
      raw.levels = { ...(raw.levels ?? {}) };
      for (const [key, files] of found) raw.levels[key] = { ...(raw.levels[key] ?? {}), overrides: [...new Set([...(raw.levels[key]?.overrides ?? []), ...files])].sort() };
      raw.levels = Object.fromEntries(Object.entries(raw.levels).sort(([a], [b]) => (a < b ? -1 : 1)));
      say(`  📝 ${white('Recorded the overrides in')} ${cyan(rel(saveCourse(labsDir, raw)))}`);
    }
    const w = ch.writeChain({ labsDir, result });
    say(`  ✅ ${bright(`Wrote ${w.written} file(s), removed ${w.removed}.`)} ${w.backupDir ? `${dim('Backup:')} ${cyan(rel(w.backupDir))} ` : ''}${dim('Updated')} ${cyan(rel(ch.manifestFile(labsDir)))}${dim('. Commit them together.')}`);
    say();
    return;
  }

  if (cmd === 'verify') {
    const { runChecks } = await import('./checks.mjs');
    process.env.HARNESS_VERIFY = '1';
    const only = pos[1] ? String(pos[1]).replace(/^lab-?/i, '').padStart(2, '0') : null;
    let problems = 0;
    say();
    if (opt.chain) {
      const ch = await import('./chain.mjs');
      const { loadCourse } = await import('./course.mjs');
      const manifest = ch.loadManifest(labsDir);
      const result = ch.computeChain({ catalog, course: loadCourse(labsDir), manifest });
      say(`  🔗 ${bold(bright('Checking the chain'))} ${dim(`— ${rel(ch.manifestFile(labsDir))} and every src/ and sol/ must match the computed chain`)}`);
      say();
      const report = ch.chainIssues({ result, manifest });
      for (const x of report) {
        say(`   ${x.issues.length ? '❌' : '✅'} ${white(x.key.padEnd(22))} ${dim(x.from ? `← ${x.from}` : 'start of the chain')}`);
        for (const issue of x.issues) wrap(issue, 92).forEach((l, i) => say(`        ${i ? '  ' : dim('↳ ')}${yellow(l)}`));
      }
      const bad = report.filter((x) => x.issues.length).length;
      problems += bad;
      say();
      say(bad ? `  ❌ ${red(`The chain has drifted in ${bad} level(s).`)} ${dim('Run')} ${cyan('node labs/start.mjs sync-seeds')} ${dim('(add --dry-run to preview).')}` : `  ✅ ${bright('The chain is in sync.')}`);
      say();
    }
    say(`  🔍 ${bold(bright('Verifying the labs'))} ${dim('— every src/ should fail at least one check, every sol/ should pass them all')}`);
    say();
    for (const lab of catalog.filter((l) => !only || l.num === only)) {
      for (const ex of lab.levels) {
        const s = await runChecks({ exDir: ex.dir, target: ex.src, env: { HARNESS_VERIFY: '1' } });
        const o = await runChecks({ exDir: ex.dir, target: ex.sol, env: { HARNESS_VERIFY: '1' } });
        // Facilitator semantics (not learner completion): machine-dependent checks may be skipped here.
        const srcOk = s.complete && s.failed > 0;
        const solOk = o.complete && o.failed === 0 && o.blocked === 0 && o.passed > 0;
        if (!srcOk || !solOk) problems++;
        const skipped = o.results.filter((r) => r.status === 'skip').length;
        say(`   ${srcOk && solOk ? '✅' : '❌'} ${white(`${lab.id} ${ex.level.padEnd(6)}`)}  ${dim('src')} ${srcOk ? green(`fails ${s.failed}/${s.total}`) : red(!s.complete ? `could not run: ${s.fatal}` : 'passes - nothing to do!')}   ${dim('sol')} ${solOk ? green(`passes ${o.passed}/${o.total}`) : red(!o.complete ? `could not run: ${o.fatal}` : o.blocked ? `blocked ${o.blocked}` : `fails ${o.failed}`)}${skipped ? dim(` (${skipped} skipped)`) : ''}`);
        if (!solOk && o.complete) o.results.filter((r) => r.status === 'fail' || r.status === 'blocked').forEach((r) => say(`        ${red(r.status === 'blocked' ? 'sol blocked' : 'sol ✗')} ${r.name}: ${dim(r.message.slice(0, 220))}`));
        if (opt.verbose && s.results) s.results.filter((r) => r.status === 'fail').forEach((r) => say(`        ${dim('src ✗')} ${dim(r.name)}`));
      }
    }
    const drift = starterDrift(ws, labsDir, catalog);
    if (drift) say(`   ${drift.ok ? '✅' : '❌'} ${white('starter manifest')}  ${drift.ok ? green(drift.message) : red(`${drift.message} Rebuild it with: node labs/start.mjs starters --write`)}`);
    if (drift && !drift.ok) problems++;
    say();
    say(problems ? `  ❌ ${red(`${problems} verification problem(s) need attention.`)}` : `  ✅ ${bold(bright('All exercises verified.'))}`);
    say();
    process.exit(problems ? 1 : 0);
  }

  if (cmd === 'starters') {
    say();
    if (opt.write) {
      try {
        let previous = null;
        try { previous = JSON.parse(fs.readFileSync(ws.DEFAULT_MANIFEST, 'utf8')); } catch { /* none yet */ }
        const manifest = ws.buildStarterManifest(labsDir, catalog, { previous });
        fs.writeFileSync(ws.DEFAULT_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
        say(`  ✅ ${bright(`Wrote ${rel(ws.DEFAULT_MANIFEST)}`)} ${dim(`(${Object.keys(manifest.exercises).length} exercises from ${manifest.revision.slice(0, 12)}). Commit it with the starter changes.`)}`);
      } catch (e) { fail(e.message, 1); }
    } else {
      const drift = starterDrift(ws, labsDir, catalog);
      say(drift ? `  ${drift.ok ? '✅' : '⚠️ '} ${drift.ok ? green(drift.message) : yellow(drift.message)}` : `  ${yellow('Needs git to compare the manifest with the committed starters.')}`);
      if (drift && !drift.ok) say(`  ${dim('Rebuild it with:')} ${cyan('node labs/start.mjs starters --write')}`);
      say();
      process.exit(drift?.ok ? 0 : 1);
    }
    say();
    return;
  }

  void signature;
  void bold;
}

/** One line per level for sync-seeds: where it starts from and what would change. */
function chainLines(result, { overrides = {}, verbose = false } = {}) {
  const names = (xs) => (verbose || xs.length <= 4 ? xs.join(', ') : `${xs.slice(0, 4).join(', ')}, +${xs.length - 4} more`);
  return result.levels.map((l) => {
    const parts = [];
    if (l.src.write.length) parts.push(`src: ${names(l.src.write)}`);
    if (l.sol.write.length && names(l.sol.write) !== names(l.src.write)) parts.push(`sol: ${names(l.sol.write)}`);
    const gone = [...new Set([...l.src.remove, ...l.sol.remove])];
    if (gone.length) parts.push(`remove: ${names(gone)}`);
    if (overrides[l.key]) parts.push(`new override: ${overrides[l.key].join(', ')}`);
    const icon = l.pred ? (parts.length ? '✏️ ' : '✅') : '🌱';
    return `   ${icon} ${white(l.key.padEnd(22))} ${dim(l.pred ? `← ${l.pred.key.padEnd(22)}` : 'start of the chain'.padEnd(24))} ${parts.length ? yellow(parts.join(' · ')) : dim('in sync')}`;
  });
}

/** Facilitators: does starters.json still describe the committed src/ folders? null without git. */
function starterDrift(ws, labsDir, catalog) {
  let current;
  try { current = ws.buildStarterManifest(labsDir, catalog); } catch { return null; }
  let saved = null;
  try { saved = JSON.parse(fs.readFileSync(ws.DEFAULT_MANIFEST, 'utf8')); } catch { /* missing */ }
  if (!saved) return { ok: false, message: `${path.basename(ws.DEFAULT_MANIFEST)} is missing.` };
  const keys = new Set([...Object.keys(current.exercises), ...Object.keys(saved.exercises ?? {})]);
  const entries = (o) => JSON.stringify(Object.entries(o ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  const differ = [...keys].filter((k) => entries(current.exercises[k]) !== entries(saved.exercises?.[k]));
  return differ.length ? { ok: false, message: `out of date for ${differ.length} exercise(s): ${differ.slice(0, 5).join(', ')}${differ.length > 5 ? ', …' : ''}` } : { ok: true, message: `matches the committed starters (${keys.size} exercises).` };
}
