import assert from 'node:assert/strict';
import { test } from 'node:test';
import { layerMapLines } from '../screens/layers.mjs';
import { stripAnsi, width } from '../ui.mjs';

const fmt = Object.fromEntries(['green', 'bright', 'dim', 'white', 'yellow', 'bold', 'cyan'].map((k) => [k, (s) => s]));
const lab = (num, emoji, title, extra = {}) => ({ id: `lab-${num}`, num, emoji, title, layer: null, maturity: null, threads: [], capstone: false, ...extra });
const catalog = [
  lab('00', '💻', 'Copilot CLI', { layer: 'Runtime', maturity: { level: 'L0', name: 'Bare' } }),
  lab('01', '📜', 'Instructions', { layer: 'Context', maturity: { level: 'L1', name: 'Instructed' }, threads: ['🔴 The red build', '📏 Measurement'] }),
  lab('02', '🧩', 'Skills'),
  lab('08', '🏛️', 'Capstone', { capstone: true, maturity: { level: 'L4 → L5', name: 'Governed' } }),
];
const show = (l) => stripAnsi(layerMapLines(catalog, l, { W: 76, fmt }).join('\n'));

test('the tree: the runtime at the root, one branch per layer, this lab marked, its threads below', () => {
  const s = show(catalog[1]);
  assert.match(s, /YOUR HARNESS · this lab reaches L1 Instructed/);
  assert.match(s, /🧠 model \+ 💻 Copilot CLI\s+00\n/);
  assert.match(s, /├─ 📜 Instructions\s+01 {2}◀ this lab/);
  assert.match(s, /└─ 🧩 Skills\s+02\n/);
  assert.doesNotMatch(s, /Capstone/, 'the capstone is not a layer');
  assert.match(s, /🧵 Threads: 🔴 The red build · 📏 Measurement/);
});

test('the root lab marks the runtime; the capstone marks every layer', () => {
  assert.match(show(catalog[0]), /💻 Copilot CLI\s+00 {2}◀ this lab/);
  const cap = show(catalog[3]);
  assert.match(cap, /all the layers together/);
  assert.equal((cap.match(/◀/g) ?? []).length, 0, 'no single arrow: the title says it');
});

test('it fits 40 columns and leaves out what it does not know', () => {
  const lines = layerMapLines(catalog, catalog[2], { W: 40, fmt });
  for (const l of lines) assert.ok(width(stripAnsi(l)) <= 42, l);
  assert.doesNotMatch(stripAnsi(lines.join('\n')), /Threads|reaches/);
});

test('a long name is cut with an ellipsis, never run into the lab number', () => {
  const long = [...catalog.slice(0, 2), lab('06', '📦', 'Plugins, extensions & APM, and a very long tail')];
  const s = stripAnsi(layerMapLines(long, long[1], { W: 60, fmt }).join('\n'));
  assert.match(s, /└─ 📦 Plugins, extensions[^\n]*… 06/);
});

test('many threads wrap onto more lines, one whole thread at a time, never cut', () => {
  const threads = ['🔴 The red build', '📏 Measurement', '🪙 Tokens and budget', '🔐 Least privilege', '🕵️ Trust boundaries', '🧪 Evals'];
  const cap = { ...catalog[3], threads };
  for (const W of [76, 40]) {
    const lines = layerMapLines(catalog, cap, { W, fmt }).map(stripAnsi);
    for (const l of lines) assert.ok(width(l) <= W + 2, `${W}: ${l}`);
    const text = lines.slice(lines.findIndex((l) => l.includes('Threads:'))).join(' ');
    for (const th of threads) assert.ok(text.includes(th), `${W}: ${th} is shown whole`);
  }
});