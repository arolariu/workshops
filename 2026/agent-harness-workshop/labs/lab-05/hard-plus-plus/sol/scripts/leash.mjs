#!/usr/bin/env node
// 🐕 Run Copilot autonomously, on a leash: exactly the permissions this job needs, and a budget.
//   node scripts/leash.mjs "Make upcoming() skip assignments that are already done, and add a test."
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Copilot arguments for an unattended coding run.
 * @param {string} prompt
 * @returns {string[]}
 */
export function leashArgs(prompt) {
  return [
    '-p', prompt,
    '--no-ask-user',
    '--max-ai-credits=50',
    '--allow-tool=write',
    '--allow-tool=shell(npm:*)',
    '--allow-tool=shell(node:*)',
    '--deny-tool=shell(git push)',
    '--deny-tool=shell(rm)',
  ];
}

// ---------- you don't need to change anything below this line ----------
// Real paths on both sides: through a symlink (macOS /var), a junction or an 8.3 name the spellings differ.
const sameFile = (a, b) => { try { return fs.realpathSync.native(a) === fs.realpathSync.native(b); } catch { return false; } };
const isMain = process.argv[1] && sameFile(process.argv[1], fileURLToPath(import.meta.url));
if (isMain) {
  const prompt = process.argv.slice(2).filter((a) => a !== '--dry-run').join(' ') || 'Make upcoming() skip assignments that are already done, and add a test.';
  const args = leashArgs(prompt);
  if (!args.length) {
    console.error('leashArgs() returns nothing yet: finish the TODO first.');
    process.exit(1);
  }
  console.log(`🐕 copilot ${args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}\n`);
  if (process.argv.includes('--dry-run')) process.exit(0);
  let r = spawnSync('copilot', args, { stdio: 'inherit' });
  if (r.error?.code === 'ENOENT' && process.platform === 'win32') {
    const q = (a) => (/^[\w\-./:=@,]+$/.test(a) ? a : `"${a.replace(/"/g, '""')}"`);
    r = spawnSync('copilot', args.map(q), { stdio: 'inherit', shell: true });
  }
  process.exit(r.status ?? 1);
}
