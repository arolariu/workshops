// Child process: runs one exercise's free checks (tests/checks.mjs) against a folder and streams
// results as "@@harness {json}" lines. Running in a child keeps a broken solution from freezing the app.
import { register } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeKit, CheckFail, commandExists, spawnCompat, copilotBin } from './kit.mjs';

register('./fake-sdk/loader.mjs', import.meta.url);

const [exDirArg, targetArg] = process.argv.slice(2);
const exDir = path.resolve(exDirArg);
const target = path.resolve(targetArg);
const emit = (o) => process.stdout.write(`@@harness ${JSON.stringify(o)}\n`);

const INSTALL = {
  copilot: 'Install GitHub Copilot CLI: npm install -g @github/copilot',
  apm: 'Install APM (Agent Package Manager): https://github.com/microsoft/apm#install',
  'gh-aw': 'Install the GitHub CLI (https://cli.github.com) and run: gh extension install github/gh-aw',
};
const available = (tool) => {
  if (tool === 'copilot') return commandExists(copilotBin());
  if (tool === 'gh-aw') return commandExists('gh') && spawnCompat('gh', ['aw', 'version'], { timeout: 20000 }).status === 0;
  return commandExists(tool);
};

const kit = makeKit({ dir: target, exDir });
let checks;
try {
  const mod = await import(pathToFileURL(path.join(exDir, 'tests', 'checks.mjs')).href);
  checks = typeof mod.default === 'function' ? await mod.default(kit) : mod.default;
} catch (e) {
  emit({ type: 'fatal', message: `Could not load the checks: ${e.message}` });
  process.exit(0);
}

emit({ type: 'plan', total: checks.length, names: checks.map((c) => c.name) });
for (const [idx, c] of checks.entries()) {
  emit({ type: 'start', idx, name: c.name });
  let status = 'pass';
  let message = '';
  const missing = (c.needs ?? []).find((n) => !available(n));
  if (missing) {
    status = c.optional ? 'skip' : 'fail';
    message = `${c.optional ? 'Skipped: this optional check needs' : 'This check needs'} \`${missing}\`. ${INSTALL[missing] ?? ''}`;
  } else if (process.env.HARNESS_VERIFY === '1' && c.env) {
    status = 'skip';
    message = 'Depends on your machine (skipped in verify mode).';
  } else {
    const limit = c.timeout ?? 60000;
    try {
      const res = await Promise.race([
        Promise.resolve().then(() => c.run()),
        new Promise((_, reject) => setTimeout(() => reject(new CheckFail(`This check took longer than ${limit / 1000}s.`)), limit)),
      ]);
      if (typeof res === 'string') { status = 'fail'; message = res; }
      else if (res === false) { status = 'fail'; message = c.hint ?? 'Not there yet.'; }
    } catch (e) {
      status = 'fail';
      message = e instanceof CheckFail || e?.constructor?.name === 'CheckFail' ? e.message : `The check crashed: ${e?.message ?? e}`;
    }
  }
  emit({ type: 'result', idx, name: c.name, status, message, optional: Boolean(c.optional) });
}
emit({ type: 'done' });
process.exit(0);
