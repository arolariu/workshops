// 🤖 Agent check: a real write through YOUR tool (the state lands in the test copy's mcp/state.json).
import fs from 'node:fs';
import { serverConfig } from './common.mjs';

export default [
  {
    name: 'Copilot marks A2 as done through your tool',
    prompt: 'I finished assignment A2. Mark it as done in the portal, then tell me what is still due this week.',
    allow: (t) => [serverConfig(t).name],
    deny: ['write', 'shell'],
    // A state file left over from your own runs could already list A2: start without one.
    setup: (t) => fs.rmSync(t.path('mcp/state.json'), { force: true }),
    expect: (t) => /A2/.test(t.read('mcp/state.json') ?? '') || 'mcp/state.json does not contain A2. Did the agent call mark_done?',
  },
];
