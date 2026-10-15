// Small cross-platform helpers: run Copilot in the foreground, open a folder, copy to the clipboard.
import { spawn } from 'node:child_process';

const winQuote = (a) => (/^[\w\-./:=@,\\]+$/.test(a) ? a : `"${String(a).replace(/"/g, '""')}"`);

/** Run a command in the foreground with the terminal handed over to it. Resolves { code, missing }. */
export function runInteractive(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (r) => { if (!settled) { settled = true; resolve(r); } };
    const go = (shell) => {
      let child;
      try {
        child = spawn(cmd, shell ? args.map(winQuote) : args, { ...opts, stdio: 'inherit', shell });
      } catch {
        done({ code: -1, missing: true });
        return;
      }
      child.on('error', (e) => {
        if (e.code === 'ENOENT' && !shell && process.platform === 'win32') go(true);
        else done({ code: -1, missing: e.code === 'ENOENT' });
      });
      child.on('exit', (code) => done({ code: code ?? 0 }));
    };
    go(false);
  });
}

/** Start a program without waiting for it (e.g. VS Code or the file manager). Resolves true if it started. */
export function launchDetached(cmd, args) {
  return new Promise((resolve) => {
    const go = (shell) => {
      let child;
      try {
        child = spawn(cmd, shell ? args.map(winQuote) : args, { detached: true, stdio: 'ignore', shell, windowsHide: false });
      } catch {
        resolve(false);
        return;
      }
      child.on('error', (e) => {
        if (e.code === 'ENOENT' && !shell && process.platform === 'win32') go(true);
        else resolve(false);
      });
      child.on('spawn', () => { child.unref(); resolve(true); });
    };
    go(false);
  });
}

/** Open a folder in VS Code if available, otherwise in the system file manager. */
export async function openFolder(dir, { hasCode } = {}) {
  if (hasCode && (await launchDetached('code', [dir]))) return 'VS Code';
  const opener = process.platform === 'win32' ? ['explorer', [dir]] : process.platform === 'darwin' ? ['open', [dir]] : ['xdg-open', [dir]];
  return (await launchDetached(...opener)) ? 'your file manager' : null;
}

function pipeTo(cmd, args, text) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { stdio: ['pipe', 'ignore', 'ignore'], shell: process.platform === 'win32' });
    } catch {
      resolve(false);
      return;
    }
    const timer = setTimeout(() => { try { child.kill(); } catch { /* gone */ } resolve(false); }, 3000);
    child.on('error', () => { clearTimeout(timer); resolve(false); });
    child.on('close', (code) => { clearTimeout(timer); resolve(code === 0); });
    child.stdin.on('error', () => {});
    child.stdin.end(text);
  });
}

/** Copy text to the clipboard. Uses the OS tool when there is one, else the terminal (OSC 52). */
export async function copyToClipboard(text, writeToTerminal) {
  const tools = process.platform === 'win32' ? [['clip', []]]
    : process.platform === 'darwin' ? [['pbcopy', []]]
    : [['wl-copy', []], ['xclip', ['-selection', 'clipboard']], ['xsel', ['--clipboard', '--input']]];
  for (const [cmd, args] of tools) {
    if (await pipeTo(cmd, args, text)) return 'system';
  }
  writeToTerminal(`\x1b]52;c;${Buffer.from(text, 'utf8').toString('base64')}\x07`);
  return 'terminal';
}
