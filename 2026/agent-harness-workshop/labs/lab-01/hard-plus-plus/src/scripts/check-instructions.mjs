#!/usr/bin/env node
// 🏛️ The instructions gate for CI: lint, drift and coverage for every instruction file of the workspace.
//   node scripts/check-instructions.mjs            exit 0 = clean, 1 = errors, 2 = the gate itself failed
//   node scripts/check-instructions.mjs --strict   warnings (vague rules, duplicates, budget) fail too
//   node scripts/check-instructions.mjs --json     { ok, code, findings }
// It runs in any folder: without packages, it skips the package checks and says so.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lint, parseRules } from './lint-instructions.mjs';
import { instructionSources, listFiles, matches } from './which-instructions.mjs';
import { loadSuite, SUITE } from './canaries.mjs';

/** How bad each kind of finding is: warnings fail only with --strict. */
export const SEVERITY = { vague: 'warning', duplicate: 'warning', budget: 'warning', contradiction: 'error', command: 'error', drift: 'error', coverage: 'error', owner: 'error' };
const CANARY = /Harness check: (.+?) rules loaded/i;
const read = (root, f) => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const finding = (check, file, line, message) => ({ check, severity: SEVERITY[check], file, line, message });

// ---------- M2 · The gate ----------

/** lint() from lint-instructions.mjs as findings with a severity, plus a warning for every budget it blows. */
export function lintAll(root) {
  // TODO(M2): lint(root) gives { findings, always, paths, budget }: give every finding its SEVERITY, and add a
  // "budget" warning when the always-on files or a path cost more than the budget.
  return [];
}

// ---------- M3 · Drift and coverage ----------

/**
 * Instructions that no longer match the repository: a file name in `code` that doesn't exist, an applyTo that matches
 * no file, a nested AGENTS.md whose canary names another folder, a suite case expecting a canary no AGENTS.md on its
 * path says.
 */
export function drift(root) {
  // TODO(M3): four kinds of drift (see the comment above). instructionSources(), parseRules(), listFiles(),
  // matches() and loadSuite() do the reading for you.
  return [];
}

/** The packages: folders with a package.json that match the root's "workspaces" (default: packages/*). */
export function packagesOf(root) {
  let globs = ['packages/*'];
  try {
    const ws = JSON.parse(read(root, 'package.json')).workspaces;
    if (Array.isArray(ws) && ws.length) globs = ws;
  } catch { /* no package.json, or no workspaces: the default */ }
  return [...new Set(listFiles(root).filter((f) => f.endsWith('/package.json')).map((f) => path.posix.dirname(f)).filter((d) => globs.some((g) => matches(g, d))))].sort();
}

/**
 * Every package has an AGENTS.md and a suite case; in a workspace with instruction files, every instruction file and
 * skill has an owner in CODEOWNERS. Without packages (the later labs, where this gate travels) there is nothing to
 * cover, and owners are that level's business: no findings.
 */
export function coverage(root) {
  // TODO(M3): a package without AGENTS.md or without a suite case; in a workspace with instruction files, an
  // instruction file or skill without an owner (ownersOf() from M4), or no CODEOWNERS at all.
  return [];
}

// ---------- M4 · Owners ----------

/**
 * Who owns a file, by CODEOWNERS rules: the last matching line wins, and a line without owners leaves the file
 * unowned. Patterns work like .gitignore: "/x" is anchored at the root, a pattern with a "/" in the middle too;
 * "x/" is a folder and everything in it; "*" stays inside one folder; a pattern without a "/" matches at any depth.
 * @returns {string[]}
 */
export function ownersOf(codeowners, file) {
  // TODO(M4): go through the lines in order; the last pattern that matches wins. Turn each pattern into a glob for
  // matches() (from which-instructions.mjs) by the .gitignore rules above.
  return [];
}

// ---------- you don't need to change anything below this line ----------

/** Run every check: { code: 0 | 1, findings }. */
export function check(root, { strict = false } = {}) {
  const findings = [...lintAll(root), ...drift(root), ...coverage(root)];
  const fails = findings.filter((f) => f.severity === 'error' || strict);
  return { code: fails.length ? 1 : 0, findings };
}

function main(argv) {
  const bad = argv.find((a) => !['--strict', '--json'].includes(a));
  if (bad) {
    console.error(`Unknown option ${bad}. Usage: node scripts/check-instructions.mjs [--strict] [--json]`);
    return 2;
  }
  const root = process.cwd();
  let result;
  try { result = check(root, { strict: argv.includes('--strict') }); } catch (e) {
    console.error(`The gate itself failed: ${e.message}`);
    return 2;
  }
  const { code, findings } = result;
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ ok: code === 0, code, findings }, null, 2));
    return code;
  }
  const pkgs = packagesOf(root);
  console.log(`\n🏛️ Instructions gate · ${pkgs.length ? `packages: ${pkgs.join(', ')}` : 'no packages here: package checks skipped'}\n`);
  for (const f of findings) console.log(`   ${f.severity.padEnd(8)} ${f.check.padEnd(13)} ${f.file}:${f.line}  ${f.message}`);
  const errors = findings.filter((f) => f.severity === 'error').length;
  console.log(`\n   ${code ? '❌' : '✅'} ${errors} error(s), ${findings.length - errors} warning(s)${argv.includes('--strict') ? ' (strict: warnings count)' : ''} → exit ${code}\n`);
  return code;
}

// Real paths: a symlinked temp folder, a junction or an 8.3 short path must not make the script silently do nothing.
const isMain = (() => {
  try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isMain) process.exitCode = main(process.argv.slice(2));
