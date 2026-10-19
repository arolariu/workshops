# Phase 1 · The engine: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the workshop a five-tier course model, a seeded chain that makes every level start from the reference result of the level before it, a way to bring your own harness forward, and milestones for long levels, without changing any mission.

**Architecture:** Builds on PR #1 (`arolariu-workshop-companion-bootstrap`). The tier table stays in `catalog.mjs` (`DIFFICULTIES`). A hand-written `_harness/course.json` holds the harness paths and per-level exceptions. The chain extends PR #1's starter manifest (`_harness/starters.json`, git blob IDs) with an inherited/starter split. `chain.mjs` computes the chain (pure: read, compute, then write in a separate step), `bring.mjs` builds and applies bring plans, `milestones.mjs` groups check results and hints. The TUI, linear mode and CLI call these shared helpers.

**Tech Stack:** Node.js 22+ ES modules, `node:test`, no dependencies. Copilot CLI 1.0.99 for the `copilot … list` checks.

**Spec:** `docs/superpowers/specs/2026-10-18-agent-harness-workshop-experience-design.md` (revision 2), §5.1, §5.2, §5.3 (milestones), §5.7 Phase 1, §5.8, §5.9, §5.10, §6 item 1.

## Global Constraints

- Node 22+, no npm dependencies, no TUI framework (spec A3).
- Unit tests use `node:test` in `labs/_harness/tests/*.test.mjs`, run with `node --test "labs/_harness/tests/*.test.mjs"` (PR #1's layout and command).
- Folder names: `easy`, `medium`, `hard`, `hard-plus`, `hard-plus-plus`. Commands also accept `hard+`, `hard++`, `h+`, `h++` and `1`–`5` (spec §5.1).
- Badges: 🟢 🟡 🔴 🟣 💎 (💎, not ⚫, for hard++: ⚫ disappears on the dark background).
- Never write outside `labs/`, and back up anything before overwriting it (spec §5.9).
- The app's own features cost no AI credits. Real agent runs only after the re-seed, against `sol/`, with `--max-ai-credits 30`.
- Line endings: compare and hash with CRLF normalised to LF; copy files byte for byte.
- Every task leaves the repo working: the unit tests pass and the TUI starts.
- Missions don't change in this phase (lab-05/hard only changes format: milestones).

## Deviations from the spec (because PR #1 is the base)

| Spec | This plan | Why |
|---|---|---|
| Tier list in `course.json` | Tiers stay in `catalog.mjs` `DIFFICULTIES`, extended with theme, time, capstone time and mode | PR #1 already drives order, labels, keys, aliases and badges from that table |
| `labs/_course/course.json` | `labs/_harness/course.json` | Lives next to PR #1's `starters.json`; there's no second data folder |
| `labs/_course/seeds.json` with SHA-256 | PR #1's `labs/_harness/starters.json`, now `format: 2`: `exercises` keeps every seed file's git blob ID, and a new `chain` section holds `from` and the `starter` list per level | One manifest. Blob IDs are computable in Node (`sha1("blob <len>\0" + content)`, CRLF normalised), so `bring` works without git |
| Runtime files listed in `course.json` | Reuse PR #1's `workFiles()` exclusions in `progress.mjs` | One definition of "work files" for evidence, recovery and the chain |
| `passHash` / `passedAt` in progress | A source counts only when its status is a **fresh** pass (`deriveStatus` = `pass`). A stale pass is skipped with a note | PR #1's evidence fingerprints already do this job |
| "its checks run again first" when a source changed | A stale source is skipped, with "run its checks again" | Same reason; no hidden check runs inside `bring` |
| `node labs/start.mjs selftest` | `node --test "labs/_harness/tests/*.test.mjs"` | PR #1 already documents this command |
| Backups in `labs/.backups/` | PR #1 recovery backups (`labs/.recovery/<lab>-<level>/backups/`), restorable from the `x` screen | Same safety, one place |

## File map

| File | Status | Responsibility |
|---|---|---|
| `labs/_harness/catalog.mjs` | modify | `DIFFICULTIES` metadata, `h+`/`h++`/digit aliases, hour durations, milestones, requirements, hint milestones, `capstone`, `mode`, `time` |
| `labs/_harness/course.json` | create | capstone, harness paths, per-level `local`/`keep`/`overrides`/`drop` |
| `labs/_harness/course.mjs` | create | load `course.json` with defaults; gitignore-style path matching |
| `labs/_harness/chain.mjs` | create | course order, predecessors, blob IDs, `computeChain`, `writeChain`, drift |
| `labs/_harness/bring.mjs` | create | your work per source, bring plan, apply, perfect-learner simulation |
| `labs/_harness/milestones.mjs` | create | milestone status, grouping, next fix, hint reveal per milestone |
| `labs/_harness/learning.mjs` | modify | spec next-up rule for the `all` path |
| `labs/_harness/workspace.mjs` | modify | export `backupWork`; `buildStarterManifest` keeps the `chain` section |
| `labs/_harness/run-checks.mjs` | modify | `milestones` in the plan event, `milestone` in result events |
| `labs/_harness/checks.mjs` | modify | validate and pass milestones through |
| `labs/_harness/progress.mjs` | modify | `recordChecks` stores milestone statuses and a milestone-aware `nextFix` |
| `labs/_harness/screens/bring.mjs` | create | bring plan → lines (pure) |
| `labs/_harness/screens/milestones.mjs` | create | grouped check results and milestone list → lines (pure) |
| `labs/_harness/tui.mjs` | modify | 💎, theme/time, two counts, 👥/🏠, starts-from, `i`, milestones, tier keys, next up |
| `labs/_harness/linear.mjs` | modify | `bring`, milestones, starts-from, shared hint helper |
| `labs/_harness/commands.mjs` | modify | `sync-seeds`, `verify --chain`, `verify --bring`, `bring` |
| `labs/start.mjs` | modify | command table, milestone-grouped `test` output, shared hint helper |
| `labs/lab-01/medium/tests/checks.mjs` | modify | G7: normalise `\` to `/` in `sourcePath` |
| `labs/lab-05/hard/todo.md`, `tests/checks.mjs` | modify | milestone format (M1 secrets, M2 tests after edits, M3 leash) |
| `labs/lab-*/**/src`, `sol` | regenerate | the re-seed (`sync-seeds --bootstrap`) |
| `labs/_harness/tests/*.test.mjs` | create/modify | `course`, `chain`, `bring`, `milestones` tests; catalog, learning, checks, tui additions |
| `readme.md` | modify | chain, tiers, `i`, new commands |

---

### Task 1: G7 fix

**Files:** Modify `labs/lab-01/medium/tests/checks.mjs:34`

- [ ] **Step 1: Confirm the failure.** Run `node labs/start.mjs verify lab-01`. Expected on Windows: `lab-01 medium … sol fails 1 … Copilot lists it with its applyTo`.
- [ ] **Step 2: Fix.**

```js
const hit = list.find((s) => /\.github\/instructions\/.+\.instructions\.md/.test(String(s.sourcePath ?? '').replace(/\\/g, '/')));
```

- [ ] **Step 3: Verify.** `node labs/start.mjs verify lab-01` → all three ✅.
- [ ] **Step 4: Commit** `Fix G7: match Copilot's sourcePath with either slash`.

### Task 2: Five tiers in the catalog

**Files:** Modify `labs/_harness/catalog.mjs`; test `labs/_harness/tests/catalog-progress.test.mjs`.

**Interfaces — produces:**
- `DIFFICULTIES[i]`: `{ id, label, aliases, badge, ascii, key, theme, time, capstoneTime, mode }`.
- `normalizeLevel(s)` also accepts `d.key` (`'1'`–`'5'`) and `h+`, `h++`.
- `parseDuration(meta)` → upper bound in minutes, now also for hours (`'🕐 1.5–2 h'` → 120). `parseDurationRange(meta)` → `[lo, hi]` minutes or `null`.
- Level objects gain `theme`, `mode` (`'together' | 'homework'`), `time` (display text), `minutesRange`, `requirements`, `milestones: [{ id, title, body }]`, and `hints[i].milestone` (`'M1'` or `null`).
- Lab objects gain `capstone: boolean`.
- `loadCatalog(labsDir, { course })` (course defaults to `loadCourse(labsDir)`, Task 3).

- [ ] **Step 1: Write failing tests** (append to `catalog-progress.test.mjs`):

```js
test('five tiers carry theme, time and mode, and accept h+, h++ and digits', () => {
  assert.deepEqual(DIFFICULTIES.map((d) => d.badge), ['🟢', '🟡', '🔴', '🟣', '💎']);
  assert.deepEqual(DIFFICULTIES.map((d) => d.theme), ['Use it', 'Shape it', 'Prove it', 'Break it', 'Scale it']);
  assert.deepEqual(DIFFICULTIES.map((d) => d.mode), ['together', 'homework', 'homework', 'homework', 'homework']);
  assert.equal(normalizeLevel('h+'), 'hard-plus');
  assert.equal(normalizeLevel('H++'), 'hard-plus-plus');
  assert.equal(normalizeLevel('4'), 'hard-plus');
  assert.equal(normalizeLevel('1'), 'easy');
  assert.equal(normalizeLevel('6'), null);
});

test('durations in hours, and ranges', () => {
  assert.equal(parseDuration('> 🕐 1.5–2 h · 🏠 homework'), 120);
  assert.equal(parseDuration('🕐 about 1 h'), 60);
  assert.deepEqual(parseDurationRange('🕐 1.5–2 h'), [90, 120]);
  assert.deepEqual(parseDurationRange('🕐 8–10 min'), [8, 10]);
  assert.deepEqual(parseDurationRange('🕐 30 min'), [30, 30]);
  assert.equal(parseDurationRange('free'), null);
});

test('milestones, requirements and hint milestones are parsed', () => {
  const t = parseTodo([
    '# 🟣 Hard+ · Policy as code', '', '> 🕐 1.5–2 h · 🏠 homework', '',
    '## 🎯 Mission', 'Make it real.', '',
    '## 📋 Requirements', '1. Deny wins.', '',
    '## 🧭 Milestones', '### M1 · The policy file', '- `policy.json` exists', '### M2 · The engine', '- deny wins', '',
    '## 💡 Hints', '<details><summary>General</summary>', '', 'Read the spec.', '', '</details>',
    '### M1', '<details><summary>Shape</summary>', '', 'An array.', '', '</details>',
    '### M2 · The engine', '<details><summary>Order</summary>', '', 'Deny first.', '', '</details>',
  ].join('\n'));
  assert.deepEqual(t.milestones.map((m) => [m.id, m.title]), [['M1', 'The policy file'], ['M2', 'The engine']]);
  assert.match(t.milestones[0].body, /policy\.json/);
  assert.match(t.requirements, /Deny wins/);
  assert.deepEqual(t.hints.map((h) => [h.title, h.milestone]), [['General', null], ['Shape', 'M1'], ['Order', 'M2']]);
});

test('levels know their tier theme, mode and time; the capstone lab is homework', () => {
  const { labsDir } = fixtureWorkshop();
  writeTree(labsDir, {
    'lab-08/readme.md': '# Lab 08 · 🏛️ Capstone — Ship it\n',
    'lab-08/easy/todo.md': '# 🟢 Easy · Assemble\n\n> 🆓 free checks\n\n## 🎯 Mission\nGo.\n',
    'lab-08/easy/tests/checks.mjs': 'export default () => [];\n',
  });
  const catalog = loadCatalog(labsDir);
  const easy0 = catalog[0].levels[0];
  assert.equal(easy0.mode, 'together');
  assert.equal(easy0.theme, 'Use it');
  assert.equal(easy0.time, '10 min');
  const cap = catalog.find((l) => l.id === 'lab-08');
  assert.equal(cap.capstone, true);
  assert.equal(cap.levels[0].mode, 'homework');
  assert.equal(cap.levels[0].time, 'about 1 h');
});
```

(Import `parseTodo`, `parseDurationRange` from `../catalog.mjs` and `fixtureWorkshop`, `writeTree` from `./helpers.mjs`.)

- [ ] **Step 2: Run** `node --test labs/_harness/tests/catalog-progress.test.mjs` → the new tests fail.
- [ ] **Step 3: Implement.** Extend `DIFFICULTIES`:

```js
export const DIFFICULTIES = [
  { id: 'easy', label: 'Easy', aliases: ['e'], badge: '🟢', ascii: 'E', key: '1', theme: 'Use it', time: '8–10 min', capstoneTime: 'about 1 h', mode: 'together' },
  { id: 'medium', label: 'Medium', aliases: ['m'], badge: '🟡', ascii: 'M', key: '2', theme: 'Shape it', time: '30–45 min', capstoneTime: '1.5–2 h', mode: 'homework' },
  { id: 'hard', label: 'Hard', aliases: ['h'], badge: '🔴', ascii: 'H', key: '3', theme: 'Prove it', time: '1–1.5 h', capstoneTime: '2–2.5 h', mode: 'homework' },
  { id: 'hard-plus', label: 'Hard+', aliases: ['hard+', 'h+'], badge: '🟣', ascii: 'H+', key: '4', theme: 'Break it', time: '1.5–2 h', capstoneTime: 'about 3 h', mode: 'homework' },
  { id: 'hard-plus-plus', label: 'Hard++', aliases: ['hard++', 'h++'], badge: '💎', ascii: 'H++', key: '5', theme: 'Scale it', time: '2–3 h', capstoneTime: '3–4 h', mode: 'homework' },
];
```

`normalizeLevel` adds `|| d.key === s`. Durations:

```js
const UNIT = { min: 1, minutes: 1, h: 60, hour: 60, hours: 60 };
export function parseDurationRange(meta) {
  const m = String(meta ?? '').match(/(?:about\s+)?(\d+(?:\.\d+)?)(?:\s*[–-]\s*(\d+(?:\.\d+)?))?\s*(minutes|min|hours|hour|h)\b/i);
  if (!m) return null;
  const k = UNIT[m[3].toLowerCase()];
  return [Math.round(Number(m[1]) * k), Math.round(Number(m[2] ?? m[1]) * k)];
}
export const parseDuration = (meta) => parseDurationRange(meta)?.[1] ?? null;
```

`parseTodo` gains `requirements: pick(secs, 'requirements')`, `milestones: parseMilestones(pick(secs, 'milestones'))` and hint parsing that tracks `### Mx` subsections:

```js
const MS = /^(M\d+)\b\s*[·:.\-–—]?\s*(.*)$/i;
function parseMilestones(block) {
  const parts = block.split(/^###\s+(.+)$/m);
  const out = [];
  for (let i = 1; i < parts.length; i += 2) {
    const m = parts[i].trim().match(MS);
    if (m) out.push({ id: m[1].toUpperCase(), title: m[2].trim(), body: (parts[i + 1] ?? '').trim() });
  }
  return out;
}
function parseHints(block) {
  const parts = block.split(/^###\s+(.+)$/m);
  const hints = [];
  for (let i = 0; i < parts.length; i += 2) {
    const milestone = i === 0 ? null : (parts[i - 1].trim().match(MS)?.[1].toUpperCase() ?? null);
    for (const m of parts[i].matchAll(/<details>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)) hints.push({ title: m[1].trim(), body: m[2].trim(), milestone });
  }
  return hints;
}
```

In `loadCatalog(labsDir, { course = loadCourse(labsDir) } = {})`: `const capstone = id === course.capstone;` lab gets `capstone`; each level gets `theme: d.theme`, `mode: capstone ? 'homework' : d.mode`, `time: todo.meta.match(/🕐\s*([^·]+)/)?.[1].trim() || (capstone ? d.capstoneTime : d.time)`, `minutesRange: parseDurationRange(todo.meta)`.

- [ ] **Step 4: Run** the catalog tests, then the whole suite. Expected: all pass (existing tests keep passing: labels, aliases and `findExercise` are unchanged).
- [ ] **Step 5: Commit** `Catalog: five tiers with theme, time and mode; milestones and requirements`.

### Task 3: `course.json` and path rules

**Files:** Create `labs/_harness/course.json`, `labs/_harness/course.mjs`; test `labs/_harness/tests/course.test.mjs`.

**Interfaces — produces:**
- `loadCourse(labsDir)` → `{ capstone, harnessPaths, levels, file }` (defaults when the file is missing, for test fixtures).
- `levelRules(course, key)` → `{ local, keep, overrides, drop }` (arrays of patterns).
- `matchPath(pattern, rel)`, `matchAny(patterns, rel)`, `isHarnessPath(course, rel)`. Gitignore semantics: `dir/` = a folder at any depth; a pattern with `/` (or a leading `/`) is anchored at the level root; otherwise it matches a name at any depth; `*`, `**`, `?` and `{a,b}` as in `globToRegExp`.
- `saveCourse(labsDir, raw)` writes `course.json` with `formatJson` (short arrays on one line).

- [ ] **Step 1: Write failing tests** (`course.test.mjs`):

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { loadCourse, levelRules, matchPath, isHarnessPath, saveCourse, formatJson } from '../course.mjs';
import { tmpdir, writeTree } from './helpers.mjs';

test('defaults when there is no course.json', () => {
  const c = loadCourse(tmpdir());
  assert.equal(c.capstone, 'lab-08');
  assert.ok(c.harnessPaths.includes('.github/**'));
  assert.deepEqual(levelRules(c, 'lab-01/easy'), { local: [], keep: [], overrides: [], drop: [] });
});

test('gitignore-style matching', () => {
  assert.ok(matchPath('AGENTS.md', 'AGENTS.md'));
  assert.ok(matchPath('AGENTS.md', 'api/AGENTS.md'));
  assert.ok(matchPath('*.instructions.md', '.github/instructions/tests.instructions.md'));
  assert.ok(matchPath('.github/**', '.github/hooks/scripts/guard.mjs'));
  assert.ok(!matchPath('.github/**', 'docs/.github/x'));
  assert.ok(matchPath('mcp/**', 'mcp/server.mjs'));
  assert.ok(!matchPath('mcp/**', 'tools/mcp/server.mjs'));
  assert.ok(matchPath('/grades.js', 'grades.js'));
  assert.ok(!matchPath('/grades.js', 'lib/grades.js'));
  assert.ok(matchPath('node_modules/', 'a/node_modules/x.js'));
  assert.ok(!matchPath('apm.yml', 'apm.yml.bak'));
});

test('harness paths and per-level rules come from course.json', () => {
  const labsDir = tmpdir();
  writeTree(labsDir, { '_harness/course.json': JSON.stringify({ harnessPaths: ['AGENTS.md'], levels: { 'lab-06/easy': { local: ['SOLUTION-NOTES.md'] } } }) });
  const c = loadCourse(labsDir);
  assert.ok(isHarnessPath(c, 'AGENTS.md'));
  assert.ok(!isHarnessPath(c, 'grades.js'));
  assert.deepEqual(levelRules(c, 'lab-06/easy').local, ['SOLUTION-NOTES.md']);
});

test('saveCourse writes stable, readable JSON', () => {
  const labsDir = tmpdir();
  saveCourse(labsDir, { capstone: 'lab-08', levels: { 'lab-00/medium': { overrides: ['grades.js'] } } });
  const text = fs.readFileSync(path.join(labsDir, '_harness', 'course.json'), 'utf8');
  assert.match(text, /"overrides": \["grades\.js"\]/);
  assert.equal(formatJson({ a: [] }), '{ "a": [] }');
});
```

- [ ] **Step 2: Run** → fails (module missing).
- [ ] **Step 3: Implement** `course.mjs`:

```js
// The course rules a maintainer writes by hand (labs/_harness/course.json): the capstone lab, the harness paths
// that `bring` carries forward, and per-level exceptions for the seeded chain. Tiers live in catalog.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { globToRegExp } from './kit.mjs';

export const DEFAULT_HARNESS_PATHS = ['AGENTS.md', '*.instructions.md', '.github/**', '.mcp.json', 'mcp/**', 'apm.yml', 'apm.lock.yaml', 'scripts/**', 'evals/**', 'HARNESS.md'];
const RULES = ['local', 'keep', 'overrides', 'drop'];
export const courseFile = (labsDir) => path.join(labsDir, '_harness', 'course.json');

export function loadCourse(labsDir) {
  const file = courseFile(labsDir);
  let raw = {};
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw new Error(`${file} is not valid JSON: ${e.message}`); }
  return { ...raw, file, capstone: raw.capstone ?? 'lab-08', harnessPaths: raw.harnessPaths ?? DEFAULT_HARNESS_PATHS, levels: raw.levels ?? {} };
}
export function levelRules(course, key) {
  const c = course.levels?.[key] ?? {};
  return Object.fromEntries(RULES.map((k) => [k, Array.isArray(c[k]) ? c[k].map(String) : []]));
}
const cache = new Map();
function compile(pattern) {
  let p = String(pattern).trim();
  if (cache.has(p)) return cache.get(p);
  const dirOnly = p.endsWith('/');
  const body = dirOnly ? p.slice(0, -1) : p;
  const anchored = body.includes('/');
  const core = globToRegExp(body.replace(/^\//, '')).source.replace(/^\^/, '').replace(/\$$/, '');
  const re = new RegExp(`${anchored ? '^' : '(?:^|/)'}${core}${dirOnly ? '/' : '(?:/|$)'}`);
  cache.set(p, re);
  return re;
}
export const matchPath = (pattern, rel) => compile(pattern).test(String(rel).replace(/\\/g, '/'));
export const matchAny = (patterns, rel) => (patterns ?? []).some((p) => matchPath(p, rel));
export const isHarnessPath = (course, rel) => matchAny(course.harnessPaths, rel);

const inline = (v) => (Array.isArray(v) ? `[${v.map(inline).join(', ')}]`
  : v && typeof v === 'object' ? (Object.keys(v).length ? `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(', ')} }` : '{}')
  : JSON.stringify(v));
/** JSON with short objects and arrays on one line, so hand-written files stay readable after a tool updates them. */
export function formatJson(v, indent = '', width = 110) {
  const one = inline(v);
  if (!v || typeof v !== 'object' || indent.length + one.length <= width) return one;
  const next = `${indent}  `;
  if (Array.isArray(v)) return `[\n${v.map((x) => `${next}${formatJson(x, next, width)}`).join(',\n')}\n${indent}]`;
  return `{\n${Object.entries(v).map(([k, x]) => `${next}${JSON.stringify(k)}: ${formatJson(x, next, width - JSON.stringify(k).length - 2)}`).join(',\n')}\n${indent}}`;
}
export function saveCourse(labsDir, raw) {
  const file = courseFile(labsDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${formatJson(raw)}\n`);
  return file;
}
```

Create `course.json`:

```json
{
  "_about": "Maintainers: rules for the seeded chain (node labs/start.mjs sync-seeds). harnessPaths: what `bring` carries forward. Per level: local = files that don't pass to the next level; keep = starter files bring never overwrites; overrides = inherited files this level's starter changes on purpose; drop = inherited files this level must not have.",
  "capstone": "lab-08",
  "harnessPaths": ["AGENTS.md", "*.instructions.md", ".github/**", ".mcp.json", "mcp/**", "apm.yml", "apm.lock.yaml", "scripts/**", "evals/**", "HARNESS.md"],
  "levels": {
    "lab-06/easy": { "local": ["SOLUTION-NOTES.md"] },
    "lab-07/medium": { "local": ["NOTES.md"] }
  }
}
```

- [ ] **Step 4: Run** `node --test labs/_harness/tests/course.test.mjs` → pass; whole suite → pass.
- [ ] **Step 5: Commit** `Course rules: harness paths and per-level chain exceptions`.

### Task 4: The chain (`chain.mjs`)

**Files:** Create `labs/_harness/chain.mjs`; modify `labs/_harness/workspace.mjs` (`buildStarterManifest` keeps `chain`; `starterDrift` compares order-insensitively), `labs/_harness/commands.mjs`; test `labs/_harness/tests/chain.test.mjs`.

**Interfaces:**
- Consumes: `loadCatalog`, `DIFFICULTIES` (Task 2); `levelRules`, `matchAny` (Task 3); `workFiles` from `progress.mjs`.
- Produces:
  - `blobId(buf)` → git blob ID of the content with CRLF → LF for text (no NUL in the first 8000 bytes).
  - `snapshot(dir)` → `Map<rel, { id, buf }>` of `workFiles(dir)`.
  - `courseOrder(catalog)` → `[{ key, lab, ex, labIndex, tierIndex }]` (lab by lab, tier by tier).
  - `predecessorOf(order, key)` → node or `null`. Rule: the previous tier in the same lab; for the first level of a lab, the nearest earlier easy level.
  - `manifestFile(labsDir)`, `loadManifest(labsDir)`.
  - `computeChain({ catalog, course, manifest, bootstrap })` → `{ levels: [{ key, node, pred, src: { write, remove }, sol: { write, remove }, newSrc, newSol, starter, inherited, delta, removed }], problems: [{ key, file, kind: 'edited'|'shadow'|'deleted'|'conflict', message }], manifest, overridesFound: { [key]: [rel] } }`.
  - `writeChain({ labsDir, result })` → `{ written, removed, backupDir }`; backs up every file it overwrites or deletes to `labs/.backups/sync-seeds-<stamp>/`.
  - `chainIssues({ result, manifest })` → `[{ key, issues: [string] }]` (empty `issues` = in sync).
- Manifest (`starters.json`, format 2): `{ format: 2, revision, note, exercises: { [key]: { [rel]: blobId } }, chain: { [key]: { from, starter: [rel] } } }`. Inherited files = `exercises[key]` minus `chain[key].starter`.

**The algorithm (per level, in course order):**
1. `base` = the predecessor's **new** `sol`, minus the predecessor's `local` files, minus this level's `drop` files.
2. Classify each file of the current `src/`:
   - recorded as inherited last time: unchanged (same ID as recorded, or as `base`) → inherited; changed and listed in `overrides` → starter; changed otherwise → problem `edited`.
   - not recorded as inherited: same ID as `base` and not an override → inherited; differs from `base` → starter if it's in `overrides`, else problem `shadow` (with `bootstrap`, record it in `overridesFound` instead); not in `base` → starter.
   - recorded as inherited, missing from `src/`, still in `base` → problem `deleted`.
3. `newSrc` = `base` overlaid with the starter files.
4. `delta` = files where the current `sol/` differs from the current `src/` (plus files `sol/` removes). A delta file whose `newSrc` version differs from the current `src/` version → problem `conflict`.
5. `newSol` = `newSrc` with the delta applied.
6. Nothing is written by `computeChain`. `writeChain` refuses to run if there are problems (the caller checks).

- [ ] **Step 1: Write failing tests** (`chain.test.mjs`):

```js
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { loadCatalog } from '../catalog.mjs';
import { loadCourse } from '../course.mjs';
import { blobId, courseOrder, predecessorOf, computeChain, writeChain, loadManifest, chainIssues } from '../chain.mjs';
import { tmpdir, writeTree } from './helpers.mjs';

const CHECKS = "export default (t) => [t.check('ok', () => true)];\n";
/** A tiny course: { 'lab-00/easy': { src: {...}, sol: {...} }, ... } */
function course(levels, rules = null) {
  const labsDir = path.join(tmpdir(), 'labs');
  const files = {};
  for (const [key, { src, sol }] of Object.entries(levels)) {
    const [lab, level] = key.split('/');
    files[`${lab}/readme.md`] = `# Lab ${lab.slice(4)} · 🧪 Fixture — x\n`;
    files[`${key}/todo.md`] = `# 🟢 ${level} · Fixture\n\n> 🕐 10 min\n\n## 🎯 Mission\nGo.\n`;
    files[`${key}/tests/checks.mjs`] = CHECKS;
    for (const [f, c] of Object.entries(src)) files[`${key}/src/${f}`] = c;
    for (const [f, c] of Object.entries(sol)) files[`${key}/sol/${f}`] = c;
  }
  if (rules) files['_harness/course.json'] = JSON.stringify({ levels: rules });
  writeTree(labsDir, files);
  return labsDir;
}
const run = (labsDir, opts = {}) => computeChain({ catalog: loadCatalog(labsDir), course: loadCourse(labsDir), manifest: loadManifest(labsDir), ...opts });
const read = (labsDir, rel) => fs.readFileSync(path.join(labsDir, rel), 'utf8');
const BASE = {
  'lab-00/easy': { src: { 'app.js': 'v1\n' }, sol: { 'app.js': 'v1\n', 'FINDINGS.md': 'found\n' } },
  'lab-00/medium': { src: { 'app.js': 'v1 medium\n' }, sol: { 'app.js': 'v1 medium\n', 'PLAN.md': 'plan\n' } },
  'lab-01/easy': { src: { 'app.js': 'v1\n' }, sol: { 'app.js': 'v1\n', 'AGENTS.md': 'rules\n' } },
  'lab-01/hard': { src: { 'app.js': 'v1\n', 'AGENTS.md': 'rules\n' }, sol: { 'app.js': 'v1\n', 'AGENTS.md': 'rules\n', 'ab.mjs': 'ab\n' } },
};

test('blob IDs match git and ignore CRLF', () => {
  const git = crypto.createHash('sha1').update('blob 4\0a\nb\n').digest('hex');
  assert.equal(blobId(Buffer.from('a\nb\n')), git);
  assert.equal(blobId(Buffer.from('a\r\nb\n')), git);
  assert.notEqual(blobId(Buffer.from([0, 13, 10])), blobId(Buffer.from([0, 10])), 'binary content is hashed as is');
});

test('course order and predecessors: down the easy column, along each row', () => {
  const order = courseOrder(loadCatalog(course(BASE)));
  assert.deepEqual(order.map((n) => n.key), ['lab-00/easy', 'lab-00/medium', 'lab-01/easy', 'lab-01/hard']);
  const pred = (k) => predecessorOf(order, k)?.key ?? null;
  assert.equal(pred('lab-00/easy'), null);
  assert.equal(pred('lab-00/medium'), 'lab-00/easy');
  assert.equal(pred('lab-01/easy'), 'lab-00/easy');
  assert.equal(pred('lab-01/hard'), 'lab-01/easy', 'a missing tier is skipped');
});

test('bootstrap: inherits the predecessor result and records overrides', () => {
  const labsDir = course(BASE);
  const r = run(labsDir, { bootstrap: true });
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.overridesFound, { 'lab-00/medium': ['app.js'] });
  const med = r.levels.find((l) => l.key === 'lab-00/medium');
  assert.deepEqual(med.src.write, ['FINDINGS.md']);
  assert.deepEqual(med.sol.write, ['FINDINGS.md']);
  assert.deepEqual(med.starter, ['app.js']);
  const e1 = r.levels.find((l) => l.key === 'lab-01/easy');
  assert.deepEqual(e1.src.write, ['FINDINGS.md'], 'Lab 01 easy starts from Lab 00 easy');
  assert.deepEqual(r.manifest.chain['lab-01/easy'], { from: 'lab-00/easy', starter: [] });
  assert.equal(r.manifest.exercises['lab-01/easy']['app.js'], blobId(Buffer.from('v1\n')));
});

