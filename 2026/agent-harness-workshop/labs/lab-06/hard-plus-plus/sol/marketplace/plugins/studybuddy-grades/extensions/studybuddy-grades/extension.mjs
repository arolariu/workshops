// 🧮 studybuddy-grades: a Copilot CLI extension shipped in a plugin (Lab 06 · hard++).
// It gives the MODEL a tool. The model decides when to call it; the handler is plain code: the same input always
// gives the same answer, and the calculation spends no credits. Load it with `copilot --experimental`.
import { joinSession } from '@github/copilot-sdk/extension';

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
// Round UP to 2 decimals (needing 7.241 means needing 7.25), without floating-point noise.
const up2 = (x) => Math.ceil(Math.round(x * 1e6) / 1e4) / 100;

/**
 * The tool's handler. Copilot passes the arguments the model chose, matching `parameters` below.
 * @param {{ grades: { grade: number, weight: number }[], examWeight: number, target?: number }} args
 * @returns {string} what the model reads: the result, or "Error: …" saying what to fix
 */
export function examNeeded(args) {
  const { grades, examWeight, target = 5 } = args ?? {};
  if (!Array.isArray(grades) || !grades.length) return 'Error: "grades" must be a list of { grade, weight } for the items graded so far (get them with the portal\'s get_grades tool).';
  for (const [i, g] of grades.entries()) {
    if (!isNum(g?.grade) || g.grade < 1 || g.grade > 10) return `Error: grades[${i}].grade must be a number from 1 to 10 (got ${JSON.stringify(g?.grade)}).`;
    if (!isNum(g?.weight) || g.weight <= 0 || g.weight > 100) return `Error: grades[${i}].weight must be a percentage above 0 (got ${JSON.stringify(g?.weight)}).`;
  }
  if (!isNum(examWeight) || examWeight <= 0 || examWeight > 100) return `Error: "examWeight" must be the exam's percentage, above 0 (got ${JSON.stringify(examWeight)}).`;
  const total = Math.round((grades.reduce((s, g) => s + g.weight, 0) + examWeight) * 100) / 100;
  if (total !== 100) return `Error: the weights add up to ${total}%, not 100%. Pass every graded item and the exam's weight.`;
  if (!isNum(target) || target < 1 || target > 10) return `Error: "target" must be a final grade from 1 to 10 (got ${JSON.stringify(target)}).`;

  const sum = Math.round(grades.reduce((s, g) => s + g.grade * g.weight, 0) * 100) / 100;
  // The exam rule: passing always needs at least 5 on the exam itself.
  const needed = Math.max(5, up2((target * 100 - sum) / examWeight));
  const reachable = needed <= 10;
  return JSON.stringify({
    target,
    needed,
    reachable,
    answer: reachable
      ? `A final grade of ${target} needs at least ${needed} on the exam.`
      : `A final grade of ${target} is not reachable: it would need ${needed} on the exam, and the maximum is 10.`,
  });
}

await joinSession({
  tools: [
    {
      name: 'studybuddy_exam_needed',
      description: 'Computes the exam grade a student needs for a target final grade, from the grades so far and the '
        + 'exam weight, with the university rules (rounding up, at least 5 on the exam). Call this tool whenever '
        + 'someone asks what they need on an exam, instead of doing the arithmetic yourself.',
      skipPermission: true,
      parameters: {
        type: 'object',
        properties: {
          grades: {
            type: 'array',
            description: 'The items graded so far',
            items: {
              type: 'object',
              properties: { grade: { type: 'number', minimum: 1, maximum: 10 }, weight: { type: 'number', description: 'Percent of the final grade' } },
              required: ['grade', 'weight'],
            },
          },
          examWeight: { type: 'number', description: 'The exam\'s percent of the final grade' },
          target: { type: 'number', minimum: 1, maximum: 10, description: 'The final grade to reach (default 5: pass)' },
        },
        required: ['grades', 'examWeight'],
      },
      handler: async (args) => examNeeded(args),
    },
  ],
});