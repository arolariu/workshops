// The checks' own reading of attack packs (independent of your scripts/attack.mjs), and the replay through your guard:
// the preToolUse hooks of .github/hooks/*.json, run like Copilot runs them, one call at a time as JSON on stdin.
import fs from 'node:fs';
import path from 'node:path';
import { scanHarness } from '../../../_harness/scorecard.mjs';

export const SHELLS = ['bash', 'powershell'];
const SHELL_TOOLS = new Set([...SHELLS, 'shell']);
const isShell = (call) => SHELL_TOOLS.has(call?.toolName);

/** The checks' copy of the shipped pack: editing attacks/pack.json can't weaken it. */
export const shipped = (t) => JSON.parse(fs.readFileSync(path.join(t.exDir, 'tests', 'fixtures', 'attack-pack.json'), 'utf8'));
export const shippedFile = (t) => path.join(t.exDir, 'tests', 'fixtures', 'attack-pack.json');

/** A shell call is judged as bash and as powershell: Copilot picks the shell tool by OS, models type either spelling. */
export const variants = (call) => (isShell(call) ? SHELLS.map((toolName) => ({ ...call, toolName })) : [call]);

export const label = (call) => {
  const text = (typeof call?.toolArgs?.command === 'string' ? call.toolArgs.command : `${call?.toolName} ${JSON.stringify(call?.toolArgs ?? {})}`).replace(/\s+/g, ' ');
  return `\`${text.length > 80 ? `${text.slice(0, 79)}…` : text}\``;
};
export const some = (list, n = 3) => list.slice(0, n).join(' · ') + (list.length > n ? ` (and ${list.length - n} more)` : '');

const canonical = (v) => (Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : v && typeof v === 'object'
  ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v));
/** Two calls that are the same attack: the same tool (any shell counts as one) and the same arguments. */
export const sameCall = (a, b) => (isShell(a) ? 'shell' : a?.toolName) === (isShell(b) ? 'shell' : b?.toolName) && canonical(a?.toolArgs) === canonical(b?.toolArgs);

const isCall = (c) => c && typeof c === 'object' && typeof c.toolName === 'string' && c.toolName.trim() !== ''
  && c.toolArgs && typeof c.toolArgs === 'object' && !Array.isArray(c.toolArgs);

/** What is wrong with a pack, judged by the pack's format (version 1). families: the family ids it may use. */
export function packProblems(pack, { families, file }) {
  if (!pack || typeof pack !== 'object' || pack.version !== 1) return [`${file} needs "version": 1.`];
  if (!Array.isArray(pack.attacks)) return [`${file} needs an "attacks" list.`];
  if (pack.allowed !== undefined && !Array.isArray(pack.allowed)) return [`${file}: "allowed" must be a list.`];
  const out = [];
  const seen = new Set();
  for (const [i, a] of pack.attacks.entries()) {
    const at = `${file}: attack ${a?.id ?? `#${i + 1}`}`;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(String(a?.id ?? ''))) out.push(`${at} needs an "id" in lowercase letters, digits and dashes`);
    else if (seen.has(a.id)) out.push(`${at}: the id is used twice`);
    seen.add(a?.id);
    if (!families.includes(a?.family)) out.push(`${at}: "family" must be one of ${families.join(', ')} (or a family you describe in "families")`);
    if (!String(a?.why ?? '').trim()) out.push(`${at} needs a "why": what the attack is after`);
    if (!isCall(a?.call)) out.push(`${at}: "call" needs a "toolName" and a "toolArgs" object, like { "toolName": "bash", "toolArgs": { "command": "…" } }`);
    if (a?.after !== undefined && (!isCall(a.after?.call) || typeof a.after?.result !== 'string')) out.push(`${at}: "after" needs the earlier "call" and the "result" text it returned`);
  }
  return out;
}

/** A local pack: the families it may use are the shipped ones plus the ones it describes itself. */
export const familiesFor = (base, pack) => [...new Set([...Object.keys(base.families ?? {}), ...Object.keys(pack?.families ?? {})])];

// `node <script>` (with optional quotes): the only kind of hook command the checks can replay.
const nodeScript = (command) => String(command ?? '').match(/^\s*node(?:\.exe)?\s+("?)([^"\s]+\.[cm]?js)\1/)?.[2] ?? null;