test('without bootstrap a differing file is a problem until it is an override', () => {
  assert.deepEqual(run(course(BASE)).problems.map((p) => [p.key, p.file, p.kind]), [['lab-00/medium', 'app.js', 'shadow']]);
  assert.deepEqual(run(course(BASE, { 'lab-00/medium': { overrides: ['app.js'] } })).problems, []);
});

test('writeChain writes, backs up and is idempotent', () => {
  const labsDir = course(BASE, { 'lab-00/medium': { overrides: ['app.js'] } });
  const w = writeChain({ labsDir, result: run(labsDir) });
  assert.ok(w.written >= 4);
  assert.equal(read(labsDir, 'lab-01/hard/src/FINDINGS.md'), 'found\n');
  assert.equal(read(labsDir, 'lab-01/hard/sol/ab.mjs'), 'ab\n');
  assert.equal(loadManifest(labsDir).format, 2);
  const again = run(labsDir);
  assert.deepEqual(again.problems, []);
  assert.ok(again.levels.every((l) => !l.src.write.length && !l.src.remove.length && !l.sol.write.length && !l.sol.remove.length));
  assert.ok(chainIssues({ result: again, manifest: loadManifest(labsDir) }).every((x) => !x.issues.length));
});

test('a change upstream ripples down; drift is reported until synced', () => {
  const labsDir = course(BASE, { 'lab-00/medium': { overrides: ['app.js'] } });
  writeChain({ labsDir, result: run(labsDir) });
  fs.writeFileSync(path.join(labsDir, 'lab-00/easy/sol/FINDINGS.md'), 'found more\n');
  const r = run(labsDir);
  assert.deepEqual(r.problems, []);
  for (const k of ['lab-00/medium', 'lab-01/easy', 'lab-01/hard']) assert.deepEqual(r.levels.find((l) => l.key === k).src.write, ['FINDINGS.md'], k);
  assert.ok(chainIssues({ result: r, manifest: loadManifest(labsDir) }).some((x) => x.issues.length));
  writeChain({ labsDir, result: r });
  assert.equal(read(labsDir, 'lab-01/hard/sol/FINDINGS.md'), 'found more\n');
});

