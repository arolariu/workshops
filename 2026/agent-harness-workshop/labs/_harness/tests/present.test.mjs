import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { loadCatalog, readmeSections, DIFFICULTIES } from '../catalog.mjs';
import { PATHS } from '../learning.mjs';
import { slidesFor, slidesOf, howSection, SLIDE_W, SLIDE_ROWS } from '../screens/present.mjs';
import { stripAnsi, width } from '../ui.mjs';
import fs from 'node:fs';

const labsDir = path.resolve(import.meta.dirname, '..', '..');
const catalog = loadCatalog(labsDir);
const sectionsOf = (lab) => readmeSections(fs.readFileSync(lab.readmePath, 'utf8'));

test('the "how it works" slide: the How section when a readme has one, else the first section after Under the hood that explains the layer', () => {
  const want = {
    'lab-00': 'How it works', 'lab-01': 'Where instructions live', 'lab-02': 'Anatomy of a skill', 'lab-03': 'Anatomy of an agent',
    'lab-04': 'Local vs remote', 'lab-05': 'How a hook works', 'lab-06': 'Plugins', 'lab-07': 'Anatomy of a workflow', 'lab-08': 'The maturity ladder',
  };
  for (const lab of catalog) assert.equal(howSection(sectionsOf(lab))?.title, want[lab.id], lab.id);
});

test('every lab gives its three slides; the deck ends with the closing demo and the homework map', () => {
  const slides = slidesFor(catalog);
  for (const lab of catalog) {
    const own = slides.filter((s) => s.lab === lab.id && s.part === 1);
    const titles = own.map((s) => s.section);
    assert.ok(titles.includes('In one minute') && titles.includes(howSection(sectionsOf(lab)).title) && titles.some((t) => /Under the hood/.test(t)), `${lab.id}: ${titles.join(' | ')}`);
  }
  const tail = slides.slice(-3).map((s) => `${s.lab}:${s.section}`).join(' | ');
  assert.match(tail, /lab-08:.*closing demo/i);
  assert.equal(slides.at(-1).lab, 'homework', tail);
  const map = slides.filter((s) => s.lab === 'homework').flatMap((s) => s.lines).map(stripAnsi).join('\n');
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const d of DIFFICULTIES) {
    assert.match(map, new RegExp(`${esc(d.label)}[^\\n]*${esc(d.time)}`), `the map gives ${d.label} its time`);
    assert.ok(map.includes(d.capstoneTime), `the map gives ${d.label} its capstone time`);
  }
  for (const p of PATHS.filter((x) => x.keys)) assert.ok(map.includes(p.label), `the map names the ${p.label} path`);
  assert.deepEqual(slides.map((s) => s.index), slides.map((_, i) => i));
  assert.ok(slides.every((s) => s.total === slides.length));
});

test('every slide fits 80x24: a long section continues on another slide, nothing is cut', () => {
  const slides = slidesFor(catalog);
  for (const s of slides) {
    assert.ok(s.lines.length <= SLIDE_ROWS, `${s.lab} ${s.title}: ${s.lines.length} lines`);
    for (const l of s.lines) assert.ok(width(l) <= SLIDE_W - 2, `${s.lab} ${s.title}: ${stripAnsi(l)}`);
    assert.ok(s.lines.some((l) => stripAnsi(l).trim()), `${s.lab} ${s.title} is not empty`);
  }
  const multi = slides.filter((s) => s.parts > 1);
  assert.ok(multi.length > 0, 'some sections are long enough to continue');
  for (const s of multi) assert.match(s.title, new RegExp(`\\(${s.part}/${s.parts}\\)$`));
  for (const s of multi) assert.ok(s.lines.length >= 4, `${s.lab} ${s.title}: a part of ${s.lines.length} line(s) is a stray tail`);
  for (const s of multi.filter((x) => x.part > 1 && stripAnsi(x.lines[0]).includes('│'))) assert.match(stripAnsi(s.lines[1] ?? ''), /─┼─/, `${s.lab} ${s.title}: a table that goes on repeats its header`);
  assert.equal(slides.filter((s) => s.lab === 'homework').length, 1, 'the homework map is one slide');
});

test('present one lab: only its slides (the capstone adds the demo and the homework map)', () => {
  const one = slidesFor(catalog, { lab: 'lab-03' });
  assert.ok(one.length >= 3 && one.every((s) => s.lab === 'lab-03'));
  const cap = slidesFor(catalog, { lab: 'lab-08' });
  assert.equal(cap.at(-1).lab, 'homework');
});

const cli = (...args) => spawnSync(process.execPath, [path.join(labsDir, 'start.mjs'), ...args], { encoding: 'utf8', timeout: 60000, env: { ...process.env, NO_COLOR: '1', COLUMNS: '80' } });

test('without a terminal, present prints the slides as text', () => {
  const r = cli('present', 'lab-01');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /1\/\d+ · Lab 01/);
  assert.match(r.stdout, /In one minute/);
  assert.match(r.stdout, /Under the hood/);
  const all = cli('present');
  assert.equal(all.status, 0, all.stderr);
  for (const l of stripAnsi(all.stdout).split('\n')) assert.ok(width(l) <= 80, `wider than 80: ${l}`);
  assert.match(cli('present', '01', '--plain').stdout, /^[\x00-\x7f]*$/);
  assert.notEqual(cli('present', 'lab-42').status, 0);
});

test('a table that goes on repeats its own whole header, even after another table on the same slide', () => {
  const rows = (n, tag) => Array.from({ length: n }, (_, i) => `| ${tag}${i} | value ${i} |`).join('\n');
  const md = `| A | B |\n|---|---|\n${rows(2, 'a')}\n\n| A long header that wraps onto a second line in this narrow column, surely, yes | Second |\n|---|---|\n${rows(30, 'r')}`;
  const parts = slidesOf('x', 'k', 'S', md);
  assert.ok(parts.length >= 3);
  const first = stripAnsi(parts[0].lines.join('\n'));
  const header = first.slice(first.indexOf('A long header'), first.indexOf('─┼─') > first.indexOf('A long header') ? first.lastIndexOf('\n', first.lastIndexOf('─┼─')) : undefined);
  for (const p of parts.slice(1)) {
    const text = stripAnsi(p.lines.join('\n'));
    assert.ok(text.startsWith(stripAnsi(p.lines[0])) && /A long header/.test(stripAnsi(p.lines[0])), `part ${p.part} starts with the second table's header: ${stripAnsi(p.lines[0])}`);
    assert.doesNotMatch(stripAnsi(p.lines[0]), /^\s*A\s+│\s+B\s*$/, 'not the first table\'s header');
    assert.ok(p.lines.length <= SLIDE_ROWS);
  }
  assert.ok(header.length > 0);
});
