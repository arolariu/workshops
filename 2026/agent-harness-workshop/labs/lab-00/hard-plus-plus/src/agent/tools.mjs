// 🧰 The mini agent's tools: four tools over a virtual workspace (an in-memory copy of the scenario's files), so a run
// can never touch your disk. Each tool has what the model needs to call it (name, description, JSON Schema
// parameters), a `kind` for the permission gate (read, write or shell), and `run(args, workspace)`, which returns
// { ok: true, content } or { ok: false, error }.

const norm = (p) => String(p ?? '').replace(/\\/g, '/').replace(/^\.\//, '');
const ok = (content) => ({ ok: true, content: String(content) });
const fail = (error) => ({ ok: false, error: String(error) });

/** The scenario's files, in memory: { has, read, write, remove, list }. */
export function workspace(files = {}) {
  const map = new Map(Object.entries(files).map(([p, s]) => [norm(p), String(s)]));
  return {
    has: (p) => map.has(norm(p)),
    read: (p) => map.get(norm(p)),
    write: (p, s) => { map.set(norm(p), String(s)); },
    remove: (p) => map.delete(norm(p)),
    list: () => [...map.keys()].sort(),
  };
}

/** A pretend shell: ls, cat, echo, rm (with -r) and npm test. Commands chain with &&, ||, ; and |. */
function shell(command, ws) {
  const parts = String(command ?? '').split(/\s*(?:&&|\|\||;|\|)\s*/).map((p) => p.trim()).filter(Boolean);
  const out = [];
  for (const part of parts) {
    const [cmd, ...args] = part.split(/\s+/);
    if (cmd === 'ls') out.push(ws.list().join('\n'));
    else if (cmd === 'echo') out.push(args.join(' '));
    else if (cmd === 'cat') {
      for (const a of args) {
        if (!ws.has(a)) return fail(`cat: ${a}: No such file or directory`);
        out.push(ws.read(a));
      }
    } else if (cmd === 'rm') {
      const recursive = args.some((a) => /^-[a-zA-Z]*[rR]/.test(a) || a === '--recursive');
      for (const target of args.filter((a) => !a.startsWith('-'))) {
        const t = norm(target).replace(/\/$/, '');
        const hits = ws.list().filter((p) => p === t || (recursive && p.startsWith(`${t}/`)));
        if (!hits.length) return fail(`rm: cannot remove '${target}': No such file or directory`);
        hits.forEach((p) => ws.remove(p));
      }
    } else if (cmd === 'npm' && args[0] === 'test') out.push(ws.has('.npm-test') ? ws.read('.npm-test') : 'ℹ tests 5 · pass 5 · fail 0');
    else return fail(`bash: ${cmd}: command not found`);
  }
  return ok(out.join('\n'));
}

export const TOOLS = [
  {
    name: 'view',
    kind: 'read',
    description: 'Read a file of the workspace and return its text.',
    parameters: { type: 'object', properties: { path: { type: 'string', description: 'The file, relative to the workspace.' } }, required: ['path'] },
    run: ({ path }, ws) => (ws.has(path) ? ok(ws.read(path)) : fail(`Path ${path} does not exist.`)),
  },
  {
    name: 'glob',
    kind: 'read',
    description: 'List the files of the workspace that match a pattern (* matches anything).',
    parameters: { type: 'object', properties: { pattern: { type: 'string', description: 'For example *.js or build/*.' } }, required: ['pattern'] },
    run: ({ pattern }, ws) => {
      const re = new RegExp(`^${String(pattern ?? '*').replace(/[.+^$()|[\]\\{}]/g, '\\$&').replace(/\*+/g, '.*').replace(/\?/g, '.')}$`);
      return ok(ws.list().filter((p) => re.test(p)).join('\n') || 'No files matched.');
    },
  },
  {
    name: 'edit',
    kind: 'write',
    description: 'Replace one exact piece of text in a file of the workspace.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' }, old_str: { type: 'string', description: 'The exact text to replace.' }, new_str: { type: 'string' } },
      required: ['path', 'old_str', 'new_str'],
    },
    run: ({ path, old_str: from, new_str: to }, ws) => {
      if (!ws.has(path)) return fail(`Path ${path} does not exist.`);
      const text = ws.read(path);
      if (!from || !text.includes(from)) return fail(`old_str was not found in ${path}.`);
      ws.write(path, text.replace(from, String(to ?? '')));
      return ok(`File ${path} updated.`);
    },
  },
  {
    name: 'bash',
    kind: 'shell',
    description: 'Run a shell command in the workspace (a pretend shell: ls, cat, echo, rm, npm test).',
    parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
    run: ({ command }, ws) => shell(command, ws),
  },
];
