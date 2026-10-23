#!/usr/bin/env node
// vet-skill: review a skill before you install it. It only READS files: it never runs, imports or installs anything
// from the skill, so it is safe to point at a skill you don't trust.
//   node scripts/vet-skill.mjs vendor/grade-sync     one skill
//   node scripts/vet-skill.mjs vendor                every skill in a folder (a library)
//   node scripts/vet-skill.mjs vendor --json         the findings as JSON
// Exit code: 2 when a skill should be blocked, 1 when one needs a human review, 0 when every skill looks fine.
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
const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const WHEN = /\buse (it |this )?when\b|\bwhen (the user|you|asked|someone)\b|\buse (it )?(after|before|to|for)\b/i;

export function checkFrontmatter(skill) {
  if (!skill.hasSkillMd) return [finding('frontmatter', 'SKILL.md', 1, 'There is no SKILL.md: this folder is not a skill.')];
  const fm = skill.skillMd;
  if (!fm) return [finding('frontmatter', 'SKILL.md', 1, 'SKILL.md has no frontmatter (name and description between two --- lines), so it cannot load.')];
  const out = [];
  const at = (key) => fm.keyLines[key] ?? 1;
  const name = String(fm.data.name ?? '').trim();
  if (!name) out.push(finding('name', 'SKILL.md', 1, 'No name.'));
  else {
    if (!NAME.test(name) || name.length > 64) out.push(finding('name', 'SKILL.md', at('name'), `"${name}" is not lowercase-with-hyphens.`));
    if (name !== skill.folder) out.push(finding('name', 'SKILL.md', at('name'), `The name "${name}" doesn't match its folder "${skill.folder}".`));
  }
  const d = String(fm.data.description ?? '').trim();
  if (!d) out.push(finding('description', 'SKILL.md', 1, 'No description: the model can never pick this skill.'));
  else {
    if (d.length < 40) out.push(finding('description', 'SKILL.md', at('description'), `The description is ${d.length} characters: say what it does and when to use it.`));
    if (!WHEN.test(d)) out.push(finding('description', 'SKILL.md', at('description'), 'The description never says when to use it ("Use when …").'));
    if (d.length > 1024) out.push(finding('description', 'SKILL.md', at('description'), `The description is ${d.length} characters (the limit is 1,024), and it is in the context on every turn.`));
  }
  return out;
}

