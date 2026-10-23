// Milestones on screen: the checks grouped by milestone (finished ones fold into one line), and the milestone list on
// the mission screen. Pure: the app passes in its colour functions and its own row renderer.
import { groupChecks, milestoneBar, revealedHints } from '../milestones.mjs';

const label = (g) => `${g.id}${g.title ? ` · ${g.title}` : ''}`;

/** One milestone's summary line: "✅ M1 · Title  ▰▰▰ 3/3" when done, "🧭 M2 · Title  ▰▱ 1/2" otherwise. */
export function milestoneLine(g, fmt) {
  const bar = milestoneBar(g.passed, g.total);
  const count = g.total ? `${g.passed}/${g.total}` : 'no checks';
  return g.done ? `✅ ${fmt.green(label(g))}  ${fmt.bright(bar)} ${fmt.dim(count)}` : `🧭 ${fmt.white(label(g))}  ${fmt.bright(bar)} ${fmt.dim(count)}`;
}

/**
 * The checks screen. R: the run ({ plan, planMilestones, results, running }). renderItem(idx, name, result) → lines and
 * focus. A finished milestone folds into one line, unless it holds the selected check (`selected`).
 * Returns { lines, focus } (focus: [first, last] rows of the selected check).
 */
export function checkGroupLines({ R, ex, fmt, renderItem, selected = -1 }) {
  const groups = groupChecks({ names: R.plan ?? [], milestones: R.planMilestones ?? [], results: R.results ?? [], defined: ex.milestones ?? [] });
  const lines = [];
  let focus = null;
  const plain = groups.length === 1 && groups[0].id === null;
  for (const g of groups) {
    if (!plain) {
      if (!g.total && !(ex.milestones ?? []).some((m) => m.id === g.id)) continue;
      const fold = g.done && !R.running && !g.items.some((it) => it.idx === selected);
      lines.push(`   ${g.id ? milestoneLine(g, fmt) : fmt.white('Other checks')}`);
      if (fold) continue;
    }
    for (const it of g.items) {
      const out = renderItem(it.idx, it.name, it.result);
      if (out.focus) focus = [lines.length + out.focus[0], lines.length + out.focus[1]];
      lines.push(...out.lines.map((l) => (plain ? l : `  ${l}`)));
    }
  }
  return { lines, focus };
}

/** The 🧭 MILESTONES section of the mission screen, from the last recorded run. */
export function milestoneListLines(ex, entry, { W, fmt, renderMarkdown, fresh = true }) {
  const status = fresh ? entry.milestones ?? {} : {};
  const lines = [];
  for (const m of ex.milestones ?? []) {
    const icon = status[m.id] === 'pass' ? '✅' : status[m.id] === 'fail' ? '❌' : '⬜';
    lines.push('');
    lines.push(`   ${icon} ${fmt.bold(fmt.white(`${m.id} · ${m.title}`))}`);
    lines.push(...renderMarkdown(m.body, W - 4).map((l) => (l ? `   ${l}` : l)));
  }
  return lines;
}

/** The hint dots per milestone: "M1 ●● · M2 ○○ · other ●". */
export function hintDots(ex, entry, fmt) {
  const shown = revealedHints(ex, entry);
  const groups = new Map();
  (ex.hints ?? []).forEach((h, i) => {
    const k = h.milestone ?? 'other';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(shown.has(i) ? fmt.yellow('●') : fmt.dim('○'));
  });
  if (!(ex.milestones ?? []).length) return [...groups.values()].flat().join('');
  return [...groups.entries()].map(([k, dots]) => `${fmt.dim(k)} ${dots.join('')}`).join(fmt.dim(' · '));
}
