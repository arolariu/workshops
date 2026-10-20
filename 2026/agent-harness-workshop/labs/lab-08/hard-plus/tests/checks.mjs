// Free checks for Lab 08 · hard+: change control. They read your workflows, CODEOWNERS, template and changelog with
// the kit's YAML parser and the scorecard's own rules (any job layout, any pattern style), and they run your
// release and rollback scripts in throwaway git repositories with a fixed configuration: no network, no global git
// config, never this workshop's repository. Nothing here starts Copilot.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  ancestors, changelog, checklist, codeowners, commitAll, compareSemver, EVENTS, eventsOf, filesUnder, front, gatesHarness,
  git, gitEnv, gitTry, harnessFiles, hookScripts, jsonOut, maturity, nextVersion, norm, ownersOf, parseYaml, readIn, readOnly,
  repoOf, restricts, SAFE_OUTPUT_SETTINGS, scanHarness, scorecard, script, sections, SEMVER, some, stepRuns, stepsOf, tail, toldScorecard,
  triggers, unpinned, unrestrictedBash, walk, writeIn,
} from './helpers.mjs';

const CI = '.github/workflows/harness-ci.yml';
const REVIEW = '.github/workflows/harness-review.md';
const ciOf = (t) => t.yaml(CI, `\`${CI}\` doesn't exist yet: the starter had a skeleton.`);
const harnessJson = (t) => t.json('harness.json', '`harness.json` doesn\'t exist yet: the starter had one.');
const EVAL_FREE = /scripts\/eval\.mjs\b[^\n]*--from\b/;
const EVAL_REAL = (run) => /scripts\/eval\.mjs\b/.test(run) && !/--(from|dry-run|ablate)\b/.test(run);
const CHECKS = [
  ['the scorecard (node scripts/harness-check.mjs)', (s) => /harness-check\.mjs\b/.test(s.run)],
  ['the attack pack (node scripts/attack.mjs)', (s) => /scripts\/attack\.mjs\b/.test(s.run)],
  ['the self-tests (node --test)', (s) => /\bnode\s+--test\b|\bnpm\s+(run\s+)?test\b|\bnpm\s+t\b/.test(s.run)],
  ['the eval self-test (node scripts/eval.mjs --from evals/runs/full --baseline evals/baseline.json)', (s) => EVAL_FREE.test(s.run) && /--baseline\b/.test(s.run)],
];
const sameText = (a, b) => a != null && b != null && norm(a).trim() === norm(b).trim();

/** A repository with the tags v1.0.0 and v1.1.0; between them, agent-facing and change-control files changed. */
function twoTags(t) {
  const env = gitEnv(t);
  const dir = repoOf(t, env);
  const meta = (() => { try { return JSON.parse(readIn(dir, 'harness.json')); } catch { return {}; } })();
  writeIn(dir, 'harness.json', `${JSON.stringify({ ...meta, version: '1.0.0' }, null, 2)}\n`);
  writeIn(dir, 'CHANGELOG.md', '# Changelog\n\n## [Unreleased]\n\n## [1.0.0] - 2026-10-01\n### Added\n- The harness.\n');
  commitAll(dir, 'Release 1.0.0', env);
  git(dir, ['tag', '-a', 'v1.0.0', '-m', '1.0.0'], env);
  const instr = walk(dir).find((f) => /^\.github\/instructions\/.+\.instructions\.md$/.test(f)) ?? null;
  const hook = walk(dir).find((f) => /^\.github\/hooks\/.+\.m?js$/.test(f)) ?? null;
  const skill = '.github/skills/study-plan/SKILL.md';
  writeIn(dir, 'AGENTS.md', `${readIn(dir, 'AGENTS.md') ?? '# AGENTS.md\n'}- Always answer in one sentence.\n`);
  writeIn(dir, skill, '---\nname: study-plan\ndescription: Plans a study week. Use when asked for a study plan.\n---\nList the deadlines, then plan.\n');
  if (instr) fs.rmSync(path.join(dir, ...instr.split('/')));
  if (hook) writeIn(dir, hook, `${readIn(dir, hook)}\n// changed in 1.1.0\n`);
  writeIn(dir, 'harness.json', `${JSON.stringify({ ...meta, version: '1.1.0' }, null, 2)}\n`);
  writeIn(dir, 'CHANGELOG.md', '# Changelog\n\n## [Unreleased]\n\n## [1.1.0] - 2026-10-10\n### Added\n- A study-plan skill.\n\n## [1.0.0] - 2026-10-01\n### Added\n- The harness.\n');
  writeIn(dir, CI, `${readIn(dir, CI) ?? 'name: Harness CI\n'}# changed in 1.1.0\n`);
  commitAll(dir, 'Release 1.1.0', env);
  git(dir, ['tag', '-a', 'v1.1.0', '-m', '1.1.0'], env);
  return { dir, env, instr, hook, skill };
}
const KEEP = ['CHANGELOG.md', 'harness.json', CI];

/** A repository at version `version` with release notes waiting, ready for a release. */
function releasable(t, { top } = {}) {
  const env = gitEnv(t);
  const dir = top ? path.join(top, 'team', 'harness') : t.tmp();
  repoOf(t, env, { dir, top: top ?? dir });
  return { dir, env, meta: JSON.parse(readIn(dir, 'harness.json') ?? '{}') };
}
const needVersion = (t) => {
  const v = harnessJson(t).version;
  if (!SEMVER.test(String(v))) t.fail(`harness.json's version must be a semantic version (MAJOR.MINOR.PATCH) first, not "${v}" (M3's first check).`);
  return String(v);
};