// ---------- M2 · the code ----------
export const NETWORK = /\bfetch\s*\(|\b(?:https?|net|tls|dgram)\.(?:request|get|connect|createConnection)\s*\(|\bfrom\s+['"](?:node:)?(?:https?|net|tls|dgram)['"]|\brequire\(\s*['"](?:node:)?(?:https?|net|tls|dgram)['"]\s*\)|\bnew\s+WebSocket\b|\bXMLHttpRequest\b|\b(?:curl|wget)\s|\b(?:Invoke-WebRequest|Invoke-RestMethod)\b|\b(?:iwr|irm)\s/i;
const EVAL = /\beval\s*\(|\bnew\s+Function\s*\(|\bvm\.(?:runIn\w+|Script)\b|\bInvoke-Expression\b|\biex\b/i;
const FETCHER = String.raw`(?:curl|wget|iwr|irm|Invoke-WebRequest|Invoke-RestMethod)`;
const PIPE_TO_SHELL = new RegExp(String.raw`\b${FETCHER}\b[^|\n]*\|\s*(?:sudo\s+)?(?:sh|bash|zsh|dash|iex|Invoke-Expression|pwsh|powershell|node|python3?)\b|\b(?:sh|bash|zsh)\s+(?:-c\s+)?["']?\$\(\s*(?:curl|wget)\b|\b(?:sh|bash)\s+<\(\s*(?:curl|wget)\b|\biex\s*\(?\s*\(?\s*${FETCHER}\b`, 'i');
const WRITES = /\b(?:writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|copyFile|copyFileSync|cpSync|rename|renameSync|symlink|symlinkSync|mkdir|mkdirSync|rmSync|unlink|unlinkSync)\s*\(|(?:^|\s)>{1,2}\s*\S|\b(?:Set-Content|Add-Content|Out-File|New-Item|Copy-Item|Move-Item|Remove-Item)\b|\b(?:tee|cp|mv|rm|install|mkdir)\s/;
const OUTSIDE = /(?:^|[\s'"`(=,])(?:\/(?:etc|usr|var|bin|sbin|root|opt|Library|System|Users|home)\b|~\/|[A-Za-z]:\\|\.\.[\\/])|\b(?:os\.)?homedir\(\)|\bprocess\.env\.(?:HOME|USERPROFILE|APPDATA|LOCALAPPDATA)\b|\$HOME\b|\$env:(?:USERPROFILE|APPDATA|LOCALAPPDATA|HOME)\b|%(?:USERPROFILE|APPDATA|LOCALAPPDATA)%/i;

export function checkScripts(skill) {
  const out = [];
  for (const h of grep(skill, NETWORK)) out.push(finding('network', h.file, h.line, `It talks to the network: ${h.text.trim().slice(0, 80)}`));
  for (const h of grep(skill, EVAL)) out.push(finding('eval', h.file, h.line, `It runs code from a string: ${h.text.trim().slice(0, 80)}`));
  for (const h of grep(skill, PIPE_TO_SHELL)) out.push(finding('pipe-to-shell', h.file, h.line, `It pipes a download into a shell: ${h.text.trim().slice(0, 80)}`));
  for (const h of grep(skill, WRITES)) {
    if (OUTSIDE.test(h.text)) out.push(finding('write-outside', h.file, h.line, `It writes outside the project: ${h.text.trim().slice(0, 80)}`));
  }
  return out;
}

// ---------- M3 · between the lines ----------
const PRE_APPROVED = /^(?:shell|bash|powershell|pwsh|write|edit|\*|all)\b/i;
const HIDDEN = /\b(?:silently|quietly|secretly)\b|\bwithout (?:asking|telling|confirm\w*|the user knowing)\b|\b(?:do not|don'?t|never) (?:tell|mention|show|inform|ask)\b|\bignore (?:all |any )?(?:the )?(?:previous|prior|earlier|other|above) instructions\b|\bhide (?:this|it|the output)\b/i;
const ACTS = /\b(?:run|execute|call|send|upload|download|install|read|open|fetch|curl|delete|copy)\b/i;
const ABSOLUTE = /(?:^|[\s'"`(=,])(?:[A-Za-z]:\\[\w$]|\/(?:Users|home)\/[\w.$-])/;
const SECRETS = /(?:^|[\s'"`(/\\=,])\.env\b(?!\.example)|\bid_(?:rsa|ed25519|ecdsa)\b|[\\/]\.ssh\b|\.npmrc\b|\.git-credentials\b|\.aws[\\/]credentials\b|[\\/]\.copilot\b|\b(?:GITHUB_TOKEN|GH_TOKEN|COPILOT_GITHUB_TOKEN|NPM_TOKEN|AWS_SECRET_ACCESS_KEY|OPENAI_API_KEY)\b|JSON\.stringify\(\s*process\.env\s*\)/;

export function checkTrust(skill, scriptFindings = checkScripts(skill)) {
  const out = [];
  const fm = skill.skillMd;
  const md = skill.files.find((f) => f.rel === 'SKILL.md');
  if (fm) {
    const raw = fm.data['allowed-tools'];
    const tools = (Array.isArray(raw) ? raw : String(raw ?? '').split(',')).map((s) => String(s).trim()).filter(Boolean);
    for (const tool of tools.filter((x) => PRE_APPROVED.test(x))) {
      out.push(finding('allowed-tools', 'SKILL.md', fm.keyLines['allowed-tools'] ?? 1, `allowed-tools pre-approves "${tool}": every command this skill asks for runs without asking you.`));
    }
  }
  if (md) {
    const start = fm ? fm.bodyLine - 1 : 0;
    md.lines.forEach((text, i) => {
      if (i >= start && HIDDEN.test(text)) out.push(finding('hidden-instructions', 'SKILL.md', i + 1, `An instruction to act behind your back: ${text.trim().slice(0, 80)}`));
    });
    for (const m of md.text.matchAll(/<!--([\s\S]*?)-->/g)) {
      const line = md.text.slice(0, m.index).split('\n').length;
      if (line > start && ACTS.test(m[1]) && !out.some((f) => f.rule === 'hidden-instructions' && f.line === line)) {
        out.push(finding('hidden-instructions', 'SKILL.md', line, 'An HTML comment tells the model to do something: people never see it, the model does.'));
      }
    }
  }
  for (const h of grep(skill, ABSOLUTE)) out.push(finding('absolute-path', h.file, h.line, `An absolute path from someone's machine: ${h.text.trim().slice(0, 80)}`));
  const secrets = grep(skill, SECRETS);
  for (const h of secrets) out.push(finding('secrets', h.file, h.line, `It reads secrets: ${h.text.trim().slice(0, 80)}`));
  const network = scriptFindings.find((f) => f.rule === 'network' && f.file === secrets[0]?.file) ?? scriptFindings.find((f) => f.rule === 'network');
  if (secrets.length && network) {
    out.push(finding('exfiltration', secrets[0].file, secrets[0].line, `It reads secrets (${secrets[0].file}:${secrets[0].line}) and talks to the network (${network.file}:${network.line}): that is how secrets leave your machine.`));
  }
  return out;
}

// ---------- M4 · the verdict ----------
export function verdictOf(findings) {
  if (findings.some((f) => f.severity === 'block')) return 'block';
  if (findings.some((f) => f.severity === 'review')) return 'review';
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
  log(argv.includes('--json') ? JSON.stringify(results, null, 2) : textReport(results));
  const verdicts = results.map((r) => r.verdict);
  return verdicts.includes('block') ? 2 : verdicts.includes('review') ? 1 : 0;
}

const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } };
if (isMain()) process.exitCode = main(process.argv.slice(2));
