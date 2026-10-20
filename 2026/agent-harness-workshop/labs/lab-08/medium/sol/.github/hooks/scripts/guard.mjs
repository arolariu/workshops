#!/usr/bin/env node
// 🔒 preToolUse guard. Copilot runs this before EVERY tool call and sends the call as JSON on stdin:
//   { "toolName": "bash", "toolArgs": "{\"command\":\"npm test\"}", "cwd": "...", ... }
// To block the call, print { "permissionDecision": "deny", "permissionDecisionReason": "..." }.
// To allow it, print nothing.
//
// Every rule has an id (logged with each denial, and named in HARNESS.md's threat model), a test, and a reason that
// tells the model what to do instead. Its test suite is the attack pack: node scripts/attack.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SHELL_TOOLS = new Set(['bash', 'powershell', 'shell']);
const READ_TOOLS = new Set(['view', 'read', 'glob', 'grep', 'ls', 'search']);
const WRITE_TOOL = /^(edit|create|write|str_replace|apply_patch|multi_edit|delete|remove|move|rename)/i;
const CONTENT_KEYS = /text|str|content|patch|body/i;
const PATH_KEYS = /path|dir|glob|target|dest|^file(name)?$|^src$|source/i;

// ---------- reading a call ----------
// Split "cd build && rm -rf x; ls" into separate commands, and drop "sudo", "VAR=value", "&" and "cmd /c" prefixes.
const segments = (command) => String(command ?? '').split(/&&|\|\||[;|\n]/).map((s) => s.trim()).filter(Boolean);
const words = (segment) => {
  const list = segment.split(/\s+/).map((w) => w.replace(/^[("'`]+|[)"'`]+$/g, '')).filter(Boolean);
  for (;;) {
    if (list[0] === 'sudo' || list[0] === '&' || /^\w+=\S*$/.test(list[0] ?? '')) list.shift();
    else if (/^cmd(\.exe)?$/i.test(list[0] ?? '') && /^\/[ck]$/i.test(list[1] ?? '')) list.splice(0, 2);
    else return list;
  }
};
const cmdOf = (segment) => (words(segment)[0] ?? '').toLowerCase().replace(/\.exe$/, '');

/** Every string in the arguments, with the key it sits under. */
function strings(value, key = '', out = []) {
  if (typeof value === 'string') out.push({ key, value });
  else if (Array.isArray(value)) value.forEach((v) => strings(v, key, out));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) strings(v, k, out);
  return out;
}

function readCall(toolName, args, cwd) {
  const tool = String(toolName ?? '').toLowerCase();
  const shell = SHELL_TOOLS.has(tool);
  const all = strings(args);
  const paths = all.filter((s) => PATH_KEYS.test(s.key) && !CONTENT_KEYS.test(s.key)).map((s) => s.value.replace(/\\/g, '/'));
  for (const s of all) for (const m of s.value.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)) paths.push(m[1].trim());
  const command = shell ? String(args.command ?? '') : '';
  return {
    tool, args, cwd, shell, command, paths,
    segs: segments(command),
    texts: all.map((s) => s.value),
    writes: !shell && !READ_TOOLS.has(tool) && (WRITE_TOOL.test(tool) || all.some((s) => /^(new_str|file_text|content|patch)$/.test(s.key))),
  };
}

// ---------- what the rules look for ----------
const DELETE_CMD = /^(rm|rmdir|rd|del|erase|ri|remove-item)$/;
const PS_RECURSE = /^-r(e(c(u(r(s(e)?)?)?)?)?)?$/i; // -Recurse and every abbreviation PowerShell accepts
const recurseFlag = (w) => w === '--recursive' || /^\/s$/i.test(w) || PS_RECURSE.test(w) || (/^-[rRfvidI]+$/.test(w) && /r/i.test(w));
const PIPE_DELETE = /\|\s*(?:xargs\s+(?:-\S+\s+)*)?(?:rm|rmdir|rd|del|erase|ri|remove-item)\b|\|\s*(?:%|foreach-object)\s*\{[^}]*\b(?:rm|del|ri|remove-item|erase)\b/i;

const SECRET_FILE = [
  /(^|[\s"'`=@:(<>|;&,/\\])\.env(?:\.(?!example\b|sample\b|template\b|dist\b)[\w-]+)*(?=$|[\s"'`)<>|;&,/\\])/i,
  /(^|[/\\])\.ssh([/\\]|$)/i, /\bid_(rsa|dsa|ecdsa|ed25519)\b/i, /(^|[/\\])\.aws[/\\]credentials\b/i,
  /(^|[\s"'/\\])\.npmrc\b/i, /(^|[\s"'/\\])\.git-credentials\b/i, /\.(pem|pfx|p12)(?=$|[\s"'`)])/i,
];
const SECRET_NAME = /token|secret|passw(or)?d|api_?key|private_?key|credential|_key$|^key$/i;
const HARDCODED = /[\w$]*(?:api[_-]?key|secret|token|passw(?:or)?d|credential)[\w$]*["']?\s*[:=]\s*(["'`])(?!\s*\$\{)[^"'`\n]{4,}\1/i;

const NET_CMD = /^(curl|wget|iwr|irm|invoke-webrequest|invoke-restmethod|start-bitstransfer|http|https|git)$/;
const ALLOWED_HOSTS = new Set(['nodejs.org', 'registry.npmjs.org', 'www.npmjs.com', 'developer.mozilla.org', 'github.com', 'docs.github.com']);
const hosts = (text) => [...String(text).matchAll(/\b(?:https?|ftp|wss?):\/\/([^/\s"'`?#:)]+)/gi)].map((m) => m[1].toLowerCase());
const CURL_UPLOAD = /(^|\s)(-d|-F|-T|--data[\w-]*|--form[\w-]*|--upload-file|--post-data|--post-file)(?=[\s=@'"]|$)/;
const PS_UPLOAD = /(^|\s)-(InFile|Body)\b/i;
const METHOD = /(^|\s)(-X|--request|-Method|--method)[\s=]*['"]?(post|put|patch)\b/i;
const RAW_SOCKET = /^(scp|sftp|ftp|nc|ncat|netcat|socat|telnet|send-mailmessage)$/;

const PKG_CMD = /^(npm|pnpm|yarn|bun|cnpm)$/;
const INSTALL = /^(install|i|in|ins|inst|insta|instal|isnt|isnta|isntal|isntall|add)$/;
const OTHER_INSTALL = /^(pip|pip3|gem|cargo|go|brew|choco|winget|scoop|apt|apt-get|yum|dnf)$/;
const RUN_PACKAGE = /^(npx|bunx|pnpx)$/;
const PIPE_TO_SHELL = /\b(curl|wget|iwr|irm|invoke-webrequest|invoke-restmethod)\b[^|]*\|\s*(sudo\s+)?(sh|bash|zsh|dash|ksh|pwsh|powershell|iex|invoke-expression|node|python3?|perl|ruby)\b/i;

const HARNESS_CONTROL = [/(^|[\s"'`=/\\])\.github[/\\]hooks([/\\]|$)/i, /(^|[\s"'`=/\\])\.github[/\\]agents([/\\]|$)/i, /(^|[\s"'`=/\\])(\.github[/\\]|\.vscode[/\\])?\.?mcp\.json\b/i, /(^|[\s"'`=/\\])\.copilot[/\\]/i];
const READERS = new Set(['cat', 'type', 'get-content', 'gc', 'less', 'more', 'head', 'tail', 'ls', 'dir', 'get-childitem', 'gci', 'get-item', 'gi',
  'test-path', 'grep', 'rg', 'select-string', 'sls', 'wc', 'stat', 'file', 'diff', 'cd', 'pwd', 'echo', 'jq']);
const BOUNDARY = /\b(never|must not|do not|don'?t)\b/i;

/** Does this command segment write to (or delete, move) a file that matches `re`? Reading it is fine. */
function shellWrites(segment, re) {
  if (!re.test(segment)) return false;
  const [cmd, ...rest] = words(segment);
  const c = (cmd ?? '').toLowerCase();
  if (/(^|[^2&])>/.test(segment)) return true;
  if (c === 'git') return /^(checkout|restore|rm|mv|apply|am|reset|clean|stash)$/.test(rest[0] ?? '');
  if (c === 'node') return rest.some((w) => /^(-e|--eval|-p|--print)$/.test(w));
  if (c === 'find') return rest.some((w) => /^-(delete|exec|execdir)$/.test(w));
  return !READERS.has(c);
}
const anyMatch = (res, text) => res.some((re) => re.test(text));
const boundaryLines = (text) => String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter((l) => BOUNDARY.test(l));
const isAgentsMd = (p) => /(^|\/)AGENTS\.md$/i.test(p);

// ---------- the rules: the first one that matches decides ----------
export const RULES = [
  {
    id: 'recursive-delete',
    reason: 'Recursive and mass deletes (rm -r, Remove-Item -Recurse, rd /s, find -delete, piping files into a delete) are blocked in this project. Delete specific files by name instead, or ask the human.',
    test: (c) => c.segs.some((s) => { const [cmd, ...rest] = words(s); return DELETE_CMD.test((cmd ?? '').toLowerCase()) && rest.some(recurseFlag); })
      || c.segs.some((s) => cmdOf(s) === 'find' && /\s-(delete|exec(dir)?\s+(rm|del|remove-item))\b/i.test(s))
      || PIPE_DELETE.test(c.command),
  },
  {
    id: 'git-history',
    reason: 'Commands that throw away work or rewrite history (git clean -f, git reset --hard, git push --force, git checkout -- .) are blocked. Use git stash or a new commit instead, or ask the human.',
    test: (c) => c.segs.some((s) => {
      const [cmd, sub, ...rest] = words(s);
      if (cmd !== 'git') return false;
      if (sub === 'clean') return rest.some((w) => /^-[a-z]*f|^--force$/i.test(w));
      if (sub === 'reset') return rest.includes('--hard');
      if (sub === 'push') return rest.some((w) => /^(-f|--force(-with-lease)?|\+\S+)$/.test(w));
      if (sub === 'checkout' || sub === 'restore') return rest.some((w) => w === '.' || w === '*');
      return false;
    }),
  },
  {
    id: 'secret-files',
    reason: 'Secret files (.env and its variants, SSH and cloud keys, .npmrc) are off-limits to every tool, for reading and for writing. Use .env.example for the variable names, read values in code with process.env, or ask the human.',
    test: (c) => (c.shell ? anyMatch(SECRET_FILE, c.command) : c.paths.some((p) => anyMatch(SECRET_FILE, p))),
  },
  {
    id: 'secret-env',
    reason: 'Commands that print or copy secret environment variables (tokens, keys, passwords) are blocked. Code should read them with process.env at run time instead; ask the human if you need to know whether one is set.',
    test: (c) => c.shell && ([...c.command.matchAll(/\$(?:env:)?\{?([A-Za-z_]\w*)/gi)].some((m) => SECRET_NAME.test(m[1]))
      || [...c.command.matchAll(/process\.env\.([A-Za-z_]\w*)/g)].some((m) => SECRET_NAME.test(m[1])) || /process\.env(?![.\w[])/.test(c.command)
      || c.segs.some((s) => { const w = words(s); return cmdOf(s) === 'printenv' || (w.length === 1 && cmdOf(s) === 'env'); })
      || /(^|[\s;&|(])(get-childitem|gci|ls|dir|get-item|gi)\s+env:/i.test(c.command) || /GetEnvironmentVariables?\s*\(/i.test(c.command)),
  },
  {
    id: 'hardcoded-secret',
    reason: 'This puts a literal value into a secret-named variable (a key, token or password). Read it from the environment instead (process.env.NAME) and add the name to .env.example, or ask the human.',
    test: (c) => (c.shell || c.writes) && c.texts.some((t) => HARDCODED.test(t)),
  },
  {
    id: 'remote-code',
    reason: 'Running code straight from the internet (curl | sh, iwr | iex, Invoke-Expression, npx and dlx, encoded commands) is blocked. Download the file, let the human review it, or write the code here instead.',
    test: (c) => c.shell && (PIPE_TO_SHELL.test(c.command) || /(^|[\s;&|(])(iex|invoke-expression)\b/i.test(c.command)
      || /\b(bash|sh|zsh)\s+-c\s+["']?\$\((curl|wget)\b|<\(\s*(curl|wget)\b/i.test(c.command)
      || /\b(pwsh|powershell)(\.exe)?\b.*\s-(e|ec|enc|encodedcommand)\s+[A-Za-z0-9+/=]{16,}/i.test(c.command)
      || c.segs.some((s) => { const [cmd, sub] = words(s).map((w) => w.toLowerCase()); return RUN_PACKAGE.test(cmd ?? '') || (PKG_CMD.test(cmd ?? '') && (sub === 'dlx' || sub === 'exec' || sub === 'x')); })),
  },
  {
    id: 'new-dependency',
    reason: 'New dependencies are not allowed (StudyBuddy has zero). Write a small helper instead, or ask the human. Plain npm install and npm ci, which install what package.json already lists, are fine.',
    test: (c) => c.segs.some((s) => {
      const [cmd, sub, ...rest] = words(s).map((w) => w.toLowerCase());
      if (PKG_CMD.test(cmd ?? '') && INSTALL.test(sub ?? '')) return rest.some((w) => !w.startsWith('-'));
      if ((cmd === 'python' || cmd === 'python3') && sub === '-m') return rest[0] === 'pip' && rest[1] === 'install';
      if (OTHER_INSTALL.test(cmd ?? '')) return /^(install|add|get)$/.test(sub ?? '');
      return /^install-(module|package|script)$/.test(cmd ?? '');
    }),
  },
  {
    id: 'package-json',
    reason: 'package.json and the lockfile only change through a reviewed pull request: no edits, overwrites or npm pkg set. Write a small helper instead, or ask the human.',
    test: (c) => (c.writes && c.paths.some((p) => /(^|\/)(package(-lock)?\.json|npm-shrinkwrap\.json)$/i.test(p)))
      || c.segs.some((s) => /^npm\s+pkg\s+(set|delete)\b/i.test(words(s).join(' ')) || shellWrites(s, /package(-lock)?\.json/i)),
  },
  {
    id: 'upload',
    reason: 'Sending data out of this machine (uploads, POST and PUT requests, scp, raw sockets) is blocked. Keep the data here, or ask the human to send it.',
    test: (c) => c.segs.some((s) => {
      const cmd = cmdOf(s);
      if (RAW_SOCKET.test(cmd)) return true;
      if (cmd === 'rsync') return /\S@\S+:|::|rsync:\/\//.test(s);
      return NET_CMD.test(cmd) && cmd !== 'git' && (CURL_UPLOAD.test(s) || PS_UPLOAD.test(s) || METHOD.test(s));
    }),
  },
  {
    id: 'egress',
    reason: `Network requests only go to approved hosts (${[...ALLOWED_HOSTS].join(', ')}). Use one of those instead, or ask the human to add a host to the allow-list in the guard.`,
    test: (c) => {
      const urls = c.shell ? c.segs.filter((s) => NET_CMD.test(cmdOf(s))).flatMap(hosts) : /fetch|http|url|browse/i.test(c.tool) ? c.texts.flatMap(hosts) : [];
      return urls.some((h) => !ALLOWED_HOSTS.has(h));
    },
  },
  {
    id: 'harness-controls',
    reason: 'The guard, its hook config, the agents\' tool lists and the MCP config belong to the harness owner: the agent may read them but never change them. Describe the change you need, and ask the human (see HARNESS.md).',
    test: (c) => (c.writes && c.paths.some((p) => anyMatch(HARNESS_CONTROL, p))) || c.segs.some((s) => HARNESS_CONTROL.some((re) => shellWrites(s, re))),
  },
  {
    id: 'boundaries',
    reason: 'This would remove or rewrite a boundary in AGENTS.md. Boundaries change only through the harness owner: edit AGENTS.md with the edit tool and keep every "Never" line, or ask the human.',
    test: (c) => {
      if (c.shell) return c.segs.some((s) => shellWrites(s, /AGENTS\.md/i));
      if (!c.writes || !c.paths.some(isAgentsMd)) return false;
      if (typeof c.args.old_str === 'string') return boundaryLines(c.args.old_str).some((l) => !boundaryLines(c.args.new_str).includes(l));
      if (typeof c.args.file_text !== 'string') return true; // a delete, a move or a patch: not through the agent
      const file = path.resolve(c.cwd ?? '.', c.paths.find(isAgentsMd));
      const before = fs.existsSync(file) ? boundaryLines(fs.readFileSync(file, 'utf8')) : [];
      return before.some((l) => !boundaryLines(c.args.file_text).includes(l));
    },
  },
];

/**
 * Decide about one tool call.
 * @param {string} toolName - e.g. "bash" or "powershell" (shell), "view", "edit", "create", "studybuddy-get_deadlines"
 * @param {object} args - the tool's arguments, e.g. { command: "rm -rf build" } for a shell call
 * @param {{ cwd?: string }} [opts] - the session's folder (to read the current AGENTS.md)
 * @returns {{ rule: string, reason: string } | null} the rule that blocks the call, or null to allow it
 */
export function evaluate(toolName, args, { cwd } = {}) {
  const call = readCall(toolName, args ?? {}, cwd);
  const rule = RULES.find((r) => r.test(call));
  return rule ? { rule: rule.id, reason: `${rule.id}: ${rule.reason}` } : null;
}

/** The same decision as a reason to block the call, or null to allow it. */
export const decide = (toolName, args, opts) => evaluate(toolName, args, opts)?.reason ?? null;

// ---------- plumbing: you don't need to change anything below this line ----------
function readInput() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8') || 'null'); } catch { return null; }
}
function log(entry) {
  try {
    fs.mkdirSync('.agent-logs', { recursive: true });
    fs.appendFileSync(path.join('.agent-logs', 'guard.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
  } catch { /* logging must never break the agent */ }
}
// Real paths on both sides: through a symlink (macOS /var), a junction or an 8.3 name the spellings differ.
const sameFile = (a, b) => { try { return fs.realpathSync.native(a) === fs.realpathSync.native(b); } catch { return false; } };
const isMain = process.argv[1] && sameFile(process.argv[1], fileURLToPath(import.meta.url));
const input = isMain ? readInput() : null;
if (input && typeof input === 'object') {
  let args = input.toolArgs ?? {};
  if (typeof args === 'string') {
    try { args = JSON.parse(args); } catch { args = { raw: args }; }
  }
  if (!args || typeof args !== 'object') args = {};
  const tool = String(input.toolName ?? '');
  let verdict;
  try {
    verdict = evaluate(tool, args, { cwd: input.cwd });
  } catch (e) {
    verdict = { rule: 'guard-error', reason: `The guard crashed (${e.message}), so the call is blocked to be safe.` }; // fail closed
  }
  log({ tool, decision: verdict ? 'deny' : 'allow', rule: verdict?.rule, reason: verdict?.reason, args: JSON.stringify(args).slice(0, 300) });
  if (verdict) process.stdout.write(JSON.stringify({ permissionDecision: 'deny', permissionDecisionReason: verdict.reason }));
}
