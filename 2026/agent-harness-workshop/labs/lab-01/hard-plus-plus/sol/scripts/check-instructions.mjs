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
  const r = lint(root);
  const out = r.findings.map((f) => finding(f.check, f.file, f.line, f.message));
  if (r.always > r.budget.always) out.push(finding('budget', 'AGENTS.md', 1, `every turn costs ≈${r.always} tokens (budget ${r.budget.always})`));
  for (const p of r.paths.filter((x) => x.tokens > r.budget.path)) out.push(finding('budget', p.path, 1, `≈${p.tokens} tokens for this path (budget ${r.budget.path})`));
  return out;
}

// ---------- M3 · Drift and coverage ----------

/**
 * Instructions that no longer match the repository: a file name in `code` that doesn't exist, an applyTo that matches
 * no file, a nested AGENTS.md whose canary names another folder, a suite case expecting a canary no AGENTS.md on its
 * path says.
 */
export function drift(root) {
  const out = [];
  const files = new Set(listFiles(root));
  for (const s of instructionSources(root)) {
    const text = read(root, s.path);
    for (const r of parseRules(text, s.path)) {
      for (const [, span] of r.text.matchAll(/`([^`]+)`/g)) {
        const p = span.trim();
        if (!/^[\w./-]+\.(js|mjs|cjs|json|md)$/.test(p)) continue;
        if (!files.has(p.replace(/^\.\//, '')) && !files.has(path.posix.join(path.posix.dirname(s.path), p))) out.push(finding('drift', s.path, r.line, `\`${p}\` doesn't exist`));
      }
    }
    if (s.path.startsWith('.github/instructions/') && s.applyTo?.length && ![...files].some((f) => s.applyTo.some((g) => matches(g, f)))) {
      out.push(finding('drift', s.path, 1, `applyTo ${s.applyTo.join(',')} matches no file, so this file never loads`));
    }
    if (/\/AGENTS\.md$/.test(s.path)) {
      const folder = path.posix.basename(path.posix.dirname(s.path));
      const m = text.match(CANARY);
      if (m && m[1].trim().toLowerCase() !== folder.toLowerCase()) out.push(finding('drift', s.path, text.slice(0, m.index).split('\n').length, `the canary says "${m[1]}", but this is ${folder}`));
    }
  }
  for (const c of loadSuite(root)?.cases ?? []) {
    const own = c.cwd === '.' ? 'AGENTS.md' : `${c.cwd}/AGENTS.md`;
    const said = ['AGENTS.md', own].filter((f) => files.has(f)).map((f) => read(root, f).toLowerCase()).join('\n');
    for (const e of c.expect ?? []) {
      if (!said.includes(String(e).toLowerCase())) out.push(finding('drift', SUITE, 1, `case "${c.id}" expects "${e}", but no AGENTS.md on its path (${c.cwd}) says it`));
    }
  }
  return out;
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

/** Every package has an AGENTS.md and a suite case; every instruction file and skill has an owner in CODEOWNERS. */
export function coverage(root) {
  const out = [];
  const files = new Set(listFiles(root));
  const suite = loadSuite(root);
  for (const p of packagesOf(root)) {
    if (!files.has(`${p}/AGENTS.md`)) out.push(finding('coverage', `${p}/package.json`, 1, `${p} has no AGENTS.md: its rules live nowhere`));
    if (!suite) out.push(finding('coverage', SUITE, 1, `no ${SUITE}: nothing proves that ${p}'s rules load`));
    else if (!suite.cases.some((c) => c.cwd === p)) out.push(finding('coverage', SUITE, 1, `no canary case runs in ${p}`));
  }
  const co = ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS'].find((f) => files.has(f));
  const owned = [...instructionSources(root).map((s) => s.path), ...[...files].filter((f) => /^\.(github|agents|claude)\/skills\/[^/]+\/SKILL\.md$/.test(f))];
  if (!co) out.push(finding('owner', '.github/CODEOWNERS', 1, 'no CODEOWNERS: a change to the instructions needs nobody\'s review'));
  else for (const f of owned) if (!ownersOf(read(root, co), f).length) out.push(finding('owner', f, 1, `${f} has no owner in ${co}`));
  return out;
}

// ---------- M4 · Owners ----------

/**
 * Who owns a file, by CODEOWNERS rules: the last matching line wins, and a line without owners leaves the file
 * unowned. Patterns work like .gitignore: "/x" is anchored at the root, a pattern with a "/" in the middle too;
 * "x/" is a folder and everything in it; "*" stays inside one folder; a pattern without a "/" matches at any depth.
 * @returns {string[]}
 */
export function ownersOf(codeowners, file) {
  let owners = [];
  for (const raw of String(codeowners).replace(/\r/g, '').split('\n')) {
    const line = raw.replace(/(^|\s)#.*$/, '').trim();
    if (!line) continue;
    const [pattern, ...who] = line.split(/\s+/);
    if (ownsPath(pattern, file)) owners = who;
  }
  return owners;
}
function ownsPath(pattern, file) {
  const dir = pattern.endsWith('/');
  let p = pattern.replace(/^\//, '').replace(/\/$/, '');
  if (!pattern.startsWith('/') && !p.includes('/')) p = `**/${p}`;
  if (dir) return matches(`${p}/**`, file);
  return matches(p, file) || (!/[*?]/.test(p.split('/').pop()) && matches(`${p}/**`, file));
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

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.exitCode = main(process.argv.slice(2));
