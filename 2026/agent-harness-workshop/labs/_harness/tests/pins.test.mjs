// Lab 08 hard+'s CI checks out this repository at a fixed commit to load the scorecard. After the merge, the pin moves
// to a commit on main (readme: For facilitators). This test finds every pin, so a re-pin can't miss one.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const labsDir = path.resolve(import.meta.dirname, '..', '..');
const workshop = path.dirname(labsDir);
const SKIP = /^(\.runs|\.recovery|\.backups|node_modules|\.git|_harness)$/;
const SKIP_ALL = /^(\.runs|\.recovery|\.backups|node_modules|\.git)$/;
/** Every file under labs/ (any type, the harness too), for the catch-all search. */
const everyFile = (rel = '') => fs.readdirSync(path.join(labsDir, rel), { withFileTypes: true }).flatMap((e) => (SKIP_ALL.test(e.name) ? [] : e.isDirectory() ? everyFile(rel ? `${rel}/${e.name}` : e.name) : [rel ? `${rel}/${e.name}` : e.name]));
const SOURCES = [
  'lab-08/hard-plus/todo.md',
  'lab-08/hard-plus/sol/.github/workflows/harness-ci.yml',
  'lab-08/hard-plus/sol/.github/workflows/harness-review.md',
];
const lf = (s) => s.replace(/\r\n/g, '\n');

/** Every pin of arolariu/workshops in the levels: [{ file, sha }] (a `repository:` line with a `ref:` right after it). */
function pins() {
  const out = [];
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(labsDir, rel), { withFileTypes: true })) {
      if (SKIP.test(e.name)) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { walk(r); continue; }
      if (!/\.(md|ya?ml|json|mjs)$/.test(e.name)) continue;
      const text = lf(fs.readFileSync(path.join(labsDir, r), 'utf8'));
      for (const m of text.matchAll(/repository:\s*arolariu\/workshops\s*\n\s*ref:\s*([0-9a-f]{7,40})/g)) out.push({ file: r, sha: m[1] });
      for (const m of text.matchAll(/arolariu\/workshops(?:\/[\w./-]+)?@([0-9a-f]{7,40})\b/g)) out.push({ file: r, sha: m[1] });
    }
  };
  walk('');
  return out;
}

test('every pin of this repository in the levels is the same commit, set in the three places the readme lists', () => {
  const found = pins();
  const shas = [...new Set(found.map((p) => p.sha))];
  assert.equal(shas.length, 1, `pins disagree: ${found.map((p) => `${p.file} ${p.sha.slice(0, 7)}`).join(', ')}`);
  assert.match(shas[0], /^[0-9a-f]{40}$/, 'a full commit SHA');
  for (const s of SOURCES) assert.ok(found.some((p) => p.file === s), `${s} has no pin`);
  // Anything else is an inherited copy of a source (sync-seeds carries the workflows down the chain); the SHA check
  // above already holds it to the same commit, and a later level may extend the file around the pin.
  for (const p of found.filter((x) => !SOURCES.includes(x.file))) {
    const rel = p.file.split('/').slice(3).join('/');
    assert.ok(SOURCES.some((s) => s.endsWith(`/${rel}`)), `${p.file}: a pin outside the three places that is not an inherited copy`);
  }
  // A catch-all: the commit anywhere else (another file type, another spelling of the pin) is a pin this scan missed.
  const known = new Set(found.map((p) => p.file));
  const stray = everyFile().filter((f) => !known.has(f) && fs.statSync(path.join(labsDir, f)).size < 2e6 && fs.readFileSync(path.join(labsDir, f), 'latin1').includes(shas[0].slice(0, 7)));
  assert.deepEqual(stray, [], 'the pinned commit appears where the scan found no pin: a form it does not know');
  const readme = fs.readFileSync(path.join(workshop, 'readme.md'), 'utf8');
  const section = readme.slice(readme.indexOf('## 🧑‍🏫 For facilitators'));
  for (const s of SOURCES) assert.ok(section.includes(`labs/${s}`), `the facilitator checklist lists labs/${s}`);
  assert.ok(section.includes(shas[0].slice(0, 7)), 'the checklist names the current pin');
});
