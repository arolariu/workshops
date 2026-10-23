// The checks load this before the server (node --import …/fs-spy.mjs mcp/studybuddy-server.mjs): it logs every fs call
// that can write a file to the file in FS_SPY_LOG, one JSON line each ({ op, paths }), then lets the call through.
// It is how the M4 check sees *how* your server writes state.json, without changing your code.
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';

const LOG = process.env.FS_SPY_LOG;
// The log is written with writeSync on a descriptor opened before anything is wrapped: appendFileSync would call the
// wrapped writeFileSync and log itself, forever.
const logFd = LOG ? fs.openSync(LOG, 'a') : null;
let busy = false;
const text = (p) => (p instanceof URL ? fileURLToPath(p) : Buffer.isBuffer(p) ? p.toString() : String(p));
const log = (op, paths) => {
  if (logFd === null || busy) return;
  busy = true;
  try { fs.writeSync(logFd, `${JSON.stringify({ op, paths: paths.map(text) })}\n`); } catch { /* never break the server */ } finally { busy = false; }
};
const W = fs.constants;
const writes = (flags) => (typeof flags === 'number'
  ? (flags & (W.O_WRONLY | W.O_RDWR | W.O_APPEND | W.O_CREAT | W.O_TRUNC)) !== 0
  : /[wa+]/.test(String(flags ?? 'r')));

function wrap(obj, name, label, pathsOf, when = () => true) {
  const original = obj?.[name];
  if (typeof original !== 'function') return;
  obj[name] = function spied(...args) {
    if (when(args)) log(label, pathsOf(args));
    return original.apply(this, args);
  };
}
const one = (a) => [a[0]];
const two = (a) => [a[0], a[1]];
for (const [obj, prefix] of [[fs, ''], [fs.promises, 'promises.']]) {
  for (const n of ['writeFileSync', 'writeFile', 'appendFileSync', 'appendFile', 'truncateSync', 'truncate', 'createWriteStream']) wrap(obj, n, `${prefix}${n}`, one);
  for (const n of ['renameSync', 'rename', 'copyFileSync', 'copyFile', 'cpSync', 'cp']) wrap(obj, n, `${prefix}${n}`, two);
  for (const n of ['openSync', 'open']) wrap(obj, n, `${prefix}${n}`, one, (a) => writes(a[1]));
}
syncBuiltinESMExports();
