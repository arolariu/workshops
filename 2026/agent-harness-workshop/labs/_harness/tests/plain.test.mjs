import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { asciiFold, stripAnsi, STATUS } from '../ui.mjs';
import { DIFFICULTIES } from '../catalog.mjs';

const labsDir = path.resolve(import.meta.dirname, '..', '..');
const start = path.join(labsDir, 'start.mjs');
// --plain may print ASCII and box-drawing (U+2500–U+257F); in practice the fold table turns box-drawing into ASCII too.
const PLAIN = /^[\x00-\x7f\u2500-\u257f]*$/;
const offending = (s) => [...new Set([...s].filter((c) => !PLAIN.test(c)))].join(' ');

// Glyphs that carry meaning on their own (no word next to them): each needs a marker, never nothing.
const MEANING = {
  status: Object.values(STATUS).map((s) => s.icon).filter(Boolean),
  tiers: DIFFICULTIES.map((d) => d.badge),
  modes: ['👥', '🏠'],
  'x-ray and chain marks': ['🆕', '✏️', '🧳', '🌱', '➖', '✅', '❌'],
  'change view': ['📝', '🗑️', '➕', '−'],
  'trace and replay': ['🔧', '⛔', '❌', '⏳', '✓', '≈', 'Σ'],
  doctor: ['🙋', '⚠️', '⬜'],
  'layer map': ['├', '└', '◀', '─'],
  symbols: ['≤', '↔', '→', '←', '…'],
};

test('--plain: every glyph that carries meaning folds to an ASCII marker, never to nothing', () => {
  for (const [group, glyphs] of Object.entries(MEANING)) {
    for (const g of glyphs) {
      const m = asciiFold(g).trim();
      assert.ok(m.length > 0, `${group}: ${g} folds to nothing`);
      assert.match(m, /^[\x20-\x7e]+$/, `${group}: ${g} → ${m}`);
      assert.notEqual(m, '?', `${group}: ${g} has no marker (unknown)`);
    }
  }
  assert.notEqual(asciiFold('⛔'), asciiFold('❌'), 'denied and failed stay apart');
  assert.notEqual(asciiFold('🆕'), asciiFold('✏️'), 'new and changed stay apart');
});

test('--plain: no character the harness prints folds to "?" (an unknown symbol)', () => {
  const dirs = [path.join(labsDir, '_harness'), path.join(labsDir, '_harness', 'screens')];
  const files = [start, ...dirs.flatMap((d) => fs.readdirSync(d).filter((f) => f.endsWith('.mjs')).map((f) => path.join(d, f)))];
  const unknown = new Map();
  const seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
  for (const f of files) {
    for (const { segment } of seg.segment(fs.readFileSync(f, 'utf8'))) {
      if (/^[\x00-\x7f]+$/.test(segment)) continue;
      if (asciiFold(segment).trim() === '?') unknown.set(segment, path.basename(f));
    }
  }
  assert.deepEqual([...unknown].map(([g, f]) => `${g} (${f})`), []);
});

const cli = (...args) => spawnSync(process.execPath, [start, ...args], { encoding: 'utf8', timeout: 120000, env: { ...process.env, COLUMNS: '80', NO_COLOR: '1' } });

test('--plain: the CLI prints only ASCII and box-drawing, at 80 columns', () => {
  for (const args of [['list', '--plain'], ['path', '--plain'], ['help', '--plain'], ['glossary', '--plain'], ['next', '--plain'], ['xray', 'lab-08', 'easy', '--sol', '--plain']]) {
    const r = cli(...args);
    assert.equal(r.status, 0, `${args.join(' ')}: ${r.stderr}`);
    const out = stripAnsi(r.stdout);
    assert.ok(out.trim().length > 0, args.join(' '));
    assert.match(out, PLAIN, `${args.join(' ')} prints: ${offending(out)}`);
  }
});

test('--plain works on every command (it is --ascii under the spec\'s name)', () => {
  const r = cli('verify', '99', '--plain');
  assert.doesNotMatch(r.stdout + r.stderr, /Unknown option --plain/);
  assert.match(cli('help', '--plain').stdout, /--plain/);
});
