import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { prepare, main, parseArgs, selectedLab, platformKey } from '../../../setup.mjs';
import { tmpdir, writeTree } from './helpers.mjs';

// Unpaid, offline-safe fixtures: fake tools packed as real archives, served from a local mirror. Nothing real is installed.
const WIN = process.platform === 'win32';
const KEY = platformKey();
const HELP = 'Usage\n  --agent\n  --plugin-dir\n  --allow-tool\n  --deny-tool\n  --max-ai-credits\n  --no-ask-user\nCommands:\n  instruction\n';
const script = (name, js) => (WIN
  ? { [`${name}.cmd`]: `@"${process.execPath}" "%~dp0${name}.js" %*\r\n`, [`${name}.js`]: js }
  : { [name]: `#!/bin/sh\nexec "${process.execPath}" "$(dirname "$0")/${name}.js" "$@"\n`, [`${name}.js`]: js });
const say = (text) => `process.stdout.write(${JSON.stringify(text)});`;
const exe = (name) => (WIN ? `${name}.cmd` : name);
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

let server;
let mirror;
let hits = 0;
const served = new Map();
const archives = {};
before(async () => {
  server = http.createServer((req, res) => {
    hits++;
    const body = served.get(req.url);
    if (!body) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-length': body.length });
    res.end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  mirror = `http://127.0.0.1:${server.address().port}`;
  const pack = (name, files, extra = []) => {
    const dir = tmpdir('setup archive ');
    writeTree(path.join(dir, 'pkg'), files);
    if (!WIN) for (const f of Object.keys(files)) if (!f.endsWith('.js')) fs.chmodSync(path.join(dir, 'pkg', f), 0o755);
    for (const [rel, content] of extra) writeTree(dir, { [rel]: content });
    const out = path.join(dir, `${name}.tar.gz`);
    const r = spawnSync('tar', ['-czf', out, '-C', dir, 'pkg', ...extra.map(([rel]) => rel)], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    archives[name] = fs.readFileSync(out);
    served.set(`/${name}.tar.gz`, archives[name]);
  };
  pack('apm', script('apm', say('apm version 9.9.9\n')));
  pack('copilot', script('copilot', `if (process.argv[2] === '--help') ${say(HELP)} else ${say('GitHub Copilot CLI 9.9.9.\n')}`));
  pack('broken', script('apm', say('apm version 0.0.1\n')));
  pack('evil', script('apm', say('apm version 9.9.9\n')), [['outside.txt', 'x']]);
});
after(() => server?.close());

const pin = (name, version = '9.9.9', file = name) => ({
  label: name, version, expect: new RegExp(version.replace(/\./g, '\\.')),
  assets: { [KEY]: { url: `${mirror}/${file}.tar.gz`, sha256: sha(archives[file]), size: archives[file].length, exe: exe(name === 'copilot' ? 'copilot' : 'apm'), bin: 'pkg' } },
});

/** A machine with a capable Copilot (and PowerShell on Windows) on PATH, in a folder with spaces. */
function machine({ copilotHelp = HELP } = {}) {
  const root = tmpdir('setup machine ');
  const userBin = path.join(root, 'user tools');
  writeTree(userBin, {
    ...script('copilot', `if (process.argv[2] === '--help') ${say(copilotHelp)} else ${say('GitHub Copilot CLI 1.0.98.\n')}`),
    ...(WIN ? script('pwsh', say('PowerShell 7.6.7\n')) : {}),
  });
  if (!WIN) for (const f of ['copilot']) fs.chmodSync(path.join(userBin, f), 0o755);
  const sys = WIN ? [path.join(process.env.SystemRoot, 'System32')] : ['/usr/bin', '/bin'];
  const env = { PATH: [userBin, ...sys].join(WIN ? ';' : ':'), PATHEXT: process.env.PATHEXT, SystemRoot: process.env.SystemRoot, ComSpec: process.env.ComSpec, HOME: root, USERPROFILE: root };
  return { root, userBin, env, toolsDir: path.join(root, 'workshop tools'), cacheDir: path.join(root, 'workshop tools', 'cache') };
}
const run = (m, opts) => prepare({ toolsDir: m.toolsDir, cacheDir: m.cacheDir, env: m.env, readTrust: () => null, ...opts });

test('arguments: setup options are recognized, everything else and everything after -- is forwarded', () => {
  const o = parseArgs(['--install=apm,gh', 'open', 'lab-06', 'easy', '--no-anim', '--', '--check', 'x']);
  assert.deepEqual(o.install, ['apm', 'gh']);
  assert.equal(o.check, false);
  assert.deepEqual(o.forward, ['open', 'lab-06', 'easy', '--no-anim', '--check', 'x']);
  assert.match(parseArgs(['--install=frob']).errors[0], /frob/);
  assert.equal(selectedLab(['open', 'lab-06', 'easy']), 'lab-06');
  assert.equal(selectedLab(['--exercise=lab-07/hard']), 'lab-07');
  assert.equal(selectedLab(['list']), null);
});

test('--check reads only: no downloads, no installs, no files', async () => {
  const m = machine();
  const originalPath = process.env.PATH;
  const readOnly = await run(m, { check: true, install: ['apm'], pins: { apm: pin('apm') } });
  assert.equal(readOnly.installs.length, 0);
  assert.equal(readOnly.downloads.length, 0);
  assert.deepEqual(readOnly.plan.map((p) => p.tool), ['apm']);
  assert.equal(fs.existsSync(m.toolsDir), false);
  assert.equal(hits, 0);
  assert.equal(process.env.PATH, originalPath);
});

test('a requested tool is prepared privately, verified, probed, and reused on the next run', async () => {
  const m = machine();
  const originalPath = process.env.PATH;
  const first = await run(m, { install: ['apm'], pins: { apm: pin('apm') } });
  assert.deepEqual(first.failures, []);
  assert.deepEqual(first.installs, ['apm']);
  assert.deepEqual(first.downloads, ['apm']);
  assert.equal(first.report.items.find((x) => x.id === 'apm').status, 'ready');
  assert.ok(first.env.PATH.startsWith(path.join(m.toolsDir, 'apm')), 'the private folder comes first, for the lab app only');
  assert.ok(first.env.PATH.includes(m.userBin), 'the existing PATH is kept');
  assert.equal(process.env.PATH, originalPath, 'this process is unchanged');
  const secondRun = await run(m, { install: ['apm'], pins: { apm: pin('apm') } });
  assert.deepEqual(secondRun.installs, []);
  assert.deepEqual(secondRun.downloads, []);
  assert.deepEqual(fs.readdirSync(m.root).sort(), ['user tools', 'workshop tools'], 'nothing written outside the tools folder');
});

test('a checksum mismatch installs nothing and the lab app is not launched', async () => {
  const m = machine();
  const bad = { apm: { ...pin('apm'), assets: { [KEY]: { ...pin('apm').assets[KEY], sha256: '0'.repeat(64) } } } };
  const result = await run(m, { install: ['apm'], pins: bad });
  assert.match(result.failures[0].message, /does not match its pinned SHA-256/);
  assert.equal(fs.existsSync(path.join(m.toolsDir, 'apm', `9.9.9-${KEY}`)), false);
  assert.ok(!fs.readdirSync(m.cacheDir).some((f) => f.endsWith('.part') || f.endsWith('.tar.gz')));
  const lines = [];
  let launched = false;
  const hashMismatch = { launched: false };
  const code = await main(['--install=apm'], { env: { ...m.env, WORKSHOP_TOOLS_DIR: m.toolsDir }, out: (s) => lines.push(s), pins: bad, readTrust: () => null, launch: async () => { launched = true; return 0; } });
  hashMismatch.launched = launched;
  assert.equal(code, 1);
  assert.equal(hashMismatch.launched, false);
  assert.match(lines.join('\n'), /requested but is not available/);
});

test('offline never downloads: a miss explains what to do; a verified cache works; a corrupt cache is ignored', async () => {
  const m = machine();
  const before = hits;
  const miss = await run(m, { offline: true, install: ['apm'], pins: { apm: pin('apm') } });
  assert.match(miss.failures[0].message, /offline, and no verified apm\.tar\.gz/);
  assert.equal(hits, before);
  fs.writeFileSync(path.join(m.cacheDir, 'apm.tar.gz'), 'corrupt');
  const corrupt = await run(m, { offline: true, install: ['apm'], pins: { apm: pin('apm') } });
  assert.equal(corrupt.installs.length, 0);
  assert.equal(hits, before);
  fs.writeFileSync(path.join(m.cacheDir, 'apm.tar.gz'), archives.apm);
  const hit = await run(m, { offline: true, install: ['apm'], pins: { apm: pin('apm') } });
  assert.deepEqual(hit.installs, ['apm']);
  assert.deepEqual(hit.downloads, []);
  assert.equal(hits, before, 'no request was made');
});

test('a corrupt cached download is replaced when online', async () => {
  const m = machine();
  fs.mkdirSync(m.cacheDir, { recursive: true });
  fs.writeFileSync(path.join(m.cacheDir, 'apm.tar.gz'), 'corrupt');
  const r = await run(m, { install: ['apm'], pins: { apm: pin('apm') } });
  assert.deepEqual(r.installs, ['apm']);
  assert.deepEqual(r.downloads, ['apm']);
});

test('leftovers of an interrupted installation do not get in the way', async () => {
  const m = machine();
  const stale = path.join(m.toolsDir, 'apm', '.staging-1-old');
  writeTree(stale, { 'half.txt': 'x' });
  const old = new Date(Date.now() - 2 * 3600 * 1000);
  fs.utimesSync(stale, old, old);
  writeTree(m.cacheDir, { 'apm.tar.gz.123.abc.part': 'half' });
  fs.utimesSync(path.join(m.cacheDir, 'apm.tar.gz.123.abc.part'), old, old);
  const r = await run(m, { install: ['apm'], pins: { apm: pin('apm') } });
  assert.deepEqual(r.installs, ['apm']);
  assert.equal(fs.existsSync(stale), false);
});

test('a broken or unsafe archive is rejected, and a private copy that does not run is replaced', async () => {
  const m = machine();
  const wrongVersion = await run(m, { install: ['apm'], pins: { apm: pin('apm', '9.9.9', 'broken') } });
  assert.match(wrongVersion.failures[0].message, /does not report version 9\.9\.9/);
  const evil = await run(m, { install: ['apm'], pins: { apm: pin('apm', '9.9.9', 'evil') } });
  assert.deepEqual(evil.installs, ['apm'], 'extra top-level files are fine as long as no path escapes');
  const finalDir = path.join(m.toolsDir, 'apm', `9.9.9-${KEY}`);
  fs.writeFileSync(path.join(finalDir, 'pkg', 'apm.js'), 'process.exit(1)');
  const repaired = await run(m, { install: ['apm'], pins: { apm: pin('apm') } });
  assert.deepEqual(repaired.installs, ['apm']);
});

test('an incompatible existing tool gets a private, compatible copy; the user\'s install is untouched', async () => {
  const m = machine({ copilotHelp: 'Usage\n  --agent\n' });
  const userCopilot = path.join(m.userBin, WIN ? 'copilot.js' : 'copilot.js');
  const before = fs.readFileSync(userCopilot, 'utf8');
  const r = await run(m, { pins: { copilot: pin('copilot') } });
  assert.deepEqual(r.failures, []);
  assert.deepEqual(r.installs, ['copilot']);
  assert.equal(r.report.items.find((x) => x.id === 'copilot').status, 'ready');
  assert.equal(fs.readFileSync(userCopilot, 'utf8'), before);
});

test('unsupported platforms and manual-only tools are reported truthfully', async () => {
  const m = machine();
  const r = await run(m, { install: ['gh-aw'], pins: { apm: pin('apm') }, platform: WIN ? 'win32' : process.platform });
  assert.match(r.manual.find((x) => x.tool === 'gh-aw').message, /gh extension install github\/gh-aw/);
  const other = await run(m, { install: ['apm'], pins: { apm: pin('apm') }, arch: 'riscv64' });
  assert.match(other.manual.find((x) => x.tool === 'apm').message, /no reviewed APM build/i);
  assert.deepEqual(other.downloads, []);
});

test('the lab app gets the forwarded arguments and its exit code is returned', async () => {
  const m = machine();
  const companion = path.join(m.root, 'companion.mjs');
  const record = path.join(m.root, 'args.json');
  fs.writeFileSync(companion, `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(record)}, JSON.stringify({ argv: process.argv.slice(2), path: process.env.PATH })); process.exit(5);`);
  const code = await main(['open', 'lab-04', 'medium', '--no-anim', '--', '--check'], { env: { ...m.env, WORKSHOP_TOOLS_DIR: m.toolsDir }, out: () => {}, companion, pins: {}, readTrust: () => null });
  assert.equal(code, 5);
  const got = JSON.parse(fs.readFileSync(record, 'utf8'));
  assert.deepEqual(got.argv, ['open', 'lab-04', 'medium', '--no-anim', '--check']);
  const lines = [];
  assert.equal(await main(['--check'], { env: m.env, out: (s) => lines.push(s), companion, pins: {}, readTrust: () => null }), 0);
  assert.match(lines.join('\n'), /check only/);
});