export default (t) => [
  // ---------- M1 · CI gate ----------
  t.check('harness-ci.yml runs on harness pull requests (and on labels) and on pushes to main', () => {
    const wf = ciOf(t);
    const on = eventsOf(wf.on);
    if (!Object.hasOwn(on, 'pull_request')) return `${CI} doesn't run on pull_request yet (its \`on:\` has ${Object.keys(on).join(', ') || 'nothing'}).`;
    if (!gatesHarness(wf.on)) return `Its pull_request \`paths\` let no harness file through: the scorecard wouldn't call it a gate.`;
    const pr = on.pull_request ?? {};
    if (!(Array.isArray(pr.types) ? pr.types : pr.types ? [pr.types] : []).map(String).includes('labeled')) return 'Add `types: [opened, synchronize, reopened, labeled]` under pull_request: without `labeled`, adding the run-evals label starts nothing.';
    if (!Object.hasOwn(on, 'push')) return 'Run it on pushes to main too (`push: branches: [main]`): main always gets the real evals.';
    const branches = on.push?.branches == null ? null : [on.push.branches].flat().map(String);
    if (branches && !branches.some((b) => b === 'main' || b === '**' || b === '*')) return `Its push trigger is for ${branches.join(', ')}, not main.`;
    const files = harnessFiles(t.dir);
    const missedPr = files.filter((f) => !triggers(pr, f));
    const missedPush = files.filter((f) => !triggers(on.push, f));
    if (missedPr.length) return `A pull request that changes these harness files wouldn't run the gate: ${some(missedPr)}. Widen \`paths\`.`;
    return !missedPush.length || `A push to main that changes these harness files wouldn't run it: ${some(missedPush)}.`;
  }, { milestone: 'M1' }),

  t.check('Every time: the scorecard (L4 or better), the attack pack, the self-tests and the eval self-test', () => {
    const wf = ciOf(t);
    const steps = stepsOf(wf);
    const gated = new Set(Object.entries(wf.jobs ?? {}).filter(([, j]) => restricts(j?.if)).map(([n]) => n));
    const always = steps.filter((s) => !s.cond && ![...ancestors(wf, s.job)].some((a) => gated.has(a)));
    const missing = CHECKS.filter(([, test]) => !always.some(test)).map(([what]) => what);
    if (missing.length) return `These don't run on every pull request yet (a step without an \`if\`, in a job without one): ${missing.join('; ')}.`;
    const score = always.find(CHECKS[0][1]);
    const low = score.run.match(/--min\s+(L[0-3])\b/);
    if (low) return `The scorecard step accepts ${low[1]}: the gate needs L4 Guarded or better (\`--min L4\`, the default).`;
    return toldScorecard(score) || 'Outside the workshop harness-check.mjs can\'t find the scorecard by walking up: set `HARNESS_SCORECARD` on the step (or pass `--scorecard`), pointing at a pinned checkout of the workshop\'s labs/_harness/scorecard.mjs.';
  }, { milestone: 'M1' }),

  t.check('Real evals: against the baseline, within a budget, only when someone adds the run-evals label or on main', () => {
    const wf = ciOf(t);
    const real = stepsOf(wf).filter((s) => EVAL_REAL(s.run));
    if (!real.length) return 'No step runs scripts/eval.mjs for real yet (without --from or --dry-run).';
    const problems = real.flatMap((s) => {
      const p = [];
      if (!/--baseline\s+\S/.test(s.run)) p.push('compare with the baseline (`--baseline evals/baseline.json`)');
      const budget = s.run.match(/--budget[\s=]+(\d+(?:\.\d+)?)/);
      if (!budget || !(Number(budget[1]) > 0)) p.push('cap the credits (`--budget <credits>`)');
      for (const [what, want, github] of EVENTS) {
        let runs;
        try { runs = stepRuns(wf, s, { github }); } catch (e) { p.push(`have an \`if:\` the checks can read (${e.message})`); break; }
        if (runs !== want) {
          p.push(want ? `run when ${what}` : `not run when ${what}: a person decides when to spend credits, and adding the label is that decision (use \`github.event.action == 'labeled' && github.event.label.name == 'run-evals'\`, not "the pull request has the label")`);
          break;
        }
      }
      return p.map((x) => `job ${s.job}: ${x}`);
    });
    return !problems.length || `The real eval step needs to ${problems.join('; ')}.`;
  }, { milestone: 'M1' }),

  t.check('Locked down: read-only permissions, a timeout on every job, concurrency that never cancels a paid run, actions pinned to SHAs', () => {
    const wf = ciOf(t);
    const problems = [];
    if (!readOnly(wf.permissions)) problems.push(`top-level \`permissions\` must be read-only (\`contents: read\`)${wf.permissions == null ? ': without it the token may write' : ''}`);
    for (const [name, job] of Object.entries(wf.jobs ?? {})) {
      if (job?.permissions != null && !readOnly(job.permissions)) problems.push(`job ${name} asks for write permissions`);
      if (!(Number(job?.['timeout-minutes']) > 0)) problems.push(`job ${name} needs \`timeout-minutes\``);
    }
    const jobs = Object.values(wf.jobs ?? {});
    const group = (c) => (typeof c === 'string' ? c : c?.group);
    const cancels = (c) => c != null && typeof c === 'object' && c['cancel-in-progress'] != null && c['cancel-in-progress'] !== false;
    if (!group(wf.concurrency) && !(jobs.length && jobs.every((j) => group(j?.concurrency)))) problems.push('add a `concurrency` group (on the workflow, or on every job), so a new push stops the old free run');
    const paid = [...new Set(stepsOf(wf).filter((s) => EVAL_REAL(s.run)).map((s) => s.job))];
    if (paid.length && cancels(wf.concurrency)) problems.push('a workflow-level `cancel-in-progress` cancels the paid eval job too, after it spent credits: move the concurrency onto the jobs (the gate may cancel, the evals job queues)');
    for (const j of paid) if (cancels(wf.jobs[j]?.concurrency)) problems.push(`job ${j} spends credits: its concurrency must queue (\`cancel-in-progress: false\`), never cancel a run halfway`);
    const loose = unpinned(wf);
    if (loose.length) problems.push(`pin to a full commit SHA: ${some(loose)}`);
    return !problems.length || `${CI}: ${problems.join('; ')}.`;
  }, { milestone: 'M1' }),

  t.check('scripts/harness-check.mjs finds the scorecard only where you tell it (outside the workshop)', () => {
    const env = gitEnv(t);
    const dir = t.copy(t.tmp());
    const lost = script(t, dir, 'scripts/harness-check.mjs', [], { ...env, HARNESS_SCORECARD: '' }, 60000);
    if (lost.code !== 2) return `Without a scorecard it should exit 2 and say where to point it; it exited ${lost.code}: ${tail(lost.all)}`;
    const found = script(t, dir, 'scripts/harness-check.mjs', ['--min', 'L4'], env, 60000);
    return (found.code === 0 && /L4|L5/.test(found.stdout)) || `With HARNESS_SCORECARD set it should print the level and exit 0 (L4 or better); it exited ${found.code}: ${tail(found.all)}`;
  }, { milestone: 'M1', timeout: 90000 }),

  t.check('The X-ray shows L5 Governed', () => {
    const scan = scanHarness(t.dir);
    const rules = scorecard(scan);
    const m = maturity(rules, scan);
    if (m.level === 'L5') return true;
    const failing = rules.filter((r) => r.ok === false).map((r) => `${r.id}: ${r.message}`);
    return `The harness is at ${m.level} ${m.name}. ${failing.length ? `Failing: ${some(failing, 3)}` : ''}`;
  }, { milestone: 'M1' }),

  // ---------- M2 · Ownership ----------
  t.check('CODEOWNERS gives every harness file an owner, itself included, and names the owner from HARNESS.md', () => {
    const where = ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS'].find((f) => t.exists(f));
    if (!where) return '`.github/CODEOWNERS` doesn\'t exist yet: the starter had a skeleton.';
    const rules = codeowners(t.read(where));
    if (!rules.length) return `${where} has no rules yet: one line per pattern, then its owners (\`/AGENTS.md @you\`).`;
    const bad = rules.filter((r) => r.bad.length).map((r) => `line ${r.line}: ${r.bad.join(' ')}`);
    if (bad.length) return `Owners are @user, @org/team or an e-mail address: ${some(bad, 3)}.`;
    const files = [...new Set([...harnessFiles(t.dir), where])];
    const orphans = files.filter((f) => !ownersOf(rules, f).length);
    if (orphans.length) return `These harness files have no owner (remember: the last matching line wins, and a line without owners un-owns): ${some(orphans)}.`;
    const owner = sections(t.read('HARNESS.md') ?? '').find((s) => /\bowner/i.test(s.title));
    const handles = [...new Set((owner?.body ?? '').match(/@[\w.-]+(\/[\w.-]+)?/g) ?? [])];
    const all = new Set(rules.flatMap((r) => r.owners));
    return !handles.length || handles.some((h) => all.has(h)) || `HARNESS.md names ${handles.join(', ')} as the owner, but CODEOWNERS never does.`;
  }, { milestone: 'M2' }),

  t.check('The pull-request template has a harness checklist: scorecard, attacks, evals, budget, rollback', () => {
    const where = walk(t.dir).find((f) => /^(\.github\/|docs\/)?pull_request_template\.md$/i.test(f));
    if (!where) return '`.github/pull_request_template.md` doesn\'t exist yet: the starter had a skeleton.';
    const items = checklist(t.read(where));
    if (!items.length) return `${where} has no checklist yet: one \`- [ ] …\` line per check.`;
    const topics = [['the scorecard', /scorecard|harness-check|maturity|x-?ray/i], ['the attack pack', /attack/i], ['the evals', /\bevals?\b|eval\.mjs/i], ['the budget', /budget|credit|token/i], ['the rollback', /roll\s*-?\s*back|revert/i]];
    const missing = topics.filter(([, re]) => !items.some((i) => re.test(i))).map(([w]) => w);
    return !missing.length || `The checklist has no item for ${missing.join(', ')}.`;
  }, { milestone: 'M2' }),

  // ---------- M3 · Release ----------
  t.check('harness.json and CHANGELOG.md agree on a semantic version (Keep a Changelog)', () => {
    const meta = harnessJson(t);
    if (!meta.name) return 'harness.json needs a "name".';
    if (!SEMVER.test(String(meta.version))) return `harness.json's version must be a semantic version (MAJOR.MINOR.PATCH, like 1.0.0), not "${meta.version}".`;
    const cl = changelog(t.need('CHANGELOG.md', '`CHANGELOG.md` doesn\'t exist yet: the starter had a skeleton.'));
    if (cl.unreleased == null) return 'CHANGELOG.md needs a `## [Unreleased]` section on top: that\'s where the next release\'s notes wait.';
    if (!cl.releases.length) return 'CHANGELOG.md has no release yet: add `## [1.0.0] - YYYY-MM-DD` with what the harness has.';
    const undated = cl.releases.filter((r) => !SEMVER.test(String(r.version)) || !r.date).map((r) => r.title);
    if (undated.length) return `Write each release as \`## [x.y.z] - YYYY-MM-DD\`: ${some(undated, 3)}.`;
    if (cl.releases[0].version !== meta.version) return `CHANGELOG.md's newest release is ${cl.releases[0].version}, but harness.json says ${meta.version}.`;
    const order = cl.releases.findIndex((r, i) => i > 0 && compareSemver(cl.releases[i - 1].version, r.version) <= 0);
    if (order > 0) return `Releases go newest first: ${cl.releases[order - 1].version} comes before ${cl.releases[order].version}.`;
    const empty = cl.releases.filter((r) => !/^###\s+(Added|Changed|Deprecated|Removed|Fixed|Security)\b/m.test(r.body)).map((r) => r.version);
    return !empty.length || `Group each release's notes under \`### Added\`, \`### Changed\`, \`### Fixed\`…: ${empty.join(', ')} has none.`;
  }, { milestone: 'M3' }),

  t.check('bump() follows semver', async () => {
    const { bump } = await t.import('scripts/release.mjs');
    if (typeof bump !== 'function') return 'scripts/release.mjs doesn\'t export bump(version, part).';
    const cases = [['1.4.2', 'patch', '1.4.3'], ['1.4.2', 'minor', '1.5.0'], ['1.4.2', 'major', '2.0.0'], ['0.9.12', 'minor', '0.10.0'], ['1.9.9', 'patch', '1.9.10']];
    for (const [v, part, want] of cases) {
      let got;
      try { got = bump(v, part); } catch (e) { return `bump('${v}', '${part}') threw: ${e.message}`; }
      if (got !== want) return `bump('${v}', '${part}') should be '${want}', not '${got}'.`;
    }
    for (const [v, part] of [['1.4', 'patch'], ['v1.4.2', 'patch'], ['1.4.2', 'minorish']]) {
      let threw = false;
      try { bump(v, part); } catch { threw = true; }
      if (!threw) return `bump('${v}', '${part}') should throw: ${part === 'minorish' ? 'there is no such part' : 'that is not a semantic version'}.`;
    }
    return true;
  }, { milestone: 'M3' }),

  t.check('A dry run validates and builds dist/ at the next version, and changes nothing else', () => {
    const current = needVersion(t);
    const { dir, env, meta } = releasable(t);
    const head = git(dir, ['rev-parse', 'HEAD'], env);
    const r = script(t, dir, 'scripts/release.mjs', ['minor', '--dry-run'], env);
    if (r.code !== 0) return `\`node scripts/release.mjs minor --dry-run\` should exit 0 on this harness; it exited ${r.code}: ${tail(r.all)}`;
    const next = nextVersion(current, 'minor');
    const changed = git(dir, ['status', '--porcelain', '--untracked-files=all'], env).split('\n').filter(Boolean).map((l) => l.slice(3)).filter((f) => !/^"?dist\//.test(f));
    if (changed.length) return `A dry run must change nothing but dist/; it changed ${some(changed)}.`;
    if (git(dir, ['tag', '--list'], env)) return `A dry run must not tag; the repository now has ${git(dir, ['tag', '--list'], env).split('\n').join(', ')}.`;
    if (git(dir, ['rev-parse', 'HEAD'], env) !== head) return 'A dry run must not commit.';
    const plugin = (() => { try { return JSON.parse(readIn(dir, 'dist/plugin/plugin.json')); } catch { return null; } })();
    if (!plugin) return 'The dry run built no readable dist/plugin/plugin.json.';
    if (plugin.name !== meta.name || plugin.version !== next || !plugin.description) return `dist/plugin/plugin.json needs the harness's name (${meta.name}), the next version (${next}) and a description; it has ${JSON.stringify({ name: plugin.name, version: plugin.version, description: plugin.description })}.`;
    const apmText = readIn(dir, 'dist/apm/apm.yml');
    if (!apmText) return 'The dry run built no dist/apm/apm.yml.';
    let apm;
    try { apm = parseYaml(apmText) ?? {}; } catch (e) { return `dist/apm/apm.yml is not valid YAML: ${e.message}`; }
    return (apm.name === meta.name && String(apm.version) === next && Boolean(apm.description)) || `dist/apm/apm.yml needs name: ${meta.name}, version: ${next} and a description; it has name: ${apm.name}, version: ${apm.version}, description: ${apm.description ?? 'none'}.`;
  }, { milestone: 'M3', needs: ['git'], timeout: 240000 }),

  t.check('The packages carry every agent, skill and hook (and the MCP server in the plugin), and no runtime file', () => {
    needVersion(t);
    const { dir, env } = releasable(t);
    const r = script(t, dir, 'scripts/release.mjs', ['patch', '--dry-run'], env);
    if (r.code !== 0) return `\`node scripts/release.mjs patch --dry-run\` should exit 0; it exited ${r.code}: ${tail(r.all)}`;
    const P = path.join(dir, 'dist', 'plugin');
    const A = path.join(dir, 'dist', 'apm');
    const inPlugin = filesUnder(P);
    const inApm = filesUnder(A);
    const problems = [];
    const runtime = [...inPlugin.map((f) => `plugin/${f}`), ...inApm.map((f) => `apm/${f}`)].filter((f) => /(^|\/)(\.agent-logs|node_modules|\.env[^/]*|state\.json)(\/|$)/.test(f));
    if (runtime.length) problems.push(`runtime files and secrets stay out of a package: ${some(runtime)}`);
    const plugin = JSON.parse(readIn(dir, 'dist/plugin/plugin.json'));
    for (const k of ['agents', 'skills', 'hooks', 'mcpServers']) for (const p of [plugin[k] ?? []].flat()) if (typeof p === 'string' && !fs.existsSync(path.join(P, p))) problems.push(`plugin.json's ${k} points at ${p}, which isn't in the plugin`);
    const agents = walk(dir).filter((f) => /^\.github\/agents\/[^/]+\.agent\.md$/.test(f));
    const skills = walk(dir).filter((f) => /^\.github\/skills\/[^/]+\/SKILL\.md$/.test(f));
    const instructions = walk(dir).filter((f) => /^\.github\/instructions\/.+\.instructions\.md$/.test(f));
    const carried = (files, base, f, suffix) => files.some((g) => g.endsWith(suffix) && sameText(readIn(base, g), readIn(dir, f)));
    for (const f of agents) {
      if (!carried(inPlugin, P, f, `/${path.posix.basename(f)}`)) problems.push(`the plugin doesn't carry ${f}`);
      if (!carried(inApm, A, f, `/${path.posix.basename(f)}`) || !inApm.some((g) => g.startsWith('.apm/agents/'))) problems.push(`the APM package doesn't carry ${f} in .apm/agents/`);
    }
    for (const f of skills) {
      const name = f.split('/')[2];
      if (!carried(inPlugin, P, f, `${name}/SKILL.md`)) problems.push(`the plugin doesn't carry the ${name} skill`);
      if (!carried(inApm.filter((g) => g.startsWith('.apm/skills/')), A, f, `${name}/SKILL.md`)) problems.push(`the APM package doesn't carry the ${name} skill in .apm/skills/`);
    }
    for (const f of instructions) if (!carried(inApm.filter((g) => g.startsWith('.apm/instructions/')), A, f, `/${path.posix.basename(f)}`)) problems.push(`the APM package doesn't carry ${f} in .apm/instructions/`);
    const hookCfgs = walk(dir).filter((f) => /^\.github\/hooks\/[^/]+\.json$/.test(f));
    if (hookCfgs.length) {
      const cmds = (base, files) => files.filter((f) => f.endsWith('.json')).flatMap((f) => {
        let cfg = null;
        try { cfg = JSON.parse(readIn(base, f)); } catch { return []; }
        return Object.values(cfg?.hooks ?? {}).flat().flatMap((e) => ['bash', 'powershell', 'command'].map((k) => e?.[k]).filter(Boolean)).map((cmd) => ({ f, cmd }));
      });
      const pluginHooks = cmds(P, inPlugin.filter((f) => /(^|\/)hooks?[^/]*\.json$|^hooks\//.test(f) && f !== 'plugin.json'));
      if (!pluginHooks.length) problems.push('the plugin has no hook config (hooks/hooks.json, named by plugin.json\'s "hooks")');
      for (const { f, cmd } of pluginHooks) for (const s of hookScripts(cmd)) if (!fs.existsSync(path.join(P, s))) problems.push(`the plugin's ${f} runs ${s}, which isn't in the plugin (a plugin's hooks run from the plugin's folder)`);
      const apmHooks = cmds(A, inApm.filter((f) => f.startsWith('.apm/hooks/')));
      if (!apmHooks.length) problems.push('the APM package has no hook config in .apm/hooks/');
      for (const { f, cmd } of apmHooks) for (const s of hookScripts(cmd)) if (!fs.existsSync(path.join(A, path.dirname(f), s))) problems.push(`the APM package's ${f} runs ${s}, which isn't next to it (apm install copies a hook's script relative to the hook file: ./scripts/…)`);
    }
    if (t.exists('.mcp.json')) {
      const servers = Object.keys(JSON.parse(t.read('.mcp.json')).mcpServers ?? {});
      const cfg = typeof plugin.mcpServers === 'string' ? (() => { try { return JSON.parse(readIn(P, plugin.mcpServers)); } catch { return null; } })() : plugin.mcpServers;
      const have = Object.keys(cfg?.mcpServers ?? cfg ?? {});
      const lost = servers.filter((s) => !have.includes(s));
      if (lost.length) problems.push(`the plugin's MCP config (plugin.json "mcpServers") doesn't have ${lost.join(', ')}`);
      for (const [name, s] of Object.entries(cfg?.mcpServers ?? cfg ?? {})) for (const a of (s?.args ?? []).filter((x) => /\.[cm]?js$/.test(String(x)))) if (!fs.existsSync(path.join(P, String(a)))) problems.push(`the plugin's MCP server ${name} runs ${a}, which isn't in the plugin`);
    }
    return !problems.length || `${some(problems, 4)}.`;
  }, { milestone: 'M3', needs: ['git'], timeout: 240000 }),

  t.check('Validation stops a release: a guard that misses attacks, a scorecard below L4, no release notes', () => {
    needVersion(t);
    const runs = [
      ['a guard that allows everything', /attack/i, 'name the attack pack', (dir) => writeIn(dir, '.github/hooks/scripts/guard.mjs', 'process.stdin.resume();\nprocess.stdin.on(\'end\', () => {});\n')],
      ['no hook config (the scorecard drops to L3)', /scorecard|maturity|\bL[0-3]\b/i, 'name the scorecard or the level', (dir) => { for (const f of walk(dir).filter((x) => /^\.github\/hooks\/[^/]+\.json$/.test(x))) fs.rmSync(path.join(dir, ...f.split('/'))); }],
      ['nothing under ## [Unreleased]', /unreleased|release notes|changelog/i, 'say the release notes are missing', (dir) => writeIn(dir, 'CHANGELOG.md', norm(readIn(dir, 'CHANGELOG.md')).replace(/(##\s+\[?Unreleased\]?[^\n]*\n)[\s\S]*?(?=^## |(?![\s\S]))/im, '$1\n'))],
    ];
    for (const [what, re, say, breakIt] of runs) {
      const { dir, env } = releasable(t);
      breakIt(dir);
      const r = script(t, dir, 'scripts/release.mjs', ['patch', '--dry-run'], env);
      if (r.code !== 1) return `With ${what}, \`release.mjs patch --dry-run\` should exit 1; it exited ${r.code}: ${tail(r.all)}`;
      if (!re.test(r.all)) return `With ${what}, the output should ${say}: ${tail(r.all)}`;
    }
    return true;
  }, { milestone: 'M3', needs: ['git'], timeout: 300000 }),

  t.check('A real release, at the top of its own repository, moves the notes, commits and tags v<version>', () => {
    const current = needVersion(t);
    const { dir, env } = releasable(t);
    const before = changelog(readIn(dir, 'CHANGELOG.md'));
    const note = (norm(before.unreleased).split('\n').find((l) => /^\s*[-*]\s+\S/.test(l)) ?? '').trim();
    const r = script(t, dir, 'scripts/release.mjs', ['minor'], env);
    if (r.code !== 0) return `\`node scripts/release.mjs minor\` should exit 0 in its own repository; it exited ${r.code}: ${tail(r.all)}`;
    const next = nextVersion(current, 'minor');
    const version = JSON.parse(readIn(dir, 'harness.json')).version;
    if (version !== next) return `harness.json should now say ${next}, not ${version}.`;
    const after = changelog(readIn(dir, 'CHANGELOG.md'));
    if (after.unreleased == null) return 'After a release, CHANGELOG.md still needs an (empty) `## [Unreleased]` on top for the next one.';
    if (after.releases[0]?.version !== next || !after.releases[0]?.date) return `CHANGELOG.md's newest release should be \`## [${next}] - <today>\`; it is \`${after.releases[0]?.title}\`.`;
    if (note && !after.releases[0].body.includes(note)) return `The Unreleased notes should move under ${next}; "${note}" isn't there.`;
    if (norm(after.unreleased).split('\n').some((l) => /^\s*[-*]\s+\S/.test(l))) return 'The Unreleased section should be empty after a release.';
    const tag = gitTry(dir, ['rev-list', '-n', '1', `v${next}`], env);
    if (tag.status !== 0) return `There is no tag v${next}.`;
    if (tag.stdout.trim() !== git(dir, ['rev-parse', 'HEAD'], env)) return `The tag v${next} should point at the release commit (HEAD).`;
    const dirty = git(dir, ['status', '--porcelain', '--untracked-files=all'], env);
    return !dirty || `The release should commit everything it changed (harness.json, CHANGELOG.md, dist/); still uncommitted: ${some(dirty.split('\n').map((l) => l.slice(3)))}.`;
  }, { milestone: 'M3', needs: ['git'], timeout: 240000 }),

  t.check('Inside another repository (like this workshop) a real release refuses with exit 2 and tags nothing', () => {
    needVersion(t);
    const top = t.tmp();
    const { dir, env } = releasable(t, { top });
    const head = git(top, ['rev-parse', 'HEAD'], env);
    const json = readIn(dir, 'harness.json');
    const r = script(t, dir, 'scripts/release.mjs', ['patch'], env);
    if (r.code !== 2) return `In team/harness/ inside a bigger repository, \`release.mjs patch\` should refuse with exit 2; it exited ${r.code}: ${tail(r.all)}`;
    if (git(top, ['tag', '--list'], env)) return 'It refused, but a tag was made anyway.';
    if (git(top, ['rev-parse', 'HEAD'], env) !== head) return 'It refused, but a commit was made anyway.';
    return readIn(dir, 'harness.json') === json || 'It refused, but harness.json changed anyway.';
  }, { milestone: 'M3', needs: ['git'], timeout: 120000 }),

  // ---------- M4 · AI review ----------
  t.check('harness-review.md: harness pull requests, the reviewer agent, read-only, limits, one comment', () => {
    const { data } = front(t, REVIEW, `\`${REVIEW}\` doesn't exist yet: the starter had a skeleton.`);
    const on = eventsOf(data.on);
    if (Object.hasOwn(on, 'pull_request_target')) return 'Use pull_request, not pull_request_target: the target event runs with secrets on code from forks.';
    if (!Object.hasOwn(on, 'pull_request')) return `${REVIEW} doesn't run on pull requests yet (\`on:\` has ${Object.keys(on).join(', ') || 'nothing'}).`;
    if (!gatesHarness(data.on)) return 'Its pull_request `paths` let no harness file through.';
    const imports = [data.imports ?? []].flat().map((i) => String(typeof i === 'object' ? i?.path ?? i?.uses ?? '' : i));
    const agent = imports.find((i) => /\.agent\.md$/.test(i) && (t.exists(i.replace(/^\.\//, '')) || t.exists(path.posix.join('.github/workflows', i))));
    if (!agent) return `Import your reviewer agent (\`imports: [.github/agents/reviewer.agent.md]\`); the imports are ${imports.join(', ') || 'empty'}.`;
    if (!readOnly(data.permissions)) return 'Its `permissions` must be read-only (contents and pull-requests: read): the comment goes through safe outputs.';
    if (data['timeout-minutes'] == null || data['max-ai-credits'] == null) return 'It needs `timeout-minutes` and `max-ai-credits`.';
    if (unrestrictedBash(data.tools)) return 'Don\'t give the agent an unrestricted shell: the scorecard runs in `steps:` before it.';
    const outputs = Object.entries(data['safe-outputs'] ?? {}).filter(([k]) => !SAFE_OUTPUT_SETTINGS.has(k));
    const comment = outputs.find(([k]) => k === 'add-comment');
    if (!comment) return 'It can\'t comment yet: add `safe-outputs: add-comment: max: 1`.';
    if (Number(comment[1]?.max) !== 1) return `\`add-comment\` needs \`max: 1\` (one comment per run), not ${comment[1]?.max ?? 'no max'}.`;
    const others = outputs.filter(([k]) => k !== 'add-comment').map(([k]) => k);
    return !others.length || `A review writes one comment and nothing else: remove ${others.join(', ')}.`;
  }, { milestone: 'M4' }),

  t.check('It runs the scorecard before the agent, and the prompt reads that output', () => {
    const { data, body } = front(t, REVIEW, `\`${REVIEW}\` doesn't exist yet.`);
    const steps = Array.isArray(data.steps) ? data.steps.filter((s) => s && typeof s === 'object') : [];
    if (!steps.length) return 'Add `steps:` that run before the agent: check out, fetch the scorecard, run scripts/harness-check.mjs into a file.';
    const view = steps.map((s) => ({ run: s.run == null ? '' : String(s.run), uses: s.uses == null ? '' : String(s.uses), env: { ...(data.env ?? {}), ...(s.env ?? {}) } }));
    const score = view.find((s) => /harness-check\.mjs\b/.test(s.run));
    if (!score) return 'No step runs scripts/harness-check.mjs.';
    if (!toldScorecard(score)) return 'Tell harness-check.mjs where the scorecard is (`HARNESS_SCORECARD` on the step, or `--scorecard`).';
    const out = (score.run.match(/(?:>{1,2}|\btee\s+(?:-a\s+)?)\s*["']?([^\s"'|&;]+)/) ?? [])[1];
    if (!out) return 'Write the scorecard\'s output to a file (`node scripts/harness-check.mjs > scorecard.txt 2>&1 || true`), so the agent can read it.';
    if (!norm(body).includes(path.posix.basename(out.replace(/\\/g, '/')))) return `The prompt never mentions ${out}: tell the agent to read the scorecard's output first.`;
    const scoreAt = view.indexOf(score);
    const firstCheckout = steps.findIndex((s) => /^actions\/checkout@/.test(String(s.uses ?? '')) && !s.with?.repository);
    if (firstCheckout < 0 || firstCheckout > scoreAt) return 'With your own `steps:`, gh-aw no longer checks the repository out for you: start with `actions/checkout` (pinned), before the scorecard runs.';
    const loose = view.map((s) => s.uses).filter((u) => u && !u.startsWith('./') && !/@[0-9a-f]{40}$/.test(u));
    return !loose.length || `Pin these actions to a full commit SHA: ${some(loose)}.`;
  }, { milestone: 'M4' }),

  t.check('The X-ray\'s workflow rules stay green', () => {
    const rules = scorecard(scanHarness(t.dir)).filter((r) => r.layer === 'workflows');
    const failing = rules.filter((r) => r.ok === false).map((r) => `${r.id}: ${r.message}`);
    return !failing.length || some(failing, 3);
  }, { milestone: 'M4' }),

  t.check('gh aw compile --strict accepts harness-review.md', () => {
    const dir = t.copy(t.tmp());
    execFileSync('git', ['init', '-q'], { cwd: dir, env: { ...process.env, ...gitEnv(t) } });
    const env = { ...process.env, GH_TOKEN: '', GITHUB_TOKEN: '', GH_ENTERPRISE_TOKEN: '', GITHUB_ENTERPRISE_TOKEN: '', GH_CONFIG_DIR: t.tmp(), GH_PROMPT_DISABLED: '1' };
    try {
      execFileSync('gh', ['aw', 'compile', 'harness-review', '--strict', '--no-check-update'], { cwd: dir, env, encoding: 'utf8', stdio: 'pipe', timeout: 180000 });
    } catch (e) {
      return `gh aw compile --strict failed: ${tail(e.stderr || e.stdout || e.message, 4)}`;
    }
    return fs.existsSync(path.join(dir, '.github', 'workflows', 'harness-review.lock.yml')) || 'gh aw compile made no harness-review.lock.yml.';
  }, { milestone: 'M4', needs: ['gh-aw'], optional: true, env: true, timeout: 200000 }),

  // ---------- M5 · Rollback ----------
  t.check('HARNESS.md has a rollback runbook: numbered steps from the dry run to a patch release', () => {
    const md = t.need('HARNESS.md', '`HARNESS.md` is missing: it came from Lab 08 · easy.');
    const s = sections(md).find((x) => /roll\s*-?\s*back/i.test(x.title) && /runbook/i.test(x.title));
    if (!s) return 'HARNESS.md needs a `## Rollback runbook` section (grow the Rollback section into one).';
    const steps = s.body.split('\n').filter((l) => /^\s*\d+\.\s+\S/.test(l)).length;
    if (steps < 4) return `The runbook has ${steps} numbered step${steps === 1 ? '' : 's'}: write at least four (\`1. …\`), in the order someone follows them at 2 a.m.`;
    const need = [['the dry run (rollback.mjs --dry-run)', /rollback\.mjs[^\n]*--dry-run|--dry-run[^\n]*rollback/i], ['the restore (rollback.mjs --to)', /rollback\.mjs\s+--to/i], ['the checks', /harness-check|scorecard|attack|eval|node --test/i], ['a pull request', /pull request|\bPR\b/i], ['a patch release', /\bpatch\b/i], ['a CHANGELOG line', /changelog/i]];
    const missing = need.filter(([, re]) => !re.test(s.body)).map(([w]) => w);
    return !missing.length || `The runbook doesn't mention ${missing.join(', ')}.`;
  }, { milestone: 'M5' }),

  t.check('rollback.mjs --to 1.0.0 --dry-run lists every agent-facing change since the tag, and changes nothing', () => {
    const { dir, env, instr, hook, skill } = twoTags(t);
    const r = script(t, dir, 'scripts/rollback.mjs', ['--to', '1.0.0', '--dry-run', '--json'], env, 60000);
    if (r.code !== 0) return `\`rollback.mjs --to 1.0.0 --dry-run --json\` should exit 0; it exited ${r.code}: ${tail(r.all)}`;
    const out = jsonOut(r.stdout);
    const changes = Array.isArray(out?.changes) ? out.changes : null;
    if (!changes) return `With --json it should print { "to", "changes": [{ "path", "action" }] }; it printed: ${tail(r.stdout)}`;
    const action = (p) => changes.find((c) => c?.path === p)?.action;
    const want = [['AGENTS.md', 'restore'], [skill, 'remove'], ...(instr ? [[instr, 'bring back']] : []), ...(hook ? [[hook, 'restore']] : [])];
    const wrong = want.filter(([p, a]) => action(p) !== a).map(([p, a]) => `${p} (${a}${action(p) ? `, not ${action(p)}` : ''})`);
    if (wrong.length) return `The plan should list ${wrong.join('; ')}.`;
    const kept = changes.filter((c) => KEEP.includes(c?.path)).map((c) => c.path);
    if (kept.length) return `A rollback never touches the history or the change control: ${kept.join(', ')} must not be in the plan.`;
    const text = script(t, dir, 'scripts/rollback.mjs', ['--to', 'v1.0.0', '--dry-run'], env, 60000);
    if (text.code !== 0 || !text.stdout.includes('AGENTS.md')) return `\`--to v1.0.0 --dry-run\` should exit 0 and list the files; it exited ${text.code}: ${tail(text.all)}`;
    const dirty = git(dir, ['status', '--porcelain', '--untracked-files=all'], env);
    if (dirty) return `A dry run must change nothing; now changed: ${some(dirty.split('\n').map((l) => l.slice(3)))}.`;
    const none = script(t, dir, 'scripts/rollback.mjs', ['--to', '9.9.9', '--dry-run'], env, 60000);
    return (none.code === 2 && /9\.9\.9/.test(none.all)) || `\`--to 9.9.9\` should refuse with exit 2 and name the missing tag v9.9.9; it exited ${none.code}: ${tail(none.all)}`;
  }, { milestone: 'M5', needs: ['git'], timeout: 120000 }),

  t.check('Without --dry-run it restores those files, never CHANGELOG.md or harness.json, and refuses over uncommitted work', () => {
    const { dir, env, instr, hook, skill } = twoTags(t);
    const head = git(dir, ['rev-parse', 'HEAD'], env);
    const edited = `${readIn(dir, 'AGENTS.md')}- An edit nobody committed.\n`;
    writeIn(dir, 'AGENTS.md', edited);
    const refused = script(t, dir, 'scripts/rollback.mjs', ['--to', '1.0.0'], env, 60000);
    if (refused.code !== 2) return `With an uncommitted edit to AGENTS.md, \`rollback.mjs --to 1.0.0\` should refuse with exit 2; it exited ${refused.code}: ${tail(refused.all)}`;
    if (readIn(dir, 'AGENTS.md') !== edited) return 'It refused, but the uncommitted edit to AGENTS.md is gone.';
    git(dir, ['checkout', '-q', '--', 'AGENTS.md'], env);
    const keep = Object.fromEntries(KEEP.map((f) => [f, readIn(dir, f)]));
    const r = script(t, dir, 'scripts/rollback.mjs', ['--to', '1.0.0'], env, 60000);
    if (r.code !== 0) return `\`rollback.mjs --to 1.0.0\` should exit 0; it exited ${r.code}: ${tail(r.all)}`;
    const at = (f) => { const x = gitTry(dir, ['show', `v1.0.0:${f}`], env); return x.status === 0 ? x.stdout : null; };
    const problems = [];
    for (const f of ['AGENTS.md', ...(instr ? [instr] : []), ...(hook ? [hook] : [])]) if (!sameText(readIn(dir, f), at(f))) problems.push(`${f} isn't v1.0.0's`);
    if (fs.existsSync(path.join(dir, ...skill.split('/')))) problems.push(`${skill} (added after v1.0.0) is still there`);
    for (const f of KEEP) if (readIn(dir, f) !== keep[f]) problems.push(`${f} changed (history and change control stay at their newest)`);
    if (git(dir, ['rev-parse', 'HEAD'], env) !== head) problems.push('it committed (a rollback goes through a pull request)');
    return !problems.length || `After the rollback: ${problems.join('; ')}.`;
  }, { milestone: 'M5', needs: ['git'], timeout: 120000 }),
];
