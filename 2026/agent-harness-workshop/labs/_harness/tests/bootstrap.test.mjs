import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolveCommand } from '../process.mjs';
import { tmpdir, writeTree } from './helpers.mjs';

const W = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const WIN = process.platform === 'win32';
const NODE_VERSION = fs.readFileSync(path.join(W, 'start.sh'), 'utf8').match(/^NODE_VERSION=(\S+)/m)[1];
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

// The fixture "lab companion": records how it was started and exits with EXIT_CODE.
const FIXTURE_SETUP = `import fs from 'node:fs';
fs.writeFileSync(process.env.RECORD, JSON.stringify({ argv: process.argv.slice(2), execPath: process.execPath, path: process.env.PATH }));
process.exit(Number(process.env.EXIT_CODE ?? 0));
`;
function workshopCopy(launcher, patch = (s) => s) {
  const dir = path.join(tmpdir('bootstrap '), 'my workshop');
  fs.mkdirSync(dir, { recursive: true });
  const text = patch(fs.readFileSync(path.join(W, launcher), 'utf8'));
  fs.writeFileSync(path.join(dir, launcher), text);
  if (!WIN) fs.chmodSync(path.join(dir, launcher), 0o755);
  fs.writeFileSync(path.join(dir, 'setup.mjs'), FIXTURE_SETUP);
  return dir;
}
/** Like spawnSync, but keeps this process's event loop free so the local mirror can answer. */
function spawnAsync(cmd, args, opts) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    const timer = setTimeout(() => child.kill(), opts.timeout ?? 120000);
    child.on('error', (e) => { clearTimeout(timer); resolve({ status: -1, stdout, stderr: e.message }); });
    child.on('close', (status) => { clearTimeout(timer); resolve({ status, stdout, stderr }); });
  });
}
const listAll = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).map(String).sort() : []);

