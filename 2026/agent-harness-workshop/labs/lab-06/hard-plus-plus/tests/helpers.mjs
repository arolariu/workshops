// Shared helpers for Lab 06 · hard++'s checks: scratch marketplaces, broken variants built at check time, and Git
// repositories in temp folders (the release script only commits and tags in a marketplace that is its own repo).
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const MARKET = 'marketplace';
export const MANIFEST = '.github/plugin/marketplace.json';
export const RELEASE = 'scripts/release.mjs';
export const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
export const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const GIT_ENV = { GIT_AUTHOR_NAME: 'Harness Check', GIT_AUTHOR_EMAIL: 'check@example.com', GIT_COMMITTER_NAME: 'Harness Check', GIT_COMMITTER_EMAIL: 'check@example.com' };

const write = (root, rel, text) => {
  const file = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
export const readJson = (root, rel) => JSON.parse(fs.readFileSync(path.join(root, ...rel.split('/')), 'utf8'));
export const writeJson = (root, rel, v) => write(root, rel, `${JSON.stringify(v, null, 2)}\n`);

/** A copy of your marketplace folder in a temp folder. */
export function copyMarket(t) {
  const dest = path.join(t.tmp(), 'marketplace');
  fs.cpSync(t.path(MARKET), dest, { recursive: true });
  return dest;
}

/** A small, publishable marketplace (two local plugins and a pinned GitHub one), independent of your files. */
export function goodMarket(t) {
  const root = path.join(t.tmp(), 'good-market');
  const plugin = (name, version) => {
    writeJson(root, `plugins/${name}/plugin.json`, { name, description: `The ${name} plugin, for the checks.`, version, author: { name: 'checks' } });
    write(root, `plugins/${name}/CHANGELOG.md`, `# Changelog · ${name}\n\n## Unreleased\n\n## ${version} - 2026-10-01\n### Added\n- First release.\n`);
  };
  plugin('alpha', '1.2.0');
  plugin('beta', '0.3.1');
  writeJson(root, MANIFEST, {
    name: 'check-market',
    owner: { name: 'The checks' },
    metadata: { description: 'A marketplace the checks build', version: '1.0.0' },
    plugins: [
      { name: 'alpha', description: 'Alpha', version: '1.2.0', source: './plugins/alpha' },
      { name: 'beta', description: 'Beta', version: '0.3.1', source: 'plugins/beta' },
      { name: 'gamma', description: 'Gamma, from another repository', version: '2.0.0', source: { source: 'github', repo: 'acme/gamma', ref: 'v2.0.0', path: 'plugins/gamma' } },
    ],
  });
  return root;
}

const edit = (fn) => (root) => { const m = readJson(root, MANIFEST); fn(m); writeJson(root, MANIFEST, m); };
/** Nine ways to break a marketplace: [what, mutate(root)]. */
export const BROKEN = [
  ['no owner', edit((m) => { delete m.owner; })],
  ['an uppercase plugin name ("Alpha_Plugin")', edit((m) => { m.plugins[0].name = 'Alpha_Plugin'; })],
  ['two plugins with the same name', edit((m) => { m.plugins[1].name = 'alpha'; })],
  ['a source folder that does not exist', edit((m) => { m.plugins[1].source = './plugins/ghost'; })],
  ['an entry whose plugin.json has another name', (root) => { const p = readJson(root, 'plugins/beta/plugin.json'); p.name = 'beta-other'; writeJson(root, 'plugins/beta/plugin.json', p); }],
  ['an entry version that differs from plugin.json', edit((m) => { m.plugins[0].version = '1.3.0'; })],
  ['a version that is not semver ("1.2")', (root) => { edit((m) => { m.plugins[0].version = '1.2'; })(root); const p = readJson(root, 'plugins/alpha/plugin.json'); p.version = '1.2'; writeJson(root, 'plugins/alpha/plugin.json', p); }],
  ['a CHANGELOG without a section for the current version', (root) => write(root, 'plugins/beta/CHANGELOG.md', '# Changelog · beta\n\n## Unreleased\n### Fixed\n- Something.\n')],
  ['a GitHub source that follows a branch', edit((m) => { m.plugins[2].source.ref = 'main'; })],
];

export function gitRun(cwd, args, env = {}) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, env: { ...process.env, ...GIT_ENV, ...env } });
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
}
/** Make `dir` its own Git repository with everything committed. */
export function gitInit(dir) {
  for (const args of [['init', '-q'], ['config', 'core.autocrlf', 'false'], ['config', 'commit.gpgsign', 'false'], ['config', 'tag.gpgsign', 'false'], ['add', '-A'], ['commit', '-qm', 'init']]) {
    const r = gitRun(dir, args);
    if (r.code !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.out}`);
  }
  return dir;
}
export const commitAll = (dir, msg) => { gitRun(dir, ['add', '-A']); gitRun(dir, ['commit', '-qm', msg]); };

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
/** rel path → sha of every file under root, without .git (to prove "nothing was written"). */
export function snapshot(root) {
  const out = {};
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === '.git') continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs); else out[path.relative(root, abs).replace(/\\/g, '/')] = sha(fs.readFileSync(abs));
    }
  };
  walk(root);
  return out;
}
export const changedFiles = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]).sort();
