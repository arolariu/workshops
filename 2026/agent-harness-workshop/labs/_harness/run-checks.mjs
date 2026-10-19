// Child process: runs one exercise's free checks (tests/checks.mjs) against a folder and streams
// results as "@@harness <token> {json}" lines. Running in a child keeps a broken solution from freezing the app.
// The token arrives on stdin before any learner code loads, so learner output cannot pass for a grader event.
// Statuses: pass | fail | blocked (a required tool is missing) | skip (optional or machine-dependent).
import { register } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeKit, CheckFail, commandExists, spawnCompat, copilotBin } from './kit.mjs';
import { recoveryFor } from './doctor.mjs';

register('./fake-sdk/loader.mjs', import.meta.url);

const [exDirArg, targetArg] = process.argv.slice(2);
const exDir = path.resolve(exDirArg);
const target = path.resolve(targetArg);
// Captured before learner code runs: patching process.stdout, fs or JSON later cannot read or rewrite events.
const { writeSync } = fs;
const stringify = JSON.stringify;
// Blocking stdout keeps learner output and grader events in order, and nothing queued is lost at exit.
process.stdout._handle?.setBlocking?.(true);
const token = await new Promise((resolve) => {
  let text = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => { text += d; });
  process.stdin.on('end', () => resolve(text.trim()));
  process.stdin.on('error', () => resolve(''));
});
process.stdin.destroy();
// Each event starts on its own line even when learner output did not end with a newline; the parent drops that separator.
const emit = (o) => {
  const bytes = Buffer.from(`\n@@harness ${token} ${stringify(o)}\n`);
  for (let off = 0; off < bytes.length;) {
    try { off += writeSync(1, bytes, off); } catch (e) { if (e.code !== 'EAGAIN') throw e; }
  }
};

const available = (tool) => {
  if (tool === 'copilot') return commandExists(copilotBin());
  if (tool === 'gh-aw') return commandExists('gh') && spawnCompat('gh', ['aw', 'version'], { timeout: 20000 }).status === 0;
  return commandExists(tool);
};

const jsonSafe = (v) => {
  try { return JSON.parse(JSON.stringify(v)); } catch { return String(v); }
};
/** Only the evidence a check actually supplied: never invent expected/actual values. */
function evidence(src) {
  const detail = {};
  if (src && typeof src === 'object') {
    if (Object.hasOwn(src, 'expected')) detail.expected = jsonSafe(src.expected);
    if (Object.hasOwn(src, 'actual')) detail.actual = jsonSafe(src.actual);
  }
  return detail;
}
/** Files a check names: declared ones, plus `backticked` paths in its message that exist in the folder. */
function filesFor(c, message, supplied) {
  const named = [...String(message).matchAll(/`([^`\s]+\.[A-Za-z0-9]+)`/g)].map((m) => m[1]);
  const declared = [...(Array.isArray(supplied) ? supplied : []), ...(Array.isArray(c.files) ? c.files : [])];
  const inside = (f) => {
    const abs = path.resolve(target, f);
    const rel = path.relative(target, abs);
    return rel && !rel.startsWith('..') && !path.isAbsolute(rel) && fs.existsSync(abs);
  };
  return [...new Set([...declared.map(String), ...named.filter(inside)])];
}

const kit = makeKit({ dir: target, exDir });
let checks;
try {
  const mod = await import(pathToFileURL(path.join(exDir, 'tests', 'checks.mjs')).href);
  checks = typeof mod.default === 'function' ? await mod.default(kit) : mod.default;
  if (!Array.isArray(checks)) throw new Error('tests/checks.mjs must export a list of checks.');
} catch (e) {
  emit({ type: 'fatal', message: `Could not load the checks: ${e.message}` });
  process.exit(0);
}

emit({ type: 'plan', total: checks.length, names: checks.map((c) => String(c.name)), milestones: checks.map((c) => (typeof c.milestone === 'string' && c.milestone ? c.milestone : null)) });
for (const [idx, c] of checks.entries()) {
  const limit = c.timeout ?? 60000;
  emit({ type: 'start', idx, name: String(c.name), timeout: limit });
  let status = 'pass';
  let message = '';
  let detail = {};
  let supplied = [];
  let needs = null;
  const missing = (c.needs ?? []).find((n) => !available(n));
  if (missing) {
    needs = missing;
    status = c.optional ? 'skip' : 'blocked';
    message = `${c.optional ? 'Skipped: this optional check needs' : 'Blocked: this check needs'} \`${missing}\`, which is not available. ${recoveryFor(missing)}`;
  } else if (process.env.HARNESS_VERIFY === '1' && c.env) {
    status = 'skip';
    message = 'Depends on your machine (skipped in verify mode).';
  } else {
    let timer;
    try {
      const res = await Promise.race([
        Promise.resolve().then(() => c.run()),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new CheckFail(`This check took longer than ${limit / 1000}s.`)), limit); }),
      ]);
      if (typeof res === 'string') { status = 'fail'; message = res; }
      else if (res === false) { status = 'fail'; message = c.hint ?? 'Not there yet.'; }
      else if (res && typeof res === 'object' && res.ok === false) {
        status = 'fail';
        message = String(res.message ?? c.hint ?? 'Not there yet.');
        detail = evidence(res);
        supplied = res.files;
      }
    } catch (e) {
      status = 'fail';
      const known = e instanceof CheckFail || e?.constructor?.name === 'CheckFail';
      message = known ? e.message : `The check crashed: ${e?.message ?? e}`;
      if (known) { detail = evidence(e.detail); supplied = e.detail?.files; }
    } finally {
      clearTimeout(timer);
    }
  }
  emit({ type: 'result', idx, name: String(c.name), status, message, optional: Boolean(c.optional), milestone: typeof c.milestone === 'string' && c.milestone ? c.milestone : null, ...(needs ? { needs } : {}), detail, files: status === 'pass' ? [] : filesFor(c, message, supplied) });
}
emit({ type: 'done' });
process.exit(0);
