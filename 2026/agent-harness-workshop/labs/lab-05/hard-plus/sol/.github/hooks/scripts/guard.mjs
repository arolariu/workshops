#!/usr/bin/env node
// 🔒 preToolUse guard, policy edition. Copilot runs this before EVERY tool call and sends the call as JSON on stdin:
//   { "toolName": "bash", "toolArgs": { "command": "npm test" }, "sessionId": "...", "cwd": "...", ... }
// The rules live in .github/hooks/policies/repo.json; engine.mjs decides. To block the call, print
// { "permissionDecision": "deny", "permissionDecisionReason": "..." }. To allow it, print nothing.
// It fails closed: a missing or broken policy, a crash, or no decision within DEADLINE_MS all deny.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { normalize, evaluate, validatePolicy } from './engine.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const POLICY = path.join(HERE, '..', 'policies', 'repo.json');
// Copilot's own hook timeout (timeoutSec in guardrails.json) fails OPEN: a hook that runs out of time lets the call
// through. So the guard keeps its own, much shorter deadline, and denies when it passes.
export const DEADLINE_MS = 1500;

const SECRETS = [/\bghp_[A-Za-z0-9]{36}\b/g, /\bgithub_pat_[A-Za-z0-9_]{22,}/g, /\bAKIA[0-9A-Z]{16}\b/g, /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, /\bsk-[A-Za-z0-9]{32,}\b/g];
// Mask secrets before anything is written to a log: the audit trail must not become the leak.
export const redact = (text) => SECRETS.reduce((acc, re) => acc.replace(re, '[REDACTED]'), String(text));

/** The policy, or a reason why there is none that can be used. */
export function loadPolicy(file = POLICY) {
  let policy;
  try {
    policy = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return { error: e.code === 'ENOENT' ? `There is no policy at .github/hooks/policies/${path.basename(file)}` : `The policy is not valid JSON (${e.message})` };
  }
  const problems = validatePolicy(policy);
  return problems.length ? { error: `The policy is broken: ${problems[0]}` } : { policy };
}

/** The full decision for one call: { decision, rule, severity, reason }. */
export function decision(toolName, args, { policyFile = POLICY } = {}) {
  const { policy, error } = loadPolicy(policyFile);
  if (error) return { decision: 'deny', rule: 'policy-unusable', severity: 'critical', reason: `${error}, so every call is blocked until a human fixes it.` };
  return evaluate(policy, normalize(toolName, args));
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
}
/** Decide in a worker, so a policy that hangs (a catastrophic regex) can be stopped: no answer in time means deny. */
function decideInTime(tool, args) {
  return new Promise((resolve) => {
    const failClosed = (reason) => ({ decision: 'deny', rule: 'guard-failed', severity: 'critical', reason });
    const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { guardWorker: true, tool, args } });
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
  try { d = decision(workerData.tool, workerData.args); } catch (e) { d = { decision: 'deny', rule: 'guard-failed', severity: 'critical', reason: `The guard crashed (${e.message}), so the call is blocked to be safe.` }; }
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
  const d = await decideInTime(tool, args);
  log({ tool, decision: d.decision, rule: d.rule ?? undefined, severity: d.severity ?? undefined, reason: d.reason || undefined, args: redact(JSON.stringify(args)).slice(0, 300) });
  if (d.decision === 'deny') process.stdout.write(JSON.stringify({ permissionDecision: 'deny', permissionDecisionReason: d.reason }));
  process.exit(0);
}
