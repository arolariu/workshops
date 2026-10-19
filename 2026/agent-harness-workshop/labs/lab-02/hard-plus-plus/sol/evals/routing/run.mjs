#!/usr/bin/env node
// The routing eval: send every request in requests.json, see which skill loads, report precision and recall.
//   node evals/routing/run.mjs                           the lexical pre-check (free, instant, deterministic)
//   node evals/routing/run.mjs --real --max-credits 2    real Copilot runs: read-only, capped per request
// Writes evals/routing/results.json and report.md (lexical), or results-real.json and report-real.md (real).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSkills, library, route } from './route.mjs';
import { canaries, metrics, report } from './metrics.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const winQuote = (a) => (/^[\w\-./:=@,]+$/.test(a) ? a : `"${String(a).replace(/"/g, '""')}"`);

/** The copilot arguments for one request: a prompt, no questions, read-only, and a credit cap. */
export function realArgs(request, { credits }) {
  return ['-p', request, '-s', '--no-ask-user', `--max-ai-credits=${credits}`, '--deny-tool=write', '--deny-tool=shell'];
}

/** One real run in this folder (skills only load in a trusted folder): Copilot's answer as text. */
export function askCopilot(request, { credits, cwd }) {
  const bin = process.env.HARNESS_COPILOT || 'copilot';
  const args = realArgs(request, { credits });
  const opts = { cwd, encoding: 'utf8', timeout: 300000, windowsHide: true };
  let r = spawnSync(bin, args, opts);
  if (r.error?.code === 'ENOENT' && process.platform === 'win32') r = spawnSync(bin, args.map(winQuote), { ...opts, shell: true });
  if (r.error) throw new Error(`Could not run ${bin}: ${r.error.message}`);
  return `${r.stdout ?? ''}`;
}

export async function main(argv, { ask = askCopilot, root = path.resolve(HERE, '..', '..'), log = console.log } = {}) {
  const requests = JSON.parse(fs.readFileSync(path.join(root, 'evals', 'routing', 'requests.json'), 'utf8'));
  const skills = loadSkills(root);
  const real = argv.includes('--real');
  const at = argv.indexOf('--max-credits');
  const credits = at >= 0 ? Number(argv[at + 1]) : NaN;
  if (real && !(Number.isInteger(credits) && credits > 0)) {
    log('A real run spends AI credits: add --max-credits <n>, the cap for each request (for example --max-credits 2).');
    return 2;
  }
  const results = [];
  if (real) {
    log(`Real run: ${requests.length} requests, at most ${credits} AI credits each (${requests.length * credits} at most in total).`);
    for (const r of requests) {
      const got = canaries(await ask(r.request, { credits, cwd: root }));
      results.push({ id: r.id, request: r.request, expect: r.expect, got });
      log(`  ${r.id} → ${got.join(' + ') || 'no skill'}`);
    }
  } else {
    const lib = library(skills);
    for (const r of requests) {
      const name = route(r.request, lib);
      results.push({ id: r.id, request: r.request, expect: r.expect, got: name ? [name] : [] });
    }
  }
  const md = report(metrics(results, skills.map((s) => s.name)), { mode: real ? 'real' : 'lexical' });
  const suffix = real ? '-real' : '';
  const dir = path.join(root, 'evals', 'routing');
  fs.writeFileSync(path.join(dir, `results${suffix}.json`), `${JSON.stringify(results, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, `report${suffix}.md`), md);
  log(md);
  return 0;
}

const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } };
if (isMain()) process.exitCode = await main(process.argv.slice(2));
