#!/usr/bin/env node
// 🔒 preToolUse guard. Copilot runs this before EVERY tool call and sends the call as JSON on stdin:
//   { "toolName": "bash", "toolArgs": "{\"command\":\"npm test\"}", "cwd": "...", ... }
// To block the call, print { "permissionDecision": "deny", "permissionDecisionReason": "..." }.
// To allow it, print nothing.
//
// Every rule has an id (logged with each denial, and named in HARNESS.md's threat model), a test, and a reason that
// tells the model what to do instead. Its test suite is the attack pack: node scripts/attack.mjs
// Shell commands are read the way a shell reads them (quotes, pipes, wrappers like bash -c), so a rule protects an
// outcome, not one spelling of it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SHELL_TOOLS = new Set(['bash', 'powershell', 'shell']);
const READ_TOOLS = new Set(['view', 'read', 'glob', 'grep', 'ls', 'search']);
const WRITE_TOOL = /^(edit|create|write|str_replace|apply_patch|multi_edit|delete|remove|move|rename)/i;
const CONTENT_KEYS = /text|str|content|patch|body|diff/i;
const NEW_CONTENT_KEYS = /^(new_str|file_text|content|new_content|new_text|text)$/i;
const PATH_KEYS = /path|dir|glob|target|dest|^file(name)?$|^src$|source/i;

// ---------- reading a shell command the way a shell does ----------
/** "rm \<newline> -rf ." (bash) and "Remove-Item `<newline> -Recurse" (PowerShell) are one line; an even run of escapes is literal. */
export const joinLines = (text) => String(text ?? '').replace(/(\\+|`+)\r?\n/g, (all, run) => (run.length % 2 ? `${run.slice(1)} ` : all));

/** The index of the bracket that closes the one at `at`, skipping quoted text. */
function closing(src, at, open, shut) {
  let depth = 0;
  let quote = null;
  for (let j = at; j < src.length; j++) {
    const c = src[j];
    if (quote) { if (c === quote) quote = null; continue; }
    if (c === "'" || c === '"') quote = c;
    else if (c === open) depth++;
    else if (c === shut && --depth === 0) return j;
  }
  return src.length;
}

/**
 * Split a command line into simple commands: &&, ||, ;, |, & and newlines separate them only outside quotes. A word
 * keeps its text without the quotes, and `expand`: its text outside single quotes (where $VAR is expanded).
 * $(…), <(…), `…`, (…) and {…} run as commands of their own, so they are collected in `subs` too.
 */
function lex(src) {
  const segs = [];
  const fresh = (sep) => ({ sep, words: [], redirects: [], inputs: [], subs: [] });
  let seg = fresh('');
  let word = null;
  let target = null; // 'out' or 'in': the next word is a redirect's file
  const add = (text, expand = true) => {
    word ??= { text: '', expand: '' };
    word.text += text;
    if (expand) word.expand += text;
  };
  const endWord = () => {
    if (!word) return;
    if (target === 'out') seg.redirects.push(word.text);
    else if (target === 'in') seg.inputs.push(word.text);
    else seg.words.push(word);
    word = null;
    target = null;
  };
  const endSeg = (sep) => {
    endWord();
    if (seg.words.length || seg.redirects.length || seg.inputs.length || seg.subs.length) segs.push(seg);
    seg = fresh(sep);
  };
  const group = (i, at) => {
    const k = closing(src, at, src[at], src[at] === '{' ? '}' : ')');
    seg.subs.push(src.slice(at + 1, k));
    add(src.slice(i, k + 1));
    return k;
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "'") {
      const j = src.indexOf("'", i + 1);
      const end = j < 0 ? src.length : j;
      add(src.slice(i + 1, end), false);
      i = end;
    } else if (c === '"') {
      word ??= { text: '', expand: '' };
      let j = i + 1;
      for (; j < src.length && src[j] !== '"'; j++) {
        if ((src[j] === '\\' && '$`"\\'.includes(src[j + 1] ?? 'x')) || (src[j] === '`' && j + 1 < src.length)) add(src[++j]);
        else if (src[j] === '$' && src[j + 1] === '(') j = group(j, j + 1);
        else add(src[j]);
      }
      i = j;
    } else if ((c === '$' || c === '<' || c === '>') && next === '(') {
      i = group(i, i + 1);
    } else if (c === '(' || c === '{') {
      i = group(i, i);
    } else if (c === '`') {
      const j = src.indexOf('`', i + 1);
      if (j > i + 1) { seg.subs.push(src.slice(i + 1, j)); add(src.slice(i, j + 1)); i = j; } else { add(next ?? ''); i++; }
    } else if (c === '&' && next === '&') { endSeg('&&'); i++; }
    else if (c === '|' && next === '|') { endSeg('||'); i++; }
    else if (c === '|') endSeg('|');
    else if (c === ';' || c === '\n' || c === '\r') endSeg(';');
    else if (c === '>' || c === '<' || (c === '&' && next === '>')) {
      if (word && !target && /^(\d|\*)$/.test(word.text)) word = null; // 2>, *>: a stream number, not an argument
      else endWord();
      let j = c === '&' ? i + 1 : i;
      const dir = src[j] === '<' ? 'in' : 'out';
      while (src[j + 1] === src[j] || src[j + 1] === '|') j++; // >>, <<, >|
      if (src[j + 1] === '&') { j++; while (/[\d-]/.test(src[j + 1] ?? '')) j++; } // 2>&1: a stream, not a file
      else target = dir;
      i = j;
    } else if (c === '&') endSeg('&');
    else if (/\s/.test(c)) endWord();
    else add(c);
  }
  endSeg('');
  return segs;
}

