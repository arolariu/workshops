// The repository's CI workflow for the workshop: Linux, macOS and Windows; no Copilot; read-only; pinned actions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const file = path.resolve(import.meta.dirname, '..', '..', '..', '..', '..', '.github', 'workflows', 'agent-harness-workshop.yml');
const there = fs.existsSync(file);

test('the CI workflow runs the unit tests and verify on three systems, read-only, without Copilot', { skip: !there && 'the workshop folder is used without its repository' }, () => {
  const y = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  for (const trigger of ['push', 'pull_request']) assert.match(y, new RegExp(`\\n  ${trigger}:\\n    paths: \\['2026/agent-harness-workshop/\\*\\*', '\\.github/workflows/agent-harness-workshop\\.yml'\\]`), trigger);
  assert.match(y, /\npermissions:\n  contents: read\n(?! )/, 'read-only, and nothing else');
  assert.doesNotMatch(y, /write/i, 'no write permission anywhere');
  const timeout = Number(y.match(/timeout-minutes: (\d+)/)?.[1]);
  assert.ok(timeout > 0 && timeout <= 30, `timeout-minutes ${timeout}`);
  assert.match(y, /os: \[ubuntu-latest, macos-latest, windows-latest\]/);
  assert.match(y, /node-version: 22\b/);
  assert.match(y, /\nconcurrency:\n  group: /);
  const uses = [...y.matchAll(/uses: (\S+)/g)].map((m) => m[1]);
  assert.ok(uses.length >= 2, 'checkout and setup-node');
  for (const u of uses) assert.match(u, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/, `${u} is pinned to a commit SHA`);
  const runs = [...y.matchAll(/\n\s+run: (.+)/g)].map((m) => m[1].trim());
  assert.deepEqual(runs, ['node --test "labs/_harness/tests/*.test.mjs"', 'node labs/start.mjs verify --chain --bring']);
  assert.doesNotMatch(y, /copilot/i, 'no Copilot calls, not even an install');
});
