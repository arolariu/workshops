// The lab screen's map of the harness: the runtime at the root, one branch per layer (one per lab), this lab marked,
// and the threads (stories that run through several labs) it continues. The capstone is every layer together.
import { clip, pad } from '../ui.mjs';

export function layerMapLines(catalog, lab, { W, fmt }) {
  const root = catalog.find((l) => !l.capstone);
  if (!root) return [];
  const layers = catalog.filter((l) => l !== root && !l.capstone);
  const nameW = Math.max(10, Math.min(30, W - 26));
  const row = (prefix, l) => {
    const here = l === lab;
    const name = `${prefix}${l.emoji} ${l.title}`;
    const cell = clip(name, nameW);
    const text = `${here ? fmt.bold(fmt.white(pad(cell, nameW))) : fmt.dim(pad(cell, nameW))} ${fmt.dim(l.num)}${here ? `  ${fmt.bright('◀ this lab')}` : ''}`;
    return `   ${text}`;
  };
  const reach = lab.capstone ? fmt.dim(' · all the layers together') : lab.maturity ? fmt.dim(` · this lab reaches ${lab.maturity.level} ${lab.maturity.name}`) : '';
  const L = [`  🗺️  ${fmt.bold(fmt.white('YOUR HARNESS'))}${reach}`];
  L.push(row('🧠 model + ', root));
  layers.forEach((l, i) => L.push(row(`   ${i === layers.length - 1 ? '└─' : '├─'} `, l)));
  if (lab.threads?.length) L.push(`  🧵 ${fmt.dim('Threads:')} ${lab.threads.join(fmt.dim(' · '))}`);
  return L.map((l) => clip(l, W + 2));
}
