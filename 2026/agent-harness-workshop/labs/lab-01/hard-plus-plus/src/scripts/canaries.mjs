#!/usr/bin/env node
// 🐤 The canary regression suite: does every package still load its own rules, on top of the shared baseline?
//   node scripts/canaries.mjs --dry-run              the commands, one per case (free)
//   node scripts/canaries.mjs --from answers.json    score recorded answers, { "<case id>": "<answer>" } (free)
//   node scripts/canaries.mjs [--only <id>]          run Copilot once per case: 1 prompt each, capped (AI credits!)
// Exit 0 when every case passes, 1 when one fails, 2 when the suite can't run. Live results go to runs/canaries.json.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SUITE = 'evals/canaries.json';

/**
 * Score one answer: every `expect` string must be in it and no `forbid` string may be (case doesn't matter).
 * @param {{ id: string, expect?: string[], forbid?: string[] }} kase
 * @param {string} answer
 * @returns {{ id: string, pass: boolean, missing: string[], leaked: string[] }}
 */
export function score(kase, answer) {
  // TODO(M5): every expect string in the answer, no forbid string in it; case doesn't matter.
  return { id: kase.id, pass: false, missing: [...(kase.expect ?? [])], leaked: [] };
}

// ---------- you don't need to change anything below this line ----------

/** The suite in evals/canaries.json: { prompt, cases: [{ id, cwd, expect, forbid }] }, or null when there is none. */
export function loadSuite(root) {
  const file = path.join(root, SUITE);
  if (!fs.existsSync(file)) return null;
  const suite = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (typeof suite?.prompt !== 'string' || !Array.isArray(suite.cases)) throw new Error(`${SUITE} needs { "prompt": "…", "cases": [] }`);
  return suite;
}

/** Arguments for one read-only, capped run. */
export const buildArgs = (prompt) => ['-p', prompt, '-s', '--no-ask-user', '--max-ai-credits=30', '--deny-tool=write', '--deny-tool=shell'];

function runCopilot(args, cwd) {
  const opts = { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 };
  let r = spawnSync('copilot', args, opts);
  if (r.error?.code === 'ENOENT' && process.platform === 'win32') {
    const q = (a) => (/^[\w\-./:=@,]+$/.test(a) ? a : `"${a.replace(/"/g, '""')}"`);
    r = spawnSync('copilot', args.map(q), { ...opts, shell: true });
  }
  return r;
}

function table(results) {
  for (const r of results) {
    const why = [...r.missing.map((m) => `missing "${m}"`), ...r.leaked.map((l) => `leaked "${l}"`)].join('; ');
    console.log(`   ${r.pass ? '✅' : '❌'} ${r.id.padEnd(10)} ${why}`);
  }
  const failed = results.filter((r) => !r.pass).length;
  console.log(failed ? `\n   ${failed} of ${results.length} case(s) failed.\n` : `\n   All ${results.length} case(s) passed.\n`);
  return failed ? 1 : 0;
}

function main(argv) {
  const value = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const bad = argv.find((a, i) => a.startsWith('--') && !['--dry-run', '--from', '--only'].includes(a) && !['--from', '--only'].includes(argv[i - 1]));
  if (bad) {
    console.error(`Unknown option ${bad}. Usage: node scripts/canaries.mjs [--dry-run] [--only <id>] | --from <answers.json>`);
    return 2;
  }
  const root = process.cwd();
  let suite;
  try { suite = loadSuite(root); } catch (e) { console.error(e.message); return 2; }
  if (!suite?.cases.length) { console.error(`${SUITE} has no cases yet.`); return 2; }
  const only = value('--only');
  const cases = suite.cases.filter((c) => !only || c.id === only);
  if (!cases.length) { console.error(`No case "${only}" in ${SUITE}.`); return 2; }
  console.log(`\n🐤 Canaries: "${suite.prompt}" · ${cases.length} case(s)\n`);

  if (argv.includes('--from')) {
    let answers;
    try { answers = JSON.parse(fs.readFileSync(path.resolve(root, value('--from') ?? ''), 'utf8')); } catch (e) { console.error(`Could not read ${value('--from')}: ${e.message}`); return 2; }
    return table(cases.map((c) => score(c, answers[c.id])));
  }
  if (argv.includes('--dry-run')) {
    const shown = buildArgs(suite.prompt).map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ');
    for (const c of cases) console.log(`   copilot ${shown}\n      ↳ ${c.id}: runs in ${c.cwd}`);
    return 0;
  }
  const results = [];
  fs.rmSync(path.join(root, 'runs', 'canaries.json'), { force: true });
  for (const c of cases) {
    process.stdout.write(`   ⏳ ${c.id.padEnd(10)} in ${c.cwd}… `);
    const r = runCopilot(buildArgs(suite.prompt), path.resolve(root, c.cwd));
    if (r.status !== 0) {
      console.log('❌');
      console.error((r.stderr || r.stdout || r.error?.message || '').trim().slice(0, 400));
      return 2;
    }
    results.push({ ...score(c, r.stdout), cwd: c.cwd, answer: r.stdout.trim() });
    console.log('done');
  }
  fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'runs', 'canaries.json'), `${JSON.stringify({ prompt: suite.prompt, results }, null, 2)}\n`);
  console.log('');
  const code = table(results);
  console.log('   Saved to runs/canaries.json\n');
  return code;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.exitCode = main(process.argv.slice(2));
