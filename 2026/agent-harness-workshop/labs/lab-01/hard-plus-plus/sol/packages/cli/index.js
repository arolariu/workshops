// @studybuddy/cli: the `studybuddy` command line, as a function the tests can call.
import { weightedAverage } from '../../grades.js';
import { upcoming } from '../../deadlines.js';

/**
 * Run one command. It never calls process.exit and never prints: it returns the exit code and the text.
 * @param {string[]} argv - e.g. ['due', '2026-10-15'] or ['average', '8:60', '6:40']
 * @param {{ assignments?: { id: string, title: string, due: string, done: boolean }[] }} [data]
 * @returns {{ code: number, out: string }}
 */
export function run(argv, { assignments = [] } = {}) {
  const [command, ...args] = argv;
  if (command === 'due') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args[0] ?? '')) return { code: 1, out: 'Usage: studybuddy due <YYYY-MM-DD>' };
    const due = upcoming(assignments, args[0]);
    return { code: 0, out: due.map((a) => `${a.due}  ${a.title}`).join('\n') || 'Nothing due in the next 7 days.' };
  }
  if (command === 'average') {
    const items = args.map((a) => a.split(':').map(Number)).map(([grade, weight]) => ({ grade, weight }));
    if (!items.length || items.some((i) => !Number.isFinite(i.grade) || !Number.isFinite(i.weight))) {
      return { code: 1, out: 'Usage: studybuddy average <grade:weight>...' };
    }
    return { code: 0, out: String(weightedAverage(items)) };
  }
  return { code: 1, out: `Unknown command: ${command ?? '(none)'}. Try: due, average` };
}
