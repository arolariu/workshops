// Free checks for Lab 06 · hard+: the supply chain. Everything runs offline, on projects built in temp folders.
import { guard } from './no-copilot.mjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseYaml } from '../../../_harness/kit.mjs';
import { CAMPUS, fixture, sha, pinnedRef, release, buildConsumer, buildShadows, snapshot, snapshotDiff, edit } from './helpers.mjs';

const PINS = 'scripts/pins.mjs';
const VERIFY = 'scripts/verify-lock.mjs';
const SHADOWS = 'scripts/find-shadows.mjs';
const UPGRADE = 'scripts/upgrade.mjs';
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const show = (v) => (typeof v === 'string' ? v : JSON.stringify(v));
const lockOf = (root) => parseYaml(fs.readFileSync(path.join(root, 'apm.lock.yaml'), 'utf8'));
const entryOf = (root, repo) => (lockOf(root).dependencies ?? []).find((d) => String(d.repo_url).toLowerCase().endsWith(repo));
const upgradeCli = (t, root) => t.node([UPGRADE, CAMPUS, 'v2.0.0', '--root', root]);

/** Each kind of drift, made on a fresh consumer: [kind, what we did, mutate(root)]. */
const DRIFT = [
  ['missing', 'deleted .github/prompts/hello.prompt.md', (r) => fs.rmSync(path.join(r, '.github/prompts/hello.prompt.md'))],
  ['modified', 'edited the deployed campus-grading-rules skill', (r) => edit(r, '.github/skills/campus-grading-rules/SKILL.md', (s) => `${s}\n4. Round everything down.\n`)],
  ['ref-mismatch', 'changed the pin in apm.yml to #v1.5.0', (r) => edit(r, 'apm.yml', (s) => s.replace('campus-standards#v1.4.0', 'campus-standards#v1.5.0'))],
  ['not-locked', 'added acme/skills#v2.0.0 to apm.yml', (r) => edit(r, 'apm.yml', (s) => `${s.trimEnd()}\n    - acme/skills#v2.0.0\n`)],
  ['orphan', 'removed microsoft/apm-sample-package from apm.yml', (r) => edit(r, 'apm.yml', (s) => s.replace(/^\s*- microsoft\/apm-sample-package#v1\.0\.0\r?\n/m, ''))],
  ['unpinned-commit', 'set resolved_commit: main in the lock', (r) => edit(r, 'apm.lock.yaml', (s) => s.replace(/resolved_commit: 5b1f[0-9a-f]+/, 'resolved_commit: main'))],
  ['no-lock', 'deleted apm.lock.yaml', (r) => fs.rmSync(path.join(r, 'apm.lock.yaml'))],
];

export default (t) => guard(t, [
  // M1 · Pin everything
  t.check('pinProblems() flags 9 loose dependencies and lets 7 pinned ones through', async () => {
    const { pinProblems } = await t.import(PINS);
    const { pinned, loose } = fixture(t, 'pins.json');
    const missed = loose.filter(([dep]) => !(pinProblems([dep]) ?? []).length);
    if (missed.length) return `pinProblems() let these through: ${missed.map(([d, why]) => `${show(d)} (${why})`).join('; ')}.`;
    const unnamed = loose.find(([dep]) => !pinProblems([dep]).some((p) => /acme\/(skills|tools)/i.test(String(p))));
    if (unnamed) return `Name the dependency in the problem, so people can find it (for ${show(unnamed[0])} you said: "${pinProblems([unnamed[0]])[0]}").`;
    if (pinProblems(loose.slice(0, 3).map(([d]) => d)).length !== 3) return 'Return one problem per loose dependency.';
    const wrong = pinned.filter((dep) => (pinProblems([dep]) ?? []).length);
    return !wrong.length || `These are pinned (a full version tag, a full SHA, or a local path), but pinProblems() complains: ${wrong.map(show).join(', ')}.`;
  }, { milestone: 'M1' }),
  t.check('studybuddy-plugin/apm.yml: the plugin as an APM package, every dependency pinned', () => {
    const plugin = t.json('studybuddy-plugin/plugin.json');
    const apm = t.yaml('studybuddy-plugin/apm.yml', 'Create studybuddy-plugin/apm.yml (apm plugin init scaffolds one).');
    if (apm.name !== plugin.name) return `apm.yml says name "${apm.name}", plugin.json says "${plugin.name}": one package, one name.`;
    if (!SEMVER.test(String(apm.version ?? '')) || apm.version !== plugin.version) return `apm.yml says version "${apm.version}", plugin.json says "${plugin.version}": keep them equal (and semver).`;
    if (String(apm.description ?? '').length < 20) return 'Give the package a description (20+ characters).';
    const deps = apm.dependencies?.apm ?? [];
    if (!Array.isArray(deps) || !deps.length) return 'Keep its dependency on microsoft/apm-sample-package (pinned).';
    const loose = deps.filter((d) => !pinnedRef(d));
    return !loose.length || `Not pinned to one exact release: ${loose.map(show).join(', ')}.`;
  }, { milestone: 'M1' }),
  t.check('node scripts/pins.mjs passes both manifests and fails a loose one', () => {
    const ok = t.node([PINS, 'apm.yml', 'studybuddy-plugin/apm.yml']);
    if (ok.code !== 0) return `node scripts/pins.mjs apm.yml studybuddy-plugin/apm.yml exited ${ok.code}: ${ok.all.trim().slice(0, 240)}`;
    const file = path.join(t.tmp(), 'apm.yml');
    fs.writeFileSync(file, 'name: x\nversion: 1.0.0\ndependencies:\n  apm:\n    - acme/skills#main\n');
    const bad = t.node([PINS, file]);
    return (bad.code === 1 && /acme\/skills/.test(bad.all)) || `On a manifest with acme/skills#main it should exit 1 and name it (exit ${bad.code}).`;
  }, { milestone: 'M1' }),

  // M2 · The lock verifier
  t.check('hashText(): SHA-256 hex of the text, with CRLF read as LF', async () => {
    const { hashText } = await t.import(VERIFY);
    const want = crypto.createHash('sha256').update('test').digest('hex');
    if (hashText('test') !== want) return `hashText("test") should be ${want} (SHA-256, hex). Got "${hashText('test')}".`;
    return hashText('a\r\nb\r\n') === hashText('a\nb\n') || 'A file checked out with CRLF line endings must hash like the LF one: replace \\r\\n with \\n first.';
  }, { milestone: 'M2' }),
  t.check('verifyLock(): a clean project passes, also with CRLF files and sha256: hashes', async () => {
    const { verifyLock } = await t.import(VERIFY);
    const clean = verifyLock(buildConsumer(t));
    if (!clean?.ok || clean.problems?.length) return `A project that matches its lock should pass. You said: ${show(clean?.problems?.[0] ?? clean)}`;
    const crlf = buildConsumer(t);
    edit(crlf, '.github/instructions/campus.instructions.md', (s) => s.replace(/\r?\n/g, '\r\n'));
    const r1 = verifyLock(crlf);
    if (!r1.ok) return `A deployed file checked out with CRLF line endings is not drift. You said: ${show(r1.problems[0])}`;
    const prefixed = verifyLock(buildConsumer(t, { prefix: 'sha256:' }));
    return prefixed.ok || `Newer locks write hashes as "sha256:<hex>": accept both. You said: ${show(prefixed.problems[0])}`;
  }, { milestone: 'M2' }),
  t.check('verifyLock() names each kind of drift', async () => {
    const { verifyLock } = await t.import(VERIFY);
    const missed = [];
    for (const [kind, what, mutate] of DRIFT) {
      const root = buildConsumer(t);
      mutate(root);
      const r = verifyLock(root);
      if (r?.ok !== false || !(r.problems ?? []).some((p) => p.kind === kind)) missed.push(`${what} → expected "${kind}", got ${r?.ok ? 'ok' : (r?.problems ?? []).map((p) => p.kind).join(', ') || 'nothing'}`);
    }
    return !missed.length || `verifyLock() missed: ${missed.join('; ')}.`;
  }, { milestone: 'M2' }),
  t.check('node scripts/verify-lock.mjs: exit 0 when clean, 1 on drift', () => {
    const root = buildConsumer(t);
    const ok = t.node([VERIFY, root]);
    if (ok.code !== 0) return `On a clean project it exited ${ok.code}: ${ok.all.trim().slice(0, 200)}`;
    fs.rmSync(path.join(root, '.github/prompts/hello.prompt.md'));
    const bad = t.node([VERIFY, root]);
    return (bad.code === 1 && /hello\.prompt\.md/.test(bad.all)) || `With a deployed file missing it should exit 1 and name the file (exit ${bad.code}).`;
  }, { milestone: 'M2' }),

  // M3 · Shadows
  t.check('findShadows() finds the 3 skill shadows and the 3 agent look-alikes in the fixture, and nothing else', async () => {
    const { findShadows } = await t.import(SHADOWS);
    const { root, plugin, expected } = buildShadows(t);
    const got = findShadows(root, [plugin]) ?? [];
    const key = (s) => `${s.kind} ${s.name} ${s.project}`;
    const missing = expected.filter((e) => !got.some((g) => key(g) === key(e)));
    const extra = got.filter((g) => !expected.some((e) => key(g) === key(e)));
    if (missing.length || extra.length) {
      return t.fail(`findShadows() ${missing.length ? `missed ${missing.map(key).join('; ')}` : ''}${missing.length && extra.length ? ', and ' : ''}${extra.length ? `wrongly reported ${extra.map(key).join('; ')}` : ''}.`, { expected: expected.map(key), actual: got.map(key) });
    }
    const want = (g) => expected.find((e) => key(e) === key(g));
    const wrongEffect = got.find((g) => g.effect !== want(g).effect);
    if (wrongEffect) return `${key(wrongEffect)} is a ${want(wrongEffect).effect}: ${want(wrongEffect).effect === 'shadow' ? 'a project skill with the plugin skill\'s name hides it' : `the plugin's agent stays available as ${want(wrongEffect).id}, so the project's is a look-alike`} (got effect "${wrongEffect.effect}").`;
    const wrongPlugin = got.find((g) => g.plugin !== want(g).plugin);
    if (wrongPlugin) return `Say which plugin file it is about: for ${key(wrongPlugin)} that's ${want(wrongPlugin).plugin} (got ${wrongPlugin.plugin}).`;
    const wrongId = got.find((g) => g.kind === 'agent' && g.id !== want(g).id);
    if (wrongId) return `For ${key(wrongId)}, give the plugin agent's own name: "${want(wrongId).id}" (<plugin name>:<agent name>, got "${wrongId.id}").`;
    return JSON.stringify(got.map(key)) === JSON.stringify(expected.map(key)) || 'Sort the result by kind, then name, then project path.';
  }, { milestone: 'M3' }),
  t.check('node scripts/find-shadows.mjs: exit 1 on the fixture, 0 on your project', () => {
    const { root, plugin } = buildShadows(t);
    const bad = t.node([SHADOWS, '--root', root, plugin]);
    if (bad.code !== 1 || !/sb-reviewer/.test(bad.all)) return `On the fixture it should exit 1 and name the shadows (exit ${bad.code}): ${bad.all.trim().slice(0, 200)}`;
    const ok = t.node([SHADOWS, 'studybuddy-plugin']);
    return ok.code === 0 || `Your own project hides an item of studybuddy-plugin: ${ok.all.trim().slice(0, 240)}`;
  }, { milestone: 'M3' }),

  // M4 · A breaking upgrade
  t.check('upgrade.mjs moves a clean project to campus-standards v2.0.0', () => {
    const root = buildConsumer(t);
    const r = upgradeCli(t, root);
    if (r.code !== 0) return `node scripts/upgrade.mjs ${CAMPUS} v2.0.0 --root <project> exited ${r.code}: ${r.all.trim().slice(0, 300)}`;
    const v2 = release(t, 'v2.0.0');
    const apm = fs.readFileSync(path.join(root, 'apm.yml'), 'utf8');
    if (!apm.includes(`${CAMPUS}#v2.0.0`) || apm.includes('#v1.4.0')) return `apm.yml should pin ${CAMPUS}#v2.0.0 now.`;
    const e = entryOf(root, CAMPUS);
    if (!e) return 'The lock lost its campus-standards entry.';
    if (e.resolved_ref !== 'v2.0.0' || e.resolved_commit !== v2.commit) return `The lock entry should say resolved_ref v2.0.0 and resolved_commit ${v2.commit} (release.json). Got ${e.resolved_ref} / ${e.resolved_commit}.`;
    const want = Object.keys(v2.files).sort();
    if (JSON.stringify([...(e.deployed_files ?? [])].sort()) !== JSON.stringify(want)) return `deployed_files should be exactly v2's files: ${want.join(', ')}.`;
    const badHash = want.filter((f) => String(e.deployed_file_hashes?.[f] ?? '').replace(/^sha256:/, '') !== sha(v2.files[f]));
    if (badHash.length) return `Wrong or missing hashes in the lock for: ${badHash.join(', ')}.`;
    const notDeployed = want.filter((f) => !fs.existsSync(path.join(root, f)) || sha(fs.readFileSync(path.join(root, f), 'utf8')) !== sha(v2.files[f]));
    if (notDeployed.length) return `These v2 files are missing or differ from vendor/: ${notDeployed.join(', ')}.`;
    if (fs.existsSync(path.join(root, '.github/skills/campus-grading-rules/SKILL.md'))) return 'The old skill (.github/skills/campus-grading-rules/) is still there: remove what v2 no longer deploys.';
    const sample = entryOf(root, 'microsoft/apm-sample-package');
    return (sample?.resolved_ref === 'v1.0.0' && sample.deployed_files?.length === 2) || 'The other package\'s lock entry must stay as it was.';
  }, { milestone: 'M4' }),
  t.check('The breaking change is migrated: nothing mentions campus-grading-rules any more', () => {
    const root = buildConsumer(t);
    const r = upgradeCli(t, root);
    if (r.code !== 0) return `The upgrade failed (exit ${r.code}).`;
    const left = Object.keys(snapshot(root)).filter((f) => fs.readFileSync(path.join(root, f), 'utf8').includes('campus-grading-rules'));
    if (left.length) return `These files still mention the old skill name: ${left.join(', ')}. Apply the release's migrations to the project's own files.`;
    return /campus-grading\b/.test(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')) || 'AGENTS.md should now name the campus-grading skill.';
  }, { milestone: 'M4' }),
  t.check('Your verifier agrees, and a second run changes nothing', async () => {
    const { verifyLock } = await t.import(VERIFY);
    const root = buildConsumer(t);
    if (upgradeCli(t, root).code !== 0) return 'The upgrade failed.';
    const v = verifyLock(root);
    if (!v.ok) return `After the upgrade, your verifyLock() finds drift: ${show(v.problems[0])}`;
    const before = snapshot(root);
    const again = upgradeCli(t, root);
    const diff = snapshotDiff(before, snapshot(root));
    if (again.code !== 0) return `Running it again should be a no-op that exits 0 (exit ${again.code}): ${again.all.trim().slice(0, 200)}`;
    return !diff.length || `The second run changed: ${diff.join(', ')}.`;
  }, { milestone: 'M4' }),
  t.check('It refuses to upgrade over drift, and changes nothing', () => {
    const root = buildConsumer(t);
    edit(root, '.github/instructions/campus.instructions.md', (s) => `${s}\n- Local tweak nobody reviewed.\n`);
    const before = snapshot(root);
    const r = upgradeCli(t, root);
    const diff = snapshotDiff(before, snapshot(root));
    if (r.code !== 1) return `A deployed file was edited by hand: the upgrade must refuse (exit 1), not overwrite it (exit ${r.code}).`;
    if (diff.length) return `It refused, but changed files anyway: ${diff.join(', ')}. Check everything before you write anything.`;
    return /campus\.instructions\.md/.test(r.all) || 'Say which file has drifted.';
  }, { milestone: 'M4' }),
  t.check('It refuses to overwrite a file the project owns', () => {
    const mine = '.github/skills/campus-grading/SKILL.md';
    const root = buildConsumer(t, { extra: { [mine]: '---\nname: campus-grading\ndescription: Our own grading notes. Use when grading.\n---\nOur rules.\n' } });
    const before = snapshot(root);
    const r = upgradeCli(t, root);
    const diff = snapshotDiff(before, snapshot(root));
    if (r.code !== 1) return `v2 deploys ${mine}, but the project already has its own file there, which no lock entry owns: refuse (exit 1) instead of overwriting it (exit ${r.code}).`;
    if (diff.length) return `It refused, but changed files anyway: ${diff.join(', ')}.`;
    return r.all.includes(mine) || `Name the file you won't overwrite (${mine}).`;
  }, { milestone: 'M4' }),
  t.check('It never follows a path out of the project, from the lock or from a release', () => {
    // 1. A lock entry that claims ../keep.txt (with the right hash, so it isn't drift): v2 doesn't deploy it, so a
    //    naive upgrade deletes a file outside the project.
    const root = buildConsumer(t, { nested: true, campusExtra: { '../keep.txt': 'Not the package\'s to delete.\n' } });
    const keep = path.join(root, '..', 'keep.txt');
    const before = snapshot(root);
    const r = upgradeCli(t, root);
    if (!fs.existsSync(keep)) return 'The lock said campus-standards deployed ../keep.txt, and the upgrade deleted it: a file OUTSIDE the project. Refuse lock paths with ".." or an absolute path.';
    if (r.code !== 1 || snapshotDiff(before, snapshot(root)).length) return `A lock entry with a path outside the project ("../keep.txt") must make the upgrade refuse (exit 1) and change nothing (exit ${r.code}).`;
    if (!r.all.includes('../keep.txt')) return 'Say which path you refused to touch (../keep.txt).';
    // 2. A release that deploys to ../escaped.txt: a copy of your scripts and vendor/ with one hostile release added.
    const tool = t.tmp();
    for (const d of ['scripts', 'vendor']) fs.cpSync(t.path(d), path.join(tool, d), { recursive: true });
    const hostile = path.join(tool, 'vendor/campus-standards/v2.0.1');
    fs.mkdirSync(path.join(hostile, 'files'), { recursive: true });
    fs.writeFileSync(path.join(hostile, 'files/x.md'), 'Written where it should never be.\n');
    const good = JSON.parse(fs.readFileSync(path.join(tool, 'vendor/campus-standards/v2.0.0/release.json'), 'utf8'));
    fs.writeFileSync(path.join(hostile, 'release.json'), JSON.stringify({ ...good, version: '2.0.1', ref: 'v2.0.1', deploy: { ...good.deploy, '../escaped.txt': 'files/x.md' } }, null, 2));
    for (const from of Object.values(good.deploy)) {
      fs.mkdirSync(path.dirname(path.join(hostile, from)), { recursive: true });
      fs.copyFileSync(path.join(tool, 'vendor/campus-standards/v2.0.0', from), path.join(hostile, from));
    }
    const project = buildConsumer(t, { nested: true });
    const snap = snapshot(project);
    const h = t.node([path.join(tool, UPGRADE), CAMPUS, 'v2.0.1', '--root', project]);
    if (fs.existsSync(path.join(project, '..', 'escaped.txt'))) return 'A release that deploys to "../escaped.txt" wrote a file OUTSIDE the project. Refuse release paths with ".." or an absolute path.';
    if (h.code !== 1 || snapshotDiff(snap, snapshot(project)).length) return `A release that wants to write outside the project must be refused (exit 1) with nothing changed (exit ${h.code}).`;
    return h.all.includes('../escaped.txt') || 'Say which path of the release you refused (../escaped.txt).';
  }, { milestone: 'M4' }),
]);
