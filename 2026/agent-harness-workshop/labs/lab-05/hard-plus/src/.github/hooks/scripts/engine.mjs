// ⚙️ The policy engine. The guard asks it one question per tool call: given this policy, allow or deny?
//   validatePolicy(policy) → problems        normalize(toolName, args) → a call        evaluate(policy, call) → a decision
// policy.json: { version: 1, default: "allow" | "deny", rules: [{ id, decision, severity, reason, match }] }
// match (every key given must match; regexes are case-insensitive):
//   tool         "shell" | "write" | "read" | a tool name, or a list of those
//   command      tested against each normalised command, e.g. "delete --force --recursive build"
//   commandLine  tested against the whole shell command (whitespace collapsed)
//   path         tested against each path the call touches (a file tool's path; a shell command's arguments)
//   text         tested against JSON.stringify(args)

export const SEVERITY = ['low', 'medium', 'high', 'critical'];
export const MATCH_KEYS = ['tool', 'command', 'commandLine', 'path', 'text'];
const SHELL = new Set(['bash', 'powershell', 'shell']);
const WRITE = new Set(['edit', 'create', 'write', 'apply_patch', 'str_replace_editor', 'multi_edit']);
const READ = new Set(['view', 'read', 'grep', 'glob', 'rg']);

// ---------- plumbing: you don't need to change anything in this block ----------
/** Split a shell command into segments at &&, ||, ;, |, & and newlines (not inside quotes). */
export function segments(command) {
  const out = [];
  let cur = '';
  let quote = null;
  const s = String(command ?? '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === ';' || ch === '\n' || ch === '|' || ch === '&') { if (cur.trim()) out.push(cur.trim()); cur = ''; if (s[i + 1] === ch) i++; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
/** Split one segment into words; quotes group words and are removed: `rd /s "my dir"` → ['rd', '/s', 'my dir']. */
export function tokens(segment) {
  const out = [];
  for (const m of String(segment).matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)) out.push(m[1] ?? m[2] ?? m[3]);
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
  // TODO (M1): check version, default, the rules list, and each rule: id (unique, lowercase-dashes), decision,
  // a reason and a severity for deny rules, and a match with known keys whose regexes compile (use compile()).
  return [];
}

// ---------- M3 · one command, many spellings ----------
// Names you will need in canonical() and unwrap():
const DELETE = new Set(['rm', 'remove-item', 'ri', 'del', 'erase', 'rd', 'rmdir']);
const CMD_DELETE = new Set(['del', 'erase', 'rd', 'rmdir']);
const PREFIXES = new Set(['sudo', 'doas', 'env', 'command', 'exec', 'nohup', 'time', 'xargs']);
const SHELLS = { bash: 'bash', sh: 'bash', zsh: 'bash', dash: 'bash', cmd: 'cmd', powershell: 'powershell', pwsh: 'powershell' };

/**
 * The words of one command in a canonical form. The delete family (rm, Remove-Item, ri, del, erase, rd, rmdir) becomes
 * name "delete" with sorted flags: `rm -rf x`, `Remove-Item x -Recurse -Force` and `rd /s /q x` all become
 * "delete --force --recursive x". Every other command keeps its words: "npm install lodash".
 */
export function canonical(words, dialect = 'bash') {
  // TODO (M3): the delete family with bash (-r -f -rf --recursive --force), PowerShell (-Recurse -rec -Force -fo) and
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
  // TODO (M3): drop prefixes (sudo, env, VAR=value, xargs, …) and open shells inside shells (bash -c, cmd /c,
  // powershell -Command, Invoke-Expression). Return { command, dialect }, or null when there is nothing to unwrap.
  return null;
}

function commandsOf(command, dialect, depth) {
  return segments(command).flatMap((segment) => {
    const words = tokens(segment);
    const inner = depth < 3 ? unwrap(words, dialect) : null;
    return inner ? commandsOf(inner.command, inner.dialect, depth + 1) : [canonical(words, dialect)];
  });
}

/** A tool call, ready for the rules: { tool, kind, commands, commandLine, paths, text }. */
export function normalize(toolName, args = {}) {
  const tool = String(toolName ?? '');
  const a = args && typeof args === 'object' ? args : {};
  const kind = SHELL.has(tool) ? 'shell' : WRITE.has(tool) ? 'write' : READ.has(tool) ? 'read' : 'other';
  const commandLine = kind === 'shell' ? String(a.command ?? '').replace(/\s+/g, ' ').trim() : '';
  const commands = kind === 'shell' ? commandsOf(commandLine, tool === 'powershell' ? 'powershell' : 'bash', 0) : [];
  const paths = [...(typeof a.path === 'string' ? [a.path] : []), ...commands.flatMap((c) => c.args)];
  return { tool, kind, commands, commandLine, paths, text: JSON.stringify(a) };
}

// ---------- M2 · the engine ----------

/**
 * The decision for one call. Deny wins: the matching deny rule with the highest severity (the first one on a tie);
 * otherwise the first matching allow rule; otherwise the policy's default.
 */
export function evaluate(policy, call) {
  // TODO (M2): find the rules whose match fits the call (every key given must match: tool, command, commandLine,
  // path, text), then decide: deny wins (highest severity), else the first allow, else policy.default.
  return { decision: 'allow', rule: null, severity: null, reason: null, matched: [] };
}
