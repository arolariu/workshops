// Puts the CampusHub app on a socket. Start it with the key in the environment, never on the command line:
//   npm start        (node --env-file=.env.campushub api/server.mjs)
// Without CAMPUSHUB_API_KEY the API starts read-only. The key is never printed or logged.
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { ApiError } from './errors.mjs';
import { createApp } from './handlers.mjs';
import { seedData } from './seed.mjs';
import { createStore } from './store.mjs';

const TYPES = { json: 'application/json; charset=utf-8', html: 'text/html; charset=utf-8' };

// Reads the whole body; past `maxBody` bytes it keeps draining the socket (so the client gets an answer) but
// stores nothing more, and fails with 413 at the end.
function readJson(req, maxBody) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size <= maxBody) chunks.push(chunk);
    });
    req.on('error', reject);
    req.on('end', () => {
      if (size > maxBody) return reject(new ApiError(413, 'too-large', `The body is over ${maxBody} bytes.`));
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text.trim()) return resolve(undefined);
      try { resolve(JSON.parse(text)); } catch { reject(new ApiError(400, 'invalid-json', 'The body is not valid JSON.')); }
    });
  });
}

/** An http.Server for the app. */
export function createServer(app, { maxBody = 64 * 1024 } = {}) {
  return http.createServer(async (req, res) => {
    let out;
    try {
      const body = await readJson(req, maxBody);
      out = await app.handle({ method: req.method, url: req.url, headers: req.headers, body });
    } catch (e) {
      out = e instanceof ApiError
        ? { status: e.status, type: 'json', body: { error: e.code, message: e.message } }
        : { status: 500, type: 'json', body: { error: 'internal', message: 'Something went wrong.' } };
    }
    const text = out.type === 'html' ? out.body : JSON.stringify(out.body);
    res.writeHead(out.status, { 'content-type': TYPES[out.type], 'content-length': Buffer.byteLength(text) });
    res.end(text);
  });
}

/** Listens on host:port (port 0 picks a free one) and resolves to { server, url, close }. */
export function listen({ app, port = 0, host = '127.0.0.1', maxBody } = {}) {
  const server = createServer(app, { maxBody });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const url = `http://${host}:${server.address().port}`;
      const close = () => new Promise((done) => {
        server.close(() => done());
        server.closeAllConnections();
      });
      resolve({ server, url, close });
    });
  });
}

const isMain = (() => {
  try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();

if (isMain) {
  const apiKey = process.env.CAMPUSHUB_API_KEY ?? '';
  const app = createApp({ store: createStore(seedData()), apiKey, log: (line) => console.log(line) });
  const { url } = await listen({ app, port: Number(process.env.PORT ?? 3080) });
  console.log(`CampusHub API on ${url} (${apiKey ? 'writes need the x-api-key header' : 'read-only: CAMPUSHUB_API_KEY is not set'})`);
}
