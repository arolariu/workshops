#!/usr/bin/env node
// The nightly digest job. The campus scheduler runs it at 23:00 UTC:
//   node jobs/nightly-digest.mjs              writes tomorrow's digest to jobs/out/digest-<date>.txt
//   node jobs/nightly-digest.mjs --dry-run    prints it instead and writes nothing
// --date picks another day, --data reads an export of the bookings instead of the demo data, --out another folder.
import fs from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { seedData } from '../api/seed.mjs';
import { buildDigest, renderDigest } from './digest.mjs';

export const USAGE = 'Usage: node jobs/nightly-digest.mjs [--date YYYY-MM-DD] [--data export.json] [--out folder] [--dry-run]';
const OUT = fileURLToPath(new URL('./out', import.meta.url));
const DAY = 24 * 60 * 60 * 1000;
const OPTIONS = { date: { type: 'string' }, data: { type: 'string' }, out: { type: 'string' }, 'dry-run': { type: 'boolean' } };

const isDay = (s) => {
  const d = new Date(`${s}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
};

const system = {
  now: () => new Date(),
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
  readFile: (file) => fs.readFile(file, 'utf8'),
  writeFile: async (file, text) => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, text);
  },
};

/** Runs the job and resolves to its exit code. Tests replace the clock, the console and the files through `io`. */
export async function main(argv = process.argv.slice(2), io = {}) {
  const { now, stdout, stderr, readFile, writeFile } = { ...system, ...io };
  let values;
  try {
    ({ values } = parseArgs({ args: argv, options: OPTIONS, strict: true, allowPositionals: false }));
  } catch (e) {
    stderr(`${e.message}\n${USAGE}\n`);
    return 2;
  }
  const date = values.date ?? new Date(now().getTime() + DAY).toISOString().slice(0, 10);
  if (!isDay(date)) {
    stderr(`--date must be a real day like 2026-11-03, not "${date}".\n${USAGE}\n`);
    return 2;
  }
  let data;
  try {
    data = values.data ? JSON.parse(await readFile(values.data)) : seedData();
  } catch (e) {
    stderr(`Cannot read ${values.data}: ${e.message}\n`);
    return 1;
  }
  const text = renderDigest(buildDigest(data, { date }));
  if (values['dry-run']) {
    stdout(`${text}(dry run: nothing written)\n`);
    return 0;
  }
  const file = path.resolve(values.out ?? OUT, `digest-${date}.txt`);
  await writeFile(file, text);
  stdout(`Wrote ${file}\n`);
  return 0;
}

const isMain = (() => {
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
})();
if (isMain) process.exitCode = await main();