test('an edited inherited file is caught; overrides, local and drop are honoured', () => {
  const labsDir = course(BASE, { 'lab-00/medium': { overrides: ['app.js'] } });
  writeChain({ labsDir, result: run(labsDir) });
  fs.writeFileSync(path.join(labsDir, 'lab-01/easy/src/FINDINGS.md'), 'oops\n');
  assert.deepEqual(run(labsDir).problems.map((p) => [p.key, p.kind]), [['lab-01/easy', 'edited']]);
  const local = course(BASE, { 'lab-00/medium': { overrides: ['app.js'] }, 'lab-00/easy': { local: ['FINDINGS.md'] } });
  assert.ok(!run(local).levels.find((l) => l.key === 'lab-01/easy').newSrc.has('FINDINGS.md'));
  const drop = course(BASE, { 'lab-00/medium': { overrides: ['app.js'] }, 'lab-01/easy': { drop: ['FINDINGS.md'] } });
  const r = run(drop);
  assert.ok(!r.levels.find((l) => l.key === 'lab-01/easy').newSrc.has('FINDINGS.md'));
  assert.ok(!r.levels.find((l) => l.key === 'lab-01/hard').newSrc.has('FINDINGS.md'), 'a dropped file stays dropped down the row');
});

test('a solution change on a file that also changed upstream is a conflict', () => {
  const levels = structuredClone(BASE);
  levels['lab-00/medium'].sol['FINDINGS.md'] = 'found, then planned\n';
  const labsDir = course(levels, { 'lab-00/medium': { overrides: ['app.js'] } });
  assert.deepEqual(run(labsDir).problems.map((p) => [p.key, p.file, p.kind]), [['lab-00/medium', 'FINDINGS.md', 'conflict']]);
});

