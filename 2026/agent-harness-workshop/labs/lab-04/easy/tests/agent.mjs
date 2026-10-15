// 🤖 Agent check: ask about deadlines; the agent must call the portal (and only the portal is allowed).
import { serverConfig } from './common.mjs';

export default [
  {
    name: 'Copilot answers from the portal',
    prompt: 'What do I have due in the next 7 days? Use the university portal.',
    allow: (t) => [serverConfig(t).name],
    deny: ['write', 'shell'],
    expect: (t, { output }) => /3NF|normali[sz]e|sprint 2|A2/i.test(output) || `The answer doesn't mention the real deadlines (A2 "Normalize the schema to 3NF", A1 "Sprint 2 demo"). Copilot said: ${output.trim().slice(0, 200)}`,
  },
];
