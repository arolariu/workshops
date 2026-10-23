// The credit meter: what the companion can verify about agent-check spending this month, from its own run history
// (labs/.runs/*/suite.json). It never infers actual usage: it counts the runs that started Copilot, and adds up the
// --max-ai-credits caps it verified on their command lines as an upper bound. /usage in Copilot knows the real number.

// A case started Copilot when the runner marked it so; older history has only the exit code to go by.
const launched = (c) => c?.launched === true || (c?.launched === undefined && typeof c?.exitCode === 'number');
const sameMonth = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

/** { runs, capped, uncapped, bound } for the calendar month of `now`. `runs` from agent.listRuns(). */
export function creditSummary(runs, { now = new Date() } = {}) {
  let count = 0;
  let capped = 0;
  let bound = 0;
  for (const s of runs ?? []) {
    (s.cases ?? []).forEach((c, i) => {
      if (!launched(c)) return;
      const at = new Date(c.startedAt ?? s.startedAt);
      if (Number.isNaN(at.getTime()) || !sameMonth(at, now)) return;
      count++;
      const cap = s.budget?.cases?.[i]?.configuredCap;
      if (Number.isInteger(cap) && cap > 0) { capped++; bound += cap; }
    });
  }
  return { runs: count, capped, uncapped: count - capped, bound };
}

/** "💳 6 agent-check runs this month · at most 180 credits · /usage has the real number" */
export function meterLine(s) {
  if (!s.runs) return '💳 No agent-check runs this month · the free checks never spend credits';
  const runs = `${s.runs} agent-check run${s.runs === 1 ? '' : 's'} this month`;
  const bound = !s.uncapped ? `at most ${s.bound} credits`
    : s.capped ? `at most ${s.bound} credits for ${s.capped} of them; ${s.uncapped} had no cap the app could verify`
      : 'no cap the app could verify';
  return `💳 ${runs} · ${bound} · /usage has the real number`;
}
