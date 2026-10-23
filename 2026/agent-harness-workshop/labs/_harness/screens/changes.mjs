// The diff view (key v on a level): your changes since your latest commit, file by file. Without git, or without a
// commit, it says why and what to do instead. `result` comes from workspace.changesDiff().
import { hardWrap, width, wrap } from '../ui.mjs';

const LABEL = { new: '🆕 new', changed: '📝 changed', deleted: '🗑️ deleted' };

/** Lines (indented by three spaces) for the file list and the selected file's diff. fmt: colour functions. */
export function changesLines(result, { idx = 0, W = 96, fmt, panel = (s) => s }) {
  const L = [];
  const put = (text, indent = '   ', cont = '      ') => wrap(text, Math.max(16, W - width(indent))).forEach((l, i) => L.push(`${i ? cont : indent}${l}`));
  if (!result.ok) {
    put(`⚠️  ${fmt.yellow(result.why === 'no-commit' ? 'No commit yet.' : 'No git here.')}`);
    put(fmt.dim(result.message), '   ', '   ');
    return L;
  }
  if (!result.files.length) {
    put(`👍 ${fmt.bright('No changes since your latest commit.')}`);
    return L;
  }
  put(fmt.dim(`${result.files.length} file${result.files.length === 1 ? '' : 's'} changed since your latest commit. New files count too; ignored ones (like node_modules) don't show.`));
  L.push('');
  result.files.forEach((f, i) => {
    const sel = i === idx;
    const row = `   ${sel ? fmt.bright('❯') : ' '} ${sel ? fmt.bold(fmt.white(f.path)) : f.path} ${fmt.dim(`(${LABEL[f.status]}${f.binary ? ', binary' : ''})`)}`;
    L.push(sel ? panel(row) : row);
  });
  L.push('');
  const f = result.files[Math.min(idx, result.files.length - 1)];
  L.push(`   ${fmt.dim('─'.repeat(Math.max(10, W - 6)))}`);
  L.push(`   📄 ${fmt.bold(fmt.white(f.path))} ${fmt.dim('(− last commit  + yours)')}`);
  if (f.note) put(fmt.dim(f.note), '   ', '   ');
  for (const line of f.diff.split('\n').filter((l, i, a) => l || i < a.length - 1)) {
    const color = line.startsWith('@@') ? fmt.cyan : line.startsWith('+') && !line.startsWith('+++') ? fmt.bright : line.startsWith('-') && !line.startsWith('---') ? fmt.yellow : line.startsWith('\\') ? fmt.dim : fmt.white;
    hardWrap(line.replace(/\t/g, '  '), W - 4).forEach((w, j) => L.push(`   ${j ? fmt.dim('↪') : ''}${color(w)}`));
  }
  return L;
}
