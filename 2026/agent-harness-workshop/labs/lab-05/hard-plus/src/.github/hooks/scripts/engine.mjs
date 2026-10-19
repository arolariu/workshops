// ⚙️ The policy engine. The guard asks it one question per tool call: given this policy, allow or deny?
//   validatePolicy(policy) → problems        normalize(toolName, args) → a call        evaluate(policy, call) → a decision
// policies/repo.json: { version: 1, default: "allow" | "deny", rules: [{ id, decision, severity, reason, match }] }
// match (every key given must match; regexes are case-insensitive):
//   tool         "shell" | "write" | "read" | a tool name, or a list of those
//   command      tested against each normalised command, e.g. "delete --force --recursive build"
//   commandLine  tested against the whole shell command (whitespace collapsed)
//   path         tested against each path the call touches (a file tool's path; a shell command's arguments)
//   text         tested against JSON.stringify(args)
// A deny rule fires when one command of the call matches. An allow rule speaks for the whole call: its `command`
// pattern must match every command, or `npm test && rm -rf src` would ride along on an allow rule for `npm test`.
//
// Where the work goes: TODO(M1) validatePolicy and policies/repo.json · TODO(M2) evaluate, and guard.mjs asks it
// · TODO(M3) canonical and unwrap · TODO(M4) guard.mjs fails closed: no usable policy, an unreadable call, or no
// decision within DEADLINE_MS denies · TODO(M5) rules for the calls an injection would make, in policies/repo.json.

export const SEVERITY = ['low', 'medium', 'high', 'critical'];
export const MATCH_KEYS = ['tool', 'command', 'commandLine', 'path', 'text'];
const SHELL = new Set(['bash', 'powershell', 'shell']);
const WRITE = new Set(['edit', 'create', 'write', 'apply_patch', 'str_replace_editor', 'multi_edit']);
const READ = new Set(['view', 'read', 'grep', 'glob', 'rg']);

// ---------- plumbing: you don't need to change anything in this block ----------
/**
 * Split a shell command into segments at &&, ||, ;, |, & and newlines: not inside quotes, not inside ( ), { } or $( ),
 * and not in a redirection (2>&1, >&2, &>). A backslash (bash), backtick (PowerShell) or caret (cmd) escapes the next
 * character. If the brackets don't balance (`echo {; rm -rf x`), it splits as if there were none.
 */
export function segments(command, dialect = 'bash') {
  return split(String(command ?? ''), dialect, true) ?? split(String(command ?? ''), dialect, false);
}
function split(s, dialect, nest) {
  const out = [];
  const esc = dialect === 'powershell' ? '`' : dialect === 'cmd' ? '^' : '\\';
  let cur = '';
  let quote = null;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === esc && quote !== "'" && i + 1 < s.length && s[i + 1] !== '\n') { cur += ch + s[i + 1]; i++; continue; }
    if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (nest && (ch === '(' || ch === '{')) depth++;
    if (nest && (ch === ')' || ch === '}') && depth > 0) depth--;
    const redirect = ch === '&' && (/[<>]$/.test(cur) || s[i + 1] === '>');
    if (!depth && !redirect && (ch === ';' || ch === '\n' || ch === '|' || ch === '&')) { if (cur.trim()) out.push(cur.trim()); cur = ''; if (s[i + 1] === ch) i++; continue; }
    cur += ch;
  }
  if (depth) return null;
  if (cur.trim()) out.push(cur.trim());
  return out;
}
/**
 * Split one segment into words; quotes group words and are removed: `rd /s "my dir"` → ['rd', '/s', 'my dir']. Escaped
 * quotes stay in their word: bash `"say \\"hi\\""`, PowerShell `"say `"hi`""` and `'it''s'`.
 */
