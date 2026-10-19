import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import path from 'node:path';
import { test } from 'node:test';
import { inspectEnvironment, TOOLS } from '../doctor.mjs';
import { tmpdir, writeTree } from './helpers.mjs';

const HELP = 'Usage: copilot [options]\n  --agent <agent>\n  --plugin-dir <directory>\n  --allow-tool\n  --deny-tool\n  --max-ai-credits <credits>\n  --no-ask-user\n  --output-format <format>\n  -s, --silent\nCommands:\n  instruction  Inspect instruction sources\n';
/** A fake probe: answers from a table keyed by "command arg arg". */
const probeFrom = (table, calls = []) => async (cmd, args) => {
  const key = [cmd, ...args].join(' ');
  calls.push(key);
  const hit = table[key];
  if (hit === undefined) return { missing: true, code: null, stdout: '', stderr: '' };
  return typeof hit === 'string' ? { code: 0, stdout: hit, stderr: '' } : hit;
};
const all = {
  'copilot --version': 'GitHub Copilot CLI 1.0.98.\n',
  'copilot --help': HELP,
  'git --version': 'git version 2.53.0.windows.1\n',
  'pwsh --version': 'PowerShell 7.5.2\n',
  'apm --version': '0.33.0\n',
  'gh --version': 'gh version 2.80.0 (2026-01-01)\n',
  'gh aw version': 'gh aw version v0.20.0\n',
};
const item = (report, id) => report.items.find((x) => x.id === id);
const base = { rootDir: '/workshop', nodeVersion: '24.19.0', readTrust: () => null, env: {} };

test('ready, missing and incompatible tools are told apart, and unverifiable things are manual', async () => {
  const report = await inspectEnvironment({ ...base, platform: 'linux', arch: 'x64', probe: probeFrom({ ...all, 'git --version': 'git version 2.10.0\n', 'apm --version': undefined }) });
  assert.equal(item(report, 'node').status, 'ready');
  assert.equal(item(report, 'copilot').status, 'ready');
  assert.equal(item(report, 'copilot').version, '1.0.98');
  assert.equal(item(report, 'git').status, 'incompatible');
  assert.equal(item(report, 'apm').status, 'optional', 'APM is only needed by Lab 06');
  assert.equal(item(report, 'copilot-auth').status, 'manual');
  assert.equal(item(report, 'copilot-policy').status, 'manual');
  assert.equal(item(report, 'folder-trust').status, 'manual');
  assert.equal(item(report, 'pwsh'), undefined, 'PowerShell 7 is a Windows requirement');
  assert.equal(report.ready, true, 'manual items and optional tools do not block readiness');
  for (const x of report.items) assert.ok(x.message && x.label, `${x.id} explains itself`);
});

test('a missing Copilot is a missing required tool with the shared recovery text', async () => {
  const report = await inspectEnvironment({ ...base, platform: 'linux', arch: 'x64', probe: probeFrom({ ...all, 'copilot --version': undefined }) });
  const c = item(report, 'copilot');
  assert.equal(c.status, 'missing');
  assert.equal(c.required, true);
  assert.equal(c.recovery, TOOLS.copilot.recovery);
  assert.equal(report.ready, false);
  assert.equal(report.coreReady, true, 'the companion itself still works');
});

test('a Copilot without the flags the labs use is incompatible', async () => {
  const report = await inspectEnvironment({ ...base, platform: 'linux', arch: 'x64', probe: probeFrom({ ...all, 'copilot --help': HELP.replace('--max-ai-credits <credits>\n', '') }) });
  assert.equal(item(report, 'copilot').status, 'incompatible');
  assert.match(item(report, 'copilot').message, /--max-ai-credits/);
  const noJson = await inspectEnvironment({ ...base, platform: 'linux', arch: 'x64', probe: probeFrom({ ...all, 'copilot --help': HELP.replace('--output-format <format>\n', '') }) });
  assert.equal(item(noJson, 'copilot').status, 'incompatible', 'agent checks need JSON events for their timeline');
  assert.match(item(noJson, 'copilot').message, /--output-format/);
});

test('an old Node is incompatible and blocks the core', async () => {
  const report = await inspectEnvironment({ ...base, nodeVersion: '20.11.0', platform: 'linux', arch: 'x64', probe: probeFrom(all) });
  assert.equal(item(report, 'node').status, 'incompatible');
  assert.equal(report.coreReady, false);
});

test('missing git does not make the deterministic labs unavailable, but a lab that needs it says so', async () => {
  const probe = probeFrom({ ...all, 'git --version': undefined });
  const general = await inspectEnvironment({ ...base, platform: 'linux', arch: 'x64', probe });
  assert.equal(item(general, 'git').status, 'optional');
  assert.equal(general.ready, true);
  const lab02 = await inspectEnvironment({ ...base, platform: 'linux', arch: 'x64', probe, lab: 'lab-02' });
  assert.equal(item(lab02, 'git').status, 'missing');
  assert.equal(lab02.ready, false);
});

test('requested tools and full setup become required', async () => {
  const probe = probeFrom({ ...all, 'apm --version': undefined, 'gh --version': undefined, 'gh aw version': undefined });
  const apm = await inspectEnvironment({ ...base, platform: 'linux', arch: 'x64', probe, requirements: ['apm'] });
  assert.equal(item(apm, 'apm').status, 'missing');
  assert.equal(item(apm, 'gh').status, 'optional');
  const full = await inspectEnvironment({ ...base, platform: 'linux', arch: 'x64', probe, full: true });
  assert.deepEqual(['apm', 'gh', 'gh-aw'].map((id) => item(full, id).status), ['missing', 'missing', 'missing']);
});

