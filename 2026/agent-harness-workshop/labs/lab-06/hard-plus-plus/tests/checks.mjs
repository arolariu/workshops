// Free checks for Lab 06 · hard++: an internal marketplace. The Copilot check uses a scratch COPILOT_HOME (your own
// marketplaces and plugins stay out of it and untouched); the release checks run in scratch Git repositories.
import fs from 'node:fs';
import path from 'node:path';
import {
  MARKET, MANIFEST, RELEASE, SEMVER, KEBAB, GIT_ENV, readJson, writeJson, copyMarket, goodMarket, BROKEN, gitRun, gitInit,
  commitAll, snapshot, changedFiles,
} from './helpers.mjs';

const MJSON = `${MARKET}/${MANIFEST}`;
const SCRIPT = `${MARKET}/${RELEASE}`;
const GRADES = `${MARKET}/plugins/studybuddy-grades`;
const TOOL = 'studybuddy_exam_needed';
const DATE = '2026-10-20';
const show = (v) => (typeof v === 'string' ? v : JSON.stringify(v));
const localEntries = (m) => (m.plugins ?? []).filter((p) => typeof p.source === 'string');

/** The extension's entry file, from the "extensions" folder(s) in studybuddy-grades/plugin.json. */
function extensionFile(t) {
  const p = t.json(`${GRADES}/plugin.json`);
  const dirs = typeof p.extensions === 'string' ? [p.extensions] : Array.isArray(p.extensions) ? p.extensions : Array.isArray(p.extensions?.paths) ? p.extensions.paths : [];
  if (!dirs.length) t.fail('studybuddy-grades/plugin.json needs "extensions": "extensions" (the folder that holds your extension\'s folder).');
  for (const d of dirs) {
    const base = `${GRADES}/${String(d).replace(/^\.\//, '')}`;
    const hit = t.files(base).find((f) => /\/[^/]+\/extension\.mjs$/.test(f.slice(base.length)));
    if (hit) return hit;
  }
  return t.fail(`No <name>/extension.mjs inside ${dirs.join(', ')} of studybuddy-grades.`);
}
async function tool(t) {
  const ext = await t.loadExtension(extensionFile(t));
  const found = ext.tools.find((x) => x.name === TOOL);
  if (!found) t.fail(`The extension registers no "${TOOL}" tool (tools: ${ext.tools.map((x) => x.name).join(', ') || 'none'}).`);
  return found;
}
const run = async (tl, args) => {
  try { return await tl.handler(args, { sessionId: 'harness-check', toolCallId: 'check', toolName: TOOL, arguments: args }); } catch (e) { return { threw: e.message }; }
};
const SE201 = { grades: [{ grade: 8, weight: 30 }, { grade: 9, weight: 30 }], examWeight: 40, target: 8 };
const releaseIn = (t, dir, ...args) => t.node([RELEASE, ...args], { cwd: dir, env: GIT_ENV });
const tags = (dir) => gitRun(dir, ['tag', '-l']).out.split('\n').filter(Boolean);

