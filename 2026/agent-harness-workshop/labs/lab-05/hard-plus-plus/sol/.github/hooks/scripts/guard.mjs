#!/usr/bin/env node
// 🔒 preToolUse guard, governance edition. Copilot runs this before EVERY tool call and sends the call as JSON on stdin:
//   { "toolName": "bash", "toolArgs": { "command": "npm test" }, "sessionId": "...", "cwd": "...", ... }
// Two policies decide: the organisation's (policies/org.json, or the file in HARNESS_ORG_POLICY), which nothing here can
// override, and this repository's (policies/repo.json). A session flagged by the prompt hook is in lockdown. Every decision
// goes into the hash-chained audit log. It fails closed: no usable policy, a crash, or no decision in time all deny.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { normalize, evaluate, effectivePolicy } from './engine.mjs';
import { append } from './audit-chain.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const POLICY = path.join(HERE, '..', 'policies', 'repo.json');
export const ORG_POLICY = process.env.HARNESS_ORG_POLICY ? path.resolve(process.env.HARNESS_ORG_POLICY) : path.join(HERE, '..', 'policies', 'org.json');
// Copilot's own hook timeout (timeoutSec in guardrails.json) fails OPEN: a hook that runs out of time lets the call
// through. So the guard keeps its own, much shorter deadline, and denies when it passes.
export const DEADLINE_MS = 1500;
export const CHAIN = path.join('.agent-logs', 'audit-chain.jsonl');
export const FLAGS = path.join('.agent-logs', 'flags');

const SECRETS = [/\bghp_[A-Za-z0-9]{36}\b/g, /\bgithub_pat_[A-Za-z0-9_]{22,}/g, /\bAKIA[0-9A-Z]{16}\b/g, /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, /\bsk-[A-Za-z0-9]{32,}\b/g];
// Mask secrets before anything is written to a log: the audit trail must not become the leak.
export const redact = (text) => SECRETS.reduce((acc, re) => acc.replace(re, '[REDACTED]'), String(text));
const safe = (id) => String(id ?? 'unknown').replace(/[^\w-]/g, '_');

function readJson(file, name) {
  try {
    return { value: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (e) {
    return { error: e.code === 'ENOENT' ? `There is no ${name} at ${file}` : `The ${name} is not valid JSON (${e.message})` };
  }
}

/** The effective policy (organisation + repository), or a reason why there is none that can be used. */
export function loadPolicy() {
  const org = readJson(ORG_POLICY, 'organisation policy');
  if (org.error) return { error: org.error };
  const repo = readJson(POLICY, 'repository policy');
  if (repo.error) return { error: repo.error };
  const { policy, problems } = effectivePolicy(org.value, repo.value);
  return problems.length ? { error: `The policy is broken: ${problems[0]}` } : { policy };
}

/** Is this session in lockdown? The prompt hook leaves a flag file when a prompt looked like an injection. */
export const lockedDown = (session) => Boolean(session) && fs.existsSync(path.join(FLAGS, `${safe(session)}.json`));

/** The full decision for one call: { decision, rule, severity, reason, layer }. */
export function decision(toolName, args, { session = null } = {}) {
  const { policy, error } = loadPolicy();
  if (error) return { decision: 'deny', rule: 'policy-unusable', severity: 'critical', reason: `${error}, so every call is blocked until a human fixes it.`, layer: 'org' };
  return evaluate(policy, normalize(toolName, args), { lockdown: lockedDown(session) });
}

/** The question the hard level's suite asks: a reason to block the call, or null to allow it. */
export function decide(toolName, args) {
  const d = decision(toolName, args);
  return d.decision === 'deny' ? d.reason : null;
}

// ---------- plumbing ----------
function readInput() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8') || 'null'); } catch { return null; }
}
function log(entry) {
  try {
    fs.mkdirSync('.agent-logs', { recursive: true });
    fs.appendFileSync(path.join('.agent-logs', 'guard.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
  } catch { /* logging must never break the agent */ }
  try {
    append(CHAIN, { type: 'decision', ...entry, at: new Date().toISOString() });
  } catch { /* the chain is evidence, not a gate: the decision stands */ }
}
/** Decide in a worker, so a policy that hangs (a catastrophic regex) can be stopped: no answer in time means deny. */
function decideInTime(tool, args, session) {
  return new Promise((resolve) => {
    const failClosed = (reason) => ({ decision: 'deny', rule: 'guard-failed', severity: 'critical', reason, layer: 'org' });
    const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { guardWorker: true, tool, args, session } });
    const timer = setTimeout(() => {
      worker.terminate();
      resolve(failClosed(`The guard could not decide within ${DEADLINE_MS} ms (time limit), so the call is blocked to be safe.`));
    }, DEADLINE_MS);
    worker.once('message', (d) => { clearTimeout(timer); worker.terminate(); resolve(d); });
    worker.once('error', (e) => { clearTimeout(timer); resolve(failClosed(`The guard crashed (${e.message}), so the call is blocked to be safe.`)); });
  });
}

if (!isMainThread && workerData?.guardWorker) {
  let d;
  try { d = decision(workerData.tool, workerData.args, { session: workerData.session }); } catch (e) { d = { decision: 'deny', rule: 'guard-failed', severity: 'critical', reason: `The guard crashed (${e.message}), so the call is blocked to be safe.`, layer: 'org' }; }
  parentPort.postMessage(d);
}

const isMain = isMainThread && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const input = isMain ? readInput() : null;
if (input && typeof input === 'object') {
  let args = input.toolArgs ?? {};
  if (typeof args === 'string') {
    try { args = JSON.parse(args); } catch { args = { raw: args }; }
  }
  if (!args || typeof args !== 'object') args = {};
  const tool = String(input.toolName ?? '');
  const session = input.sessionId ? String(input.sessionId) : null;
  const d = await decideInTime(tool, args, session);
  log({ session: session ?? 'unknown', tool, decision: d.decision, rule: d.rule ?? null, layer: d.layer ?? null, severity: d.severity ?? null, reason: d.reason || undefined, args: redact(JSON.stringify(args)).slice(0, 200) });
  if (d.decision === 'deny') process.stdout.write(JSON.stringify({ permissionDecision: 'deny', permissionDecisionReason: d.reason }));
  process.exit(0);
}
