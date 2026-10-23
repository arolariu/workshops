// Free checks for Lab 02 · hard++: a library that routes. The 24-request real run is yours to start (it spends
// credits); these checks run the lexical pre-check, the metrics and the runner with a fake Copilot, all deterministic.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SIX, WHEN, MIN_SCORE, library as refLibrary, score as refScore, readSkills, lexicalEval } from './helpers.mjs';

const ROUTE = 'evals/routing/route.mjs';
const METRICS = 'evals/routing/metrics.mjs';
const RUN = 'evals/routing/run.mjs';
const fixture = (t, name) => JSON.parse(fs.readFileSync(path.join(t.exDir, 'tests', 'fixtures', name), 'utf8'));
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;
const n2 = (x) => x.toFixed(2);
const TOY = [
  { name: 'pizza-order', description: 'Order a pizza from the shop. Use when the user wants pizza delivered.' },
  { name: 'pizza-recipe', description: 'Bake a pizza at home from a recipe. Use when the user wants to cook pizza.' },
  { name: 'weather', description: 'Tell the weather forecast for a city. Use when the user asks about rain or sun.' },
];
/** A copy of your folder, and its run.mjs loaded from there (so the runner writes into the copy, never into yours). */
async function runner(t) {
  const copy = t.copy(t.tmp());
  const file = path.join(copy, ...RUN.split('/'));
  if (!fs.existsSync(file)) t.fail(`\`${RUN}\` doesn't exist yet.`);
  try {
    return { copy, mod: await import(`${pathToFileURL(file).href}?v=${Date.now()}${Math.random()}`) };
  } catch (e) {
    return t.fail(`\`${RUN}\` could not be loaded: ${e.message.split('\n')[0]}`);
  }
}

