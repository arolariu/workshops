#!/usr/bin/env node
// 🏛️ CampusHub's policy guard: the organisation's policy on top of CampusHub's own, before every tool call.
// Copilot sends the call as JSON on stdin ({ toolName, toolArgs, sessionId, cwd, … }); to block it, print
// { "permissionDecision": "deny", "permissionDecisionReason": "…" }. StudyBuddy's installed guard runs next to this
// one (.github/hooks/apm-guardrails.json): Copilot runs every preToolUse hook, and one deny blocks the call.
//   policies/org.json   the university's baseline (or the file in HARNESS_ORG_POLICY): nothing here can weaken it
//   policies/repo.json  CampusHub's own rules: the API key, .env.campushub, deploys, tickets, approvals
// It fails closed: no usable policy, a crash, or no decision in time all deny. Every decision goes to
// .agent-logs/policy.jsonl with its layer.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { normalize, evaluate, effectivePolicy } from './engine.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_POLICY = path.join(HERE, '..', 'policies', 'repo.json');
export const orgPolicyFile = () => (process.env.HARNESS_ORG_POLICY ? path.resolve(process.env.HARNESS_ORG_POLICY) : path.join(HERE, '..', 'policies', 'org.json'));
// Copilot's own hook timeout (timeoutSec) fails OPEN, so the guard keeps a shorter deadline of its own and denies.
export const DEADLINE_MS = 1500;
export const LOG = path.join('.agent-logs', 'policy.jsonl');

function readJson(file, name) {
  try {
    return { value: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (e) {
    return { error: e.code === 'ENOENT' ? `There is no ${name} at ${file}` : `The ${name} is not valid JSON (${e.message})` };
  }
}

/** The effective policy (organisation over repository): { policy } or { error } when there is none that can be used. */
export function loadPolicy() {
  const org = readJson(orgPolicyFile(), 'organisation policy');
  if (org.error) return { error: org.error };
  const repo = readJson(REPO_POLICY, 'repository policy');
  if (repo.error) return { error: repo.error };
  const { policy, problems } = effectivePolicy(org.value, repo.value);
  return problems.length ? { error: `The policy is broken: ${problems[0]}` } : { policy };
}

/** The decision for one call: { decision: 'allow' | 'deny', rule, layer, severity, reason }. */
export function decision(toolName, args, { session = null } = {}) {
  void session; // a hook for lockdown (Lab 05 hard++): CampusHub doesn't flag sessions yet
  const { policy, error } = loadPolicy();
  if (error) return { decision: 'deny', rule: 'policy-unusable', layer: 'org', severity: 'critical', reason: `${error}, so every call is blocked until a human fixes it.` };
  const d = evaluate(policy, normalize(toolName, args));
  return { decision: d.decision, rule: d.rule, layer: d.layer, severity: d.severity, reason: d.reason };
}

// ---------- plumbing: you don't need to change anything below this line ----------
const SECRETS = [/\bchk_(live|test)_[A-Za-z0-9]{8,}/g, /\bghp_[A-Za-z0-9]{36}\b/g, /\bgithub_pat_[A-Za-z0-9_]{22,}/g, /\bAKIA[0-9A-Z]{16}\b/g];
export const redact = (text) => SECRETS.reduce((acc, re) => acc.replace(re, '[REDACTED]'), String(text));

function readInput() {
  let raw = '';
  try { raw = fs.readFileSync(0, 'utf8'); } catch { return undefined; }
  if (!raw.trim()) return null;
  try { return JSON.parse(raw); } catch { return undefined; }
}
function log(entry) {
  try {
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    fs.appendFileSync(LOG, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
  } catch { /* logging must never break the agent */ }
}
const failClosed = (reason) => ({ decision: 'deny', rule: 'guard-failed', layer: 'org', severity: 'critical', reason });
/** Decide in a worker, so a policy that hangs (a catastrophic regex) can be stopped: no answer in time means deny. */
function decideInTime(tool, args, session) {
  return new Promise((resolve) => {
    const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { policyWorker: true, tool, args, session } });
    const timer = setTimeout(() => { worker.terminate(); resolve(failClosed(`The policy guard could not decide within ${DEADLINE_MS} ms, so the call is blocked to be safe.`)); }, DEADLINE_MS);
    worker.once('message', (d) => { clearTimeout(timer); worker.terminate(); resolve(d); });
    worker.once('error', (e) => { clearTimeout(timer); resolve(failClosed(`The policy guard crashed (${e.message}), so the call is blocked to be safe.`)); });
  });
}
if (!isMainThread && workerData?.policyWorker) {
  let d;
  try { d = decision(workerData.tool, workerData.args, { session: workerData.session }); } catch (e) { d = failClosed(`The policy guard crashed (${e.message}), so the call is blocked to be safe.`); }
  parentPort.postMessage(d && typeof d === 'object' ? d : failClosed('The policy guard returned no decision, so the call is blocked to be safe.'));
}

const sameFile = (a, b) => { try { return fs.realpathSync.native(a) === fs.realpathSync.native(b); } catch { return false; } };
const isMain = isMainThread && process.argv[1] && sameFile(process.argv[1], fileURLToPath(import.meta.url));
if (isMain) {
  const input = readInput();
  let d;
  let tool = 'unknown';
  let args = {};
  let session = 'unknown';
  if (!input || typeof input !== 'object' || Array.isArray(input) || !input.toolName) {
    d = { decision: 'deny', rule: 'unreadable-call', layer: 'org', severity: 'critical', reason: 'The policy guard could not read this tool call, so it is blocked to be safe.' };
  } else {
    tool = String(input.toolName);
    session = input.sessionId ? String(input.sessionId) : 'unknown';
    args = input.toolArgs ?? {};
    if (typeof args === 'string') { try { args = JSON.parse(args); } catch { args = { raw: args }; } }
    if (!args || typeof args !== 'object') args = {};
    d = await decideInTime(tool, args, session);
  }
  log({ session, tool, decision: d.decision, rule: d.rule ?? null, layer: d.layer ?? null, severity: d.severity ?? null, args: redact(JSON.stringify(args)).slice(0, 200) });
  if (d.decision === 'deny') process.stdout.write(JSON.stringify({ permissionDecision: 'deny', permissionDecisionReason: `${d.rule ?? 'policy'}: ${d.reason ?? 'Blocked by the policy.'}` }));
  process.exit(0);
}
