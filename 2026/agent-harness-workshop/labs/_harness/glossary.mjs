// labs/glossary.md: one bullet per term, "- **Term**: one sentence. (Lab NN)". Shown at the end of the ? screen, by
// `node labs/start.mjs glossary [word]` and by the linear mode's `glossary` command.
import fs from 'node:fs';
import path from 'node:path';

const TERM = /^\s*[-*]\s+\*\*(.+?)\*\*\s*:\s*(.*?)\s*(?:\(Lab\s+(\d+)\))?\s*$/;

/** [{ term, text, lab: 'lab-NN' | null }] in file order. */
export function parseGlossary(md) {
  const out = [];
  for (const line of String(md ?? '').replace(/\r/g, '').split('\n')) {
    const m = line.match(TERM);
    if (m) out.push({ term: m[1].trim(), text: m[2].trim(), lab: m[3] ? `lab-${m[3].padStart(2, '0')}` : null });
  }
  return out;
}

export const glossaryFile = (labsDir) => path.join(labsDir, 'glossary.md');
export function loadGlossary(labsDir) {
  try { return parseGlossary(fs.readFileSync(glossaryFile(labsDir), 'utf8')); } catch { return []; }
}

/** "Term: text (Lab NN)" per term, as plain text, optionally only those whose term or text contains `query`. */
export function glossaryLines(entries, { query = '' } = {}) {
  const q = String(query).trim().toLowerCase();
  const plain = (s) => s.replace(/`([^`]+)`/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1');
  return entries.filter((e) => !q || `${e.term} ${e.text}`.toLowerCase().includes(q))
    .map((e) => plain(`${e.term}: ${e.text}${e.lab ? ` (Lab ${e.lab.slice(4)})` : ''}`));
}