export default (t) => [
  // M1 · Six skills, six canaries
  t.check('Six skills, each named after its folder, each saying what and when', () => {
    const skills = readSkills(t);
    const missing = SIX.filter((n) => !skills.some((s) => s.folder === n));
    if (missing.length) return `Missing from .github/skills/: ${missing.join(', ')}.`;
    for (const s of skills.filter((x) => SIX.includes(x.folder))) {
      if (s.name !== s.folder) return `${s.folder}/SKILL.md is named "${s.name}"; name it after its folder.`;
      if (s.description.length < 40 || !WHEN.test(s.description)) return `${s.folder}: the description should say what it does and when to use it ("Use when …").`;
    }
    return true;
  }, { milestone: 'M1' }),
  t.check('Every skill ends its answers with its own canary, and only its own', () => {
    const skills = readSkills(t).filter((s) => SIX.includes(s.folder));
    const without = skills.filter((s) => !s.body.split('\n').some((l) => l.includes(`[skill:${s.folder}]`) && /answer|reply|respon/i.test(l))).map((s) => s.folder);
    if (without.length) return `No [skill:…] tag in: ${without.join(', ')}. Add a line such as "When you use this skill, end your answer with the line \`[skill:<name>]\`."`;
    const wrong = skills.flatMap((s) => [...s.body.matchAll(/\[skill:([a-z0-9-]+)\]/g)].map((m) => m[1]).filter((n) => n !== s.folder).map((n) => `${s.folder} mentions [skill:${n}]`));
    return !wrong.length || `A skill may only print its own tag: ${wrong.join('; ')}. Otherwise the eval can't tell which one loaded.`;
  }, { milestone: 'M1' }),
  t.check('Copilot loads all six', () => {
    const r = t.copilot(['skill', 'list', '--json']);
    let list = [];
    try { list = JSON.parse(r.stdout); } catch { return `Could not read the skill list: ${r.all.trim().slice(0, 160)}`; }
    const missing = SIX.filter((n) => !list.some((s) => s.name === n && s.source === 'project'));
    return !missing.length || `Copilot does not list these as project skills: ${missing.join(', ')}. Is their frontmatter valid YAML (no ": " inside an unquoted description)?`;
  }, { milestone: 'M1', needs: ['copilot'] }),

  // M2 · The lexical pre-check
  t.check('score() adds up the weights of the words a request shares with a skill', async () => {
    const { library, score } = await t.import(ROUTE);
    const lib = library(TOY);
    const ref = refLibrary(TOY);
    const cases = [['How do I bake pizza dough at home?', 1], ['Order pizzas for the team', 0], ['Tell me a joke', 2], ['What is 2 plus 2?', 0]];
    for (const [request, i] of cases) {
      const got = score(request, lib.skills[i], lib);
      const want = refScore(request, ref.skills[i], ref);
      if (typeof got !== 'number' || Math.abs(got - want) > 1e-6) return t.fail(`score("${request}", ${TOY[i].name}) is wrong.`, { expected: Number(want.toFixed(4)), actual: typeof got === 'number' ? Number(got.toFixed(4)) : got });
    }
    return true;
  }, { milestone: 'M2' }),
  t.check('route() picks the best skill, or null below MIN_SCORE or on a tie', async () => {
    const { library, route, MIN_SCORE: min } = await t.import(ROUTE);
    if (min !== MIN_SCORE) return `Keep MIN_SCORE at ${MIN_SCORE} (the checks grade your descriptions with it).`;
    const lib = library(TOY);
    const cases = [
      ['I want a pizza delivered to my office', 'pizza-order', 'the best score wins'],
      ['How do I bake pizza dough at home?', 'pizza-recipe', 'the best score wins'],
      ['Is there rain in the forecast for Paris?', 'weather', 'the best score wins'],
      ['Order pizzas for the team', 'pizza-order', '"pizzas" counts as "pizza"'],
      ['pizza', null, 'a tie (and below MIN_SCORE)'],
      ['Tell me a joke', null, 'one shared word, below MIN_SCORE'],
      ['Some pizza at home, delivered', null, 'a tie for first place, above MIN_SCORE'],
    ];
    const wrong = cases.filter(([r, want]) => route(r, lib) !== want).map(([r, want, why]) => `"${r}" → ${route(r, lib)} (expected ${want}: ${why})`);
    return !wrong.length || `route() is wrong for: ${wrong.join('; ')}.`;
  }, { milestone: 'M2' }),

  // M3 · Precision and recall
  t.check('canaries() reads the [skill:name] tags in an answer', async () => {
    const { canaries } = await t.import(METRICS);
    const cases = [
      ['Here are your notes.\n[skill:release-notes]', ['release-notes']],
      ['[skill:explain-error] … [skill:write-tests] … [skill:explain-error]', ['explain-error', 'write-tests']],
      ['Harness check: AGENTS.md loaded\n[skill:write-docs]\n', ['write-docs']],
      ['No skill here. [skill: spaced] [Skill:Upper] [skill:]', []],
      ['', []],
    ];
    const wrong = cases.filter(([a, want]) => JSON.stringify(canaries(a)) !== JSON.stringify(want)).map(([a, want]) => `${JSON.stringify(a.slice(0, 40))} → ${JSON.stringify(canaries(a))} (expected ${JSON.stringify(want)})`);
    return !wrong.length || `canaries() is wrong for: ${wrong.join('; ')}.`;
  }, { milestone: 'M3' }),
  t.check('metrics() gives the precision and recall of the worked example', async () => {
    const { metrics } = await t.import(METRICS);
    const { names, results } = fixture(t, 'routing-results.json');
    const want = fixture(t, 'routing-metrics.json');
    const m = metrics(results, names);
    for (const w of want.perSkill) {
      const s = (m?.perSkill ?? []).find((x) => x.skill === w.skill);
      if (!s) return `metrics().perSkill has no entry for "${w.skill}".`;
      const bad = Object.keys(w).filter((k) => k !== 'skill' && !near(s[k], w[k]));
      if (bad.length) return t.fail(`${w.skill} is wrong for: ${bad.join(', ')} (tests/fixtures/routing-metrics.json shows the working).`, { expected: Object.fromEntries(bad.map((k) => [k, w[k]])), actual: Object.fromEntries(bad.map((k) => [k, s[k]])) });
    }
    if (!near(m.macro?.precision, want.macro.precision) || !near(m.macro?.recall, want.macro.recall)) return t.fail('The macro averages are wrong: the mean over the skills.', { expected: want.macro, actual: m.macro });
    if (m.none?.total !== want.none.total || m.none?.left !== want.none.left) return t.fail('none counts the requests that need no skill, and how many loaded none.', { expected: want.none, actual: m.none });
    const ids = (m.misses ?? []).map((x) => x.id);
    return JSON.stringify(ids) === JSON.stringify(want.misses) || t.fail('misses: every request whose got isn\'t exactly [expect] (or [] for no skill), in order.', { expected: want.misses, actual: ids });
  }, { milestone: 'M3' }),
  t.check('report() shows every skill, the macro row, the no-skill line and the misses', async () => {
    const { metrics, report } = await t.import(METRICS);
    const { names, results } = fixture(t, 'routing-results.json');
    const md = String(report(metrics(results, names), { mode: 'lexical' }) ?? '');
    const rows = md.split('\n');
    const missing = [];
    for (const [skill, p, r] of [['alpha', '0.50', '0.33'], ['beta', '0.67', '1.00'], ['gamma', '0.67', '1.00']]) {
      if (!rows.some((l) => l.includes(`| ${skill} |`) && l.includes(p) && l.includes(r))) missing.push(`a row for ${skill} with ${p} and ${r}`);
    }
    if (!rows.some((l) => /macro/i.test(l) && l.includes('0.61') && l.includes('0.78'))) missing.push('a macro row with 0.61 and 0.78');
    if (!/1 of 2/.test(md)) missing.push('"1 of 2" requests that need no skill loaded none');
    const noMiss = ['r2', 'r3', 'r5', 'r8'].filter((id) => !new RegExp(`\\b${id}\\b`).test(md));
    if (noMiss.length) missing.push(`the misses (${noMiss.join(', ')})`);
    return !missing.length || `The report needs: ${missing.join('; ')}.`;
  }, { milestone: 'M3' }),

  // M4 · The eval runner
  t.check('node evals/routing/run.mjs writes the lexical report for your six skills', async () => {
    const { copy, mod } = await runner(t);
    if (typeof mod.main !== 'function') return `${RUN} should export main(argv, { ask, root, log }).`;
    const code = await mod.main([], { root: copy, log: () => {}, ask: () => t.fail('The lexical run must not ask Copilot.') });
    if (code !== 0) return `main([]) returned ${code}; the lexical run returns 0.`;
    const dir = path.join(copy, 'evals', 'routing');
    if (!fs.existsSync(path.join(dir, 'report.md')) || !fs.existsSync(path.join(dir, 'results.json'))) return 'main([]) should write evals/routing/report.md and results.json.';
    const requests = JSON.parse(fs.readFileSync(path.join(dir, 'requests.json'), 'utf8'));
    const results = JSON.parse(fs.readFileSync(path.join(dir, 'results.json'), 'utf8'));
    if (!Array.isArray(results) || results.length !== requests.length) return `results.json should have one entry per request (${requests.length}).`;
    const { m } = lexicalEval(readSkills(t), requests);
    const md = fs.readFileSync(path.join(dir, 'report.md'), 'utf8');
    const macro = md.split('\n').find((l) => /macro/i.test(l)) ?? '';
    return (macro.includes(n2(m.macro.precision)) && macro.includes(n2(m.macro.recall))) || t.fail('The report\'s macro row doesn\'t match the pre-check on your skills.', { expected: `precision ${n2(m.macro.precision)}, recall ${n2(m.macro.recall)}`, actual: macro.trim() || '(no macro row)' });
  }, { milestone: 'M4' }),
  t.check('realArgs(): one prompt, no questions, read-only, capped', async () => {
    const { realArgs } = await t.import(RUN);
    const a = (realArgs?.('Export my grades to a CSV file.', { credits: 2 }) ?? []).map(String);
    const has = (flag, value) => a.includes(`${flag}=${value}`) || a.some((x, i) => x === flag && a[i + 1] === value);
    const missing = [];
    if (a[a.indexOf('-p') + 1] !== 'Export my grades to a CSV file.' || !a.includes('-p')) missing.push('-p <request>');
    if (!a.includes('--no-ask-user')) missing.push('--no-ask-user');
    if (!has('--max-ai-credits', '2')) missing.push('--max-ai-credits=2');
    if (!has('--deny-tool', 'write')) missing.push('--deny-tool=write');
    if (!has('--deny-tool', 'shell')) missing.push('--deny-tool=shell');
    if (missing.length) return `realArgs() is missing: ${missing.join(', ')}.`;
    const risky = a.filter((x) => /^--(allow-all|yolo|allow-all-tools|allow-all-paths|dynamic-retrieval)\b/.test(x) || /^--allow-tool=(write|shell)/.test(x));
    return !risky.length || `Never in an eval: ${risky.join(', ')} (--dynamic-retrieval even changes your settings for good).`;
  }, { milestone: 'M4' }),
  t.check('--real refuses without a cap, and above 3 credits a request without --yes', async () => {
    const { copy, mod } = await runner(t);
    let asked = 0;
    const code = await mod.main(['--real'], { root: copy, log: () => {}, ask: () => { asked++; return ''; } });
    if (asked) return `main(['--real']) asked Copilot ${asked} time(s) without a credit cap.`;
    if (code !== 2) return `main(['--real']) without --max-credits should return 2, got ${code}.`;
    const big = await mod.main(['--real', '--max-credits', '10'], { root: copy, log: () => {}, ask: () => { asked++; return ''; } });
    if (asked) return `main(['--real', '--max-credits', '10']) asked Copilot without --yes: that's up to 240 credits.`;
    return big === 2 || `Above 3 credits a request, refuse (return 2) unless --yes is given; got ${big}.`;
  }, { milestone: 'M4' }),
  t.check('--real asks every request once, reads the canaries, and writes report-real.md', async () => {
    const { copy, mod } = await runner(t);
    const requests = JSON.parse(fs.readFileSync(path.join(copy, 'evals', 'routing', 'requests.json'), 'utf8'));
    const byText = new Map(requests.map((r) => [r.request, r]));
    const asked = [];
    const firstNone = requests.find((r) => r.expect === null);
    const ask = async (request, opts) => {
      asked.push({ request, credits: opts?.credits });
      const r = byText.get(request);
      if (r === firstNone) return 'Here you go.\n[skill:write-docs]';
      return r?.expect ? `Done.\nHarness check: AGENTS.md loaded\n[skill:${r.expect}]` : 'Just an answer, no skill needed.';
    };
    const code = await mod.main(['--real', '--max-credits', '1'], { root: copy, log: () => {}, ask });
    if (code !== 0) return `main(['--real', '--max-credits', '1']) returned ${code}.`;
    if (asked.length !== requests.length || new Set(asked.map((a) => a.request)).size !== requests.length) return `Ask each of the ${requests.length} requests exactly once (asked ${asked.length} time(s)).`;
    if (asked.some((a) => a.credits !== 1)) return 'Pass the cap to ask(request, { credits, cwd }): every request has its own --max-ai-credits.';
    const file = path.join(copy, 'evals', 'routing', 'report-real.md');
    if (!fs.existsSync(file)) return 'A real run writes evals/routing/report-real.md (and results-real.json), so it never overwrites the lexical report.';
    const md = fs.readFileSync(file, 'utf8');
    const row = md.split('\n').find((l) => l.includes('| write-docs |')) ?? '';
    return (row.includes('0.75') && row.includes('1.00') && /5 of 6/.test(md)) || `With the fake answers, write-docs has precision 0.75 and recall 1.00, and 5 of 6 no-skill requests load none. The report says: ${row.trim() || '(no write-docs row)'}`;
  }, { milestone: 'M4' }),

  // M5 · The right skill loads
  t.check('The pre-check routes the 24 requests well (precision and recall)', () => {
    const requests = fixture(t, 'requests.json');
    const skills = readSkills(t).filter((s) => SIX.includes(s.folder));
    if (skills.length !== 6) return 'First, the six skills (M1).';
    const { m, results } = lexicalEval(skills, requests);
    const problems = [];
    if (m.macro.precision < 0.85) problems.push(`macro precision ${n2(m.macro.precision)} (needs 0.85)`);
    if (m.macro.recall < 0.85) problems.push(`macro recall ${n2(m.macro.recall)} (needs 0.85)`);
    for (const s of m.perSkill) if (s.precision < 2 / 3 - 1e-9 || s.recall < 2 / 3 - 1e-9) problems.push(`${s.skill} P ${n2(s.precision)} R ${n2(s.recall)} (each needs 0.67)`);
    if (m.none.left < 5) problems.push(`only ${m.none.left} of ${m.none.total} no-skill requests load none (needs 5)`);
    if (!problems.length) return true;
    const misses = results.filter((r) => (r.expect ?? null) !== (r.got[0] ?? null)).slice(0, 4).map((r) => `${r.id} → ${r.got[0] ?? 'none'} (expected ${r.expect ?? 'none'})`);
    return `${problems.join('; ')}. Misses: ${misses.join(', ')}. Run node evals/routing/run.mjs and read report.md.`;
  }, { milestone: 'M5' }),
  t.check('All six descriptions fit in 1,500 characters together', () => {
    const skills = readSkills(t).filter((s) => SIX.includes(s.folder));
    const total = skills.reduce((n, s) => n + s.description.length, 0);
    const longest = [...skills].sort((a, b) => b.description.length - a.description.length)[0];
    return total <= 1500 || `The six descriptions are ${total} characters together (about ${Math.round(total / 4)} tokens, in the context on every turn); keep them to 1,500. The longest: ${longest?.folder} (${longest?.description.length}).`;
  }, { milestone: 'M5' }),

  // M6 · Split the broad skill
  t.check('write-docs loads light: a short SKILL.md that points to references/', () => {
    const file = '.github/skills/write-docs/SKILL.md';
    const s = t.need(file, 'write-docs is gone: keep the skill, and split it.');
    if (s.length > 2000) return `write-docs/SKILL.md is ${s.length} characters (about ${Math.round(s.length / 4)} tokens, all loaded every time it's used). Keep it under 2,000 and move the details to references/.`;
    const links = [...new Set([...s.matchAll(/references\/([\w.-]+\.md)/g)].map((m) => m[1]))];
    if (links.length < 3) return `SKILL.md links ${links.length} reference file(s); give each kind of document its own (references/readme.md, …).`;
    const missing = links.filter((f) => !t.exists(`.github/skills/write-docs/references/${f}`));
    if (missing.length) return `These references don't exist: ${missing.join(', ')}.`;
    const unclear = links.filter((f) => !s.split('\n').some((l) => l.includes(`references/${f}`) && /\b(when|if|only)\b/i.test(l)));
    return !unclear.length || `Say when to read each reference, on the line that links it ("read references/x.md when …"): ${unclear.join(', ')}.`;
  }, { milestone: 'M6' }),
  t.check('Nothing lost: README, JSDoc and decision records each have a reference', () => {
    const files = t.files('.github/skills/write-docs/references').filter((f) => f.endsWith('.md'));
    const texts = files.map((f) => t.read(f) ?? '');
    const thin = files.filter((f, i) => texts[i].split('\n').filter((l) => l.trim()).length < 5);
    if (thin.length) return `These references are nearly empty: ${thin.join(', ')}. Move the guidance there, don't drop it.`;
    const topics = [['README', /readme/i], ['JSDoc', /jsdoc/i], ['architecture decision records', /decision record|\bADR\b/i]];
    const lost = topics.filter(([, re]) => !texts.some((x) => re.test(x))).map(([n]) => n);
    return !lost.length || `No reference covers: ${lost.join(', ')}.`;
  }, { milestone: 'M6' }),
  t.check('write-docs no longer claims other skills\' jobs', () => {
    const fm = t.frontmatter('.github/skills/write-docs/SKILL.md');
    const OTHERS = /\bchangelogs?\b|\brelease notes?\b|\bcommit messages?\b|\bexplain\w*\b[^.]*?\b(errors?|crash(es)?)\b|\bstack traces?\b|\bcrash(es)?\b|\bexport(s|ing)?\b/gi;
    const claims = String(fm.data.description ?? '').match(OTHERS);
    if (claims) return `The description still claims: ${[...new Set(claims.map((c) => c.toLowerCase()))].join(', ')}. Those requests belong to release-notes, explain-error and csv-export.`;
    const files = ['.github/skills/write-docs/SKILL.md', ...t.files('.github/skills/write-docs/references')];
    const sections = files.flatMap((f) => (t.read(f) ?? '').split('\n').filter((l) => /^#{1,4}\s/.test(l) && new RegExp(OTHERS.source, 'i').test(l)).map((l) => `${f}: ${l.trim()}`));
    return !sections.length || `These sections teach another skill's job; delete them: ${sections.join('; ')}.`;
  }, { milestone: 'M6' }),
];
