#!/usr/bin/env node
// vet-skill: review a skill before you install it. It only READS files: it never runs, imports or installs anything
// from the skill, so it is safe to point at a skill you don't trust.
//   node scripts/vet-skill.mjs vendor/grade-sync     one skill
//   node scripts/vet-skill.mjs vendor                every skill in a folder (a library)
//   node scripts/vet-skill.mjs vendor --json         the findings as JSON
// Exit code: 2 when a skill should be blocked, 1 when one needs a human review, 0 when every skill looks fine.
//
// Given: RULES, finding(), parseFrontmatter(), readSkill(), grep(), vetSkill(), the text report and the folder handling.
// Your work: TODO(M1) checkFrontmatter · TODO(M2) checkScripts · TODO(M3) checkTrust · TODO(M4) verdictOf, --json and
// the exit code in main(). Every finding is { rule, severity, file, line, message }: use finding(rule, file, line, msg).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Every rule and its severity. block: it can hurt you if it runs. review: a person has to look. */
export const RULES = {
  frontmatter: 'review',
  name: 'review',
  description: 'review',
  'absolute-path': 'review',
  network: 'review',
  secrets: 'review',
  'allowed-tools': 'block',
  'hidden-instructions': 'block',
  eval: 'block',
  'pipe-to-shell': 'block',
  'write-outside': 'block',
  exfiltration: 'block',
};
export const finding = (rule, file, line, message) => ({ rule, severity: RULES[rule], file, line, message });

/** The frontmatter between two `---` lines: { data, body, bodyLine, keyLines }, or null. Values: plain, quoted or [a, b]. */
export function parseFrontmatter(text) {
  const lines = String(text).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n');
  if (lines[0].trim() !== '---') return null;
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (end < 0) return null;
  const data = {};
  const keyLines = {};
  for (let i = 1; i < end; i++) {
    const m = lines[i].match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    const quoted = v.match(/^"(.*)"$|^'(.*)'$/);
    if (quoted) v = quoted[1] ?? quoted[2];
    else {
      v = v.replace(/\s+#.*$/, '');
      if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    }
    data[m[1]] = v;
    keyLines[m[1]] = i + 1;
  }
  return { data, body: lines.slice(end + 1).join('\n'), bodyLine: end + 2, keyLines };
}

/** A skill folder as text: { dir, folder, files: [{ rel, text, lines }], hasSkillMd, skillMd }. Binary and huge files are skipped. */
export function readSkill(dir) {
  const files = [];
  const walk = (abs, rel, depth) => {
    if (depth > 6) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      const p = path.join(abs, e.name);
      if (e.isDirectory()) walk(p, r, depth + 1);
      else if (e.isFile() && fs.statSync(p).size <= 512 * 1024) {
        const buf = fs.readFileSync(p);
        if (buf.includes(0)) continue;
        const text = buf.toString('utf8').replace(/\r\n/g, '\n');
        files.push({ rel: r, text, lines: text.split('\n') });
      }
    }
  };
  if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) walk(dir, '', 0);
  const md = files.find((f) => f.rel === 'SKILL.md');
  return { dir, folder: path.basename(path.resolve(dir)), files, hasSkillMd: Boolean(md), skillMd: md ? parseFrontmatter(md.text) : null };
}

/** Every line that matches `re`, in every file (or the files `only` accepts): [{ file, line, text }]. */
export function grep(skill, re, only = () => true) {
  const out = [];
  for (const f of skill.files.filter(only)) f.lines.forEach((text, i) => { if (re.test(text)) out.push({ file: f.rel, line: i + 1, text }); });
  return out;
}

// ---------- M1 · the label ----------
export function checkFrontmatter(skill) {
  // TODO(M1): `frontmatter` when there is no SKILL.md or no frontmatter; `name` when it's missing, not
  // lowercase-with-hyphens, or not the folder's name; `description` when it's missing, under 40 characters, never says
  // when to use it, or is over 1,024 characters. Point each finding at SKILL.md and the key's line (skillMd.keyLines).
  void skill;
  return [];
}

// ---------- M2 · the code ----------
export function checkScripts(skill) {
  // TODO(M2): one finding per matching line, in every file (SKILL.md too): `network`, `eval`, `pipe-to-shell`, and
  // `write-outside` (a write and an outside target on the same line). See todo.md for what each one covers.
  void skill;
  return [];
}

// ---------- M3 · between the lines ----------
export function checkTrust(skill, scriptFindings = checkScripts(skill)) {
  // TODO(M3): `allowed-tools` that pre-approve a shell or writes; `hidden-instructions` in SKILL.md's body (phrases,
  // and HTML comments that tell the model to do something); `absolute-path`; `secrets`; and one `exfiltration` when
  // the skill reads secrets and a `network` finding exists too.
  void skill;
  void scriptFindings;
  return [];
}

// ---------- M4 · the verdict ----------
export function verdictOf(findings) {
  // TODO(M4): 'block' when any finding is a block, else 'review' when any is a review, else 'ok'.
  void findings;
  return 'ok';
}

export function vetSkill(dir) {
  const skill = readSkill(dir);
  const scripts = checkScripts(skill);
  const findings = [...checkFrontmatter(skill), ...scripts, ...checkTrust(skill, scripts)];
  return { skill: skill.folder, dir, verdict: verdictOf(findings), findings };
}

/** A folder with a SKILL.md is one skill; a folder of skill folders is a library. */
function expand(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory() || fs.existsSync(path.join(dir, 'SKILL.md'))) return [dir];
  const subs = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'SKILL.md'))).map((e) => path.join(dir, e.name));
  return subs.length ? subs.sort() : [dir];
}

const ICON = { block: '⛔', review: '⚠️ ', ok: '✅' };
export function textReport(results) {
  const lines = [];
  for (const r of results) {
    lines.push(`🔍 ${r.skill} · ${ICON[r.verdict]} ${r.verdict} (${r.findings.length} finding${r.findings.length === 1 ? '' : 's'})`);
    for (const f of r.findings) lines.push(`   ${ICON[f.severity]} ${f.rule.padEnd(19)} ${`${f.file}:${f.line}`.padEnd(26)} ${f.message}`);
  }
  return lines.join('\n');
}

export function main(argv, { log = console.log } = {}) {
  const targets = argv.filter((a) => !a.startsWith('--'));
  if (!targets.length) {
    log('Usage: node scripts/vet-skill.mjs <skill folder or folder of skills>... [--json]');
    return 2;
  }
  const results = targets.flatMap(expand).map(vetSkill);
  // TODO(M4): with --json, log JSON.stringify(results, null, 2) instead; return 2 when any skill is blocked, 1 when
  // any needs review, else 0 (CI can stop on it).
  log(textReport(results));
  return 0;
}

const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } };
if (isMain()) process.exitCode = main(process.argv.slice(2));
