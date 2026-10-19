// 🧮 studybuddy-grades: a Copilot CLI extension shipped in a plugin (Lab 06 · hard++).
// It gives the MODEL a tool. The model decides when to call it; the handler is plain code: the same input always
// gives the same answer, and the calculation spends no credits. Load it with `copilot --experimental`.
import { joinSession } from '@github/copilot-sdk/extension';

/**
 * The tool's handler. Copilot passes the arguments the model chose, matching `parameters` below.
 * @param {{ grades: { grade: number, weight: number }[], examWeight: number, target?: number }} args
 * @returns {string} what the model reads: the result, or "Error: …" saying what to fix
 */
export function examNeeded(args) {
  // TODO(M3): validate the input (say what's wrong in an "Error: …" string, never throw), then compute the exam
  // grade needed for `target` (default 5), rounded UP to 2 decimals, with the exam rule (at least 5 on the exam).
  return 'studybuddy_exam_needed is not written yet.';
}

await joinSession({
  tools: [
    {
      name: 'studybuddy_exam_needed',
      // TODO(M3): a description that tells the model when to call this tool, and not to do the maths itself.
      description: 'Exam grade.',
      // TODO(M3): a JSON Schema for the arguments: grades, examWeight, target.
      parameters: { type: 'object', properties: {} },
      handler: async (args) => examNeeded(args),
    },
  ],
});