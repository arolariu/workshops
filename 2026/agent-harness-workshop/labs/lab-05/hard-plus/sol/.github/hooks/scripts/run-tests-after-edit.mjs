#!/usr/bin/env node
// 🧪 postToolUse hook: after the agent edits a .js file, run the tests and log the result in .agent-logs/tests.jsonl.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDIT_TOOLS = /^(edit|create|write|apply_patch|str_replace_editor|multi_edit)$/;

try {
  const input = JSON.parse(fs.readFileSync(0, 'utf8') || 'null');
  if (input && EDIT_TOOLS.test(String(input.toolName ?? ''))) {
    let args = input.toolArgs ?? {};
    if (typeof args === 'string') {
      try { args = JSON.parse(args); } catch { args = { raw: args }; }
    }
    const file = (JSON.stringify(args).match(/[\w./\\-]+\.m?js\b/) ?? [])[0];
    if (file && !/\.github[\\/]/.test(file)) {
      const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap'], { cwd: process.cwd(), encoding: 'utf8', timeout: 110000 });
      const count = (key) => Number((String(r.stdout).match(new RegExp(`^# ${key} (\\d+)`, 'm')) ?? [])[1] ?? 0);
      const entry = { at: new Date().toISOString(), file, result: r.status === 0 ? 'pass' : 'fail', pass: count('pass'), fail: count('fail') };
      fs.mkdirSync('.agent-logs', { recursive: true });
      fs.appendFileSync(path.join('.agent-logs', 'tests.jsonl'), `${JSON.stringify(entry)}\n`);
    }
  }
} catch {
  // Never break the session.
}
