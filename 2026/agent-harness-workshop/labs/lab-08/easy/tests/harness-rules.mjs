// Generic rules for a harness that was brought together from several places (Lab 08 · easy). They read any learner's
// harness through the course's scanner, so they judge what is there, not how the reference looks.
import { scanHarness, scorecard, maturity, LAYERS, present } from '../../../_harness/scorecard.mjs';
import { contextBudget, measureMcp, tokens } from '../../../_harness/xray.mjs';

export { scanHarness, scorecard, maturity, LAYERS, present, contextBudget, tokens };

export const BUDGET = 2500;
const LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'];
export const atLeast = (level, want) => LEVELS.indexOf(level) >= LEVELS.indexOf(want);

/** The scan, the tool lists of the folder's own local node MCP servers (nothing else is started), the rules and the level. */
export async function audit(dir) {
  const scan = scanHarness(dir);
  const mcpTools = scan.mcp?.servers.length ? await measureMcp(dir, scan.mcp.servers, { localOnly: true, timeout: 5000 }) : {};
  const rules = scorecard(scan, { mcpTools });
  return { scan, mcpTools, rules, level: maturity(rules, scan) };
}

/** The prose lines of a Markdown file with their line numbers, without list markers: no frontmatter, code blocks, comments, headings or table rules. */
export function textLines(text) {
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n');
  let start = 0;
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
    if (end > 0) start = end + 1;
  }
  const out = [];
  let fence = false;
  let comment = false;
  for (let i = start; i < lines.length; i++) {
    let l = lines[i];
    if (/^\s*(```|~~~)/.test(l)) { fence = !fence; continue; }
    if (fence) continue;
    if (comment) {
      if (!l.includes('-->')) continue;
      l = l.slice(l.indexOf('-->') + 3);
      comment = false;
    }
    l = l.replace(/<!--[\s\S]*?-->/g, '');
    if (l.includes('<!--')) { l = l.slice(0, l.indexOf('<!--')); comment = true; }
    if (!l.trim() || /^\s*#/.test(l) || /^\s*\|?\s*:?-{3,}/.test(l)) continue;
    out.push({ n: i + 1, text: l.trim().replace(/^([-*+]|\d+[.)])\s+/, '') });
  }
  return out;
}

/** A rule line without its bullet, Markdown marks, case, spacing and final punctuation. */
export const normalize = (line) => line.replace(/^([-*+]|\d+[.)])\s+/, '').replace(/[`*_]/g, '').toLowerCase().replace(/\s+/g, ' ').replace(/[\s.:;,!]+$/, '').trim();

/** Rules that appear more than once across the instruction files (or twice in one): [{ text, places: ['file:line'] }]. */
export function repeatedRules(scan) {
  const seen = new Map();
  for (const file of scan.instructions) {
    for (const { n, text } of textLines(file.text)) {
      const key = normalize(text);
      if (key.length < 25 || key.split(' ').length < 4) continue;
      if (!seen.has(key)) seen.set(key, { text, places: [] });
      seen.get(key).places.push(`${file.path}:${n}`);
    }
  }
  return [...seen.values()].filter((r) => r.places.length > 1);
}

// "Don't use Jest" is not a Jest rule: a line with a negation states the opposite.
const NEGATED = /\b(no|not|never|don'?t|do not|without|instead of|avoid|nor)\b/i;
const OTHER_RUNNERS = /\b(jest|mocha|vitest|jasmine|ava)\b/i;

/** The known topics two teams' rules tend to disagree on, judged against what the project really does (package.json). */
export function topics(pkg) {
  const script = String(pkg?.scripts?.test ?? '');
  const other = script.match(OTHER_RUNNERS)?.[1];
  const list = [
    {
      id: 'runner',
      title: 'the test runner',
      wrong: other ? /node:test|node --test/i : OTHER_RUNNERS,
      truth: other ? `the project runs ${other} (package.json: "${script}")` : `the project runs \`${script || 'node --test'}\` with the built-in node:test (package.json)`,
    },
    {
      id: 'failing-tests',
      title: 'what to do with a failing test',
      wrong: /\b(test|it|describe)\.(skip|only|todo)\b|\bskip (it|the test|failing tests?|a failing test)\b|\bmark (it|the test) (as )?skipped\b|\b(update|change|adjust|relax|loosen|rewrite) the (expected values?|expectations?|assertions?)\b/i,
      truth: 'the boundary says a failing test is fixed in the code, never skipped or rewritten to pass',
    },
  ];
  if (pkg?.type === 'module') {
    list.splice(1, 0, {
      id: 'modules',
      title: 'the module style',
      wrong: /\brequire\s*\(|module\.exports|\bcommonjs\b/i,
      truth: 'the project uses ES modules ("type": "module" in package.json)',
    });
  }
  return list;
}

/** Instruction lines that state the wrong side of a topic: [{ place, text }]. */
export function contradictions(scan, topic) {
  return scan.instructions.flatMap((file) => textLines(file.text)
    .filter(({ text }) => topic.wrong.test(text) && !NEGATED.test(text))
    .map(({ n, text }) => ({ place: `${file.path}:${n}`, text })));
}

// Words that say little about an agent's job (and the boilerplate of scripted agent teams).
const STOP = new Set(('that this with from when what which your their them they then than into only read never edit edits file files code '
  + 'agent agents name named studybuddy model picked pick script scripts json team runs using used uses each every also just about '
  + 'have does will should after before').split(' '));
const stem = (w) => { const s = w.replace(/(ing|ers|er|es|ed|s)$/, ''); return s.length >= 4 ? s : w; };
export const jobWords = (text) => new Set(String(text ?? '').toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4 && !STOP.has(w)).map(stem));
const nameParts = (name) => String(name ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(stem);

/** Two agents with one job: the same name, names that contain each other with a shared job, or mostly the same job words. */
export function twinAgents(scan) {
  const out = [];
  const agents = scan.agents.map((a) => ({ ...a, words: jobWords(a.description), parts: nameParts(a.name) }));
  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      const [a, b] = [agents[i], agents[j]];
      const shared = [...a.words].filter((w) => b.words.has(w));
      const union = new Set([...a.words, ...b.words]).size || 1;
      const contains = (x, y) => x.parts.length > 0 && x.parts.every((p) => y.parts.includes(p));
      const same = a.name.toLowerCase() === b.name.toLowerCase()
        || ((contains(a, b) || contains(b, a)) && shared.length >= 3)
        || (shared.length >= 3 && shared.length / union >= 0.5);
      const word = new Map(String(a.description).toLowerCase().split(/[^a-z]+/).map((w) => [stem(w), w]));
      if (same) out.push({ a: a.path, b: b.path, shared: shared.map((s) => word.get(s) ?? s) });
    }
  }
  return out;
}

/** HARNESS.md's sections: [{ title, body, line }] for every `##` heading (the body without comments). */
export function sections(md) {
  const out = [];
  const lines = String(md ?? '').replace(/\r\n/g, '\n').split('\n');
  lines.forEach((l, i) => {
    const h = l.match(/^##\s+(.+?)\s*#*\s*$/);
    if (h) out.push({ title: h[1], start: i + 1, body: '' });
    else if (out.length) out[out.length - 1].body += `${l}\n`;
  });
  return out.map((s) => ({ ...s, body: textLines(s.body).map((l) => l.text).join('\n') }));
}

export const HARNESS_SECTIONS = [
  { id: 'owner', title: 'Owner', re: /\bowner/i },
  { id: 'layers', title: 'Layers', re: /\blayers?\b|inventory/i },
  { id: 'trust', title: 'Trust boundaries', re: /trust|boundar/i },
  { id: 'budget', title: 'Budget', re: /budget|cost/i },
  { id: 'change', title: 'Changing the harness', re: /chang/i },
  { id: 'rollback', title: 'Rollback', re: /roll\s*-?\s*back/i },
];

/** { [id]: section | null } for the six sections HARNESS.md needs. */
export function harnessSections(md) {
  const all = sections(md);
  return Object.fromEntries(HARNESS_SECTIONS.map((s) => [s.id, all.find((x) => s.re.test(x.title)) ?? null]));
}

// How the Layers section can name each layer.
export const LAYER_WORDS = {
  instructions: /AGENTS\.md|instruction/i,
  skills: /skill/i,
  agents: /\bagents?\b|\.agent\.md/i,
  mcp: /\bMCP\b/i,
  hooks: /\bhooks?\b|guard/i,
  distribution: /\bAPM\b|apm\.yml|plugin/i,
  workflows: /workflow/i,
};