export function tokens(segment, dialect = 'bash') {
  const out = [];
  const s = String(segment);
  const esc = dialect === 'powershell' ? '`' : '\\';
  let word = '';
  let has = false;
  let quote = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote === "'") {
      if (ch === "'" && dialect === 'powershell' && s[i + 1] === "'") { word += "'"; i++; continue; }
      if (ch === "'") quote = null; else word += ch;
      continue;
    }
    if (quote === '"') {
      if (ch === esc && (s[i + 1] === '"' || s[i + 1] === esc)) { word += s[i + 1]; i++; continue; }
      if (ch === '"' && dialect === 'powershell' && s[i + 1] === '"') { word += '"'; i++; continue; }
      if (ch === '"') quote = null; else word += ch;
      continue;
    }
    if (ch === esc && (s[i + 1] === '"' || s[i + 1] === "'")) { word += s[i + 1]; has = true; i++; continue; }
    if (ch === '"' || ch === "'") { quote = ch; has = true; continue; }
    if (/\s/.test(ch)) { if (has) out.push(word); word = ''; has = false; continue; }
    word += ch;
    has = true;
  }
  if (has) out.push(word);
  return out;
}
/** The bodies of the { … } blocks in a segment (script blocks, function bodies), not ${…} or @{…}, not in quotes. */
export function blocks(segment, dialect = 'bash') {
  const out = [];
  const s = String(segment);
  const esc = dialect === 'powershell' ? '`' : '\\';
  let depth = 0;
  let start = -1;
  let skip = false;
  let quote = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === esc && quote !== "'") { i++; continue; }
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '{') { if (!depth) { skip = /[$@]/.test(s[i - 1] ?? ''); start = i + 1; } depth++; continue; }
    if (ch === '}' && depth > 0 && --depth === 0 && !skip) out.push(s.slice(start, i));
  }
  return out;
}
/** A command's name without its folder or extension, in lower case: C:\Windows\System32\cmd.exe → cmd. */
export const base = (word) => String(word ?? '').split(/[\\/]/).pop().replace(/\.(exe|cmd|bat|ps1)$/i, '').toLowerCase();
const requote = (words) => words.map((w) => (/\s/.test(w) ? JSON.stringify(w) : w)).join(' ');
const cache = new Map();
/** A case-insensitive RegExp for a policy pattern (cached). Throws if the pattern is not a valid regex. */
export function compile(source) {
  if (!cache.has(source)) cache.set(source, new RegExp(source, 'i'));
  return cache.get(source);
}

// ---------- M1 · the policy file ----------
/** Everything wrong with a policy, in words a human can fix; [] when it is valid. */
export function validatePolicy(policy) {
  // TODO(M1): check version, default, the rules list, and each rule: id (unique, lowercase-dashes), decision,
  // a reason and a severity for deny rules, and a match with known keys whose regexes compile (use compile()).
  return [];
}

// ---------- M3 · one command, many spellings ----------
// Names you will need in canonical() and unwrap():
const DELETE = new Set(['rm', 'remove-item', 'ri', 'del', 'erase', 'rd', 'rmdir']);
const CMD_DELETE = new Set(['del', 'erase', 'rd', 'rmdir']);
const PREFIXES = new Set(['sudo', 'doas', 'env', 'command', 'exec', 'nohup', 'time', 'xargs', 'nice', 'ionice', 'timeout', 'stdbuf']);
// Flags of a prefix that take a value (sudo -u root, xargs -I {}, nice -n 10, timeout -s KILL); timeout also takes a duration.
const VALUE_FLAGS = { sudo: /^-[ugCphrtD]$/, doas: /^-[uC]$/, env: /^-[uSC]$/, xargs: /^-[IinLPdsEa]$/, nice: /^-n$/, ionice: /^-[cnp]$/, timeout: /^-[sk]$/ };
// Words that start a compound command (`then rm …`, `! rm …`); unwrap() can drop them like a prefix.
const KEYWORDS = new Set(['then', 'do', 'else', 'elif', 'if', 'while', 'until', '!', '&']);
const SHELLS = { bash: 'bash', sh: 'bash', zsh: 'bash', dash: 'bash', cmd: 'cmd', powershell: 'powershell', pwsh: 'powershell' };

/**
 * The words of one command in a canonical form. The delete family (rm, Remove-Item, ri, del, erase, rd, rmdir) becomes
 * name "delete" with sorted flags: `rm -rf x`, `Remove-Item x -Recurse -Force` and `rd /s /q x` all become
 * "delete --force --recursive x". Every other command keeps its words: "npm install lodash".
 */