test('Windows needs PowerShell 6 or newer for Copilot', async () => {
  const old = await inspectEnvironment({ ...base, platform: 'win32', arch: 'x64', probe: probeFrom({ ...all, 'pwsh --version': 'PowerShell 5.1.0\n' }) });
  assert.equal(item(old, 'pwsh').status, 'incompatible');
  const none = await inspectEnvironment({ ...base, platform: 'win32', arch: 'x64', probe: probeFrom({ ...all, 'pwsh --version': undefined }) });
  assert.equal(item(none, 'pwsh').status, 'missing');
  assert.equal(none.ready, false);
});

test('on macOS the doctor never runs the git shim that would open the developer-tools installer', async () => {
  const calls = [];
  const report = await inspectEnvironment({ ...base, platform: 'darwin', arch: 'arm64', which: (c) => (c === 'git' ? '/usr/bin/git' : `/opt/${c}`), probe: probeFrom({ ...all, 'xcode-select -p': { code: 2, stdout: '', stderr: 'unable to get active developer directory' } }, calls) });
  assert.equal(item(report, 'git').status, 'manual');
  assert.match(item(report, 'git').message, /xcode-select --install/);
  assert.ok(!calls.includes('git --version'));
  assert.equal(report.ready, true, 'git is not required outside lab-02 and --full');
  for (const opts of [{ lab: 'lab-02' }, { full: true }]) {
    const needsGit = await inspectEnvironment({ ...base, ...opts, platform: 'darwin', arch: 'arm64', which: (c) => (c === 'git' ? '/usr/bin/git' : `/opt/${c}`), probe: probeFrom({ ...all, 'xcode-select -p': { code: 2, stdout: '', stderr: 'unable to get active developer directory' } }) });
    assert.equal(item(needsGit, 'git').status, 'manual');
    assert.equal(needsGit.ready, false, `a required git that needs a manual install blocks readiness (${JSON.stringify(opts)})`);
  }
});

test('folder trust is reported only when Copilot\'s own settings establish it', async () => {
  const trusted = await inspectEnvironment({ ...base, readTrust: () => true, platform: 'linux', arch: 'x64', probe: probeFrom(all) });
  assert.equal(item(trusted, 'folder-trust').status, 'ready');
  const untrusted = await inspectEnvironment({ ...base, readTrust: () => false, platform: 'linux', arch: 'x64', probe: probeFrom(all) });
  assert.equal(item(untrusted, 'folder-trust').status, 'manual');
});

test('unsupported platforms are reported, not guessed', async () => {
  const report = await inspectEnvironment({ ...base, platform: 'freebsd', arch: 'x64', probe: probeFrom(all) });
  assert.equal(item(report, 'platform').status, 'incompatible');
});

test('real probes: shims in folders with spaces work, a hung tool is stopped, and nothing is written, fetched or changed', async () => {
  const bin = path.join(tmpdir(), 'tools with spaces');
  const say = (text) => `process.stdout.write(${JSON.stringify(text)})`;
  const tool = (name, js) => (process.platform === 'win32'
    ? { [`${name}.cmd`]: `@"${process.execPath}" "%~dp0${name}.js" %*\r\n`, [`${name}.js`]: js }
    : { [name]: `#!/bin/sh\nexec "${process.execPath}" "\${0%/*}/${name}.js" "$@"\n`, [`${name}.js`]: js });
  writeTree(bin, {
    ...tool('copilot', `if (process.argv[2] === '--help') ${say(HELP)}; else ${say('GitHub Copilot CLI 1.0.98.\n')};`),
    ...tool('git', say('git version 2.53.0\n')),
    ...tool('apm', 'setInterval(() => {}, 1000)'),
  });
  if (process.platform !== 'win32') for (const f of ['copilot', 'git', 'apm']) fs.chmodSync(path.join(bin, f), 0o755);
  const env = { PATH: bin, PATHEXT: '.COM;.EXE;.BAT;.CMD', SystemRoot: process.env.SystemRoot, ComSpec: process.env.ComSpec };
  const before = JSON.stringify(process.env);
  const listing = () => fs.readdirSync(bin).sort().join('|');
  const filesBefore = listing();
  const network = [];
  const saved = { fetch: globalThis.fetch, http: http.request, https: https.request, connect: net.connect };
  globalThis.fetch = (...a) => { network.push('fetch'); return saved.fetch(...a); };
  http.request = (...a) => { network.push('http'); return saved.http(...a); };
  https.request = (...a) => { network.push('https'); return saved.https(...a); };
  net.connect = (...a) => { network.push('net'); return saved.connect(...a); };
  let report;
  try {
    report = await inspectEnvironment({ rootDir: bin, env, readTrust: () => null, probeTimeout: 1500, requirements: ['apm'] });
  } finally {
    Object.assign(globalThis, { fetch: saved.fetch });
    http.request = saved.http;
    https.request = saved.https;
    net.connect = saved.connect;
  }
  assert.equal(item(report, 'copilot').status, 'ready', item(report, 'copilot').message);
  assert.equal(item(report, 'git').status, 'ready');
  assert.equal(item(report, 'apm').status, 'incompatible');
  assert.match(item(report, 'apm').message, /did not answer/i);
  assert.deepEqual(network, []);
  assert.equal(JSON.stringify(process.env), before);
  assert.equal(listing(), filesBefore);
});