/** The program a word names: "/bin/rm" → "rm", "npm.cmd" → "npm"; "" for a variable, a group or a substitution. */
const base = (word) => {
  const t = String(word ?? '');
  if (!t || /^[$(`{<]/.test(t)) return '';
  return t.split(/[\\/]/).pop().toLowerCase().replace(/\.(exe|cmd|bat|com|ps1)$/, '');
};

const DATA_CMDS = /^(echo|printf|write-output|write-host|write-information|write-verbose|write-warning|write-error|write|say)$/;
const PKG_CMD = /^(npm|pnpm|yarn|bun|cnpm)$/;
const PKG_VALUE_FLAGS = /^(--prefix|-C|--cwd|--dir|-w|--workspace|--filter|--registry|--userconfig|--cache|--loglevel|--tag)$/;
const GIT_VALUE_FLAGS = /^(-C|-c|--git-dir|--work-tree|--namespace|--exec-path|--config-env)$/;
const SHELL_CMDS = /^(bash|sh|zsh|dash|ksh|fish)$/;
const POWERSHELLS = /^(pwsh|powershell)$/;
const PS_VALUE_OPTS = /^-(executionpolicy|ep|windowstyle|version|inputformat|outputformat|configurationname|workingdirectory|wd)$/i;
// Prefixes that run the command after them: sudo rm, env rm, time rm, nohup rm, xargs rm …
const PREFIXES = new Set(['sudo', 'doas', 'command', 'builtin', 'exec', 'nohup', 'time', 'nice', 'stdbuf', 'timeout', 'xargs', 'env']);
const PREFIX_VALUE_FLAGS = /^-(u|g|n|C|D|I|L|P|d|E|a|k|S)$/;

/** The index of the first word at or after i that is not a -flag (a flag in `valued` takes the next word too). */
const skipFlags = (words, i, valued) => {
  while (words[i] && /^-/.test(words[i].text)) i += valued.test(words[i].text) && !words[i].text.includes('=') ? 2 : 1;
  return i;
};

/** One simple command: { cmd, args, sub, rest, data, script, operands, code, expand, redirects, inputs, subs, viaXargs }. */
function command(seg) {
  const w = seg.words;
  let i = 0;
  let viaXargs = false;
  for (;;) {
    const t = w[i]?.text ?? '';
    const name = base(t);
    if (/^[A-Za-z_]\w*=/.test(t)) { i++; continue; } // VAR=value before a command
    if (!PREFIXES.has(name)) break;
    if (name === 'env' && !w.slice(i + 1).some((x) => !/^-|^[A-Za-z_]\w*=/.test(x.text))) break; // env alone prints the environment
    if (name === 'xargs') viaXargs = true;
    i = skipFlags(w, i + 1, PREFIX_VALUE_FLAGS);
    if (name === 'timeout' && /^\d/.test(w[i]?.text ?? '')) i++;
  }
  const head = w[i]?.text ?? '';
  const args = w.slice(i + 1);
  const c = { cmd: base(head), head, args, sub: null, rest: args, data: new Set(), script: null, viaXargs, redirects: seg.redirects, inputs: seg.inputs, subs: seg.subs };
  // git and the package managers: the subcommand after their global options (git -C dir clean, npm --prefix . install)
  if (c.cmd === 'git' || PKG_CMD.test(c.cmd)) {
    const j = skipFlags(args, 0, c.cmd === 'git' ? GIT_VALUE_FLAGS : PKG_VALUE_FLAGS);
    c.sub = args[j]?.text.toLowerCase() ?? null;
    c.rest = args.slice(j + 1);
  }
  // Words that are data, not files or code: what echo prints, a commit message.
  if (DATA_CMDS.test(c.cmd)) args.forEach((_, n) => c.data.add(n));
  if (c.cmd === 'git') args.forEach((a, n) => { if (/^(-m|--message)$/.test(args[n - 1]?.text ?? '') || /^(-m\S|--message=)/.test(a.text)) c.data.add(n); });
  // Wrappers run a command line of their own: cmd /c, bash -c, powershell -Command, eval, Invoke-Expression.
  const after = (re) => { const n = args.findIndex((a) => re.test(a.text)); return n < 0 ? null : args.slice(n + 1).map((a) => a.text).join(' '); };
  if (c.cmd === 'cmd') c.script = after(/^\/[ckr]$/i);
  else if (SHELL_CMDS.test(c.cmd)) { const n = args.findIndex((a) => /^-[a-z]*c[a-z]*$/i.test(a.text)); if (n >= 0) c.script = args[n + 1]?.text ?? ''; }
  else if (POWERSHELLS.test(c.cmd)) {
    c.script = after(/^[-/](c|command)$/i);
    const n = skipFlags(args, 0, PS_VALUE_OPTS);
    if (c.script == null && args[n] && !/\.ps1$/i.test(args[n].text) && !args.some((a) => /^-(e|ec|enc|encodedcommand|f|file)$/i.test(a.text))) c.script = args.slice(n).map((a) => a.text).join(' ');
  } else if (/^(eval|iex|invoke-expression)$/.test(c.cmd)) c.script = args.map((a) => a.text).join(' ');
  const kept = args.filter((_, n) => !c.data.has(n)).map((a) => a.text);
  c.operands = [...kept, ...seg.redirects, ...seg.inputs];
  c.code = [head, ...kept].join(' ');
  c.expand = [...w.map((x) => x.expand), ...seg.redirects].join(' ');
  return c;
}

const DOWNLOAD = /^(curl|wget|iwr|irm|invoke-webrequest|invoke-restmethod|start-bitstransfer)$/;
const RUNS_CODE = /^(sh|bash|zsh|dash|ksh|fish|pwsh|powershell|node|python3?|py|perl|ruby|php|source|\.|iex|invoke-expression|eval|cmd)$/;
const LOOPS = /^(%|foreach-object|foreach|where-object|where|\?)$/;

/** Every simple command in a command line, with the commands inside wrappers and substitutions. */
export function commands(text, depth = 0, inPipe = false) {
  if (depth > 5) return [];
  const segs = lex(joinLines(text));
  const out = [];
  let download = false;
  segs.forEach((seg, n) => {
    const c = command(seg);
    if (seg.sep !== '|') download = false;
    c.piped = inPipe || seg.sep === '|';
    c.pipedOut = segs[n + 1]?.sep === '|';
    c.fedByDownload = download && RUNS_CODE.test(c.cmd); // curl … | sh, iwr … | iex
    if (DOWNLOAD.test(c.cmd)) download = true;
    out.push(c);
    for (const sub of seg.subs) out.push(...commands(sub, depth + 1, c.piped && LOOPS.test(c.cmd)));
    if (c.script != null) out.push(...commands(c.script, depth + 1));
  });
  return out;
}

/** Variables the command line sets itself (x=1, $x = 1, read x, for x in): reading them is not reading the environment. */
function assigned(text) {
  const names = new Set();
  for (const m of text.matchAll(/(?:^|[\s;&|(])(?:export\s+|local\s+|readonly\s+|declare\s+(?:-\w+\s+)*)?([A-Za-z_]\w*)=/g)) names.add(m[1]);
  for (const m of text.matchAll(/\$([A-Za-z_]\w*)\s*=(?!=)/g)) names.add(m[1]);
  for (const m of text.matchAll(/\b(?:read\s+(?:-\w+\s+)*|for(?:each)?\s*\(?\s*\$?)([A-Za-z_]\w*)/g)) names.add(m[1]);
  return names;
}

// ---------- which files a command writes ----------
const READERS = new Set(['cat', 'type', 'get-content', 'gc', 'less', 'more', 'head', 'tail', 'ls', 'dir', 'get-childitem', 'gci', 'get-item', 'gi',
  'get-itemproperty', 'test-path', 'resolve-path', 'split-path', 'join-path', 'grep', 'egrep', 'fgrep', 'rg', 'select-string', 'sls', 'findstr',
  'wc', 'stat', 'file', 'diff', 'fc', 'compare-object', 'cd', 'set-location', 'sl', 'pushd', 'popd', 'pwd', 'jq', 'sort', 'uniq', 'cut', 'nl',
  'od', 'xxd', 'hexdump', 'strings', 'md5sum', 'sha1sum', 'sha256sum', 'get-filehash', 'measure-object', 'select-object', 'foreach-object',
  'where-object', 'format-table', 'format-list', 'out-host', 'out-string', 'convertfrom-json', 'convertto-json', 'test', '[']);
const METADATA = new Set(['test-path', 'ls', 'dir', 'get-childitem', 'gci', 'stat', 'get-item', 'gi', 'file']);
const WRITE_FIRST = new Set(['set-content', 'sc', 'add-content', 'ac', 'out-file', 'new-item', 'ni']);
const COPY = new Set(['cp', 'copy', 'copy-item', 'cpi', 'xcopy', 'robocopy']);
const PATH_PARAMS = /^(path|literalpath|lp|destination|filepath|target|newname|outfile)$/;
const VALUE_PARAMS = /^(value|encoding|filter|include|exclude|itemtype|inputobject|pattern|uri|method|body|infile|headers|first|last|skip|name)$/;
const WRITE_CALL = /write|append|unlink|\brm(dir)?(Sync)?\(|rename|copyFile|truncate|createWriteStream|open\([^)]*['"][wa]/i;

/** The positional operands and the -Name value parameters of a command (its data words left out). */
function operandsOf(c) {
  const pos = [];
  const named = {};
  for (let n = 0; n < c.args.length; n++) {
    if (c.data.has(n)) continue;
    const t = c.args[n].text;
    const m = t.match(/^-{1,2}([A-Za-z][\w-]*)(?:[:=]([\s\S]*))?$/);
    if (!m) { pos.push(t); continue; }
    const name = m[1].toLowerCase();
    if (m[2] !== undefined) named[name] = m[2];
    else if ((PATH_PARAMS.test(name) || VALUE_PARAMS.test(name)) && n + 1 < c.args.length) named[name] = c.args[++n].text;
  }
  return { pos, named };
}

/** The files a command writes, moves or deletes. Readers write nothing; a command it doesn't know writes all its operands. */
function written(c) {
  const out = [...c.redirects];
  const { cmd } = c;
  if (!cmd || DATA_CMDS.test(cmd) || PKG_CMD.test(cmd) || SHELL_CMDS.test(cmd) || POWERSHELLS.test(cmd) || /^(cmd|eval|iex|invoke-expression)$/.test(cmd)) return out;
  if (cmd === 'git') {
    const changes = /^(checkout|restore|switch|mv|apply|am|reset|clean|stash)$/.test(c.sub ?? '') || (c.sub === 'rm' && !c.rest.some((a) => a.text === '--cached'));
    return changes ? [...out, ...c.rest.map((a) => a.text)] : out;
  }
  if (RUNS_CODE.test(cmd)) {
    const n = c.args.findIndex((a) => /^(-e|--eval|-p|--print|-c)$/.test(a.text));
    const script = n >= 0 ? c.args[n + 1]?.text ?? '' : '';
    return WRITE_CALL.test(script) ? [...out, script] : out;
  }
  const { pos, named } = operandsOf(c);
  const paths = Object.entries(named).filter(([k]) => PATH_PARAMS.test(k)).map(([, v]) => v);
  if (cmd === 'sed' || cmd === 'perl') return c.args.some((a) => /^(-i|--in-place)/.test(a.text) || (cmd === 'perl' && /^-\w*i/.test(a.text))) ? [...out, ...pos] : out;
  if (cmd === 'find') return c.args.some((a) => /^-(delete|exec|execdir|fprint\w*)$/.test(a.text)) ? [...out, ...pos] : out;
  if (READERS.has(cmd)) return out;
  if (COPY.has(cmd)) return [...out, ...(named.destination !== undefined ? [named.destination] : pos.slice(-1))];
  if (WRITE_FIRST.has(cmd)) return [...out, ...paths, ...pos.slice(0, 1)];
  return [...out, ...paths, ...pos];
}

// ---------- what the rules look for ----------
const DELETE_CMD = /^(rm|rmdir|rd|del|erase|ri|remove-item|unlink|shred)$/;
const PS_RECURSE = /^-r(e(c(u(r(s(e)?)?)?)?)?)?$/i; // -Recurse and every abbreviation PowerShell accepts
/** -r, -rf, --recursive, /s, -Recurse, -Rec, -Recurse:$true (but not -Recurse:$false) */
const recurseFlag = (t) => {
  if (/^\/s$/i.test(t)) return true;
  const m = t.match(/^(-{1,2}[^:=]+)(?:[:=](.*))?$/);
  if (!m || (m[2] !== undefined && /^\$?false$/i.test(m[2]))) return false;
  return m[1] === '--recursive' || PS_RECURSE.test(m[1]) || (/^-[rRfvidI]+$/.test(m[1]) && /r/i.test(m[1]));
};

const SECRET_FILE = [
  /(^|[\s"'`=@:(<>|;&,/\\])\.env(?:\.(?!example\b|sample\b|template\b|dist\b)[\w-]+)*(?=$|[\s"'`)<>|;&,/\\])/i,
  /(^|[/\\])\.ssh([/\\]|$)/i, /\bid_(rsa|dsa|ecdsa|ed25519)\b/i, /(^|[/\\])\.aws[/\\]credentials\b/i,
  /(^|[\s"'/\\])\.npmrc\b/i, /(^|[\s"'/\\])\.git-credentials\b/i, /\.(pem|pfx|p12)(?=$|[\s"'`)])/i,
];
const SECRET_NAME = /token|secret|passw(or)?d|api_?key|private_?key|credential|_key$|^key$/i;
const HARDCODED = /[\w$]*(?:api[_-]?key|secret|token|passw(?:or)?d|credential)[\w$]*["']?\s*[:=]\s*(["'`])(?!\s*\$\{)[^"'`\n]{4,}\1/i;
/** Only an existence check or the index: Test-Path .env, ls, git rm --cached .env (unless the output goes on to a pipe). */
const metadataOnly = (c) => !c.pipedOut && (METADATA.has(c.cmd)
  || (c.cmd === 'git' && (/^(status|check-ignore|ls-files)$/.test(c.sub ?? '') || (c.sub === 'rm' && c.rest.some((a) => a.text === '--cached')))));

/** Environment variables a command reads: $env:NAME (PowerShell), and $NAME or ${NAME} in capitals that it doesn't set itself. */
const envReads = (c, own) => [
  ...[...c.expand.matchAll(/\$\{?env:([A-Za-z_]\w*)/gi)].map((m) => m[1]),
  ...[...c.expand.matchAll(/\$\{?([A-Z_][A-Z0-9_]*)(?![A-Za-z0-9_])/g)].map((m) => m[1]).filter((n) => !own.has(n)),
];

const ALLOWED_HOSTS = new Set(['nodejs.org', 'registry.npmjs.org', 'www.npmjs.com', 'developer.mozilla.org', 'github.com', 'docs.github.com']);
const hosts = (text) => [...String(text).matchAll(/\b(?:https?|ftp|wss?):\/\/([^/\s"'`?#:)]+)/gi)].map((m) => m[1].toLowerCase());
const RAW_SOCKET = /^(scp|sftp|ftp|nc|ncat|netcat|socat|telnet|send-mailmessage)$/;
/** Does a download command send data: POST/PUT/PATCH, curl -d/-F/-T, wget --post-file, -InFile, -Body? */
function uploads(c) {
  const a = c.args.map((x) => x.text);
  const method = a.some((t, n) => /^(-X|--request|-method|--method)$/i.test(t) && /^(post|put|patch)$/i.test(a[n + 1] ?? ''))
    || a.some((t) => /^(-X|--request=|-method:|--method=)(post|put|patch)$/i.test(t));
  if (c.cmd === 'curl') return method || a.some((t) => /^-[dFT]/.test(t) || /^--(data[\w-]*|json|form[\w-]*|upload-file)(=|$)/.test(t));
  if (c.cmd === 'wget') return method || a.some((t) => /^--(post|body)-(data|file)(=|$)/.test(t));
  return DOWNLOAD.test(c.cmd) && (method || a.some((t) => /^-(infile|body)(:|$)/i.test(t)));
}

const INSTALL = /^(install|i|in|ins|inst|insta|instal|isnt|isnta|isntal|isntall|add)$/;
const OTHER_INSTALL = /^(pip|pip3|gem|cargo|go|brew|choco|winget|scoop|apt|apt-get|yum|dnf)$/;
const RUN_PACKAGE = /^(npx|bunx|pnpx)$/;
const FETCHES = /^\s*(curl|wget|iwr|irm|invoke-webrequest|invoke-restmethod)(\.exe)?\b/i;
const PKG_FILE = /(^|[/\\])(package(-lock)?\.json|npm-shrinkwrap\.json)$/i;

const HARNESS_CONTROL = [/(^|[\s"'`=/\\])\.github[/\\]hooks([/\\]|$)/i, /(^|[\s"'`=/\\])\.github[/\\]agents([/\\]|$)/i, /(^|[\s"'`=/\\])(\.github[/\\]|\.vscode[/\\])?\.?mcp\.json\b/i, /(^|[\s"'`=/\\])\.copilot[/\\]/i];
const AGENTS_MD = /(^|[\s"'`=/\\])AGENTS\.md($|[\s"'`)])/i;
const BOUNDARY = /\b(never|must not|do not|don'?t)\b/i;
const anyMatch = (res, text) => res.some((re) => re.test(text));
const boundaryLines = (text) => String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter((l) => BOUNDARY.test(l));
const isAgentsMd = (p) => /(^|\/)AGENTS\.md$/i.test(p);

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
  const added = [];
  for (const s of all) {
    for (const m of s.value.matchAll(/^\*\*\* (?:(?:Add|Update|Delete) File|Move to): (.+)$/gm)) paths.push(m[1].trim()); // a move writes its target too
    if (/patch|diff/i.test(s.key) || /^\*\*\* Begin Patch|^@@ /m.test(s.value)) added.push(...s.value.split(/\r?\n/).filter((l) => /^\+(?!\+\+)/.test(l)).map((l) => l.slice(1)));
  }
  const command = shell ? String(args.command ?? '') : '';
  const cmds = shell ? commands(command) : [];
  return {
    tool, args, cwd, shell, paths, cmds,
    own: shell ? assigned(joinLines(command)) : new Set(),
    writtenPaths: cmds.flatMap(written),
    texts: all.map((s) => s.value),
    newTexts: [...all.filter((s) => NEW_CONTENT_KEYS.test(s.key)).map((s) => s.value), ...added], // what a write adds, not what it removes
    writes: !shell && !READ_TOOLS.has(tool) && (WRITE_TOOL.test(tool) || all.some((s) => /^(new_str|file_text|content|patch)$/.test(s.key))),
  };
}

// ---------- the rules: the first one that matches decides ----------
export const RULES = [
  {
    id: 'recursive-delete',
    reason: 'Recursive and mass deletes (rm -r, Remove-Item -Recurse, rd /s, find -delete, piping files into a delete) are blocked in this project. Delete specific files by name instead, or ask the human.',
    test: (call) => call.cmds.some((c) => (DELETE_CMD.test(c.cmd) && (c.args.some((a) => recurseFlag(a.text)) || c.piped || c.viaXargs))
      || (c.cmd === 'find' && c.args.some((a, n) => a.text === '-delete' || (/^-exec(dir)?$/.test(a.text) && DELETE_CMD.test(base(c.args[n + 1]?.text)))))
      || (c.piped && /\.delete\(\)/i.test(c.code))),
  },
  {
    id: 'git-history',
    reason: 'Commands that throw away work or rewrite history (git clean -f, git reset --hard, git push --force, git checkout -- .) are blocked. Use git stash or a new commit instead, or ask the human.',
    test: (call) => call.cmds.some((c) => {
      if (c.cmd !== 'git') return false;
      const r = c.rest.map((a) => a.text);
      if (c.sub === 'clean') return r.some((x) => /^-[a-z]*f/i.test(x) || x === '--force');
      if (c.sub === 'reset') return r.includes('--hard');
      if (c.sub === 'push') return r.some((x) => /^(-f|--force(-with-lease)?(=.*)?|\+\S+)$/.test(x));
      if (c.sub === 'checkout' || c.sub === 'restore') return r.some((x) => x === '.' || x === '*' || x === ':/');
      return false;
    }),
  },
  {
    id: 'secret-files',
    reason: 'Secret files (.env and its variants, SSH and cloud keys, .npmrc) are off-limits to every tool, for reading and for writing. Use .env.example for the variable names, read values in code with process.env, or ask the human.',
    test: (call) => (call.shell
      ? call.cmds.some((c) => !metadataOnly(c) && c.operands.some((o) => anyMatch(SECRET_FILE, o)))
      : call.paths.some((p) => anyMatch(SECRET_FILE, p))),
  },
  {
    id: 'secret-env',
    reason: 'Commands that print or copy secret environment variables (tokens, keys, passwords) are blocked. Code should read them with process.env at run time instead; ask the human if you need to know whether one is set.',
    test: (call) => call.cmds.some((c) => c.cmd === 'printenv' || c.cmd === 'env'
      || envReads(c, call.own).some((n) => SECRET_NAME.test(n))
      || (/^(get-childitem|gci|ls|dir|get-item|gi|get-content|gc|cat|type)$/.test(c.cmd) && c.args.some((a) => /^env:/i.test(a.text)))
      || /GetEnvironmentVariables?\s*\(|process\.env(?![.\w[])/i.test(c.code)
      || [...c.code.matchAll(/process\.env\.([A-Za-z_]\w*)/g)].some((m) => SECRET_NAME.test(m[1]))),
  },
  {
    id: 'hardcoded-secret',
    reason: 'This puts a literal value into a secret-named variable (a key, token or password). Read it from the environment instead (process.env.NAME) and add the name to .env.example, or ask the human.',
    test: (call) => (call.shell
      ? call.cmds.some((c) => c.args.some((a, n) => !(c.cmd === 'git' && c.data.has(n)) && HARDCODED.test(a.text)))
      : call.writes && call.newTexts.some((t) => HARDCODED.test(t))),
  },
  {
    id: 'remote-code',
    reason: 'Running code straight from the internet or from a pipe (curl | sh, … | base64 -d | sh, iwr | iex, Invoke-Expression, npx and dlx, encoded commands) is blocked. Download the file, let the human review it, or write the code here instead.',
    test: (call) => call.cmds.some((c) => RUN_PACKAGE.test(c.cmd) || (PKG_CMD.test(c.cmd) && /^(dlx|exec|x)$/.test(c.sub ?? ''))
      || /^(iex|invoke-expression)$/.test(c.cmd) || c.fedByDownload
      || (c.piped && /^(sh|bash|zsh|dash|ksh|fish|pwsh|powershell|node|python3?|perl|ruby)$/.test(c.cmd) && c.args.every((a) => a.text.startsWith('-')))
      || (POWERSHELLS.test(c.cmd) && c.args.some((a) => /^[-/](e|ec|enc|encodedcommand)$/i.test(a.text)))
      || ((RUNS_CODE.test(c.cmd) || c.cmd === '') && c.subs.some((s) => FETCHES.test(s)))),
  },
  {
    id: 'new-dependency',
    reason: 'New dependencies are not allowed (StudyBuddy has zero). Write a small helper instead, or ask the human. Plain npm install and npm ci, which install what package.json already lists, are fine.',
    test: (call) => call.cmds.some((c) => {
      if (PKG_CMD.test(c.cmd) && INSTALL.test(c.sub ?? '')) {
        for (let n = 0; n < c.rest.length; n++) {
          const t = c.rest[n].text;
          if (!t.startsWith('-')) return true;
          if (PKG_VALUE_FLAGS.test(t)) n++;
        }
        return false;
      }
      const a = c.args.map((x) => x.text.toLowerCase());
      if (/^(python3?|py)$/.test(c.cmd)) return a[0] === '-m' && /^pip3?$/.test(a[1] ?? '') && a[2] === 'install';
      if (OTHER_INSTALL.test(c.cmd)) return /^(install|add|get)$/.test(a[0] ?? '');
      return /^install-(module|package|script)$/.test(c.cmd);
    }),
  },
  {
    id: 'package-json',
    reason: 'package.json and the lockfile only change through a reviewed pull request: no edits, overwrites or npm pkg set. Write a small helper instead, or ask the human.',
    test: (call) => (call.writes && call.paths.some((p) => PKG_FILE.test(p)))
      || call.writtenPaths.some((p) => PKG_FILE.test(p.trim()))
      || call.cmds.some((c) => c.cmd === 'npm' && c.sub === 'pkg' && /^(set|delete)$/.test(c.rest[0]?.text ?? '')),
  },
  {
    id: 'upload',
    reason: 'Sending data out of this machine (uploads, POST and PUT requests, scp, raw sockets) is blocked. Keep the data here, or ask the human to send it.',
    test: (call) => call.cmds.some((c) => RAW_SOCKET.test(c.cmd) || uploads(c)
      || (c.cmd === 'rsync' && c.args.some((a) => /\S@\S+:|::|^rsync:\/\//.test(a.text)))),
  },
  {
    id: 'egress',
    reason: `Network requests only go to approved hosts (${[...ALLOWED_HOSTS].join(', ')}). Use one of those instead, or ask the human to add a host to the allow-list in the guard.`,
    test: (call) => {
      const net = (c) => DOWNLOAD.test(c.cmd) || /^https?$/.test(c.cmd) || (c.cmd === 'git' && /^(clone|fetch|pull|push|remote|ls-remote|submodule)$/.test(c.sub ?? ''));
      const found = call.shell ? call.cmds.filter(net).flatMap((c) => c.args.flatMap((a) => hosts(a.text)))
        : /fetch|http|url|browse/i.test(call.tool) ? call.texts.flatMap(hosts) : [];
      return found.some((h) => !ALLOWED_HOSTS.has(h));
    },
  },
  {
    id: 'harness-controls',
    reason: 'The guard, its hook config, the agents\' tool lists and the MCP config belong to the harness owner: the agent may read them but never change them. Describe the change you need, and ask the human (see HARNESS.md).',
    test: (call) => (call.writes && call.paths.some((p) => anyMatch(HARNESS_CONTROL, p))) || call.writtenPaths.some((p) => anyMatch(HARNESS_CONTROL, p)),
  },
  {
    id: 'boundaries',
    reason: 'This would remove or rewrite a boundary in AGENTS.md. Boundaries change only through the harness owner: edit AGENTS.md with the edit tool and keep every "Never" line, or ask the human.',
    test: (call) => {
      if (call.shell) return call.writtenPaths.some((p) => AGENTS_MD.test(p));
      if (!call.writes || !call.paths.some(isAgentsMd)) return false;
      if (typeof call.args.old_str === 'string') return boundaryLines(call.args.old_str).some((l) => !boundaryLines(call.args.new_str).includes(l));
      if (typeof call.args.file_text !== 'string') return true; // a delete, a move or a patch: not through the agent
      const file = path.resolve(call.cwd ?? '.', call.paths.find(isAgentsMd));
      const before = fs.existsSync(file) ? boundaryLines(fs.readFileSync(file, 'utf8')) : [];
      return before.some((l) => !boundaryLines(call.args.file_text).includes(l));
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
