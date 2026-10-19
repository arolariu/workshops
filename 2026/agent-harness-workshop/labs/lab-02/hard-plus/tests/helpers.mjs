// Helpers for Lab 02 · hard+ checks: build small skills in temp folders, so no hostile file is ever committed twice.
import cp from 'node:child_process';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';

const STARTERS = ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'];
/**
 * Run `fn` (your code, in this process) with no way to start a process: every child_process function throws instead
 * (your module's named imports follow, via syncBuiltinESMExports), and PATH and HARNESS_COPILOT point nowhere.
 * Returns { value, error, started: [commands it tried] }; everything is restored afterwards.
 */
export async function withoutProcesses(t, fn) {
  const saved = Object.fromEntries(STARTERS.map((n) => [n, cp[n]]));
  const env = { HARNESS_COPILOT: process.env.HARNESS_COPILOT, PATH: process.env.PATH };
  const empty = t.tmp();
  const started = [];
  for (const n of STARTERS) cp[n] = (cmd) => { started.push(String(cmd).endsWith('no-copilot-here') ? 'copilot' : String(cmd)); throw new Error(`blocked: tried to start ${cmd}`); };
  syncBuiltinESMExports();
  process.env.HARNESS_COPILOT = path.join(empty, 'no-copilot-here');
  process.env.PATH = empty;
  try {
    return { value: await fn(), started };
  } catch (error) {
    return { error, started };
  } finally {
    Object.assign(cp, saved);
    syncBuiltinESMExports();
    for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}

export const VET = 'scripts/vet-skill.mjs';
export const SKILL_DIRS = ['.github/skills', '.agents/skills', '.claude/skills'];
export const VENDOR = { 'grade-sync': 'block', 'study-timer': 'review', 'csv-export': 'ok' };

/** A skill folder named `folder` in a fresh temp folder, from { 'SKILL.md': text, 'scripts/a.mjs': text }. */
export function makeSkill(t, folder, files = {}) {
  const dir = path.join(t.tmp(), folder);
  fs.mkdirSync(dir, { recursive: true });
  for (const [rel, text] of Object.entries(files)) {
    const p = path.join(dir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text);
  }
  return dir;
}

export const skillMd = (front, body = '1. Do the one thing this skill is for.\n') => `---\n${front}\n---\n${body}`;
export const CLEAN = skillMd('name: grade-chart\ndescription: Draw a bar chart of the grades in the terminal. Use when the user asks to see their grades as a chart.');

/** The rule ids in a list of findings. */
export const rules = (findings) => new Set((findings ?? []).map((f) => f.rule));
/** "file:line" for every finding of one rule. */
export const where = (findings, rule) => (findings ?? []).filter((f) => f.rule === rule).map((f) => `${f.file}:${f.line}`);

/** Every file under `dir` as rel → text (LF line endings). */
export function readTree(dir) {
  const out = new Map();
  const walk = (abs, rel) => {
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(abs, e.name), r);
      else out.set(r, fs.readFileSync(path.join(abs, e.name), 'utf8').replace(/\r\n/g, '\n'));
    }
  };
  walk(dir, '');
  return out;
}
