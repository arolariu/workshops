// Remembers what you finished (labs/.progress.json - ignored by git).
import fs from 'node:fs';
import path from 'node:path';

export function progressStore(labsDir) {
  const file = path.join(labsDir, '.progress.json');
  let data = {};
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { data = {}; }
  const save = () => { try { fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`); } catch { /* read-only checkout: keep in memory */ } };
  return {
    get: (key) => data[key] ?? {},
    set(key, patch) { data[key] = { ...(data[key] ?? {}), ...patch, updated: new Date().toISOString() }; save(); },
    all: () => data,
  };
}
