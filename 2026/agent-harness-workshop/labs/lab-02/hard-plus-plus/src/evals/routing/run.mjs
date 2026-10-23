#!/usr/bin/env node
// The routing eval: send every request in requests.json, see which skill loads, report precision and recall.
//   node evals/routing/run.mjs                           the lexical pre-check (free, instant, deterministic)
//   node evals/routing/run.mjs --real --max-credits 2    real Copilot runs: read-only, capped per request
//                                                        (more than 3 credits a request needs --yes too)
// Writes evals/routing/results.json and report.md (lexical), or results-real.json and report-real.md (real).
// Given: askCopilot() (one real run). Your work: TODO(M4) realArgs() and main().
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
  // TODO(M4): -p <request>, -s, --no-ask-user, --max-ai-credits=<credits>, and deny the write and shell tools.
  return ['-p', request];
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
  // TODO(M4): without --real: route() each request over library(skills) → { id, request, expect, got: [name] or [] }.
  // With --real: return 2 unless --max-credits <n> (a positive integer) is given, and unless --yes is given when n is
  // over 3; say the ceiling (requests × n); then got = canaries(await ask(request, { credits: n, cwd: root })).
  // Never call askCopilot() yourself: use the `ask` you're given (the checks pass a fake one). Finally metrics(),
  // report(), and write results(-real).json and report(-real).md into evals/routing/; log the report; return 0.
  log(`TODO: the eval runner (${requests.length} requests, ${skills.length} skills).`);
  return 0;
}

const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } };
if (isMain()) process.exitCode = await main(process.argv.slice(2));
