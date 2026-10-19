// Shared helpers for Lab 06 · hard+'s checks. Fixture projects are built in temp folders at check time: the lock is
// computed here, with the checks' own hashing and YAML writing (never with your scripts), so a bug in your code
// can't make a fixture agree with it.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const CAMPUS = 'studybuddy-org/campus-standards';
export const fixture = (t, name) => JSON.parse(fs.readFileSync(path.join(t.exDir, 'tests', 'fixtures', name), 'utf8'));
export const sha = (text) => crypto.createHash('sha256').update(String(text).replace(/\r\n/g, '\n'), 'utf8').digest('hex');

/** The checks' own reading of "pinned": a full version tag or a full commit SHA (local paths are fine). */
export function pinnedRef(dep) {
  if (typeof dep === 'string' && /^(\.{1,2}\/|\/|file:)/.test(dep)) return true;
  const ref = typeof dep === 'string' ? (dep.includes('#') ? dep.slice(dep.lastIndexOf('#') + 1) : '') : String(dep?.ref ?? dep?.sha ?? '');
  return /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(ref) || /^[0-9a-f]{40}$/.test(ref);
}

const write = (root, rel, text) => {
  const file = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const q = (s) => JSON.stringify(s);
function lockYaml(entries) {
  const out = ['lockfile_version: "1"', 'apm_version: "0.33.0"', 'dependencies:'];
  for (const e of entries) {
    out.push(`  - repo_url: ${e.repo}`, `    resolved_ref: ${e.ref}`, `    resolved_commit: ${e.commit}`, `    version: ${q(e.version)}`, '    depth: 1', '    package_type: apm_package', '    deployed_files:');
    const files = Object.keys(e.files).sort();
    for (const f of files) out.push(`      - ${q(f)}`);
    out.push('    deployed_file_hashes:');
    for (const f of files) out.push(`      ${q(f)}: ${q(`${e.prefix ?? ''}${sha(e.files[f])}`)}`);
  }
  return `${out.join('\n')}\n`;
}

/** The files a vendored release deploys: { target path: text }. */
export function release(t, version) {
  const dir = t.path(`vendor/campus-standards/${version}`);
  const rel = JSON.parse(fs.readFileSync(path.join(dir, 'release.json'), 'utf8'));
  const files = Object.fromEntries(Object.entries(rel.deploy).map(([to, from]) => [to, fs.readFileSync(path.join(dir, ...from.split('/')), 'utf8')]));
  return { ...rel, files };
}

/**
 * A consumer project in a temp folder: fixtures/consumer.json, plus campus-standards v1.4.0 deployed from vendor/,
 * plus a lock that matches. `extra` adds or replaces project files; `prefix` writes hashes as "sha256:<hex>".
 */
export function buildConsumer(t, { extra = {}, prefix = '' } = {}) {
  const root = t.tmp();
  const c = fixture(t, 'consumer.json');
  const campus = release(t, 'v1.4.0');
  const entries = [
    ...c.packages.map((p) => ({ ...p, prefix })),
    { repo: campus.repo, ref: campus.ref, commit: campus.commit, version: campus.version, files: campus.files, prefix },
  ];
  for (const e of entries) for (const [f, text] of Object.entries(e.files)) write(root, f, text);
  for (const [f, text] of Object.entries({ ...c.files, ...extra })) write(root, f, text);
  write(root, 'apm.lock.yaml', lockYaml(entries));
  return root;
}

/** The shadow fixture in a temp folder: { root, plugin, expected }. */
export function buildShadows(t) {
  const s = fixture(t, 'shadows.json');
  const root = t.tmp();
  for (const [f, text] of Object.entries(s.files)) write(root, f, text);
  return { root, plugin: s.plugin, expected: s.expected };
}

/** rel path → sha of every file under root (to prove "nothing changed"). */
export function snapshot(root) {
  const out = {};
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else out[path.relative(root, abs).replace(/\\/g, '/')] = sha(fs.readFileSync(abs));
    }
  };
  walk(root);
  return out;
}
export function snapshotDiff(before, after) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((k) => before[k] !== after[k]).sort();
}
export const edit = (root, rel, fn) => {
  const file = path.join(root, ...rel.split('/'));
  fs.writeFileSync(file, fn(fs.readFileSync(file, 'utf8')));
};