/** { bash: [scripts], powershell: [scripts] }: what each platform's preToolUse hooks run. Fails when a platform has none. */
export function hookGuards(t) {
  const pre = scanHarness(t.dir).hooks.flatMap((h) => h.preToolUse ?? []);
  const out = {};
  for (const shell of SHELLS) {
    if (!pre.some((e) => e?.[shell])) t.fail(`No preToolUse hook has a "${shell}" command in .github/hooks/*.json, so nothing guards the calls Copilot makes on ${shell === 'bash' ? 'macOS and Linux' : 'Windows'}.`);
    const scripts = pre.map((e) => ({ script: nodeScript(e?.[shell]), cwd: e?.cwd ?? '.' })).filter((x) => x.script)
      .map(({ script, cwd }) => path.posix.normalize(`${cwd}/${script}`.replace(/\\/g, '/')));
    if (!scripts.length) t.fail(`The preToolUse "${shell}" command is not \`node <script>\`, so the checks can't replay calls through it.`);
    out[shell] = [...new Set(scripts)];
  }
  return out;
}

/**
 * decide(call) → [{ tool, decision, reason }]: the call as each platform's hooks see it (a shell call becomes the bash
 * call on macOS and Linux and the powershell call on Windows; other tools run on both). Any deny denies.
 */
export function replayer(t) {
  const guards = hookGuards(t);
  const cwd = t.tmp();
  const cache = new Map();
  const run = (script, payload) => {
    const key = `${script}\n${payload.toolName}\n${canonical(payload.toolArgs)}`;
    if (!cache.has(key)) cache.set(key, t.hook(script, payload, { cwd }));
    return cache.get(key);
  };
  return (call) => SHELLS.map((shell) => {
    const payload = isShell(call) ? { ...call, toolName: shell } : call;
    const runs = guards[shell].map((script) => run(script, payload));
    const deny = runs.find((r) => r.decision === 'deny');
    const odd = runs.find((r) => r.decision !== 'allow');
    return { tool: isShell(call) ? shell : `${call.toolName} on ${shell === 'bash' ? 'macOS/Linux' : 'Windows'}`, decision: deny ? 'deny' : odd ? odd.decision : 'allow', reason: deny?.reason ?? odd?.stdout?.trim().slice(0, 80) ?? '' };
  });
}

/** Where a call got through or was blocked: "bash, powershell", or just the tool when it is the same on both platforms. */
const where = (call, results) => (!isShell(call) && results.length === SHELLS.length && results.every((r) => r.decision === results[0].decision)
  ? call.toolName : results.map((r) => (r.decision === 'allow' || r.decision === 'deny' ? r.tool : `${r.tool}: ${r.decision} output`)).join(', '));

/** The attacks a guard lets through: ["id (bash, powershell): `command`"]. */
export function missed(decide, attacks) {
  return attacks.flatMap((a) => {
    const open = decide(a.call).filter((r) => r.decision !== 'deny');
    return open.length ? [`${a.id} (${where(a.call, open)}): ${label(a.call)}`] : [];
  });
}

/** The calls a guard blocks although they are fine: ["id (bash): `command` → reason"]. */
export function blocked(decide, entries, pick = (e) => e.call) {
  return entries.flatMap((e) => {
    const shut = decide(pick(e)).filter((r) => r.decision !== 'allow');
    return shut.length ? [`${e.id} (${where(pick(e), shut)}): ${label(pick(e))}${shut[0].reason ? ` → "${shut[0].reason.slice(0, 70)}"` : ''}`] : [];
  });
}

// How a threat-model row can name each shipped family (the id itself always works).
export const FAMILY_WORDS = {
  destructive: /destruct|delet|wip(e|ing)/i,
  'secret-read': /read\w*\W+(\w+\W+){0,2}secrets?|secrets?\W+(\w+\W+){0,2}read/i,
  'secret-write': /writ\w*\W+(\w+\W+){0,2}secrets?|secrets?\W+(\w+\W+){0,2}writ/i,
  exfiltration: /exfiltrat|send\w*\W+(\w+\W+){0,2}out|upload|egress/i,
  'supply-chain': /supply|dependenc/i,
  tampering: /tamper|harness itself/i,
  injection: /inject/i,
};
export const familyRe = (id) => {
  const words = new RegExp(String(id).split(/[^a-z0-9]+/i).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\W*'), 'i');
  return FAMILY_WORDS[id] ? { test: (s) => FAMILY_WORDS[id].test(s) || words.test(s) } : words;
};
