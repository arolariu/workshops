// Free checks for Lab 06 · easy. Some depend on your machine (APM installed, network, installed plugins).
const DEPLOY = /^(\.github\/(instructions|agents|prompts|skills|chatmodes)\/|\.agents\/skills\/)/;

export default (t) => [
  t.check('apm.yml exists and has a name', () => {
    const y = t.yaml('apm.yml', 'Create `apm.yml` (hint: `apm init -y`).');
    return Boolean(y?.name) || 'apm.yml needs a `name`.';
  }),
  t.check('It depends on the sample package, pinned to a version', () => {
    const deps = t.yaml('apm.yml')?.dependencies?.apm ?? [];
    const list = (Array.isArray(deps) ? deps : []).map((d) => (typeof d === 'string' ? d : d?.git ?? d?.repo ?? JSON.stringify(d)));
    const hit = list.find((d) => d.includes('microsoft/apm-sample-package'));
    if (!hit) return 'dependencies.apm should include microsoft/apm-sample-package (installing it with APM adds it for you).';
    return /#\S+/.test(hit) || `"${hit}" is not pinned. Add a version tag: microsoft/apm-sample-package#v1.0.0`;
  }),
  t.check('apm.lock.yaml records the exact versions', () =>
    t.exists('apm.lock.yaml') || 'No apm.lock.yaml yet: install the package with APM.', { env: true }),
  t.check('The package was deployed where Copilot looks', () => {
    const deployed = t.files('.').filter((f) => DEPLOY.test(f));
    return deployed.length > 0 || 'No files in .github/instructions, agents, skills or .agents/skills yet. Did you use --target copilot?';
  }, { env: true }),
  t.check('A marketplace plugin is installed', () => {
    const r = t.copilot(['plugin', 'list', '--json']);
    let list = [];
    try { list = JSON.parse(r.stdout); } catch { return `Could not read the plugin list: ${r.all.trim().slice(0, 120)}`; }
    return list.some((p) => p.source !== 'external') || 'No installed plugins yet: browse awesome-copilot and install one.';
  }, { needs: ['copilot'], env: true }),
];
