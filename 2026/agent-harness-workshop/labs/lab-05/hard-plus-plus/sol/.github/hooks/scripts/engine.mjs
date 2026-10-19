// ⚙️ The policy engine. The guard asks it one question per tool call: given this policy, allow or deny?
//   validatePolicy(policy) → problems        normalize(toolName, args) → a call        evaluate(policy, call) → a decision
// policies/repo.json: { version: 1, default: "allow" | "deny", rules: [{ id, decision, severity, reason, match }] }
// match (every key given must match; regexes are case-insensitive):
//   tool         "shell" | "write" | "read" | a tool name, or a list of those
//   command      tested against each normalised command, e.g. "delete --force --recursive build"
//   commandLine  tested against the whole shell command (whitespace collapsed)
//   path         tested against each path the call touches (a file tool's path; a shell command's arguments)
//   text         tested against JSON.stringify(args)
// An allow rule may also say "override": true (an exception to the repository's own denies, never the organisation's)
// or "lockdown": true (still allowed when the session is in lockdown). effectivePolicy() layers org over repo.
// A deny rule fires when one command of the call matches. An allow rule speaks for the whole call: its `command`
// pattern must match every command, or `npm test && rm -rf src` would ride along on an allow rule for `npm test`.

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
    for (const flag of ['override', 'lockdown']) {
      if (r[flag] === undefined) continue;
      if (typeof r[flag] !== 'boolean') problems.push(`${at}: "${flag}" must be true or false.`);
      else if (r[flag] && r.decision !== 'allow') problems.push(`${at}: only an allow rule can be marked "${flag}".`);
    }
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
const PREFIXES = new Set(['sudo', 'doas', 'env', 'command', 'exec', 'nohup', 'time', 'xargs', 'nice', 'ionice', 'timeout', 'stdbuf']);
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
    if (/^(\/[a-z])+$/i.test(w) && (dialect === 'cmd' || CMD_DELETE.has(name))) {        // cmd: rd /s /q, rd /s/q
      if (/\/s/i.test(w)) flags.add('recursive');
      if (/\/q/i.test(w)) flags.add('force');
      continue;
    }
    if (ps && /^-[a-z]+(:\S*)?$/i.test(w)) {                                              // PowerShell parameters
      const p = w.slice(1).split(':')[0].toLowerCase();
      if ('recurse'.startsWith(p)) { flags.add('recursive'); flags.add('force'); continue; } // PowerShell never asks
      if (p.length >= 2 && 'force'.startsWith(p)) { flags.add('force'); continue; }
      if (!/^[rf]+$/.test(p)) continue;  // -LiteralPath, -ErrorAction, -WhatIf …: not about recursion or force
      // -rf typed into PowerShell: read it the way bash would
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

// Flags of a prefix command that take a value (sudo -u root, xargs -I {}, nice -n 10, timeout -s KILL).
const VALUE_FLAGS = { sudo: /^-[ugCphrtD]$/, doas: /^-[uC]$/, env: /^-[uSC]$/, xargs: /^-[IinLPdsEa]$/, nice: /^-n$/, ionice: /^-[cnp]$/, timeout: /^-[sk]$/ };
const KEYWORDS = new Set(['then', 'do', 'else', 'elif', 'if', 'while', 'until', '!', '&']);
// PowerShell parameters that take a value, and those after which there is nothing to unwrap (a script file, an encoded command).
const PS_VALUE = /^-(executionpolicy|ep|windowstyle|w|outputformat|of|inputformat|if|configurationname|workingdirectory|wd)$/i;
const PS_OPAQUE = /^-(file|f|e|ec|en|enc\w*|encodedcommand)$/i;

/**
 * The command a wrapper runs, or null. Grouping and keywords are peeled off (`(rm -rf x)`, `$(…)`, `{ …; }`, `then …`,
 * `& { … }`), prefixes are dropped (`sudo -u root …`, `env A=1 …`, `xargs -I {} …`, `timeout 5 …`), `find … -exec …`
 * gives up its command, and shells inside shells are opened up: `bash -lc "…"`, `cmd /c "…"`,
 * `powershell -NoProfile -Command "…"` (or just `powershell "…"`), `Invoke-Expression "…"`.
 */
export function unwrap(words, dialect = 'bash') {
  const w = [...words];
  let peeled = false;
  let open = 0;  // openers removed at the front, so the same number of closers comes off the end (and `{}` stays)
  while (w.length && (KEYWORDS.has(w[0]) || /^(\$\(|\(|\{|&\{?)$/.test(w[0]))) { open += (w[0].match(/[({]/g) ?? []).length; w.shift(); peeled = true; }
  const lead = (w[0] ?? '').match(/^(\$\(|\(|\{)+/);
  if (lead && w[0].length > lead[0].length) { open += lead[0].match(/[({]/g).length; w[0] = w[0].slice(lead[0].length); peeled = true; }
  while (open > 0 && w.length) {
    const closers = w.at(-1).match(/[)}]+$/)?.[0].length ?? 0;
    if (!closers) break;
    const n = Math.min(open, closers);
    w[w.length - 1] = w.at(-1).slice(0, -n);
    open -= n;
    if (!w.at(-1)) w.pop();
  }
  if (peeled) return w.length ? { command: requote(w), dialect } : null;

  const first = base(w[0]);
  if (/^\w+=/.test(w[0] ?? '') || PREFIXES.has(first)) {
    let i = 1;
    while (i < w.length && (/^-/.test(w[i]) || /^\w+=/.test(w[i]))) i += VALUE_FLAGS[first]?.test(w[i]) ? 2 : 1;
    if (first === 'timeout' && i < w.length) i++;  // the duration
    return i < w.length ? { command: requote(w.slice(i)), dialect } : null;
  }
  if (first === 'find') {
    const at = w.findIndex((x) => /^-(exec|execdir|ok|okdir)$/.test(x));
    if (at < 0) return null;
    const end = w.findIndex((x, j) => j > at && /^(\\?;|\+)$/.test(x));
    return { command: requote(w.slice(at + 1, end > 0 ? end : undefined)), dialect };
  }
  if (first === 'iex' || first === 'invoke-expression') return w.length > 1 ? { command: w.slice(1).join(' '), dialect: 'powershell' } : null;
  const shell = SHELLS[first];
  if (shell === 'bash') {
    const at = w.findIndex((x, j) => j > 0 && /^-[a-z]*c[a-z]*$/i.test(x));        // -c, -lc, -ec
    return at > 0 && at + 1 < w.length ? { command: w.slice(at + 1).join(' '), dialect: 'bash' } : null;
  }
  if (shell === 'cmd') {
    const at = w.findIndex((x, j) => j > 0 && /^\/[ck]$/i.test(x));
    return at > 0 && at + 1 < w.length ? { command: w.slice(at + 1).join(' '), dialect: 'cmd' } : null;
  }
  if (shell === 'powershell') {
    const at = w.findIndex((x, j) => j > 0 && /^-c[a-z]*$/i.test(x) && 'command'.startsWith(x.slice(1).toLowerCase()));
    if (at > 0) return at + 1 < w.length ? { command: w.slice(at + 1).join(' '), dialect: 'powershell' } : null;
    let i = 1;
    while (i < w.length && /^-/.test(w[i])) {
      if (PS_OPAQUE.test(w[i])) return null;
      i += PS_VALUE.test(w[i]) ? 2 : 1;
    }
    return i < w.length ? { command: w.slice(i).join(' '), dialect: 'powershell' } : null;
  }
  return null;
}

function commandsOf(command, dialect, depth) {
  return segments(command).flatMap((segment) => {
    const words = tokens(segment);
    const inner = depth < 3 ? unwrap(words, dialect) : null;
    // A command substitution runs too: `echo $(rm -rf x)` and `echo \`rm -rf x\`` hide a second command.
    const hidden = depth < 3 && !inner ? [...segment.matchAll(/\$\(([^()]+)\)|`([^`]+)`/g)].flatMap((m) => commandsOf(m[1] ?? m[2], dialect, depth + 1)) : [];
    return [...(inner ? commandsOf(inner.command, inner.dialect, depth + 1) : [canonical(words, dialect)]), ...hidden];
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
function matchesWith(m, call, every) {
  if (m.tool !== undefined && ![].concat(m.tool).some((w) => w === call.kind || w === call.tool)) return false;
  if (m.command !== undefined) {
    const fits = (c) => compile(m.command).test(c.line);
    if (!(every ? call.commands.length > 0 && call.commands.every(fits) : call.commands.some(fits))) return false;
  }
  if (m.commandLine !== undefined && !compile(m.commandLine).test(call.commandLine)) return false;
  if (m.path !== undefined && !call.paths.some((p) => compile(m.path).test(p))) return false;
  if (m.text !== undefined && !compile(m.text).test(call.text)) return false;
  return true;
}
// A deny rule needs one bad command to fire. An allow rule speaks for the whole call, so with a `command` pattern every
// command in it must match: otherwise `npm test && rm -rf src` would ride along on an allow rule for `npm test`.
const fires = (rule, call) => matchesWith(rule.match, call, rule.decision === 'allow');

/**
 * The decision for one call. In order:
 *   1. an organisation deny wins, always;
 *   2. in lockdown (a flagged session), every call but a read is denied, unless an allow rule marked "lockdown": true
 *      covers it;
 *   3. a repository allow rule marked "override": true makes an exception to the repository's own denies;
 *   4. any other deny wins (the highest severity, the first on a tie);
 *   5. the first matching allow; 6. the policy's default.
 * Allow rules (and so the exceptions in 2 and 3) must cover every command of a call (see fires()). The result says which
 * layer decided: 'org', 'lockdown', 'repo' or 'default'.
 */
export function evaluate(policy, call, { lockdown = false } = {}) {
  const hits = policy.rules.filter((r) => fires(r, call));
  const matched = hits.map((r) => r.id);
  const top = (rules) => rules.reduce((a, b) => (rank(b) > rank(a) ? b : a));
  const from = (r, decision) => ({ decision, rule: r.id, severity: r.severity ?? null, reason: r.reason ?? null, layer: r.layer ?? 'repo', matched });
  const orgDenies = hits.filter((r) => r.decision === 'deny' && r.layer === 'org');
  if (orgDenies.length) return from(top(orgDenies), 'deny');
  if (lockdown && call.kind !== 'read' && !hits.some((r) => r.decision === 'allow' && r.lockdown === true)) {
    return { decision: 'deny', rule: 'session-lockdown', severity: 'high', reason: LOCKDOWN, layer: 'lockdown', matched };
  }
  const override = hits.find((r) => r.decision === 'allow' && r.override === true && r.layer !== 'org');
  if (override) return from(override, 'allow');
  const denies = hits.filter((r) => r.decision === 'deny');
  if (denies.length) return from(top(denies), 'deny');
  const allow = hits.find((r) => r.decision === 'allow');
  if (allow) return from(allow, 'allow');
  if (policy.default === 'deny') return { decision: 'deny', rule: null, severity: null, reason: 'No rule allows this call, and the policy denies everything else. Ask the human.', layer: 'default', matched };
  return { decision: 'allow', rule: null, severity: null, reason: null, layer: 'default', matched };
}

const LOCKDOWN = 'This session\'s prompt looked like a prompt injection, so it is in lockdown: only reading files and running the tests. Tell the human what you were asked to do; a new session starts clean.';

/**
 * The organisation's policy on top of the repository's: { policy, problems }. Each rule gets its layer ('org' or
 * 'repo'). The "org-" prefix belongs to the organisation, and the engine sets the layer itself, so a repository rule
 * that uses either is a problem (and a policy with problems blocks every call).
 */
export function effectivePolicy(org, repo) {
  const problems = [...validatePolicy(org).map((p) => `org policy: ${p}`), ...validatePolicy(repo).map((p) => `repo policy: ${p}`)];
  if (problems.length) return { policy: null, problems };
  for (const r of repo.rules) {
    if (r.id.startsWith('org-')) problems.push(`repo policy: rule ${r.id} uses the "org-" prefix, which belongs to the organisation.`);
    if (r.layer !== undefined) problems.push(`repo policy: rule ${r.id} sets "layer"; the engine decides which layer a rule is in.`);
  }
  for (const r of org.rules) if (!r.id.startsWith('org-')) problems.push(`org policy: rule ${r.id} must start with "org-".`);
  const policy = {
    version: 1,
    default: org.default === 'deny' || repo.default === 'deny' ? 'deny' : 'allow',
    rules: [...org.rules.map((r) => ({ ...r, layer: 'org' })), ...repo.rules.map((r) => ({ ...r, layer: 'repo' }))],
  };
  return { policy: problems.length ? null : policy, problems };
}
