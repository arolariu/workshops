// Shared helpers for the Lab 05 checks: feed fake tool calls to your hook, like Copilot does.
export const GUARD = '.github/hooks/scripts/guard.mjs';
export const shell = (command) => ({ toolName: 'bash', toolArgs: { command } });
export const ps = (command) => ({ toolName: 'powershell', toolArgs: { command } });
export const tool = (toolName, toolArgs) => ({ toolName, toolArgs });
export const label = (p) => `${p.toolName} ${JSON.stringify(p.toolArgs).slice(0, 70)}`;

export function expectDecisions(t, deny, allow) {
  const wronglyAllowed = deny.filter((p) => t.hook(GUARD, p).decision !== 'deny').map(label);
  if (wronglyAllowed.length) return `Not blocked yet: ${wronglyAllowed.join(' · ')}`;
  const wronglyDenied = allow.filter((p) => t.hook(GUARD, p).decision !== 'allow').map(label);
  if (wronglyDenied.length) return `Blocked but should be allowed: ${wronglyDenied.join(' · ')}`;
  return true;
}

export function hookConfig(t) {
  const files = t.find(/^\.github\/hooks\/[^/]+\.json$/);
  if (!files.length) t.fail('No hook config in .github/hooks/*.json.');
  // Copilot loads every .github/hooks/*.json and runs the hooks of all of them, so the checks read them the same way.
  const hooks = {};
  for (const f of files) {
    const cfg = t.json(f);
    if (cfg.version !== 1) t.fail(`${f} needs "version": 1.`);
    for (const [event, list] of Object.entries(cfg.hooks ?? {})) hooks[event] = [...(hooks[event] ?? []), ...(Array.isArray(list) ? list : [])];
  }
  return hooks;
}
export const runs = (entries, script) => (entries ?? []).some((e) => e.type === 'command' && String(e.bash ?? '').includes(script) && String(e.powershell ?? '').includes(script));
