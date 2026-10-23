#!/usr/bin/env node
// The scorecard gate: this harness's maturity level, from the same scorecard the X-ray shows.
//
//   node scripts/harness-check.mjs [--min L4] [--json] [--scorecard <file>]
//
// The scorecard is the workshop's labs/_harness/scorecard.mjs. This script finds it, in this order: --scorecard
// <file>, the HARNESS_SCORECARD environment variable, or by walking up from this harness to a folder that has
// labs/_harness/scorecard.mjs (inside the workshop). Your own repository's CI checks the workshop's labs/_harness
// out at a pinned commit and sets HARNESS_SCORECARD (see .github/workflows/harness-ci.yml).
//
// Exit codes: 0 the level is --min (L4 when left out) or better, 1 below it, 2 no scorecard or bad arguments.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'];
export class UsageError extends Error {}

/** The scorecard module's path, or null when there is none to find. */
export function findScorecard({ scorecard, env = process.env, from = ROOT } = {}) {
  if (scorecard) return path.resolve(scorecard);
  if (env.HARNESS_SCORECARD) return path.resolve(env.HARNESS_SCORECARD);
  for (let dir = path.resolve(from); ; dir = path.dirname(dir)) {
    const file = path.join(dir, 'labs', '_harness', 'scorecard.mjs');
    if (fs.existsSync(file)) return file;
    if (path.dirname(dir) === dir) return null;
  }
}

/**
 * Scores the harness in `root`.
 * @returns {Promise<{ level: string, name: string, min: string, ok: boolean, failing: object[], problems: string[], scorecard: string }>}
 */
export async function harnessCheck(root = ROOT, { min = 'L4', scorecard, env = process.env } = {}) {
  if (!LEVELS.includes(min)) throw new UsageError(`--min must be one of ${LEVELS.join(', ')}, not "${min}".`);
  const file = findScorecard({ scorecard, env, from: root });
  if (!file || !fs.existsSync(file)) {
    throw new UsageError(`No scorecard${file ? ` at ${file}` : ''}. Outside the workshop, pass --scorecard <file> or set HARNESS_SCORECARD to the workshop's labs/_harness/scorecard.mjs.`);
  }
  let sc;
  try { sc = await import(pathToFileURL(file).href); } catch (e) { throw new UsageError(`The scorecard at ${file} could not be loaded: ${e.message.split('\n')[0]}`); }
  const scan = sc.scanHarness(root);
  const rules = sc.scorecard(scan);
  const m = sc.maturity(rules, scan);
  return {
    level: m.level,
    name: m.name,
    min,
    ok: LEVELS.indexOf(m.level) >= LEVELS.indexOf(min),
    failing: rules.filter((r) => r.ok === false).map(({ id, layer, level, message }) => ({ id, layer, level, message })),
    problems: scan.problems ?? [],
    scorecard: file,
  };
}

/** The report as text: one line for the level, one per failing rule. */
export function report(r) {
  const lines = [`Scorecard: ${r.level} ${r.name} (the gate needs ${r.min} or better) ${r.ok ? '✓' : '✗'}`];
  for (const f of r.failing) lines.push(`  ✗ ${f.id} (${f.layer}, ${f.level}): ${f.message}`);
  for (const p of r.problems) lines.push(`  ! ${p}`);
  if (!r.failing.length && !r.problems.length) lines.push('  every rule passes');
  return lines.join('\n');
}

async function main(argv) {
  const value = (flag) => {
    const i = argv.indexOf(flag);
    if (i < 0) return undefined;
    if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new UsageError(`${flag} needs a value.`);
    return argv[i + 1];
  };
  const known = new Set(['--min', '--json', '--scorecard']);
  const unknown = argv.filter((a, i) => a.startsWith('--') && !known.has(a) && !(i > 0 && ['--min', '--scorecard'].includes(argv[i - 1])));
  if (unknown.length) throw new UsageError(`Unknown option: ${unknown.join(', ')}`);
  const r = await harnessCheck(ROOT, { min: value('--min') ?? 'L4', scorecard: value('--scorecard') });
  console.log(argv.includes('--json') ? JSON.stringify(r, null, 2) : report(r));
  return r.ok ? 0 : 1;
}

const sameFile = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
if (process.argv[1] && sameFile(process.argv[1], fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => {
    console.error(e instanceof UsageError ? e.message : e.stack);
    process.exitCode = 2;
  });
}
