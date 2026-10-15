// A tiny stand-in for the Copilot SDK so checks can load and exercise an extension.
export async function joinSession(options = {}) {
  const state = { options, commands: options.commands ?? [], tools: options.tools ?? [], hooks: options.hooks ?? {}, logs: [], listeners: {} };
  const session = {
    log: async (message, opts = {}) => { state.logs.push({ msg: String(message), level: opts.level ?? 'info' }); },
    on: (event, fn) => { (state.listeners[event] ??= []).push(fn); return () => {}; },
    send: async () => null,
    sendAndWait: async () => null,
  };
  state.session = session;
  globalThis.__fakeCopilot = state;
  return session;
}
