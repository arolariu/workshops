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
const rank = (r) => SEVERITY.indexOf(r.severity);

// ---------- M1 · the policy file ----------
/** Everything wrong with a policy, in words a human can fix; [] when it is valid. */
export function validatePolicy(policy) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) return ['The policy must be a JSON object.'];
  const problems = [];
  if (policy.version !== 1) problems.push('"version" must be 1.');
  if (!['allow', 'deny'].includes(policy.default)) problems.push('"default" must be "allow" or "deny".');
  if (!Array.isArray(policy.rules)) return [...problems, '"rules" must be a list.'];
  const seen = new Set();
  policy.rules.forEach((r, i) => {
    const at = `Rule ${i + 1}${typeof r?.id === 'string' ? ` (${r.id})` : ''}`;
    if (!r || typeof r !== 'object') { problems.push(`${at} must be an object.`); return; }
    if (typeof r.id !== 'string' || !/^[a-z0-9-]+$/.test(r.id)) problems.push(`${at}: "id" must be lowercase letters, digits and dashes.`);
    else if (seen.has(r.id)) problems.push(`${at}: the id "${r.id}" is used twice.`);
    else seen.add(r.id);
    if (!['allow', 'deny'].includes(r.decision)) problems.push(`${at}: "decision" must be "allow" or "deny".`);
    if (r.decision === 'deny' && !String(r.reason ?? '').trim()) problems.push(`${at}: a deny rule needs a "reason" the model can read.`);
    if ((r.decision === 'deny' || r.severity !== undefined) && !SEVERITY.includes(r.severity)) problems.push(`${at}: "severity" must be one of ${SEVERITY.join(', ')}.`);
    const m = r.match;
    if (!m || typeof m !== 'object' || Array.isArray(m) || !Object.keys(m).length) { problems.push(`${at}: "match" needs at least one of ${MATCH_KEYS.join(', ')}.`); return; }
    for (const k of Object.keys(m)) if (!MATCH_KEYS.includes(k)) problems.push(`${at}: unknown match key "${k}".`);
    if (m.tool !== undefined && !(typeof m.tool === 'string' || (Array.isArray(m.tool) && m.tool.length && m.tool.every((x) => typeof x === 'string')))) problems.push(`${at}: "tool" must be a tool kind or name, or a list of them.`);
    for (const k of ['command', 'commandLine', 'path', 'text']) {
      if (m[k] === undefined) continue;
      if (typeof m[k] !== 'string') { problems.push(`${at}: "${k}" must be a regex in a string.`); continue; }
      try { compile(m[k]); } catch (e) { problems.push(`${at}: "${k}" is not a valid regex (${e.message}).`); }
    }
  });
  return problems;
}

// ---------- M3 · one command, many spellings ----------
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
  const name = base(words[0]);
  const rest = words.slice(1);
  if (!DELETE.has(name)) return { name, flags: [], args: rest, line: [name, ...rest].join(' ') };
  const flags = new Set();
  const args = [];
  const ps = dialect === 'powershell' || name === 'remove-item' || name === 'ri';
  for (const w of rest) {
    if (/^\/[a-z]$/i.test(w) && (dialect === 'cmd' || CMD_DELETE.has(name))) {          // cmd: rd /s /q
      if (/s/i.test(w[1])) flags.add('recursive');
      if (/q/i.test(w[1])) flags.add('force');
      continue;
    }
    if (ps && /^-[a-z]+(:\$?\w+)?$/i.test(w)) {                                           // PowerShell: -Recurse, -rec, -Force, -fo
      const p = w.slice(1).split(':')[0].toLowerCase();
      if ('recurse'.startsWith(p)) { flags.add('recursive'); flags.add('force'); continue; } // PowerShell never asks
      if (p.length >= 2 && 'force'.startsWith(p)) { flags.add('force'); continue; }
    }
    if (w === '--recursive') { flags.add('recursive'); continue; }
    if (w === '--force') { flags.add('force'); continue; }
    if (/^-[a-z]+$/i.test(w)) {                                                           // bash: -r -f -rf -Rfv
      if (/r/i.test(w)) flags.add('recursive');
      if (/f/.test(w)) flags.add('force');
      continue;
    }
    if (/^--/.test(w)) continue;
    args.push(w);
  }
  const sorted = [...flags].sort();
  return { name: 'delete', flags: sorted, args, line: ['delete', ...sorted.map((f) => `--${f}`), ...args].join(' ') };
}

/**
 * The command a wrapper runs, or null. Prefixes are dropped (`sudo -E rm …`, `env A=1 rm …`, `xargs rm …`), and shells
 * inside shells are opened up: `bash -c "…"`, `cmd /c "…"`, `powershell -NoProfile -Command "…"`, `Invoke-Expression "…"`.
 */
export function unwrap(words, dialect = 'bash') {
  const first = base(words[0]);
  if (/^\w+=/.test(words[0] ?? '') || PREFIXES.has(first)) {
    let i = 1;
    while (i < words.length && (/^-/.test(words[i]) || /^\w+=/.test(words[i]) || (/^\d+$/.test(words[i]) && /^-/.test(words[i - 1] ?? '')))) i++;
    return i < words.length ? { command: requote(words.slice(i)), dialect } : null;
  }
  if (first === 'iex' || first === 'invoke-expression') return words.length > 1 ? { command: words.slice(1).join(' '), dialect: 'powershell' } : null;
  const shell = SHELLS[first];
  if (!shell) return null;
  const at = words.findIndex((w, j) => j > 0 && (shell === 'cmd' ? /^\/[ck]$/i.test(w) : shell === 'bash' ? w === '-c' : /^-c[a-z]*$/i.test(w) && 'command'.startsWith(w.slice(1).toLowerCase())));
  return at > 0 && at + 1 < words.length ? { command: words.slice(at + 1).join(' '), dialect: shell } : null;
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
function matches(m, call) {
  if (m.tool !== undefined && ![].concat(m.tool).some((w) => w === call.kind || w === call.tool)) return false;
  if (m.command !== undefined && !call.commands.some((c) => compile(m.command).test(c.line))) return false;
  if (m.commandLine !== undefined && !compile(m.commandLine).test(call.commandLine)) return false;
  if (m.path !== undefined && !call.paths.some((p) => compile(m.path).test(p))) return false;
  if (m.text !== undefined && !compile(m.text).test(call.text)) return false;
  return true;
}

/**
 * The decision for one call. Deny wins: the matching deny rule with the highest severity (the first one on a tie);
 * otherwise the first matching allow rule; otherwise the policy's default.
 */
export function evaluate(policy, call) {
  const hits = policy.rules.filter((r) => matches(r.match, call));
  const matched = hits.map((r) => r.id);
  const denies = hits.filter((r) => r.decision === 'deny');
  if (denies.length) {
    const top = denies.reduce((a, b) => (rank(b) > rank(a) ? b : a));
    return { decision: 'deny', rule: top.id, severity: top.severity, reason: top.reason, matched };
  }
  const allow = hits.find((r) => r.decision === 'allow');
  if (allow) return { decision: 'allow', rule: allow.id, severity: allow.severity ?? null, reason: allow.reason ?? null, matched };
  if (policy.default === 'deny') return { decision: 'deny', rule: null, severity: null, reason: 'No rule allows this call, and the policy denies everything else. Ask the human.', matched };
  return { decision: 'allow', rule: null, severity: null, reason: null, matched };
}