// A local mirror: serves fixture archives and counts requests. No real downloads in tests.
let server;
let mirror;
const files = new Map();
let hits = 0;
before(async () => {
  server = http.createServer((req, res) => {
    hits++;
    const body = files.get(req.url);
    if (!body) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-length': body.length });
    res.end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  mirror = `http://127.0.0.1:${server.address().port}`;
});
after(() => server?.close());

describe('start.cmd (native Windows cmd)', { skip: !WIN }, () => {
  const plat = process.arch === 'arm64' ? 'win-arm64' : 'win-x64';
  const name = `node-${NODE_VERSION}-${plat}`;
  const sys32 = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32');
  let goodZip;
  let evilZip;
  const zip = (dir, out, extra = []) => {
    const r = spawnSync('tar.exe', ['-a', '-cf', out, '--options', 'zip:compression=store', '-C', dir, name, ...extra], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return out;
  };
  before(() => {
    const build = tmpdir('node archive ');
    fs.mkdirSync(path.join(build, name));
    fs.copyFileSync(process.execPath, path.join(build, name, 'node.exe'));
    goodZip = zip(build, path.join(build, 'good.zip'));
    fs.writeFileSync(path.join(build, 'evil.txt'), 'outside the expected folder');
    evilZip = zip(build, path.join(build, 'evil.zip'), ['evil.txt']);
  });
  const withSha = (sha) => (s) => s.replace(new RegExp(`(NODE_SHA256_${plat.replace('-', '_')}=)[0-9a-f]+`), `$1${sha}`);
  /** Run start.cmd natively through cmd.exe, from a folder with spaces. */
  const run = async (dir, args, env = {}) => {
    const record = path.join(dir, '..', `record-${crypto.randomBytes(3).toString('hex')}.json`);
    const home = path.join(dir, '..', 'home');
    fs.mkdirSync(home, { recursive: true });
    const r = await spawnAsync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `""${path.join(dir, 'start.cmd')}" ${args}"`], {
      encoding: 'utf8',
      windowsVerbatimArguments: true,
      timeout: 120000,
      env: { SystemRoot: process.env.SystemRoot, ComSpec: process.env.ComSpec, PATHEXT: process.env.PATHEXT, TEMP: process.env.TEMP, TMP: process.env.TMP, PROCESSOR_ARCHITECTURE: process.env.PROCESSOR_ARCHITECTURE, USERPROFILE: home, APPDATA: home, LOCALAPPDATA: home, HOME: home, RECORD: record, EXIT_CODE: '7', WORKSHOP_NODE_MIRROR: mirror, ...env },
    });
    const recorded = fs.existsSync(record) ? JSON.parse(fs.readFileSync(record, 'utf8')) : null;
    return { status: r.status, out: `${r.stdout}${r.stderr}`, recorded, home };
  };

  test('an existing Node.js is used, from a folder with spaces, with arguments and the exit code forwarded', async () => {
    const dir = workshopCopy('start.cmd');
    const nodeDir = path.dirname(process.execPath);
    const r = await run(dir, 'open lab-04 medium --no-anim', { PATH: `${nodeDir};${sys32}` });
    assert.equal(r.status, 7, r.out);
    assert.deepEqual(r.recorded.argv, ['open', 'lab-04', 'medium', '--no-anim']);
    assert.equal(r.recorded.execPath.toLowerCase(), process.execPath.toLowerCase());
    assert.equal(fs.existsSync(path.join(dir, '.workshop')), false, 'nothing was prepared');
    const literal = await run(dir, '-- --check open', { PATH: `${nodeDir};${sys32}` });
    assert.deepEqual(literal.recorded.argv, ['--', '--check', 'open'], 'arguments after -- are not launcher options');
  });

  test('--help and --check never create state, even without Node.js', async () => {
    const dir = workshopCopy('start.cmd');
    const help = await run(dir, '--help', { PATH: sys32 });
    assert.equal(help.status, 0);
    assert.match(help.out, /workshop launcher for Windows/);
    const check = await run(dir, '--check', { PATH: sys32 });
    assert.equal(check.status, 3);
    assert.match(check.out, /Node\.js 22 or newer was not found/);
    assert.equal(fs.existsSync(path.join(dir, '.workshop')), false);
    assert.equal(hits, 0, 'no network');
    assert.equal(check.recorded, null);
  });

  test('a missing Node.js is downloaded privately, verified, reused, and nothing global changes', async () => {
    files.set(`/${NODE_VERSION}/${name}.zip`, fs.readFileSync(goodZip));
    const dir = workshopCopy('start.cmd', withSha(sha256(goodZip)));
    const before = hits;
    const first = await run(dir, 'open lab-04 medium --no-anim', { PATH: sys32 });
    assert.equal(first.status, 7, first.out);
    const privateNode = path.join(dir, '.workshop', 'node', name, 'node.exe');
    assert.equal(first.recorded.execPath.toLowerCase(), privateNode.toLowerCase());
    assert.deepEqual(first.recorded.argv, ['open', 'lab-04', 'medium', '--no-anim']);
    assert.equal(first.recorded.path, `${path.dirname(privateNode)}\\;${sys32}`, 'only the lab app gets the private runtime on its PATH');
    assert.equal(hits - before, 1);
    assert.deepEqual(listAll(first.home), [], 'nothing written to the user profile');
    const second = await run(dir, 'list', { PATH: sys32 });
    assert.equal(second.status, 7);
    assert.equal(hits - before, 1, 'the private runtime is reused');
    assert.ok(!listAll(path.join(dir, '.workshop')).some((f) => /\.part$|\.staging-/.test(f)), 'no partial files left');
  });

  test('a download that does not match the pinned checksum is deleted and never run', async () => {
    files.set(`/${NODE_VERSION}/${name}.zip`, fs.readFileSync(goodZip));
    const dir = workshopCopy('start.cmd', withSha('0'.repeat(64)));
    const r = await run(dir, 'list', { PATH: sys32 });
    assert.equal(r.status, 3);
    assert.match(r.out, /does not match its pinned SHA-256/);
    assert.equal(r.recorded, null);
    assert.equal(fs.existsSync(path.join(dir, '.workshop', 'node', name)), false);
    assert.ok(!listAll(path.join(dir, '.workshop')).some((f) => /\.part$|\.zip$/.test(f)));
  });

  test('--offline never uses the network, and uses a verified cache', async () => {
    const dir = workshopCopy('start.cmd', withSha(sha256(goodZip)));
    const before = hits;
    const miss = await run(dir, '--offline', { PATH: sys32 });
    assert.equal(miss.status, 3);
    assert.match(miss.out, /Offline/);
    fs.mkdirSync(path.join(dir, '.workshop', 'cache'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.workshop', 'cache', `${name}.zip`), 'corrupt');
    assert.equal((await run(dir, '--offline', { PATH: sys32 })).status, 3, 'a corrupt cache is not used');
    fs.copyFileSync(goodZip, path.join(dir, '.workshop', 'cache', `${name}.zip`));
    const hit = await run(dir, '--offline open lab-01 easy', { PATH: sys32 });
    assert.equal(hit.status, 7, hit.out);
    assert.deepEqual(hit.recorded.argv, ['--offline', 'open', 'lab-01', 'easy']);
    assert.equal(hits, before, 'no request was made');
  });

  test('the verified copy is moved into place even while something still holds the staged folder for a moment', async () => {
    // Antivirus can hold the program that just ran, and Windows won't rename a folder something holds ("Access is
    // denied"). A process working inside the staged folder holds it the same way: start one for a moment, right
    // before the move, so that this happens every time.
    const hold = (text) => withSha(sha256(goodZip))(text).replace(/^if not exist "%FINAL%\\" /m, (line) => `start "" /b /d "%STAGE%\\%NAME%" "%STAGE%\\%NAME%\\node.exe" -e "setTimeout(() => {}, 2500)"\r\n${line}`);
    const dir = workshopCopy('start.cmd', hold);
    assert.match(fs.readFileSync(path.join(dir, 'start.cmd'), 'utf8'), /start "" \/b/, 'the launcher was patched');
    fs.mkdirSync(path.join(dir, '.workshop', 'cache'), { recursive: true });
    fs.copyFileSync(goodZip, path.join(dir, '.workshop', 'cache', `${name}.zip`));
    const r = await run(dir, '--offline list', { PATH: sys32 });
    assert.equal(r.status, 7, r.out);
    assert.equal(r.recorded.execPath.toLowerCase(), path.join(dir, '.workshop', 'node', name, 'node.exe').toLowerCase());
  });

  test('an archive with paths outside the expected folder is not unpacked', async () => {
    files.set(`/${NODE_VERSION}/${name}.zip`, fs.readFileSync(evilZip));
    const dir = workshopCopy('start.cmd', withSha(sha256(evilZip)));
    const r = await run(dir, 'list', { PATH: sys32 });
    assert.equal(r.status, 3);
    assert.match(r.out, /unexpected paths/);
    assert.equal(r.recorded, null);
    assert.equal(fs.existsSync(path.join(dir, 'evil.txt')), false);
  });
});

// POSIX sh: native on macOS/Linux; on Windows, Git for Windows' sh gives supplemental coverage (not native proof).
const shPath = resolveCommand('sh');
describe('start.sh (POSIX sh)', { skip: !shPath }, () => {
  const plat = WIN ? 'linux-x64' : `${process.platform === 'darwin' ? 'darwin' : 'linux'}-${process.arch === 'arm64' ? 'arm64' : 'x64'}`;
  const name = `node-${NODE_VERSION}-${plat}`;
  const toSh = (p) => (WIN ? p.replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`).replace(/\\/g, '/') : p);
  const gitRoot = WIN ? path.dirname(path.dirname(shPath)) : null;
  const basePath = WIN ? ['usr\\bin', 'ucrt64\\bin', 'mingw64\\bin'].map((d) => path.join(gitRoot, d)).concat(path.join(process.env.SystemRoot, 'System32')).join(';') : '/usr/bin:/bin';
  const nodeOnBase = WIN ? false : spawnSync('sh', ['-c', 'command -v node'], { env: { PATH: basePath } }).status === 0;
  let goodTar;
  let evilTar;
  before(() => {
    const build = tmpdir('node tarball ');
    writeTree(build, { [`${name}/bin/node`]: `#!/bin/sh\nexec "${toSh(process.execPath)}" "$@"\n`, 'evil.txt': 'x' });
    fs.chmodSync(path.join(build, name, 'bin', 'node'), 0o755);
    const tar = (out, extra = []) => {
      const r = spawnSync('tar', ['-czf', out, '-C', build, name, ...extra], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      return out;
    };
    goodTar = tar(path.join(build, 'good.tar.gz'));
    evilTar = tar(path.join(build, 'evil.tar.gz'), ['evil.txt']);
  });
  const withSha = (sha) => (s) => s.replace(new RegExp(`(NODE_SHA256_${plat.replace(/-/g, '_')}=)[0-9a-f]+`), `$1${sha}`);
  const run = async (dir, args, env = {}) => {
    const record = path.join(dir, '..', `record-${crypto.randomBytes(3).toString('hex')}.json`);
    const home = path.join(dir, '..', 'home');
    fs.mkdirSync(home, { recursive: true });
    const r = await spawnAsync(shPath, [path.join(dir, 'start.sh'), ...args], {
      encoding: 'utf8',
      timeout: 120000,
      env: { ...(WIN ? { SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP, WORKSHOP_PLATFORM: plat } : {}), HOME: home, RECORD: record, EXIT_CODE: '7', WORKSHOP_NODE_MIRROR: mirror, ...env },
    });
    const recorded = fs.existsSync(record) ? JSON.parse(fs.readFileSync(record, 'utf8')) : null;
    return { status: r.status, out: `${r.stdout}${r.stderr}`, recorded, home };
  };

  test('an existing Node.js is used, from a folder with spaces, with arguments and the exit code forwarded', async () => {
    const dir = workshopCopy('start.sh');
    const r = await run(dir, ['open', 'lab-04', 'medium', '--no-anim'], { PATH: `${path.dirname(process.execPath)}${WIN ? ';' : ':'}${basePath}` });
    assert.equal(r.status, 7, r.out);
    assert.deepEqual(r.recorded.argv, ['open', 'lab-04', 'medium', '--no-anim']);
    assert.equal(fs.existsSync(path.join(dir, '.workshop')), false);
  });

  test('--help and --check never create state, even without Node.js', { skip: nodeOnBase && 'node is on the base PATH' }, async () => {
    const dir = workshopCopy('start.sh');
    const help = await run(dir, ['--help'], { PATH: basePath });
    assert.equal(help.status, 0);
    assert.match(help.out, /workshop launcher \(macOS and Linux\)/);
    const check = await run(dir, ['--check'], { PATH: basePath });
    assert.equal(check.status, 3, check.out);
    assert.match(check.out, /Node\.js 22 or newer was not found/);
    assert.equal(fs.existsSync(path.join(dir, '.workshop')), false);
  });

  test('a missing Node.js is downloaded privately, verified and reused', { skip: nodeOnBase && 'node is on the base PATH' }, async () => {
    files.set(`/${NODE_VERSION}/${name}.tar.gz`, fs.readFileSync(goodTar));
    const dir = workshopCopy('start.sh', withSha(sha256(goodTar)));
    const before = hits;
    const first = await run(dir, ['open', 'lab-04', 'medium', '--no-anim'], { PATH: basePath });
    assert.equal(first.status, 7, first.out);
    assert.deepEqual(first.recorded.argv, ['open', 'lab-04', 'medium', '--no-anim']);
    assert.ok(fs.existsSync(path.join(dir, '.workshop', 'node', name, 'bin', 'node')));
    if (!WIN) assert.equal(first.recorded.path, `${path.join(fs.realpathSync(dir), '.workshop', 'node', name, 'bin')}:${basePath}`, 'the lab app (and the MCP servers it starts) find the private runtime as node');
    assert.equal(hits - before, 1);
    assert.deepEqual(listAll(first.home), [], 'nothing written to the home folder');
    assert.equal((await run(dir, ['list'], { PATH: basePath })).status, 7);
    assert.equal(hits - before, 1, 'reused');
  });

  test('an unusable private Node.js is replaced by a verified copy instead of being started again', { skip: nodeOnBase && 'node is on the base PATH' }, async () => {
    files.set(`/${NODE_VERSION}/${name}.tar.gz`, fs.readFileSync(goodTar));
    const dir = workshopCopy('start.sh', withSha(sha256(goodTar)));
    const bin = path.join(dir, '.workshop', 'node', name, 'bin', 'node');
    assert.equal((await run(dir, ['list'], { PATH: basePath })).status, 7);
    const before = hits;
    for (const damage of [() => fs.writeFileSync(bin, '#!/bin/sh\nexit 1\n', { mode: 0o755 }), () => fs.rmSync(bin)]) {
      damage();
      const r = await run(dir, ['list'], { PATH: basePath });
      assert.equal(r.status, 7, r.out);
      assert.notEqual(r.recorded, null);
      assert.match(fs.readFileSync(bin, 'utf8'), /exec /, 'the verified runtime is back in place');
    }
    assert.equal(hits, before, 'the verified cached archive is reused');
    assert.ok(!listAll(path.join(dir, '.workshop')).some((f) => /\.staging-|\.broken-/.test(f)), 'nothing left behind');
  });

  test('a checksum mismatch, an offline miss and an unsafe archive all stop before running anything', { skip: nodeOnBase && 'node is on the base PATH' }, async () => {
    files.set(`/${NODE_VERSION}/${name}.tar.gz`, fs.readFileSync(goodTar));
    const bad = await run(workshopCopy('start.sh', withSha('0'.repeat(64))), ['list'], { PATH: basePath });
    assert.equal(bad.status, 3);
    assert.match(bad.out, /does not match its pinned SHA-256/);
    assert.equal(bad.recorded, null);
    const before = hits;
    const offline = await run(workshopCopy('start.sh', withSha(sha256(goodTar))), ['--offline'], { PATH: basePath });
    assert.equal(offline.status, 3);
    assert.match(offline.out, /Offline/);
    assert.equal(hits, before);
    files.set(`/${NODE_VERSION}/${name}.tar.gz`, fs.readFileSync(evilTar));
    const evil = await run(workshopCopy('start.sh', withSha(sha256(evilTar))), ['list'], { PATH: basePath });
    assert.equal(evil.status, 3);
    assert.match(evil.out, /unexpected path/);
    assert.equal(evil.recorded, null);
  });
});

test('the launchers and setup-tools.mjs pin the same Node.js build', async () => {
  const sh = fs.readFileSync(path.join(W, 'start.sh'), 'utf8');
  const cmd = fs.readFileSync(path.join(W, 'start.cmd'), 'utf8');
  const { NODE } = await import('../../../setup-tools.mjs');
  assert.equal(cmd.match(/set "NODE_VERSION=(\S+)"/)[1], NODE.version);
  assert.equal(NODE_VERSION, NODE.version);
  for (const [plat, a] of Object.entries(NODE.assets)) {
    const key = plat.replace(/-/g, '_');
    const inSh = sh.match(new RegExp(`^NODE_SHA256_${key}=([0-9a-f]{64})$`, 'm'))?.[1];
    const inCmd = cmd.match(new RegExp(`set "NODE_SHA256_${key}=([0-9a-f]{64})"`))?.[1];
    assert.equal(inSh ?? inCmd, a.sha256, plat);
    if (inSh && inCmd) assert.equal(inSh, inCmd);
  }
  assert.match(sh, /^#!\/bin\/sh\n/, 'start.sh uses LF line endings');
  assert.doesNotMatch(sh, /\r/);
  assert.match(cmd, /\r\n/, 'start.cmd uses CRLF line endings');
});
