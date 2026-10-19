#!/usr/bin/env node
// 🪙 The context diet: what do your instruction files cost on every turn, and what in them is noise?
//   node scripts/lint-instructions.mjs                        findings and ≈tokens per path (exit 1: findings or over budget)
//   node scripts/lint-instructions.mjs --json                 the same, as JSON
//   node scripts/lint-instructions.mjs --inventory [file]     a RULES-INVENTORY.md table, one row per rule of the file
//                                                             (default: .github/copilot-instructions.md)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { instructionSources, applicable, listFiles } from './which-instructions.mjs';

/** ≈tokens the always-on files may cost, and the most any single path may cost (always-on + scoped). */
export const BUDGET = { always: 600, path: 900 };
/** Words that sound like a rule but give the agent nothing to check (they also match as a prefix: careful → carefully). */
export const VAGUE = ['clean', 'best practice', 'careful', 'readable', 'nice', 'proper', 'appropriate', 'good', 'simple', 'small', 'as needed', 'up to date', 'high quality', 'robust', 'elegant', 'sensible', 'reasonable'];
/** Words that carry no meaning of their own; words() leaves them out. Negations (no, not, never) stay. */
export const STOPWORDS = new Set(['a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'and', 'or', 'for', 'with', 'is', 'are', 'be', 'it', 'its', 'this', 'that', 'these', 'those', 'by', 'as', 'from', 'you', 'your', 'we', 'our', 'us', 'any', 'all', 'please', 'always', 'just', 'so', 'if', 'then', 'than', 'do', 'does', 'will', 'can', 'should', 'must']);
/** Topics where two rules can say different things. Extend it when you find a new kind of conflict. */
export const TOPICS = [
  { id: 'indent', re: /\b(\d+)[- ]space/i, value: (m) => m[1] },
  { id: 'quotes', re: /\b(single|double)[- ]quot/i, value: (m) => m[1].toLowerCase() },
  { id: 'decimals', re: /\b(\d+|one|two|three)\s+decimals?\b/i, value: (m) => ({ one: '1', two: '2', three: '3' })[m[1].toLowerCase()] ?? m[1] },
  { id: 'runner', re: /\b(node:test|jest|mocha|vitest)\b/i, value: (m) => m[1].toLowerCase() },
];

// ---------- M1 · Find the noise ----------

/**
 * Rules that use a VAGUE word and give nothing concrete to check: no `code`, no digit, no file name (name.js, x.md…).
 * @returns {{ file, line, text, word }[]} in the order of `rules`
 */
export function findVague(rules) {
  // TODO(M1): for every rule without `code`, a digit or a file name, find the first VAGUE word it uses.
  return [];
}

/**
 * Pairs of rules that say the same thing: the Jaccard similarity of their words() is at least 0.6, and they can be in
 * the context together (inContextTogether()).
 * @returns {{ a, b, similarity }[]} a comes before b in `rules`; similarity rounded to 2 decimals
 */
export function findDuplicates(rules) {
  // TODO(M1): compare every pair once (i < j) that is inContextTogether(); similarity = |both| / |either| of words().
  return [];
}

// ---------- M2 · Conflicts and wrong commands ----------

/**
 * For every topic in TOPICS: do two rules that can be in the context together give it different values?
 * @returns {{ topic, values, rules }[]} values sorted; rules = every rule in a clash, in order, each with its `value`
 */
export function findContradictions(rules) {
  // TODO(M2): per topic, the rules that match topic.re, with value = topic.value(match); report a topic when two of
  // them that are inContextTogether() disagree.
  return [];
}

/**
 * Commands in `code` that don't work here: `npm test` / `npm start` / `npm run <x>` without that script in the nearest
 * package.json (scriptsOf(file) gives its "scripts"), and any `yarn …` or `pnpm …` (this project uses npm).
 * @returns {{ file, line, command, why }[]}
 */
export function findBadCommands(rules, scriptsOf) {
  // TODO(M2): look at every `code span` of every rule.
  return [];
}

// ---------- M3 · Count the cost ----------

/**
 * For every path: the instruction files Copilot adds when the agent works on it (which-instructions.mjs), and their
 * ≈tokens together (tokens() of each whole file).
 * @returns {{ path, files: string[], tokens: number }[]} in the order of `paths`
 */
export function tokensPerPath(root, paths) {
  // TODO(M3): instructionSources(root), applicable(sources, path), tokens() of each file's text.
  return paths.map((p) => ({ path: p, files: [], tokens: 0 }));
}

// ---------- you don't need to change anything below this line ----------

/** ≈tokens: characters ÷ 4 (rounded up), line endings counted as one character. Real tokenizers differ a little. */
export const tokens = (text) => Math.ceil(String(text ?? '').replace(/\r\n/g, '\n').length / 4);

/** Lowercase words (a–z, 0–9) without STOPWORDS: "Use `node:test`!" → { "use", "node", "test" }. */
export function words(text) {
  return new Set(String(text).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !STOPWORDS.has(w)));
}

/** Is this file sent on every turn? */
export const alwaysOn = (file) => /^(AGENTS|CLAUDE|GEMINI)\.md$|^\.github\/copilot-instructions\.md$|^\.claude\/CLAUDE\.md$/.test(file);
/** Two rules can meet in one context when they come from the same file, or one of them is always on. */
export const inContextTogether = (a, b) => a.file === b.file || alwaysOn(a.file) || alwaysOn(b.file);

/** The rules of an instruction file: its list items (outside code blocks and frontmatter), with line and section. */
export function parseRules(text, file = '') {
  const rules = [];
  const lines = String(text).replace(/\r/g, '').split('\n');
  let i = 0;
  if (lines[0] === '---') { i = lines.indexOf('---', 1) + 1 || lines.length; }
  let section = '';
  let fence = false;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; continue; }
    if (fence) continue;
    const h = line.match(/^#{1,6}\s+(.*)$/);
    if (h) { section = h[1].trim(); continue; }
    const m = line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.*\S)\s*$/);
    if (m) rules.push({ file, line: i + 1, text: m[1], section });
  }
  return rules;
}

