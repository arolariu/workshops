// 🧪 A table-driven test suite for the guard: one test per row of guard-cases.json.
//   node --test .github/hooks/scripts/guard.test.mjs
// (`node --test` alone skips dot folders like .github, so this suite only runs when you ask for it.)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { decide } from './guard.mjs';

// A row may say {{secret:ghp}} instead of a token: the suite builds fake secrets at runtime, so the repository never
// contains a real-looking one (push protection and secret scanners would rightly complain).
const SECRETS = {
  ghp: 'ghp_' + 'A1b2C3d4'.repeat(4) + 'E5f6',
  pat: 'github_pat_' + '11ABCDEFG0'.repeat(3) + '_xyz',
  aws: 'AKIA' + 'QWERTYUIOPASDFGH',
  key: ['-----BEGIN', 'RSA PRIVATE KEY-----'].join(' ') + '\nMIIEowIBAAKCAQEA\n',
  sk: 'sk-' + 'abcd1234'.repeat(5),
};
const expand = (value) => JSON.parse(JSON.stringify(value).replace(/\{\{secret:(\w+)\}\}/g, (m, k) => JSON.stringify(SECRETS[k] ?? m).slice(1, -1)));
const cases = JSON.parse(fs.readFileSync(new URL('./guard-cases.json', import.meta.url), 'utf8'));

for (const c of cases) {
  test(`${c.expect} · ${c.tool} ${JSON.stringify(c.args).slice(0, 60)} (${c.why})`, () => {
    const reason = decide(c.tool, expand(c.args));
    assert.equal(reason ? 'deny' : 'allow', c.expect, reason ?? 'the guard allowed it');
    if (c.expect === 'deny') assert.ok(reason.length >= 30, `say why, and what to do instead: "${reason}"`);
  });
}