test('CRLF copies of an inherited file count as the same file', () => {
  const levels = structuredClone(BASE);
  levels['lab-01/easy'].src['FINDINGS.md'] = 'found\r\n';
  const r = run(course(levels, { 'lab-00/medium': { overrides: ['app.js'] } }));
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.levels.find((l) => l.key === 'lab-01/easy').src.write, []);
});
```

- [ ] **Step 2: Run** `node --test labs/_harness/tests/chain.test.mjs` → fails (module missing).
- [ ] **Step 3: Implement** `chain.mjs` following the algorithm above. Core pieces:

```js
const isText = (buf) => !buf.subarray(0, 8000).includes(0);
const lf = (buf) => (isText(buf) && buf.includes(13) ? Buffer.from(buf.toString('latin1').replace(/\r\n/g, '\n'), 'latin1') : buf);
export const blobId = (buf) => { const b = lf(buf); return crypto.createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex'); };
export function snapshot(dir) {
  const out = new Map();
  for (const f of workFiles(dir)) { try { const buf = fs.readFileSync(f.abs); out.set(f.rel, { id: blobId(buf), buf }); } catch { /* vanished */ } }
  return out;
}
export function predecessorOf(order, key) {
  const i = order.findIndex((n) => n.key === key);
  if (i < 0) return null;
  if (i > 0 && order[i - 1].labIndex === order[i].labIndex) return order[i - 1];
  for (let j = i - 1; j >= 0; j--) if (order[j].tierIndex === 0) return order[j];
  return null;
}
```

`writeChain` copies every file it will overwrite or delete to `labs/.backups/sync-seeds-<stamp>/<lab>-<level>/<src|sol>/…`, writes `newSrc`/`newSol` buffers byte for byte (only files whose ID differs), deletes removed files and prunes empty folders, then writes `starters.json` with `revision` = `git rev-parse HEAD` when git is available. It throws if a target folder is outside `labsDir`.

`chainIssues` lists, per level: `src/ out of date: …`, `sol/ out of date: …`, `src/ has files the chain doesn't: …`, and `starters.json is out of date` when `exercises[key]` or `chain[key]` differ (compared as sorted entries).

In `workspace.mjs`: `buildStarterManifest(labsDir, catalog, { gitBin, previous })` copies `previous.chain` into the result and sets `format: previous?.chain ? 2 : 1`; `commands.mjs` `starters --write` passes the current manifest as `previous`, and `starterDrift` compares each exercise's entries sorted by path.

- [ ] **Step 4: Run** the chain tests, then the whole suite → pass.
- [ ] **Step 5: Commit** `Seeded chain: compute, write and check the chain in starters.json`.

### Task 5: `sync-seeds`, `verify --chain` and the re-seed

**Files:** Modify `labs/_harness/commands.mjs`, `labs/start.mjs` (command table and usage); test `labs/_harness/tests/cli.test.mjs`; regenerate `labs/lab-*/**/src`, `sol`, `labs/_harness/starters.json`, `labs/_harness/course.json`.

**Interfaces — produces (CLI):**
- `node labs/start.mjs sync-seeds [--bootstrap] [--dry-run]`: prints one line per level (`← predecessor`, files to write or remove), then the problems. With problems: writes nothing, exit 1. With `--bootstrap`: adds `overridesFound` to `course.json` (`saveCourse`) before writing. With `--dry-run`: writes nothing, exit 0 when there are no problems.
- `node labs/start.mjs verify [LAB] [--chain] [--bring] [--verbose]`: `--chain` first runs the chain check (whole chain, no writes): one line per level, ❌ with the issues, each issue counts as a problem. Then the level checks as before. (`--bring`: Task 7.)

- [ ] **Step 1: Write failing CLI tests** (append to `cli.test.mjs`, using its existing `run(args, { env: { WORKSHOP_LABS_DIR } })` helper and a fixture like Task 4's):

```js
test('sync-seeds --dry-run shows the plan and writes nothing; verify --chain reports drift', () => {
  const labsDir = chainFixture(); // BASE from chain.test.mjs, written with the same helper
  const dry = runCli(['sync-seeds', '--bootstrap', '--dry-run'], labsDir);
  assert.equal(dry.code, 0);
  assert.match(dry.out, /lab-00\/medium .*← lab-00\/easy/);
  assert.match(dry.out, /override.*app\.js/);
  assert.ok(!fs.existsSync(path.join(labsDir, 'lab-01/easy/src/FINDINGS.md')));
  const drift = runCli(['verify', '--chain'], labsDir);
  assert.notEqual(drift.code, 0);
  assert.match(drift.out, /❌ lab-01\/easy/);
  const sync = runCli(['sync-seeds', '--bootstrap'], labsDir);
  assert.equal(sync.code, 0, sync.out);
  assert.ok(fs.existsSync(path.join(labsDir, 'lab-01/easy/src/FINDINGS.md')));
  assert.match(fs.readFileSync(path.join(labsDir, '_harness/course.json'), 'utf8'), /"overrides": \["app\.js"\]/);
  const clean = runCli(['verify', '--chain'], labsDir);
  assert.match(clean.out, /✅ lab-01\/easy/);
});
```

(`chainFixture` and `runCli` are small helpers added to `helpers.mjs`: `chainFixture()` writes Task 4's `BASE` course, `runCli(args, labsDir)` spawns `node labs/start.mjs` with `WORKSHOP_LABS_DIR=labsDir` and returns `{ code, out }`.)

- [ ] **Step 2: Run** → fails (`Unknown command "sync-seeds"`).
- [ ] **Step 3: Implement** the two commands in `commands.mjs` with the `computeChain`/`writeChain`/`chainIssues` helpers, and add them to `COMMANDS` and `usage()` in `start.mjs` (`'sync-seeds': { args: [0, 0], opts: { bootstrap: 'flag', 'dry-run': 'flag', ascii: 'flag' } }`, and `chain`/`bring` flags on `verify`).
- [ ] **Step 4: Run** the CLI tests and the whole suite → pass.
- [ ] **Step 5: The re-seed (real labs).**
  1. `node labs/start.mjs sync-seeds --bootstrap --dry-run` → no problems; the overrides found must be exactly: `lab-00/medium` grades.js; `lab-00/hard` grades.js, grades.test.js; `lab-01/hard` grades.test.js; `lab-02/easy` README.md; `lab-02/medium` README.md, index.js; `lab-03/easy` README.md, index.js; `lab-03/hard` deadlines.test.js; `lab-05/easy` .gitignore, AGENTS.md; `lab-06/easy` AGENTS.md; `lab-07/hard` .github/workflows/issue-triage.md. Anything else: stop and investigate.
  2. Check the `local` candidates: `lab-06/easy/sol/SOLUTION-NOTES.md` explains what `apm install` would add (a solution note, not part of the harness) and `lab-07/medium/sol/NOTES.md` answers that level's question. Both stay `local`.
  3. `node labs/start.mjs sync-seeds --bootstrap` → writes.
  4. `node labs/start.mjs verify --chain` → every level ✅; then the level checks: 24/24 ✅ (G7 fixed in Task 1).
  5. `git add -A labs && git commit -m "Re-seed the 24 levels into the chain"`, then `node labs/start.mjs starters` → the manifest matches the committed starters.

### Task 6: Milestones in the check pipeline and the CLI

**Files:** Create `labs/_harness/milestones.mjs`; modify `run-checks.mjs`, `checks.mjs`, `progress.mjs`, `start.mjs` (`test` output, `hint`), `commands.mjs` (`verify` consistency check), `labs/lab-05/hard/todo.md`, `labs/lab-05/hard/tests/checks.mjs`; tests `labs/_harness/tests/milestones.test.mjs`, `checks.test.mjs`, `content.test.mjs`.

**Interfaces — produces:**
- Check kit: `t.check(name, fn, { milestone: 'M2' })` (the kit already spreads options onto the check).
- `run-checks.mjs`: the plan event gains `milestones: [string|null]` (same length as `names`); each result event gains `milestone`.
- `checks.mjs` `runChecks()`: validates `plan.milestones` when present (array of the plan's length, each a string or null; anything else is a protocol violation); every result gets `milestone` from the plan; the summary gains `planMilestones` and `milestones` (`milestoneStatus(results)`).
- `milestones.mjs`:
  - `milestoneStatus(results)` → `{ M1: 'pass' | 'fail' }` (pass = every check of the milestone passed or was skipped).
  - `nextFixName(results)` → the first failing (or blocked) check of the earliest milestone (`M1` < `M2` < `M10`; no milestone last), or `null`.
  - `groupChecks({ names, milestones, results, defined })` → `[{ id, title, items: [{ idx, name, result }], total, passed, failed, done }]` in `defined` order, then unknown IDs, then checks without a milestone (`id: null`).
  - `currentMilestone(ex, entry)` → the first milestone of `ex.milestones` whose stored status isn't `pass`, or `null`.
  - `revealedHints(ex, entry)` → `Set<hintIndex>`; `nextHint(ex, entry, current)` → `{ idx, patch } | null`; `revealNextHint(store, ex)` → `{ hint, idx, milestone, shown, total } | { none: true, milestone }`. Levels without milestones keep PR #1's single counter (`entry.hints`); levels with milestones also store `entry.hintsBy` (`{ M1: 2, _: 1 }`) and keep `entry.hints` as the total.
- `progressStore.recordChecks()` stores `milestones: milestoneStatus(results)` and `nextFix: nextFixName(results)`.
- `verify` adds a problem for a level whose checks name a milestone its `todo.md` doesn't define, or whose `todo.md` defines a milestone with no check.

- [ ] **Step 1: Write failing tests.** `milestones.test.mjs`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { milestoneStatus, nextFixName, groupChecks, currentMilestone, revealedHints, nextHint } from '../milestones.mjs';

const r = (idx, name, status, milestone) => ({ idx, name, status, milestone });
const RESULTS = [r(0, 'a', 'pass', 'M1'), r(1, 'b', 'skip', 'M1'), r(2, 'c', 'fail', 'M2'), r(3, 'd', 'pass', 'M2'), r(4, 'e', 'fail', null), r(5, 'f', 'fail', 'M10')];

test('milestone status and the next fix follow milestone order', () => {
  assert.deepEqual(milestoneStatus(RESULTS), { M1: 'pass', M2: 'fail', M10: 'fail' });
  assert.equal(nextFixName(RESULTS), 'c');
  assert.equal(nextFixName([r(0, 'z', 'fail', 'M10'), r(1, 'y', 'blocked', 'M2')]), 'y');
  assert.equal(nextFixName([r(0, 'a', 'pass', 'M1')]), null);
});

test('groups follow the todo order, then unknown milestones, then the rest', () => {
  const g = groupChecks({ names: RESULTS.map((x) => x.name), milestones: RESULTS.map((x) => x.milestone), results: RESULTS, defined: [{ id: 'M1', title: 'One' }, { id: 'M2', title: 'Two' }, { id: 'M3', title: 'Three' }] });
  assert.deepEqual(g.map((x) => [x.id, x.title, x.total, x.passed, x.done]), [['M1', 'One', 2, 2, true], ['M2', 'Two', 2, 1, false], ['M3', 'Three', 0, 0, false], ['M10', '', 1, 0, false], [null, '', 1, 0, false]]);
});

const EX = { milestones: [{ id: 'M1' }, { id: 'M2' }], hints: [{ milestone: null }, { milestone: 'M1' }, { milestone: 'M1' }, { milestone: 'M2' }] };
test('hints are revealed per milestone', () => {
  assert.equal(currentMilestone(EX, {}), 'M1');
  assert.equal(currentMilestone(EX, { milestones: { M1: 'pass' } }), 'M2');
  assert.equal(currentMilestone(EX, { milestones: { M1: 'pass', M2: 'pass' } }), null);
  let entry = {};
  const steps = [];
  for (;;) {
    const n = nextHint(EX, entry, 'M1');
    if (!n) break;
    steps.push(n.idx);
    entry = { ...entry, ...n.patch };
  }
  assert.deepEqual(steps, [1, 2, 0], 'M1 hints first, then the general one, never M2');
  assert.deepEqual([...revealedHints(EX, entry)].sort(), [0, 1, 2]);
  assert.equal(entry.hints, 3);
  assert.deepEqual(nextHint(EX, entry, 'M2').idx, 3);
});

test('levels without milestones keep one counter', () => {
  const ex = { milestones: [], hints: [{}, {}] };
  assert.deepEqual(nextHint(ex, { hints: 1 }), { idx: 1, patch: { hints: 2 } });
  assert.equal(nextHint(ex, { hints: 2 }), null);
  assert.deepEqual([...revealedHints(ex, { hints: 1 })], [0]);
});
```

`checks.test.mjs` (with its `makeExercise` helper):

```js
test('milestones travel from the checks to the summary', async () => {
  const { exDir, target } = makeExercise(tmpdir(), "export default (t) => [t.check('one', () => true, { milestone: 'M1' }), t.check('two', () => 'no', { milestone: 'M2' }), t.check('three', () => true)];\n");
  const res = await runChecks({ exDir, target });
  assert.deepEqual(res.results.map((x) => x.milestone), ['M1', 'M2', null]);
  assert.deepEqual(res.planMilestones, ['M1', 'M2', null]);
  assert.deepEqual(res.milestones, { M1: 'pass', M2: 'fail' });
});
```

`content.test.mjs` (real labs): every `todo.md` has a title and a mission; every hint milestone exists in that level's milestones.

- [ ] **Step 2: Run** → fail.
- [ ] **Step 3: Implement** `milestones.mjs` as specified; in `run-checks.mjs` emit `milestones: checks.map((c) => (typeof c.milestone === 'string' ? c.milestone : null))` and `milestone` on results; in `checks.mjs` validate and keep `plan.milestones`, set `milestone: plan.milestones?.[ev.idx] ?? null` on results, and return `planMilestones` and `milestones`; in `progress.mjs` `recordChecks` use `nextFixName` and store `milestones`. In `start.mjs`, `printChecks` prints `🧭 M2 · <title>` when the milestone changes and a per-milestone summary (`✅ M1 · Secret scanner ▰▰▰▰ 4/4`) at the end; `hint` calls `revealNextHint` and says `All hints for M2 are revealed.` when it returns `none`.
- [ ] **Step 4: Convert lab-05/hard to milestones (format only).** `todo.md`: the mission's story stays; the three numbered layers move to `## 📋 Requirements`; `## 🧭 Milestones` with `### M1 · Secret scanner` (the secrets and redaction bullets), `### M2 · Tests after every edit` (the `postToolUse` bullet), `### M3 · A leash` (the `leashArgs` bullet), replacing `## ✅ Done when`; hints under `### M1` (Matching secrets, Logs are a leak too), `### M2` (new: *"The payload has `toolName` and `toolArgs.path`. Run `node --test` with `spawnSync` and read the `# pass` / `# fail` lines from its output."*) and `### M3` (Least privilege for the leash). `tests/checks.mjs`: checks 1–4 get `{ milestone: 'M1' }`, 5–6 `{ milestone: 'M2' }`, 7 `{ milestone: 'M3' }`.
- [ ] **Step 5: Run** the suite, then `node labs/start.mjs test lab-05 hard --sol` (grouped output, all ✅) and `node labs/start.mjs verify lab-05` (no milestone problems).
- [ ] **Step 6: Commit** `Milestones: in the checks, progress, CLI and the lab-05 hard level`.

### Task 7: Bring your work forward

**Files:** Create `labs/_harness/bring.mjs`; modify `workspace.mjs` (export `backupWork`), `commands.mjs` (`bring`, `verify --bring`), `start.mjs` (command table, usage); test `labs/_harness/tests/bring.test.mjs`.

**Interfaces:**
- Consumes: `courseOrder`, `snapshot`, `loadManifest` (Task 4); `isHarnessPath`, `levelRules`, `matchAny` (Task 3); `progressView` (PR #1); `ensureStarter`, `backupWork` (workspace).
- Produces:
  - `workIn(dir, seed, course)` → `Map<rel, { id, buf, added }>`: harness files that differ from the seed (`{ rel: blobId }`) or that it doesn't have.
  - `planFor({ sources: [{ key, work }], target, manifest, course })` → `{ items: [{ file, from, alsoIn, buf, action: 'new'|'replace'|'replace-yours' }], kept: [{ file, from, reason: 'keep'|'starter' }] }`. Later sources win. Files in the target's `keep`, and the target's own starter files that aren't overrides, are kept. Files already identical in `src/` are left out.
  - `bringPlan({ catalog, course, manifest, view, target })` → `{ target, sources, skipped: [{ key, reason }], items, kept, error? }`. A source is an earlier level whose `view.checks(ex)` is `pass`. A stale former pass is skipped with "changed since its checks last passed: run them again to bring it". A level with no manifest entry is skipped with a reason. A target with no manifest entry returns `error`.
  - `applyBring({ labsDir, target, plan })` → `{ ok, backup, files: [{ file, from }] }` (keeps the first-use starter, backs up `src/` to the recovery backups, then copies the files byte for byte).
  - `perfectLearnerPlan({ catalog, course, manifest, target })`: every earlier level done exactly like the reference (its work = its `sol/` against its seed, harness paths only).
  - `simulateBring({ labsDir, catalog, course, manifest, target })` → `{ plan, base, src, sol }`: copies of `src/` and `sol/` in `labs/.runs/verify-bring/<lab>-<level>/` with the perfect learner's work applied (on `sol/`, this level's own solution files are skipped).
- CLI: `node labs/start.mjs bring LAB LEVEL [--dry-run]` prints the plan (spec §5.2 format) and applies it unless `--dry-run`; `verify --bring` runs `simulateBring` for every level: `src/` must still fail and `sol/` must still pass.

- [ ] **Step 1: Write failing tests** (`bring.test.mjs`), on a course written with Task 4's `course()` helper (moved to `helpers.mjs` as `chainCourse`) and synced with `writeChain`:

```js
test('only fresh passes travel, only harness files, later sources win', async () => {
  const labsDir = synced({
    'lab-00/easy': { src: { 'app.js': 'v1\n' }, sol: { 'app.js': 'v1\n', 'done.txt': 'x\n' } },
    'lab-00/medium': { src: {}, sol: { 'done.txt': 'x\n', 'AGENTS.md': 'ref\n' } },
    'lab-01/easy': { src: {}, sol: { 'done.txt': 'x\n' } },
  });
  const { catalog, course, manifest, store, view } = ctx(labsDir);
  const ex = (k) => exerciseByKey(catalog, k).ex;
  write(labsDir, 'lab-00/easy/src/done.txt', 'x\n');
  write(labsDir, 'lab-00/easy/src/AGENTS.md', 'mine v1\n');
  write(labsDir, 'lab-00/easy/src/app.js', 'my app\n');
  await pass(store, ex('lab-00/easy'));
  write(labsDir, 'lab-00/medium/src/AGENTS.md', 'mine v2\n');
  await pass(store, ex('lab-00/medium'));
  view.refresh();
  const target = courseOrder(catalog).find((n) => n.key === 'lab-01/easy');
  const plan = bringPlan({ catalog, course, manifest, view, target });
  assert.deepEqual(plan.sources, ['lab-00/easy', 'lab-00/medium']);
  assert.deepEqual(plan.items.map((i) => [i.file, i.from, i.action, i.alsoIn]), [['AGENTS.md', 'lab-00/medium', 'new', ['lab-00/easy']]]);
  write(labsDir, 'lab-00/medium/src/AGENTS.md', 'mine v3\n');
  view.refresh();
  const stale = bringPlan({ catalog, course, manifest, view, target });
  assert.deepEqual(stale.skipped.map((s) => s.key), ['lab-00/medium']);
  assert.equal(stale.items[0].from, 'lab-00/easy');
});

test('keep and new starter files are never overwritten; applying backs up first', async () => { /* target lists keep: ['.github/hooks/**'] and ships a new starter .github/x.md; plan.kept has both, items exclude them; applyBring writes the rest, returns a backup that exists, and src/ now holds the brought file */ });

test('the perfect learner brings every earlier solution delta under the harness paths', () => { /* perfectLearnerPlan on the synced course lists lab-00/medium's AGENTS.md for lab-01/easy; simulateBring writes it into the src copy and, when lab-01/easy's own solution changes AGENTS.md, not into the sol copy */ });
```

(`pass(store, ex)` runs the real `runChecks` and `store.recordChecks(ex.key, res, captureEvidence(ex))`, so the evidence is genuine. The last two tests are written out in full in the test file; the comments above give their exact assertions.)

- [ ] **Step 2: Run** → fail.
- [ ] **Step 3: Implement** `bring.mjs`, `backupWork` (= PR #1's private `backupNow`, exported), the `bring` command and `verify --bring` (one line per level: `✅ lab-05 hard   +6 files from 9 levels · src fails 7/7 · sol passes 7/7`; the copies are removed afterwards).
- [ ] **Step 4: Run** the suite → pass. Then `node labs/start.mjs bring lab-05 hard --dry-run` (no passes yet: "nothing to bring") and `node labs/start.mjs verify --bring` → every level ✅. A failure here means a level's checks depend on an earlier lab's harness file: fix it with a `keep` entry or by narrowing the check (spec §5.2 author rules), and record it as a deviation.
- [ ] **Step 5: Commit** `Bring your work forward: plan, apply and the perfect-learner check`.

### Task 8: Next up

**Files:** Modify `labs/_harness/learning.mjs`; test `labs/_harness/tests/learning.test.mjs`.

**Interfaces — produces:** `nextExercise(catalog, view, { path, current, last })`. For `path: 'all'`:
1. `current` is an easy level → the next lab's easy level, finished or not (the live track).
2. Not on a level (`current` null) and `last` is unfinished → `last`.
3. The first unfinished easy level.
4. The next unfinished tier after `last`'s tier in `last`'s lab.
5. The lowest unfinished tier of the labs after `last`'s lab.
6. Any unfinished level. `null` when everything passes.
Rules 3–6 never return `current`. Other paths keep PR #1's behaviour (the path's own order).

- [ ] **Step 1: Write failing tests** (append to `learning.test.mjs`, on `fixtureWorkshop()`):

```js
test('next up follows the live track and the homework ladder', async () => {
  const { labsDir } = fixtureWorkshop();
  const catalog = loadCatalog(labsDir);
  const store = progressStore(labsDir);
  const view = progressView(store, catalog);
  const next = (o) => nextExercise(catalog, view, { path: 'all', ...o })?.key ?? null;
  assert.equal(next({ current: 'lab-02/easy' }), 'lab-03/easy', 'n on an easy level moves down the live track');
  assert.equal(next({ last: 'lab-04/medium' }), 'lab-04/medium', 'home: back to where you were');
  assert.equal(next({ current: 'lab-04/medium' }), 'lab-00/easy', 'then the first unfinished easy level');
  for (const lab of catalog.slice(0, 8)) await passLevel(store, lab.levels[0]);
  view.refresh();
  assert.equal(next({ current: 'lab-04/medium' }), 'lab-04/hard', 'then the next tier in the same lab');
  await passLevel(store, catalog[4].levels[2]);
  view.refresh();
  assert.equal(next({ current: 'lab-04/medium' }), 'lab-05/medium', 'then the lowest unfinished tier of the next lab');
});
```

(`passLevel` writes `src/done.txt`, runs the real checks and records them with fresh evidence.)

- [ ] **Step 2: Run** → fail. **Step 3: Implement.** **Step 4: Run** the suite → pass (PR #1's path tests unchanged).
- [ ] **Step 5: Commit** `Next up: the live track first, then the homework ladder`.

### Task 9: The TUI

**Files:** Create `labs/_harness/screens/bring.mjs`, `labs/_harness/screens/milestones.mjs`; modify `labs/_harness/tui.mjs`; test `labs/_harness/tests/tui.test.mjs`.

**Interfaces:**
- `screens/milestones.mjs`: `milestoneBar(passed, total)` → `▰▰▱` (at most 10 cells); `checkGroupLines(groups, { W, resultLines, fmt })` → lines: a finished milestone folds to `✅ M1 · Title  ▰▰▰ 3/3`; an unfinished one shows `🧭 M2 · Title  ▰▱ 1/2` and then its check rows (rendered by the TUI's `resultRow`); no milestones → the plain list, as today. `milestoneListLines(ex, entry, { W, fmt })` → the exercise screen's 🧭 MILESTONES section (status icon, title, bar from the stored statuses, and the milestone's body bullets).
- `screens/bring.mjs`: `bringLines(plan, { W, fmt, describe })` → the plan in the spec's format (`file ← source · replaces the reference · also changed in …`, `⏩ … skipped: …`, `🔒 kept: … (this level's starter)`, or `Nothing to bring yet: …` with what counts as your work).
- `tui.mjs`:
  - Home: header row marks 👥 over 🟢 and 🏠 over the other tiers; the progress line shows `👥 Workshop 3/8 · 🏠 Homework 5/16` (by `ex.mode`); `0-N` in the footer uses the last lab number.
  - Lab screen: each row shows `🟣 HARD+ · Break it · 30 min` (badge, label, theme, `ex.time`).
  - Exercise screen: under the meta line, `🧱 Starts from: Lab 04 · 🟢 Easy (reference)`, or `(your work, brought in on 12 Nov)` when `entry.brought` exists, or `🧱 The start of the chain`; `📋 REQUIREMENTS` and `🧭 MILESTONES` sections when present; hints grouped by milestone; `i` key and a `☰` menu item "Bring your work forward".
  - Keys `1`–`5` select the tier with that key (toast when the lab doesn't have it), on the lab and exercise screens.
  - `n` uses `nextExercise(catalog, view, { path, current, last })`.
  - Checks screen: `checkGroupLines`; `Next to fix` comes from `entry.nextFix` (now milestone-aware); when a run turns a milestone from not-pass to pass, toast `🎉 M2 · The engine is done!`.
  - Bring screen (`S.screen = 'bring'`): `y` applies (`applyBring`), records `brought: { at, files }`, then runs the checks; `n`/`b` cancel.
  - Help: five tiers with their theme and time, 👥 together and 🏠 homework, `i`, `1-5`.

- [ ] **Step 1: Write failing tests** (append to `tui.test.mjs`, using its `app()`/`press()`/`text()` helpers):

```js
const widest = (output) => Math.max(...frame(output).map((l) => width(l)));

test('home: two counts, 👥/🏠 headers, and nothing wider than the terminal', async () => {
  for (const columns of [80, 120]) {
    const t = await app({ size: { columns, rows: 40 } });
    assert.match(text(t.output), /Workshop 0\/8/);
    assert.match(text(t.output), /Homework 0\/16/);
    assert.match(text(t.output), /👥/);
    assert.ok(widest(t.output) <= columns, `${columns} columns`);
    t.quit();
  }
});

test('lab and exercise screens show tier theme, time and where the level starts', async () => {
  const t = await app({ open: 'lab-01/medium' });
  assert.match(text(t.output), /Starts from: Lab 01 · 🟡?.*Easy \(reference\)/);
  press(t.input, 'b');
  assert.match(text(t.output), /Shape it/);
  press(t.input, '3');
  assert.equal(t.state.screen, 'exercise');
  assert.equal(t.catalog[t.state.lab].levels[t.state.level].level, 'hard');
  press(t.input, '5');
  assert.match(text(t.output), /no Hard\+\+ level/);
  t.quit();
});

test('n on an easy level moves down the live track', async () => {
  const t = await app({ open: 'lab-02/easy' });
  press(t.input, 'n');
  assert.equal(t.catalog[t.state.lab].levels[t.state.level].key, 'lab-03/easy');
  t.quit();
});

test('checks are grouped by milestone; finished milestones fold', async () => {
  const { labsDir } = fixtureWorkshop();
  writeTree(labsDir, { 'lab-05/hard/todo.md': '# 🔴 Hard · M\n\n> 🕐 30 min\n\n## 🎯 Mission\nGo.\n\n## 🧭 Milestones\n### M1 · First\n- one\n### M2 · Second\n- two\n\n## 💡 Hints\n### M1\n<details><summary>H1</summary>\n\nx\n\n</details>\n### M2\n<details><summary>H2</summary>\n\ny\n\n</details>\n' });
  const res = (idx, name, status, milestone) => ({ idx, name, status, milestone, message: status === 'pass' ? '' : 'nope', optional: false, detail: {}, files: [], output: '' });
  const results = [res(0, 'a', 'pass', 'M1'), res(1, 'b', 'pass', 'M1'), res(2, 'c', 'fail', 'M2')];
  const t = await app({ labsDir, open: 'lab-05/hard', deps: { runChecks: async ({ onEvent }) => { onEvent({ type: 'plan', total: 3, names: ['a', 'b', 'c'], milestones: ['M1', 'M1', 'M2'] }); return { state: 'fail', allPass: false, complete: true, results, passed: 2, failed: 1, skipped: 0, blocked: 0, total: 3, fatal: null, stdout: '', stderr: '', planMilestones: ['M1', 'M1', 'M2'], milestones: { M1: 'pass', M2: 'fail' } }; } } });
  press(t.input, 't');
  await waitFor(() => t.state.run && !t.state.run.running);
  const s = text(t.output);
  assert.match(s, /✅ M1 · First .*2\/2/);
  assert.doesNotMatch(s, /✅ a\b/, 'a finished milestone folds');
  assert.match(s, /M2 · Second .*0\/1/);
  press(t.input, 'b');
  press(t.input, 'h');
  assert.match(text(t.output), /H2/, 'the hint comes from the current milestone');
  t.quit();
});

test('i shows the bring plan; y brings the files in and backs up first', async () => { /* chain-synced fixture with a fresh pass on lab-00/easy that added AGENTS.md: i on lab-01/easy shows "AGENTS.md ← lab-00 easy", y writes it to src/, a recovery backup exists, entry.brought.files lists it, and the header then says "your work, brought in on" */ });

test('NO_COLOR and --no-anim draw plain frames that fit 80 columns', () => { /* spawnSync a child with NO_COLOR=1 that starts the TUI on fake 80×24 streams (anim: false), presses ⏎, 1, ?, b, q and prints the frames: no "\x1b[38;5" colour codes, every line ≤ 80 columns, exit code 0 */ });
```

(The last two tests are written out in full in the test file; the comments give their exact assertions.)

- [ ] **Step 2: Run** `node --test labs/_harness/tests/tui.test.mjs` → the new tests fail.
- [ ] **Step 3: Implement** the screens and the `tui.mjs` changes listed above.
- [ ] **Step 4: Run** the whole suite → pass.
- [ ] **Step 5: Commit** `TUI: five tiers, where a level starts, bring, milestones and next up`.

### Task 10: Linear mode and the docs

**Files:** Modify `labs/_harness/linear.mjs`, `readme.md`; test `labs/_harness/tests/linear.test.mjs`.

- [ ] **Step 1: Write failing tests** (append to `linear.test.mjs`): `show` prints `Starts from:` and the milestone list; `hint` on a milestone level reveals the current milestone's hint; `bring` prints the plan and `bring yes` applies it.
- [ ] **Step 2: Run** → fail. **Step 3: Implement**: `show` adds the starting point and milestones; `hint` uses `revealNextHint`; new `bring` / `bring yes` commands; HELP lists them.
- [ ] **Step 4: Docs.** `readme.md`: the five tiers (👥 easy together, 🏠 the rest as homework) with themes and times; the chain in "How the labs work" (replacing "Every level is a standalone mini-project…": every level starts from the reference result of the level before it, so you can start anywhere, and `i` brings your own harness forward); the keys table gets `i` and `1 2 3 4 5`; "Without the app" gets `bring`; "For facilitators" gets `sync-seeds` and `verify --chain --bring`.
- [ ] **Step 5: Run** the suite → pass. **Commit** `Linear mode and docs: tiers, the chain and bring`.

### Task 11: Phase verification

- [ ] **Step 1:** `node --test "labs/_harness/tests/*.test.mjs"` → all pass.
- [ ] **Step 2:** `node labs/start.mjs verify --chain --bring` → the chain is in sync, 24/24 levels ✅, every bring simulation ✅, the starter manifest matches the committed starters.
- [ ] **Step 3:** Agent checks against `sol/` after the re-seed (spec §5.10), one run per level that has `tests/agent.mjs`, each capped at 30 AI credits: `node labs/start.mjs test <lab> <level> --sol --agent`. Record pass/fail per level. A failure caused by the re-seed (more harness in the seed changes what the agent does) is fixed in that level's prompt or seed; anything else is reported as an open issue.
- [ ] **Step 4:** TUI smoke at 80×24 and 120×40, with `--no-anim` and `NO_COLOR=1` (the Task 9 tests), plus one real start: `node labs/start.mjs --no-intro --no-anim` in a terminal, navigate home → lab → exercise → `i` → `b` → `q`.
- [ ] **Step 5:** Commit any fixes, then report to the coordinator: what was built, the verification output, the deviations above (plus any found while implementing), and open issues. Wait for the go-ahead before Phase 2.


---

## Notes from the implementation (added while executing)

- **Base:** PR #1 moved from `e1928e6` to `6dae8a5` before work started; this branch is rebased onto `6dae8a5`.
- **Conflicts (Task 4):** a solution file that the new upstream version already contains byte for byte is *absorbed*,
  not reported as a conflict. A file already reported as edited or deleted is not reported again as a conflict.
- **PR #1 lock bug (found by Task 5's extra test load):** on Windows, creating `.progress.json.lock` while another
  process deletes it fails with `EPERM`; `locked()` then wrote without the lock and the concurrency test lost
  updates. Fixed in its own commit (retry up to ~40 times on `EPERM`/`EACCES`/`EBUSY`), so it can be ported to PR #1.
- **Next up (Task 8):** one PR #1 TUI test assumed "first unfinished exercise"; it now follows the spec rule (back to
  your last level first). The test keeps its intent: a stale pass counts as unfinished.
- **`local` (after the agent sweep):** `FINDINGS.md` and `team-notes.md` are Lab 01 easy's inputs. They no longer
  travel past it (`course.json`), as before the chain.
- **Agent checks after the re-seed (Task 11):** run on copies of `sol/` in `labs/.runs/sol-sweep/`, with every
  `--max-ai-credits` above 30 lowered to 30 in the copy (lab-03/hard's fixer and lab-05/hard's leash use 50). Two
  checks fail, and fail the same way on the pre-re-seed `sol/`, so they are not caused by the chain: lab-01/hard (the
  "without instructions" run still reads `AGENTS.md` as a file and prints the canary) and lab-05/medium case 1 (the
  agent obeys `AGENTS.md` and never tries `npm install`, so the guard has nothing to deny). Both levels are rewritten
  in Phase 4.
- **Tests (Tasks 7, 9):** the tests described by comments in this plan were written out in full.
- **PR #1 lock bug, part 2 (found while verifying):** under load the concurrency test still lost updates. Tracing
  every lock acquire/release showed a second cause: a waiting writer saw a just-released lock (Windows keeps it visible
  for a moment) whose owner had exited, deleted it, and so deleted the next writer's brand-new lock. A lock with a gone
  owner is now broken only after 1 s. Stress test (4 runs × 4 writers × 25 writes): PR #1's original lost updates in
  18 of 40 runs, part 1 alone in 10 of 40, both parts in 0 of 60.
- **Agent re-sweep after the `local` change:** 11 of 12 changed levels pass. lab-05/easy failed this time and passed in
  the first sweep: the agent chose a command spelling outside `--allow-tool=shell(rm)`, so Copilot refused it before
  the hook ran. Run-to-run variance in a pre-existing check (Windows); noted for Lab 05's Phase 4 rewrite.