/** The "scripts" of the package.json nearest to a file (its folder, then up to the root). */
export function nearestScripts(root, file) {
  let dir = path.posix.dirname(String(file).replace(/\\/g, '/'));
  for (;;) {
    const pj = path.join(root, dir === '.' ? '' : dir, 'package.json');
    if (fs.existsSync(pj)) {
      try { return JSON.parse(fs.readFileSync(pj, 'utf8')).scripts ?? {}; } catch { return {}; }
    }
    if (dir === '.' || dir === '' || dir === '/') return {};
    dir = path.posix.dirname(dir);
  }
}

/** Lint every instruction file under root: { findings: [{ check, file, line, message }], always, paths, budget }. */
export function lint(root) {
  const sources = instructionSources(root);
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
  const rules = sources.flatMap((s) => parseRules(read(s.path), s.path));
  const findings = [
    ...(findVague(rules) ?? []).map((f) => ({ check: 'vague', file: f.file, line: f.line, message: `"${f.text}" says "${f.word}" and nothing the agent can check` })),
    ...(findDuplicates(rules) ?? []).map((d) => ({ check: 'duplicate', file: d.b.file, line: d.b.line, message: `"${d.b.text}" repeats ${d.a.file}:${d.a.line} "${d.a.text}"` })),
    ...(findContradictions(rules) ?? []).map((c) => ({ check: 'contradiction', file: c.rules[0].file, line: c.rules[0].line, message: `${c.topic}: ${c.rules.map((r) => `${r.file}:${r.line} says ${r.value}`).join(', ')}` })),
    ...(findBadCommands(rules, (f) => nearestScripts(root, f)) ?? []).map((b) => ({ check: 'command', file: b.file, line: b.line, message: `\`${b.command}\`: ${b.why}` })),
  ];
  const always = sources.filter((s) => s.applyTo == null).reduce((n, s) => n + tokens(read(s.path)), 0);
  const paths = (tokensPerPath(root, listFiles(root)) ?? []).sort((a, b) => b.tokens - a.tokens || a.path.localeCompare(b.path));
  return { findings, always, paths, budget: BUDGET };
}

/** A RULES-INVENTORY.md table: one row per rule of a legacy file, Status / Where / Now reads left for you. */
export function inventorySkeleton(text) {
  const id = (i) => `L${String(i + 1).padStart(2, '0')}`;
  return [
    '| ID | Legacy rule | Status | Where | Now reads |',
    '|---|---|---|---|---|',
    ...parseRules(text).map((r, i) => `| ${id(i)} | ${r.text.replace(/\|/g, '\\|')} | | | |`),
  ].join('\n');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const root = process.cwd();
  const usage = 'Usage: node scripts/lint-instructions.mjs [--json] | --inventory [file]';
  if (args[0] === '--inventory') {
    const file = path.resolve(root, args[1] ?? '.github/copilot-instructions.md');
    if (!file || !fs.existsSync(file)) { console.error(usage); process.exit(2); }
    console.log(inventorySkeleton(fs.readFileSync(file, 'utf8')));
    process.exit(0);
  }
  if (args.some((a) => a !== '--json')) { console.error(usage); process.exit(2); }
  const r = lint(root);
  const over = [
    ...(r.always > BUDGET.always ? [`every turn: ≈${r.always} tokens (budget ${BUDGET.always})`] : []),
    ...r.paths.filter((p) => p.tokens > BUDGET.path).map((p) => `${p.path}: ≈${p.tokens} tokens (budget ${BUDGET.path})`),
  ];
  const ok = !r.findings.length && !over.length;
  if (args.includes('--json')) {
    console.log(JSON.stringify({ ok, ...r, over }, null, 2));
  } else {
    console.log(`\n🪙 Instruction lint: ${r.findings.length} finding(s)\n`);
    for (const f of r.findings) console.log(`   ${f.check.padEnd(13)} ${f.file}:${f.line}  ${f.message}`);
    console.log(`\n   ≈tokens       files`);
    console.log(`   ${String(r.always).padStart(6)}        every turn (${instructionSources(root).filter((s) => s.applyTo == null).map((s) => s.path).join(', ') || 'none'})`);
    for (const p of r.paths.slice(0, 8)) console.log(`   ${String(p.tokens).padStart(6)}        ${p.path}  ← ${p.files.join(' + ') || 'none'}`);
    console.log(over.length ? `\n   ❌ Over budget: ${over.slice(0, 3).join('; ')}${over.length > 3 ? ` (and ${over.length - 3} more)` : ''}\n` : `\n   ✅ Within budget (every turn ≤ ${BUDGET.always}, any path ≤ ${BUDGET.path})\n`);
  }
  process.exit(ok ? 0 : 1);
}
