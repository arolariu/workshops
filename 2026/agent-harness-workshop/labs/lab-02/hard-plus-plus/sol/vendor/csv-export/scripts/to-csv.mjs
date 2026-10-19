#!/usr/bin/env node
// csv-export: turn a grades JSON file ([{ course, grade, weight }]) into a CSV file inside the current project.
//   node .github/skills/csv-export/scripts/to-csv.mjs grades.json [output.csv]
import fs from 'node:fs';
import path from 'node:path';

const [input, output = 'grades.csv'] = process.argv.slice(2);
if (!input) {
  console.error('Usage: node to-csv.mjs <grades.json> [output.csv]');
  process.exit(1);
}
const root = process.cwd();
const target = path.resolve(root, output);
const rel = path.relative(root, target);
if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
  console.error('The output file must be inside this project.');
  process.exit(1);
}
const rows = JSON.parse(fs.readFileSync(path.resolve(root, input), 'utf8'));
const cell = (v) => (/[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''));
const lines = ['course,grade,weight', ...rows.map((r) => [r.course, r.grade, r.weight].map(cell).join(','))];
fs.writeFileSync(target, `${lines.join('\n')}\n`);
console.log(`Wrote ${rows.length} rows to ${rel}`);
