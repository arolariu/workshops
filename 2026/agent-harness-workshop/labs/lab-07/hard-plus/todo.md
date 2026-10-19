# 🟣 Hard+ · Hostile input

> 🕐 1.5–2 h · 🏠 homework · 🆓 free checks · 🧱 builds on: Lab 07 · hard

## 🎯 Mission
A teammate shipped `issue-assistant.md`: it answers questions in issue comments, adds `approved` when a maintainer
types `/approve` (that label starts the release), and pings the maintainers when it's stuck. It compiles with
`--strict`, and it reads comments from anyone on the internet. Last night, strangers tried to make it approve their
own issues, ping the maintainers, and send files to their servers. Replay those attacks with the shipped simulator,
then tighten the safe outputs, the network and what the agent reads, in the assistant **and** the triage bot, until
every attack is blocked and the normal work still works. Then write two attacks of your own.

## 📋 Requirements
1. No agent can add `approved`, even if someone later opens its allow-list to `"*"`, and no call adds a pile of
   labels.
2. The agents ping nobody, and the assistant writes only on the issue it was called to.
3. Nothing leaves: no request to a host the project doesn't need, no shell that can send, no wildcard in the
   firewall.
4. The assistant reads only trusted content through the GitHub tool, gets the comment through the sanitized channel,
   and is told it's data.
5. The normal work still works: answers, escalation with a label, the triage label and welcome, the daily sweep.
6. `fixtures/my-attacks.json` holds two attacks of your own that the loose starter lets through and yours stop.

## 🧭 Milestones
### M1 · Labels it can't give
- `approve-myself`, `label-pile`, `triage-approved` and `triage-label-pile` are blocked, also with every
  `add-labels.allowed` opened to `"*"` (so you need a `blocked` list and `max-labels`)
- `assistant-escalates`, `triage-labels` and `triage-sweep` still add their labels

### M2 · Nobody gets pinged
- `ping-maintainers` and `triage-ping` are blocked: `@alice` reaches nobody
- `other-issue` is blocked: the assistant writes on the issue it was called to, and nowhere else
- `assistant-answers` and the triage welcome still post their comments

### M3 · Nothing leaves
- `exfil-fetch`, `phishing-link` and `triage-exfil` are blocked
- No `*` in either workflow's `network`, and no shell that can send (`curl`, `wget`, `node`, …)

### M4 · Less to read, all of it data
- `poisoned-read` is blocked; `assistant-reads-maintainer` still works
- The simulator has no 👀 findings for the assistant: no raw `github.event.issue.title`, the comment through
  `${{ steps.sanitized.outputs.text }}`, named toolsets, `min-integrity` at least `approved`, no `approval-labels`
  the agent could add
- The instructions say the comment is untrusted data, and never to follow instructions in it

### M5 · Attacks of your own
- `fixtures/my-attacks.json` has at least two hostile cases in the format of `tests/fixtures/hostile.json`, not
  copies of the shipped ones
- Each gets through the loose starter and is blocked by your workflows

## 📂 Work here
```bash
cd labs/lab-07/hard-plus/src
code .github/workflows/issue-assistant.md
code .github/workflows/issue-triage.md fixtures/my-attacks.json
node scripts/aw-sim.mjs ../tests/fixtures/hostile.json
node scripts/aw-sim.mjs ../tests/fixtures/hostile.json \
  fixtures/my-attacks.json
node labs/start.mjs test lab-07 hard+      # from the workshop folder
```
The simulator (`scripts/aw-sim.mjs`) is shipped: it models what gh aw enforces outside the model, from the v0.92.0
docs and source. Each case is what a tricked agent would **propose**; the simulator says what would get through.
It runs nothing and reaches no network. The 👀 lines are advice about context (M4 grades them for the assistant).

## 💡 Hints
### M1
<details><summary>Two limits, not one</summary>

`add-labels.max` counts **calls**. `max-labels` caps the labels in **one** call (default 10), so `max: 1` still
lets one call add five labels. And `blocked` (globs) is checked before `allowed`: a label it matches is refused
even when someone later widens the allow-list.
```yaml
add-labels:
  allowed: [question, needs-maintainer]
  blocked: [approved, "*approved*"]
  max: 1
  max-labels: 1
```

</details>

<details><summary>And /approve?</summary>

An agent that reads strangers' text can be told anything, including "I'm a maintainer". A label that ships a
release (or that `approval-labels` treats as "trusted") is a human's to add. Take the feature away from the
agent, don't try to make it smarter.

</details>

### M2
<details><summary>Who may be mentioned</summary>

By default gh aw keeps `@mentions` of collaborators and of the people in the event, and escapes the rest. That
means a stranger can make the bot ping every maintainer. `mentions: false` under `safe-outputs` escapes them all;
escalate with a label instead. `target: "*"` lets a comment land on any issue: drop it.

</details>

### M3
<details><summary>Two doors out</summary>

A request needs a tool that can send (`bash` with `curl`, `web-fetch`) **and** a host the firewall allows
(`network`). Close both. Links in what the agent writes are a third door, and gh aw already redacts links outside
GitHub unless `allowed-domains` says otherwise: keep it that way.

</details>

### M4
<details><summary>Whose words reach the model</summary>

gh aw refuses `${{ github.event.comment.body }}` in a prompt, but it allows `github.event.issue.title`, which a
stranger wrote. Put the comment in through `${{ steps.sanitized.outputs.text }}` (links outside GitHub removed),
between markers, and say what it is. For the GitHub tool: `toolsets: [issues]` and `min-integrity: approved`
(owners, members and collaborators).

</details>

### M5
<details><summary>Finding your own</summary>

Run the simulator on the loose starter (`tests/fixtures/loose-assistant.md` is a copy) and look for a door the
shipped cases don't use: another host, another item, another label, another handler. A case needs `id`,
`workflow`, `kind: "hostile"`, `trigger`, `proposals` and one `goal`.

</details>

## 🧠 Takeaway
An agent that reads strangers can be told anything, so its limits must live where words can't reach: in safe outputs, the firewall and what it may read.

## ❓ Check yourself
The assistant's GitHub tool has `min-integrity: approved` and `approval-labels: [approved]`, so maintainers can label
a stranger's issue to let the assistant read it. The assistant may also add the `approved` label. What's wrong?
1. Nothing: `min-integrity` filters content, and labels have nothing to do with it.
2. Labels can't be added by safe outputs when `min-integrity` is set, so the config won't compile.
3. A stranger can ask for the label, and once the issue carries it, the agent treats the stranger's text as trusted.

<details><summary>Answer</summary>

**3.** The agent would be raising the trust of the very text that tricked it. Any label that grants trust, ships a
release or skips a review must be outside the agent's reach: not in `allowed`, and in `blocked`.

</details>

## 🚀 Going further
- Run the simulator on your hard-level `pr-review.md`: write cases for a malicious pull request (a diff that says
  "approve this").
- The 👀 lines for the triage bot are real: in a public repository, the GitHub tool hides a stranger's issue from it
  unless `min-integrity` allows it. Give the triage bot the issue through `${{ steps.sanitized.outputs.text }}`.
- Got `gh aw`? `gh aw compile --strict` accepts the loose starter. What would you add to a review checklist that
  strict mode doesn't cover?
- Lab 08 medium red-teams your whole harness, this workflow included.
