import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { main } from './nightly-digest.mjs';

const CLI = fileURLToPath(new URL('./nightly-digest.mjs', import.meta.url));

// A fake console, clock and file system, so the job never touches the real ones.
function fake({ files = {} } = {}) {
  const out = [];
  const err = [];
  const writes = [];
  const io = {
    now: () => new Date('2026-11-02T23:00:00Z'),
    stdout: (s) => out.push(s),
    stderr: (s) => err.push(s),
    readFile: async (f) => {
      if (!(f in files)) throw new Error('no such file');
      return files[f];
    },
    writeFile: async (f, text) => writes.push([f, text]),
  };
  return { io, out, err, writes, stdout: () => out.join(''), stderr: () => err.join('') };
}

test('--dry-run prints tomorrow\'s digest and writes nothing', async () => {
  const f = fake();
  assert.equal(await main(['--dry-run'], f.io), 0);
  assert.match(f.stdout(), /^CampusHub nightly digest for Tue 3 Nov 2026\n3 bookings/);
  assert.match(f.stdout(), /\(dry run: nothing written\)\n$/);
  assert.equal(f.writes.length, 0);
});

test('without --dry-run it writes jobs/out/digest-<date>.txt', async () => {
  const f = fake();
  assert.equal(await main(['--date', '2026-11-04'], f.io), 0);
  const [[file, text]] = f.writes;
  assert.equal(file, fileURLToPath(new URL('./out/digest-2026-11-04.txt', import.meta.url)));
  assert.match(text, /^CampusHub nightly digest for Wed 4 Nov 2026\n1 booking,/);
  assert.equal(f.stdout(), `Wrote ${file}\n`);
});

test('--out picks the folder', async () => {
  const f = fake();
  await main(['--out', 'reports'], f.io);
  assert.equal(f.writes[0][0], path.resolve('reports', 'digest-2026-11-03.txt'));
});

test('bad arguments exit 2 with the usage', async () => {
  for (const args of [['--date', '2026-02-30'], ['--date', 'tomorrow'], ['--force'], ['--date']]) {
    const f = fake();
    assert.equal(await main(args, f.io), 2, args.join(' '));
    assert.match(f.stderr(), /Usage: node jobs\/nightly-digest\.mjs/);
    assert.equal(f.writes.length, 0);
  }
});

test('--data reads rooms and bookings from a JSON file', async () => {
  const data = { rooms: [{ id: 'A-1', name: 'Room A' }], bookings: [{ id: 'bk-9', roomId: 'A-1', title: 'Board games', start: '2026-11-03T18:00:00Z', end: '2026-11-03T19:00:00Z', attendees: 5, status: 'confirmed' }] };
  const f = fake({ files: { 'export.json': JSON.stringify(data), 'broken.json': '{' } });
  assert.equal(await main(['--dry-run', '--data', 'export.json'], f.io), 0);
  assert.match(f.stdout(), /18:00-19:00  A-1      Board games \(5\)/);
  const g = fake({ files: { 'broken.json': '{' } });
  assert.equal(await main(['--dry-run', '--data', 'broken.json'], g.io), 1);
  assert.match(g.stderr(), /Cannot read broken\.json/);
});

test('the real CLI runs from the command line', () => {
  const r = spawnSync(process.execPath, [CLI, '--dry-run', '--date', '2026-11-03'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /3 bookings, 7 room-hours/);
});
