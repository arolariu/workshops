import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { STATUS, statusIcon, statusWord, asciiFold } from '../ui.mjs';

const harness = path.resolve(import.meta.dirname, '..');
const labsDir = path.dirname(harness);
const sources = [path.join(labsDir, 'start.mjs'), ...['', 'screens'].flatMap((d) => fs.readdirSync(path.join(harness, d)).filter((f) => f.endsWith('.mjs')).map((f) => path.join(harness, d, f)))];

test('colour codes are written only where NO_COLOR is checked', () => {
  const COLOUR = /38;5|48;5|\\x1b\[(?:3|4|9)\d(?:;\d+)*m/;
  const bad = [];
  for (const f of sources) {
    if (path.basename(f) === 'ui.mjs') continue; // the palette itself: every code there is behind noColor
    fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => { if (COLOUR.test(l) && !/noColor/.test(l)) bad.push(`${path.basename(f)}:${i + 1}`); });
  }
  assert.deepEqual(bad, [], 'a colour code that ignores NO_COLOR');
});

test('a state is never shown by colour alone: every status has its own icon and a word, also with --plain', () => {
  const states = Object.keys(STATUS).filter((s) => s !== 'none');
  const icons = states.map(statusIcon);
  assert.equal(new Set(icons).size, icons.length, `two states share an icon: ${icons.join(' ')}`);
  assert.equal(new Set(icons.map((i) => asciiFold(i).trim())).size, icons.length, 'and their --plain markers differ too');
  for (const s of states) assert.ok(statusIcon(s) && statusWord(s), s);
});

const COLOURED = /\x1b\[(?:38|48);5;|\x1b\[(?:3|4|9)\dm/;
const cli = (args, env) => {
  const e = { ...process.env, ...env };
  for (const k of Object.keys(e)) if (e[k] === undefined) delete e[k];
  return spawnSync(process.execPath, [path.join(labsDir, 'start.mjs'), ...args], { encoding: 'utf8', timeout: 60000, env: e });
};

test('NO_COLOR: the CLI prints no colour codes, even where colour is forced on', () => {
  // FORCE_COLOR turns colour on for piped output, so NO_COLOR is what turns it off; the control run proves it.
  assert.match(cli(['list'], { FORCE_COLOR: '1', NO_COLOR: undefined }).stdout, COLOURED, 'control: FORCE_COLOR alone prints colour');
  for (const args of [['list'], ['path'], ['help'], ['glossary'], ['next'], ['xray', 'lab-00', 'easy'], ['present', 'lab-00'], ['replay']]) {
    const r = cli(args, { FORCE_COLOR: '1', NO_COLOR: '1' });
    assert.equal(r.status, 0, `${args.join(' ')}: ${r.stderr}`);
    assert.doesNotMatch(r.stdout, COLOURED, `${args.join(' ')} printed colour`);
  }
});