export function canonical(words, dialect = 'bash') {
  // TODO(M3): the delete family with bash (-r -f -rf --recursive --force), PowerShell (-Recurse -rec -Force -fo) and
  // cmd (/s /q) flags. Until then, every command keeps its words, so "rm -rf x" stays "rm -rf x".
  const name = base(words[0]);
  const rest = words.slice(1);
  return { name, flags: [], args: rest, line: [name, ...rest].join(' ') };
}

/**
 * The command a wrapper runs, or null. Prefixes are dropped (`sudo -E rm …`, `env A=1 rm …`, `xargs rm …`), and shells
 * inside shells are opened up: `bash -c "…"`, `cmd /c "…"`, `powershell -NoProfile -Command "…"`, `Invoke-Expression "…"`.
 */
export function unwrap(words, dialect = 'bash') {
  // TODO(M3): drop prefixes (sudo, env, VAR=value, xargs, …) and open shells inside shells (bash -c, cmd /c,
  // powershell -Command, Invoke-Expression). Return { command, dialect }, or null when there is nothing to unwrap.
  return null;
}

const MAX_DEPTH = 5;
function commandsOf(command, dialect, depth) {
  return segments(command, dialect).flatMap((segment) => {
    const words = tokens(segment, dialect);
    const inner = depth < MAX_DEPTH ? unwrap(words, dialect) : null;
    // Code inside a command runs too: `echo $(rm -rf x)`, `A=$(rm -rf x) ls`, bash backticks, and the script blocks of
    // `gci | ForEach-Object { Remove-Item $_ -Recurse -Force }`, `if ($x) { … }` or `f() { …; }`.
    const code = depth < MAX_DEPTH ? [
      ...[...segment.matchAll(/\$\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)].map((m) => m[1]),
      ...(dialect === 'powershell' ? [] : [...segment.matchAll(/`([^`]+)`/g)].map((m) => m[1])),
      ...blocks(segment, dialect),
    ] : [];
    const hidden = code.filter((c) => c.trim()).flatMap((c) => commandsOf(c, dialect, depth + 1));
    return [...(inner ? commandsOf(inner.command, inner.dialect, depth + 1) : [canonical(words, dialect)]), ...hidden];
  });
}

/** A tool call, ready for the rules: { tool, kind, commands, commandLine, paths, text }. */
export function normalize(toolName, args = {}) {
  const tool = String(toolName ?? '');
  const a = args && typeof args === 'object' ? args : {};
  const kind = SHELL.has(tool) ? 'shell' : WRITE.has(tool) ? 'write' : READ.has(tool) ? 'read' : 'other';
  const dialect = tool === 'powershell' ? 'powershell' : 'bash';
  // A newline separates commands like `;` does (a line ending in \\ or a PowerShell backtick goes on), so only the
  // spaces in a line are collapsed before splitting; commandLine is the whole call on one line.
  const raw = kind === 'shell' ? String(a.command ?? '').replace(/\r\n?/g, '\n').replace(dialect === 'powershell' ? /`\n/g : /\\\n/g, ' ') : '';
  const commandLine = raw.replace(/\s+/g, ' ').trim();
  const commands = kind === 'shell' ? commandsOf(raw.replace(/[ \t]+/g, ' ').trim(), dialect, 0) : [];
  const paths = [...(typeof a.path === 'string' ? [a.path] : []), ...commands.flatMap((c) => c.args)];
  return { tool, kind, commands, commandLine, paths, text: JSON.stringify(a) };
}

// ---------- M2 · the engine ----------

/**
 * The decision for one call. Deny wins: the matching deny rule with the highest severity (the first one on a tie);
 * otherwise the first matching allow rule; otherwise the policy's default.
 */
export function evaluate(policy, call) {
  // TODO(M2): find the rules whose match fits the call (every key given must match: tool, command, commandLine,
  // path, text), then decide: deny wins (highest severity), else the first allow, else policy.default.
  return { decision: 'allow', rule: null, severity: null, reason: null, matched: [] };
}
