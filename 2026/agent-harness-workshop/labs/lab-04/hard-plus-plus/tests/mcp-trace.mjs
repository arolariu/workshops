// The hard++ agent check starts your server as `node --import <this file> mcp/library-server.mjs`: it records every
// JSON-RPC message that comes in on stdin and goes out on stdout (direction, method, id, and whether it is a result or
// an error: never the content) as JSON lines in the file named by MCP_TRACE_LOG. The server itself is unchanged.
import fs from 'node:fs';
import path from 'node:path';

const LOG = process.env.MCP_TRACE_LOG;
if (LOG) {
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  const fd = fs.openSync(LOG, 'a');
  const reader = (dir) => {
    let buf = '';
    return (chunk) => {
      buf += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      for (let n = buf.indexOf('\n'); n >= 0; n = buf.indexOf('\n')) {
        const line = buf.slice(0, n).trim();
        buf = buf.slice(n + 1);
        let m = null;
        try { m = JSON.parse(line); } catch { continue; }
        const entry = { at: new Date().toISOString(), dir, method: m?.method ?? null, id: m?.id ?? null, result: Boolean(m && 'result' in m), error: m?.error?.code ?? null };
        try { fs.writeSync(fd, `${JSON.stringify(entry)}\n`); } catch { /* never break the server */ }
      }
    };
  };
  // Everything that arrives on stdin passes through push(), whichever way the server reads it.
  const inbound = reader('in');
  const push = process.stdin.push;
  process.stdin.push = function traced(chunk, encoding) {
    if (chunk !== null && chunk !== undefined) inbound(chunk);
    return push.call(this, chunk, encoding);
  };
  const outbound = reader('out');
  const write = process.stdout.write;
  process.stdout.write = function traced(chunk, ...rest) {
    try { outbound(chunk); } catch { /* never break the server */ }
    return write.call(this, chunk, ...rest);
  };
}
