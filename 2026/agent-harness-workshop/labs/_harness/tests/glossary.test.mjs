import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { parseGlossary, loadGlossary, glossaryLines } from '../glossary.mjs';
import { loadCatalog } from '../catalog.mjs';
import { tmpdir } from './helpers.mjs';

test('one bullet per term, with the lab that teaches it', () => {
  const g = parseGlossary('# Glossary\n\nIntro.\n\n- **Hook**: your code that runs before a tool call. (Lab 05)\r\n- **Harness**: everything around the model.\n- not a term\n');
  assert.deepEqual(g, [
    { term: 'Hook', text: 'your code that runs before a tool call.', lab: 'lab-05' },
    { term: 'Harness', text: 'everything around the model.', lab: null },
  ]);
  assert.deepEqual(glossaryLines(g, { query: 'hook' }), ['Hook: your code that runs before a tool call. (Lab 05)']);
  assert.deepEqual(glossaryLines(g, { query: 'around' }), ['Harness: everything around the model.']);
  assert.equal(glossaryLines(g).length, 2);
  assert.deepEqual(loadGlossary(tmpdir()), [], 'no file, no glossary');
});

test('the workshop glossary: about 22 terms, each pointing at a lab that exists', () => {
  const labsDir = path.join(import.meta.dirname, '..', '..');
  const g = loadGlossary(labsDir);
  const labs = new Set(loadCatalog(labsDir).map((l) => l.id));
  assert.ok(g.length >= 20 && g.length <= 28, `${g.length} terms`);
  for (const e of g) {
    assert.ok(e.text.length > 20, `${e.term}: one real sentence`);
    assert.ok(!e.lab || labs.has(e.lab), `${e.term} → ${e.lab}`);
  }
  assert.equal(new Set(g.map((e) => e.term.toLowerCase())).size, g.length, 'no duplicates');
});
