// 🤖 Agent check: does Copilot actually see what APM deployed?
import path from 'node:path';

const DEPLOY = /^(\.github\/(instructions|agents|prompts|skills|chatmodes)\/|\.agents\/skills\/)/;

export default [
  {
    name: 'Copilot sees the installed harness',
    prompt: 'List the names of the custom agents, skills and instruction files available in this project. Names only.',
    deny: ['write', 'shell'],
    expect: (t, { output }) => {
      const names = t.files('.').filter((f) => DEPLOY.test(f)).map((f) => path.basename(f).replace(/\.(agent|instructions|prompt|chatmode)\.md$/, '').replace(/\.md$/, '')).map((n, i, all) => n);
      const skills = t.files('.').filter((f) => DEPLOY.test(f) && f.endsWith('/SKILL.md')).map((f) => path.basename(path.dirname(f)));
      const all = [...names.filter((n) => n !== 'SKILL'), ...skills];
      if (!all.length) return 'Nothing was deployed by APM yet.';
      return all.some((n) => n.length > 2 && output.toLowerCase().includes(n.toLowerCase())) || `Copilot did not mention any of: ${all.join(', ')}`;
    },
  },
];