export default (t) => [
  // M1 · The marketplace
  t.check('marketplace.json: a kebab-case name, an owner, a description and two plugins', () => {
    const m = t.json(MJSON, `Create ${MJSON}.`);
    if (!KEBAB.test(m.name ?? '') || m.name.length > 64) return `marketplace.json needs a kebab-case "name" (got "${m.name ?? ''}"). It becomes the "@name" people install from.`;
    if (!String(m.owner?.name ?? '').trim()) return 'marketplace.json needs "owner": { "name": … } (the CLI refuses it without one).';
    if (String(m.metadata?.description ?? '').length < 10) return 'Add "metadata": { "description": … } so people know whose catalog this is.';
    const names = (m.plugins ?? []).map((p) => p.name);
    const missing = ['studybuddy-guard', 'studybuddy-grades'].filter((n) => !names.includes(n));
    if (missing.length) return `List both plugins in "plugins": missing ${missing.join(', ')}.`;
    for (const p of m.plugins) {
      if (!KEBAB.test(p.name ?? '')) return `Plugin "${p.name}": names are kebab-case.`;
      if (String(p.description ?? '').length < 10) return `Plugin "${p.name}" needs a description (browse shows it).`;
      if (!SEMVER.test(String(p.version ?? ''))) return `Plugin "${p.name}" needs a semver "version".`;
      if (!p.source) return `Plugin "${p.name}" needs a "source".`;
    }
    return true;
  }, { milestone: 'M1' }),
  t.check('Every entry points at a plugin with the same name and version', () => {
    const m = t.json(MJSON);
    if (!localEntries(m).length) return 'marketplace.json has no plugin entries with a local "source" yet (like "./plugins/studybuddy-guard").';
    for (const p of localEntries(m)) {
      const dir = path.posix.normalize(`${MARKET}/${p.source.replace(/\\/g, '/')}`);
      if (!dir.startsWith(`${MARKET}/`)) return `"${p.name}": the source ${p.source} is outside the marketplace.`;
      if (!t.exists(`${dir}/plugin.json`)) return `"${p.name}": ${dir}/plugin.json doesn't exist (the CLI accepts this when you add the marketplace, and fails at install).`;
      const pj = t.json(`${dir}/plugin.json`);
      if (pj.name !== p.name) return `"${p.name}": its plugin.json says "${pj.name}". The CLI installs it silently, under a name nobody asked for.`;
      if (pj.version !== p.version) return `"${p.name}": the entry says ${p.version}, plugin.json says ${pj.version}. Copilot reports plugin.json's version, so the catalog would lie.`;
    }
    return true;
  }, { milestone: 'M1' }),
  t.check('README: how to add the marketplace and install each plugin', () => {
    const m = t.json(MJSON);
    const s = t.need(`${MARKET}/README.md`);
    if (!/copilot plugin marketplace add/.test(s)) return 'Show how to add the marketplace (copilot plugin marketplace add …).';
    const missing = (m.plugins ?? []).map((p) => `copilot plugin install ${p.name}@${m.name}`).filter((c) => !s.includes(c));
    return !missing.length || `Show the install command of every plugin: ${missing.join('; ')}.`;
  }, { milestone: 'M1' }),
  t.check('Copilot adds it, lists both plugins, and installs them at their versions', () => {
    const m = t.json(MJSON);
    // Names from your JSON become command-line arguments: check them first, so a bad one gets a clear message
    // (which field to fix) before five CLI calls. The kit already refuses anything that would start a session.
    const unsafe = [m.name, ...(m.plugins ?? []).map((p) => p.name)].filter((n) => !KEBAB.test(String(n ?? '')));
    if (unsafe.length) return `Fix these names in marketplace.json first (kebab-case): ${unsafe.map(show).join(', ')}.`;
    const copy = copyMarket(t);
    const env = { COPILOT_HOME: t.tmp(), COPILOT_AUTO_UPDATE: 'false' };
    const cli = (args) => t.copilot(args, { env, cwd: copy });
    const add = cli(['plugin', 'marketplace', 'add', copy]);
    if (add.code !== 0) return `copilot plugin marketplace add <absolute path> failed: ${add.all.trim().slice(0, 240)}`;
    const browse = cli(['plugin', 'marketplace', 'browse', m.name, '--json']);
    let listed = [];
    try { listed = JSON.parse(browse.stdout).map((p) => p.name); } catch { return `Could not browse "${m.name}": ${browse.all.trim().slice(0, 200)}`; }
    const unlisted = m.plugins.map((p) => p.name).filter((n) => !listed.includes(n));
    if (unlisted.length) return `browse doesn't list: ${unlisted.join(', ')}.`;
    for (const p of localEntries(m)) {
      const r = cli(['plugin', 'install', `${p.name}@${m.name}`]);
      if (r.code !== 0) return `copilot plugin install ${p.name}@${m.name} failed: ${r.all.trim().slice(0, 240)}`;
    }
    const list = cli(['plugin', 'list', '--json']);
    let rows = [];
    try { rows = JSON.parse(list.stdout); } catch { return `Could not read the plugin list: ${list.all.trim().slice(0, 200)}`; }
    const wrong = localEntries(m).filter((p) => !rows.some((r) => r.name === p.name && r.marketplace === m.name && r.version === p.version));
    return !wrong.length || `After installing, Copilot doesn't report ${wrong.map((p) => `${p.name} ${p.version}`).join(', ')} from "${m.name}".`;
  }, { milestone: 'M1', needs: ['copilot'], timeout: 180000 }),

  // M2 · A gatekeeper
  t.check('validateMarketplace() passes a good marketplace and finds each of 9 problems', async () => {
    const { validateMarketplace } = await t.import(SCRIPT);
    const good = validateMarketplace(goodMarket(t));
    if (!Array.isArray(good)) return 'validateMarketplace() must return a list of problems ([] when the marketplace is fine).';
    if (good.length) return `A publishable marketplace (with a GitHub source pinned to v2.0.0) got: ${good[0]}`;
    const missed = [];
    for (const [what, mutate] of BROKEN) {
      const root = goodMarket(t);
      mutate(root);
      if (!(validateMarketplace(root) ?? []).length) missed.push(what);
    }
    return !missed.length || `validateMarketplace() found nothing wrong with: ${missed.join('; ')}.`;
  }, { milestone: 'M2' }),
  t.check('Your marketplace passes it, and release.mjs --validate exits 0 (1 when broken)', async () => {
    const { validateMarketplace } = await t.import(SCRIPT);
    if ((t.json(MJSON).plugins ?? []).length < 2) return 'List both plugins in marketplace.json first (M1).';
    const mine = validateMarketplace(t.path(MARKET));
    if (mine.length) return `Your own marketplace isn't publishable: ${mine.join('; ')}`;
    const ok = t.node([SCRIPT, '--validate']);
    if (ok.code !== 0) return `node ${SCRIPT} --validate exited ${ok.code}: ${ok.all.trim().slice(0, 200)}`;
    const copy = copyMarket(t);
    const m = readJson(copy, MANIFEST);
    m.plugins[0].version = '9.9.9';
    writeJson(copy, MANIFEST, m);
    const bad = t.node([RELEASE, '--validate'], { cwd: copy });
    return bad.code === 1 || `With an entry version that differs from plugin.json, --validate should exit 1 (exit ${bad.code}).`;
  }, { milestone: 'M2' }),

  // M3 · A tool the model can trust
  t.check('studybuddy-grades declares its extension, which registers studybuddy_exam_needed', async () => {
    await tool(t);
    return true;
  }, { milestone: 'M3' }),
  t.check('The tool says when to use it, with a JSON Schema and no permission prompt', async () => {
    const tl = await tool(t);
    const d = String(tl.description ?? '');
    if (d.length < 80 || !/exam/i.test(d)) return `The description is all the model knows about the tool (${d.length} characters): say what it computes and when to call it (80+ characters).`;
    if (!/instead|never|don't|do not|rather than/i.test(d)) return 'Tell the model to call the tool instead of doing the arithmetic itself (models make rounding mistakes).';
    const p = tl.parameters ?? {};
    const props = p.properties ?? {};
    if (p.type !== 'object' || props.grades?.type !== 'array' || !['number', 'integer'].includes(props.examWeight?.type) || !['number', 'integer'].includes(props.target?.type)) {
      return '"parameters" should be a JSON Schema object with grades (array), examWeight (number) and target (number).';
    }
    if (!['grades', 'examWeight'].every((k) => (p.required ?? []).includes(k))) return 'Mark grades and examWeight as "required" (target defaults to 5).';
    return tl.skipPermission === true || 'The tool only computes: set "skipPermission": true so nobody is asked to approve arithmetic.';
  }, { milestone: 'M3' }),
  t.check('The maths: 7.25, 6.8, the exam rule, and "not reachable"', async () => {
    const tl = await tool(t);
    const cases = [
      [SE201, (s) => /\b7\.25\b/.test(s), 'SE201 (Project 8 at 30%, Labs 9 at 30%, exam 40%) needs 7.25 for an 8'],
      [{ ...SE201, target: undefined }, (s) => /\b5\b/.test(s) && !/-0\.25|(?<![\d.])0(?![\d.])/.test(s), 'without a target it aims for 5, and passing always needs at least 5 on the exam (the exam rule), not -0.25'],
      [{ grades: [{ grade: 9.2, weight: 50 }], examWeight: 50, target: 8 }, (s) => /\b6\.80?\b/.test(s) && !/6\.81/.test(s), 'AI210 needs exactly 6.8 for an 8 (no floating-point noise)'],
      [{ grades: [{ grade: 7.6, weight: 50 }], examWeight: 50, target: 8 }, (s) => /\b8\.40?\b/.test(s), 'DB220 needs 8.4 for an 8'],
      [{ grades: [{ grade: 4, weight: 40 }], examWeight: 60, target: 8 }, (s) => /not reachable|unreachable|out of reach|impossible/i.test(s) && /10\.67/.test(s), 'MA110 would need 10.67 for an 8: say it is not reachable, with the number'],
    ];
    for (const [args, ok, what] of cases) {
      const out = await run(tl, JSON.parse(JSON.stringify(args)));
      if (typeof out !== 'string') return `The handler should return a string the model reads. For ${what} it returned ${show(out)}.`;
      if (!ok(out)) return `${what}. The tool said: ${out.slice(0, 200)}`;
    }
    return true;
  }, { milestone: 'M3' }),
  t.check('Bad input gets an "Error: …" the model can act on, never a crash', async () => {
    const tl = await tool(t);
    const bad = [
      [{ examWeight: 40 }, 'no grades'],
      [{ grades: [{ grade: 8, weight: 30 }], examWeight: 40 }, 'weights that add up to 70, not 100'],
      [{ grades: [{ grade: 11, weight: 60 }], examWeight: 40 }, 'a grade of 11 (the scale is 1-10)'],
      [{ grades: [{ grade: 8, weight: 60 }], examWeight: 40, target: 12 }, 'a target of 12'],
      [{ grades: [{ grade: 'eight', weight: 60 }], examWeight: 40 }, 'a grade that is not a number'],
      [{ grades: [{ grade: 8, weight: 100 }], examWeight: 0 }, 'an exam that weighs nothing'],
    ];
    for (const [args, what] of bad) {
      const out = await run(tl, args);
      if (out?.threw) return `For ${what}, the handler threw (${out.threw}). Return "Error: …" instead, so the model can fix its call.`;
      if (typeof out !== 'string' || !/^Error: .{10,}/.test(out)) return `For ${what}, return a string that starts with "Error: " and says what to fix. Got: ${show(out).slice(0, 160)}`;
    }
    return true;
  }, { milestone: 'M3' }),
  t.check('Deterministic and local: the same answer twice, no network, no processes, no writes', async () => {
    const tl = await tool(t);
    const a = await run(tl, SE201);
    const b = await run(tl, SE201);
    if (a !== b) return `The same input gave two answers: ${show(a)} / ${show(b)}.`;
    const src = t.read(extensionFile(t)).replace(/\/\/.*$/gm, '');
    const risky = [[/\bfetch\s*\(|https?:\/\/|node:https?\b|['"]https?['"]/, 'network access'], [/child_process|\bexec(Sync)?\s*\(|\bspawn(Sync)?\s*\(/, 'starting processes'], [/write(File|FileSync)?\s*\(|append(File|FileSync)\s*\(|createWriteStream|\bunlink|\brmSync|\brm\s*\(/, 'writing files'], [/Math\.random|Date\.now|new Date\(/, 'randomness or the clock'], [/\.send(AndWait)?\s*\(/, 'sending prompts (that would spend credits)']];
    const hit = risky.find(([re]) => re.test(src));
    return !hit || `The extension's code uses ${hit[1]}. A calculator tool needs none of that: keep it pure.`;
  }, { milestone: 'M3' }),

  // M4 · Release it
  t.check('bump() and changeKind()', async () => {
    const { bump, changeKind } = await t.import(SCRIPT);
    const table = [['1.2.3', 'patch', '1.2.4'], ['1.2.3', 'minor', '1.3.0'], ['1.2.3', 'major', '2.0.0'], ['0.1.0', 'major', '1.0.0'], ['1.9.9', 'patch', '1.9.10']];
    for (const [v, part, want] of table) {
      let got;
      try { got = bump(v, part); } catch (e) { got = `threw ${e.message}`; }
      if (got !== want) return `bump("${v}", "${part}") should be "${want}", got "${got}".`;
    }
    for (const [v, part] of [['1.2', 'patch'], ['1.2.3', 'huge']]) {
      let threw = false;
      try { bump(v, part); } catch { threw = true; }
      if (!threw) return `bump("${v}", "${part}") should throw.`;
    }
    const log = (body) => `# Changelog\n\n## Unreleased\n${body}\n## 1.0.0 - 2026-10-01\n### Added\n- First.\n`;
    const kinds = [[log('### Fixed\n- A bug.\n'), 'fix'], [log('### Added\n- A tool.\n### Fixed\n- A bug.\n'), 'feature'], [log('### Breaking\n- Renamed the tool.\n### Added\n- More.\n'), 'breaking'], [log('### Removed\n- The old command.\n'), 'breaking'], [log(''), null]];
    for (const [text, want] of kinds) {
      const got = changeKind(text);
      if (got !== want) return `changeKind() should say ${show(want)} for an Unreleased section with ${text.split('## Unreleased\n')[1].split('\n## 1.0.0')[0].replace(/\n/g, ' ').trim() || 'nothing'}; got ${show(got)}.`;
    }
    return true;
  }, { milestone: 'M4' }),
  t.check('cutChangelog() moves Unreleased under the new version', async () => {
    const { cutChangelog } = await t.import(SCRIPT);
    const before = '# Changelog · x\n\n## Unreleased\n### Added\n- The tool.\n\n## 0.1.0 - 2026-10-01\n### Added\n- Preview.\n';
    const after = String(cutChangelog(before, '1.0.0', DATE)).replace(/\r\n/g, '\n');
    const u = after.indexOf('## Unreleased');
    const v = after.indexOf(`## 1.0.0 - ${DATE}`);
    const old = after.indexOf('## 0.1.0 - 2026-10-01');
    if (u < 0 || v < 0 || old < 0 || !(u < v && v < old)) return `Expected "## Unreleased", then "## 1.0.0 - ${DATE}", then the old "## 0.1.0" section. Got:\n${after}`;
    if (after.slice(u, v).includes('- The tool.') || !after.slice(v, old).includes('- The tool.')) return 'The entries move from Unreleased into the new version\'s section.';
    let threw = false;
    try { cutChangelog('# Changelog\n\n## Unreleased\n\n## 1.0.0 - 2026-10-01\n- x\n', '1.0.1', DATE); } catch { threw = true; }
    return threw || 'Releasing with an empty Unreleased section should throw: there is nothing to release.';
  }, { milestone: 'M4' }),
  t.check('A release in its own repository: bump, changelog, commit and tag', () => {
    const dir = gitInit(copyMarket(t));
    const r = releaseIn(t, dir, 'studybuddy-guard', 'patch', '--date', DATE);
    if (r.code !== 0) return `node scripts/release.mjs studybuddy-guard patch --date ${DATE} exited ${r.code}: ${r.all.trim().slice(0, 300)}`;
    const pj = readJson(dir, 'plugins/studybuddy-guard/plugin.json');
    const entry = readJson(dir, MANIFEST).plugins.find((p) => p.name === 'studybuddy-guard');
    if (pj.version !== '1.0.1' || entry?.version !== '1.0.1') return `Both plugin.json and the marketplace entry should say 1.0.1 (got ${pj.version} and ${entry?.version}).`;
    const log = fs.readFileSync(path.join(dir, 'plugins/studybuddy-guard/CHANGELOG.md'), 'utf8').replace(/\r\n/g, '\n');
    if (!log.includes(`## 1.0.1 - ${DATE}`)) return `The changelog should have a "## 1.0.1 - ${DATE}" section.`;
    if (!tags(dir).includes('studybuddy-guard-v1.0.1')) return `No tag "studybuddy-guard-v1.0.1" (tags: ${tags(dir).join(', ') || 'none'}).`;
    const dirty = gitRun(dir, ['status', '--porcelain']).out;
    if (dirty) return `The release left uncommitted changes: ${dirty.split('\n').join(', ')}. Commit them, then tag that commit.`;
    const tagged = gitRun(dir, ['rev-parse', 'studybuddy-guard-v1.0.1^{commit}']).out;
    return tagged === gitRun(dir, ['rev-parse', 'HEAD']).out || 'The tag should point at the release commit (the one with the new version).';
  }, { milestone: 'M4', needs: ['git'], timeout: 90000 }),
  t.check('It refuses a bump too small for the changes, a dirty tree, an existing tag and an invalid marketplace', () => {
    const listed = (t.json(MJSON).plugins ?? []).map((p) => p.name);
    if (!['studybuddy-guard', 'studybuddy-grades'].every((n) => listed.includes(n))) return 'List both plugins in marketplace.json first (M1).';
    const scenarios = [
      ['a "minor" release over a Breaking entry', (dir) => {
        const f = path.join(dir, 'plugins/studybuddy-guard/CHANGELOG.md');
        fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/## Unreleased\r?\n/, '## Unreleased\n### Breaking\n- The log moved to .agent-logs/guard/.\n'));
        commitAll(dir, 'breaking');
      }, 'minor'],
      ['a dirty working tree', (dir) => fs.appendFileSync(path.join(dir, 'README.md'), '\nUncommitted.\n'), 'patch'],
      ['a tag that already exists', (dir) => gitRun(dir, ['tag', 'studybuddy-guard-v1.0.1']), 'patch'],
      ['an invalid marketplace', (dir) => {
        const m = readJson(dir, MANIFEST);
        m.plugins.find((p) => p.name === 'studybuddy-grades').version = '9.9.9';
        writeJson(dir, MANIFEST, m);
        commitAll(dir, 'broken');
      }, 'patch'],
    ];
    for (const [what, setup, part] of scenarios) {
      const dir = gitInit(copyMarket(t));
      setup(dir);
      const before = snapshot(dir);
      const tagsBefore = tags(dir);
      const r = releaseIn(t, dir, 'studybuddy-guard', part, '--date', DATE);
      if (r.code !== 1) return `With ${what}, the release should refuse (exit 1); it exited ${r.code}.`;
      const changed = changedFiles(before, snapshot(dir));
      if (changed.length) return `With ${what}, it refused but changed ${changed.join(', ')}. Check everything before you write.`;
      if (tags(dir).length !== tagsBefore.length) return `With ${what}, it refused but created a tag.`;
    }
    return true;
  }, { milestone: 'M4', needs: ['git'], timeout: 120000 }),
  t.check('--dry-run writes nothing; outside its own repository it skips the commit and the tag', () => {
    const dir = gitInit(copyMarket(t));
    const before = snapshot(dir);
    const dry = releaseIn(t, dir, 'studybuddy-guard', 'patch', '--date', DATE, '--dry-run');
    if (dry.code !== 0) return `--dry-run exited ${dry.code}: ${dry.all.trim().slice(0, 200)}`;
    if (changedFiles(before, snapshot(dir)).length || tags(dir).length) return '--dry-run changed files or created a tag.';
    if (!/1\.0\.1/.test(dry.all)) return '--dry-run should say what it would release (1.0.1).';
    const plain = copyMarket(t);
    const r = releaseIn(t, plain, 'studybuddy-guard', 'patch', '--date', DATE);
    if (r.code !== 0) return `Outside a Git repository of its own, the release should still update the files (exit ${r.code}): ${r.all.trim().slice(0, 200)}`;
    if (readJson(plain, 'plugins/studybuddy-guard/plugin.json').version !== '1.0.1') return 'Outside its own repository, plugin.json should still be bumped.';
    return (/skip/i.test(r.all) && !fs.existsSync(path.join(plain, '.git'))) || 'Say that it skipped the commit and the tag (the folder is not its own repository), and never create one.';
  }, { milestone: 'M4', needs: ['git'], timeout: 90000 }),
  t.check('Inside a bigger repository (like this workshop), it never commits or tags that repository', () => {
    const outer = t.tmp();
    const dir = copyMarket(t, path.join(outer, 'marketplace'));
    fs.writeFileSync(path.join(outer, 'README.md'), '# The workshop: marketplace/ is only a folder in here\n');
    gitInit(outer);
    const head = gitRun(outer, ['rev-parse', 'HEAD']).out;
    const r = releaseIn(t, dir, 'studybuddy-guard', 'patch', '--date', DATE);
    if (r.code !== 0) return `Inside a bigger repository the release should still update the files (exit ${r.code}): ${r.all.trim().slice(0, 200)}`;
    if (readJson(dir, 'plugins/studybuddy-guard/plugin.json').version !== '1.0.1') return 'Inside a bigger repository, plugin.json should still be bumped.';
    if (gitRun(outer, ['rev-parse', 'HEAD']).out !== head) return 'It committed to the repository around the marketplace (in real life: the workshop you cloned). Being inside a repository isn\'t enough: the marketplace folder must be its top (git rev-parse --show-cdup prints nothing there).';
    if (tags(outer).length) return `It tagged the repository around the marketplace (${tags(outer).join(', ')}).`;
    if (fs.existsSync(path.join(dir, '.git'))) return 'It created a repository inside the marketplace folder: never do that on your own.';
    return /skip/i.test(r.all) || 'Say that it skipped the commit and the tag (the marketplace is not a repository of its own).';
  }, { milestone: 'M4', needs: ['git'], timeout: 90000 }),
  t.check('You shipped studybuddy-grades 1.0.0 (or later) with the script', async () => {
    const { changeKind } = await t.import(SCRIPT);
    const pj = t.json(`${GRADES}/plugin.json`);
    if (Number(String(pj.version).split('.')[0]) < 1) return `studybuddy-grades is still ${pj.version}: release it as 1.0.0 (node marketplace/scripts/release.mjs studybuddy-grades major).`;
    const entry = (t.json(MJSON).plugins ?? []).find((p) => p.name === 'studybuddy-grades');
    if (entry?.version !== pj.version) return `The marketplace entry says ${entry?.version}, plugin.json says ${pj.version}.`;
    const log = t.need(`${GRADES}/CHANGELOG.md`);
    if (!new RegExp(`^## ${pj.version.replace(/\./g, '\\.')}\\b`, 'm').test(log)) return `CHANGELOG.md has no "## ${pj.version}" section.`;
    return changeKind(log) === null || 'Its Unreleased section still has entries: they were released, so they belong under the version.';
  }, { milestone: 'M4' }),
];
