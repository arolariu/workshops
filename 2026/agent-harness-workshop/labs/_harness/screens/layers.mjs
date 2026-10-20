// The lab screen's map of the harness: the runtime at the root, one branch per layer (one per lab), this lab marked,
// and the threads (stories that run through several labs) it continues. The capstone is every layer together.
import { clip, isAscii, pad, stripAnsi, width } from '../ui.mjs';

export function layerMapLines(catalog, lab, { W, fmt }) {
  const root = catalog.find((l) => !l.capstone);
  if (!root) return [];
  const layers = catalog.filter((l) => l !== root && !l.capstone);
  const nameW = Math.max(10, Math.min(36, W - 24));
  const row = (prefix, l) => {
    const here = l === lab;
    const name = `${prefix}${l.emoji} ${l.title}`;
    const cell = width(name) > nameW ? `${clip(name, nameW - 1)}…` : name;
    const text = `${here ? fmt.bold(fmt.white(pad(cell, nameW))) : fmt.dim(pad(cell, nameW))} ${fmt.dim(l.num)}${here ? `  ${fmt.bright('◀ this lab')}` : ''}`;
    return `   ${text}`;
  };
  const reach = lab.capstone ? fmt.dim(' · all the layers together') : lab.maturity ? fmt.dim(` · this lab reaches ${lab.maturity.level} ${lab.maturity.name}`) : '';
  const L = [`  🗺️  ${fmt.bold(fmt.white('YOUR HARNESS'))}${reach}`];
  L.push(row('🧠 model + ', root));
  layers.forEach((l, i) => L.push(row(`   ${i === layers.length - 1 ? '└─' : '├─'} `, l)));
  if (lab.threads?.length) {
    // One whole thread at a time: a line that would run past the width goes on below, indented under the first.
    // With --plain a thread keeps its name, not its icon (🔴 would fold to the Hard badge's H).
    const threads = isAscii() ? lab.threads.map((th) => th.replace(/^[^\p{L}\p{N}]+/u, '')) : lab.threads;
    const head = `  🧵 ${fmt.dim('Threads:')} `;
    const indent = ' '.repeat(width(`  🧵 Threads: `));
    let line = head;
    let first = true;
    for (const th of threads) {
      const add = first ? th : `${fmt.dim(' · ')}${th}`;
      if (!first && width(stripAnsi(line + add)) > W + 2) { L.push(`${line}${fmt.dim(' ·')}`); line = `${indent}${th}`; } else line += add;
      first = false;
    }
    L.push(line);
  }
  return L.map((l) => clip(l, W + 2));
}
