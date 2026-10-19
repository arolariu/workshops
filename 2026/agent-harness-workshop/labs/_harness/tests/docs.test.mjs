// The workshop readme agrees with the app: its key table follows keys.mjs, and it has the agenda, the tiers and the
// homework paths that the app uses.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { KEYMAP, GLOBAL } from '../keys.mjs';
import { PATHS } from '../learning.mjs';
import { DIFFICULTIES } from '../catalog.mjs';

const readme = fs.readFileSync(path.join(import.meta.dirname, '..', '..', '..', 'readme.md'), 'utf8').replace(/\r/g, '');
const section = (title) => readme.split(/^## /m).find((s) => s.startsWith(title)) ?? '';

test('the readme key table lists every key of the mission screen, and no key the app does not have', () => {
  const companion = section('⌨️ The lab companion');
  const table = companion.split('\n').filter((l) => l.startsWith('|'));
  const listed = new Set(table.flatMap((l) => [...l.split('|')[1].matchAll(/\*\*([^*]+)\*\*/g)].flatMap((m) => m[1].split(/\s+/))));
  // d (doctor) and e (export) work everywhere, so the readme lists them in its "Everywhere" line, like the help screen.
  const skip = new Set(['scroll', 'back', 'search', 'doctor', 'export']);
  for (const b of KEYMAP.exercise.filter((x) => !skip.has(x.id))) {
    assert.ok(b.keys.some((k) => listed.has(k)) || (b.id === 'tier' && listed.has('1')), `the readme misses ${b.keys.join('/')} (${b.id})`);
  }
  assert.match(companion, /Everywhere:[\s\S]{0,300}\*\*d\*\*[\s\S]{0,100}\*\*e\*\*/);
  const known = new Set([...KEYMAP.exercise, ...GLOBAL].flatMap((x) => x.keys));
  for (const k of listed) assert.ok(known.has(k), `the readme lists "${k}", which the mission screen does not have`);
});

test('the readme has the 110-minute agenda, the five tiers and every homework path', () => {
  const agenda = section('🕐 The workshop');
  for (const slot of ['0–10', '10–98', '98–110']) assert.match(agenda, new RegExp(`\\| ${slot} \\|`));
  const homework = section('🏠 Homework');
  for (const d of DIFFICULTIES) assert.match(homework, new RegExp(`${d.badge} ${d.id}[^|]*\\| \\*\\*${d.theme}\\.\\*\\*`), d.id);
  for (const p of PATHS.filter((x) => x.keys)) assert.match(homework, new RegExp(`\\*\\*${p.label}\\*\\*`), p.label);
  assert.match(readme, /glossary/i);
  assert.doesNotMatch(readme, /--path=(builder|foundations|automation)/, 'old path ids are gone');
});

test('the readme and the Lab 00 guide point to the replay and the X-ray, on the keys the app uses', () => {
  assert.ok(KEYMAP.home.some((b) => b.id === 'replay' && b.keys.includes('u')));
  assert.match(section('⌨️ The lab companion'), /home screen, \*\*u\*\* replays an agent run/);
  assert.match(readme, /node labs\/start\.mjs replay/);
  assert.match(readme, /node labs\/start\.mjs xray lab-/);
  assert.match(section('🕐 The workshop'), /\| 10–98 \|[^\n]*replay/);
  assert.match(section('🧑‍🏫 For facilitators'), /node labs\/start\.mjs replay /);
  const lab00 = fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'lab-00', 'readme.md'), 'utf8').replace(/\r/g, '');
  const hood = lab00.split(/^## /m).find((s) => s.startsWith('🔬 Under the hood')) ?? '';
  assert.match(hood, /press \*\*u\*\* on the home screen \(or run `node labs\/start\.mjs replay`\)/);
  assert.match(hood, /\*\*tab\*\*/);
});

test('the agent-check section says personal plugins and skills can show up in the timeline', () => {
  const checks = section('🧪 Two kinds of checks');
  assert.match(checks, /🧭 timeline/);
  assert.match(checks, /\*\*personal\*\* Copilot setup/);
});
