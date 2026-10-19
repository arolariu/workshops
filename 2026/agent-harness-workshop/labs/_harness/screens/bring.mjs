// The bring plan as lines of text, shared by `node labs/start.mjs bring` and the full-screen app (key i).
import { DIFFICULTIES } from '../catalog.mjs';
import { width, wrap, pad } from '../ui.mjs';

/** "lab-01/hard-plus" → "lab-01 hard+" */
export const describeKey = (key) => {
  const [lab, level] = String(key).split('/');
  return `${lab} ${(DIFFICULTIES.find((d) => d.id === level)?.label ?? level).toLowerCase()}`;
};
const ACTION = { new: 'new', replace: 'replaces the reference', 'replace-yours': 'replaces your edits in this level' };

/**
 * plan: from bring.bringPlan. fmt: { dim, white, yellow, bright } colour functions. W: the width to wrap to.
 * Returns lines without a header, indented by three spaces.
 */
export function bringLines(plan, { W = 96, fmt }) {
  const L = [];
  const put = (text, indent = '   ', cont = '      ') => wrap(text, Math.max(16, W - width(indent))).forEach((l, i) => L.push(`${i ? cont : indent}${l}`));
  if (plan.error) { put(`⚠️  ${fmt.yellow(plan.error)}`); return L; }
  if (!plan.items.length && !plan.kept.length) {
    put(`🧳 ${fmt.white('Nothing to bring yet.')}`);
    put(fmt.dim('Your work is the harness files (AGENTS.md, *.instructions.md, .github/…, .mcp.json, mcp/…, apm.yml, scripts/…) that you changed or added in an earlier level whose checks pass on its current files. App code never travels.'), '      ', '      ');
  }
  const fileW = Math.min(36, Math.max(10, ...plan.items.map((i) => width(i.file))));
  for (const it of plan.items) {
    const also = it.alsoIn.length ? ` · also changed in ${it.alsoIn.map(describeKey).join(', ')}` : '';
    put(`${fmt.white(pad(it.file, fileW))} ${fmt.bright(`← ${describeKey(it.from)}`)}  ${fmt.dim(`${it.support ? 'new · a file your work there uses' : ACTION[it.action]}${also}`)}`, '   ', `   ${' '.repeat(Math.min(fileW + 1, 24))}`);
  }
  for (const s of plan.skipped) put(`⏩ ${fmt.yellow(`${describeKey(s.key)} skipped:`)} ${fmt.dim(s.reason)}`);
  for (const k of plan.kept) put(`🔒 ${fmt.white(`kept: ${k.file}`)} ${fmt.dim(`(${k.reason === 'drop' ? 'this level asks you to create it yourself' : k.reason === 'keep' ? 'this level needs its own version' : "this level's starter"}; yours is in ${describeKey(k.from)})`)}`);
  return L;
}
