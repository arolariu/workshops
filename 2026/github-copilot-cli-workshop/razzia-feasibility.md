# Razzia integration and Azure hosting feasibility

Research date: **28 October 2026**. Event date: **31 October 2026**.

## Decision

**Question-bank integration: feasible with a small format conversion.**
**Complete Razzia deployment on Azure Static Web Apps Free: not feasible as-is.**

Use the existing Razzia container on **Azure Container Apps Consumption** if an
Azure-hosted live quiz is required. Serve the frontend and backend together on
one HTTPS origin, with one active revision and one replica during the event.
This avoids a fork, cross-origin authentication changes, and a last-minute
rewrite of the real-time game server.

If zero additional Azure spend is a hard requirement, use an existing machine
with Docker and a tested participant-accessible network, or use the bank's
Kahoot import workflow subject to that service's account and participant limits.
Neither alternative guarantees venue connectivity or third-party free capacity.
Do not treat a Static Web Apps Free frontend as a free hosting solution for the
entire Razzia application.

This is a source-based feasibility assessment, not a deployment or load-test
result. No quiz conversion, Azure provisioning, image execution, or live
participant test was performed.

## Evidence baseline

The upstream repository was inspected at commit
[`5161eb7022144ee26d46a5f94cdbc714ec8b560d`](https://github.com/Ralex91/Razzia/tree/5161eb7022144ee26d46a5f94cdbc714ec8b560d).
Use the pinned source links below rather than assuming a future `main` or
`latest` image has the same behavior. The project is
[MIT-licensed](https://github.com/Ralex91/Razzia/blob/5161eb7022144ee26d46a5f94cdbc714ec8b560d/LICENSE);
retain the license notice when redistributing its software.

| Requirement | Evidence | Consequence |
| --- | --- | --- |
| Static frontend | [Container build](https://github.com/Ralex91/Razzia/blob/5161eb7022144ee26d46a5f94cdbc714ec8b560d/Dockerfile) builds `packages/web/dist` | The UI assets can be hosted statically, but they are not the complete application. |
| Live backend | [Socket server](https://github.com/Ralex91/Razzia/blob/5161eb7022144ee26d46a5f94cdbc714ec8b560d/packages/socket/src/app.ts) attaches Socket.IO to a Node HTTP server at `/ws` | A persistent server is required for rooms, answers, and broadcasts. |
| Same-origin API and socket | [API client](https://github.com/Ralex91/Razzia/blob/5161eb7022144ee26d46a5f94cdbc714ec8b560d/packages/web/src/lib/api.ts) uses `/api`; [socket client](https://github.com/Ralex91/Razzia/blob/5161eb7022144ee26d46a5f94cdbc714ec8b560d/packages/web/src/features/game/contexts/socket-context.tsx) uses `io("/")` and `/ws` | Splitting the frontend requires code changes, not just uploading its build output. |
| In-memory games | [Configuration documentation](https://github.com/Ralex91/Razzia/blob/5161eb7022144ee26d46a5f94cdbc714ec8b560d/docs/configuration.md) states that restarting ends running games | A persistent file share does not preserve a live game after a restart. |
| Writable files | The same configuration documentation lists `config/quizz`, `results`, `media`, and `branding` | Quiz content and saved results need persistent storage if they must survive replacement. |
| Integrated runtime | [Nginx configuration](https://github.com/Ralex91/Razzia/blob/5161eb7022144ee26d46a5f94cdbc714ec8b560d/docker/nginx.conf) serves assets and proxies `/api` and `/ws` through port 3000 | The upstream container already provides a single-origin deployment. |

## Integrating this question bank

### Input inventory

[`quiz-bank.md`](quiz-bank.md) contains nine modules, each with five live
questions and three bonus questions: **72 questions total**. Its nine
Kahoot-style Markdown tables already contain question text, ordered answers,
timers, set membership, and correct-answer numbers. Inspection of those tables
found **64 four-option questions, eight two-option questions, one correct
answer per question, and 20-second timers throughout**. The introduction allows
20 or 30 seconds; retain the actual per-row value rather than that general
description.

An additional Kahoot CSV export is **optional**, not a prerequisite. It could
simplify a future converter, but the Markdown already has the necessary data.
Razzia's inspected
[manager import UI](https://github.com/Ralex91/Razzia/blob/5161eb7022144ee26d46a5f94cdbc714ec8b560d/packages/web/src/features/manager/components/configurations/ConfigManageQuizz.tsx)
accepts JSON and calls the quiz-creation API; it is not a native Kahoot CSV
importer. CSV would still require conversion.

### Field mapping

Use Razzia's [quiz documentation](https://github.com/Ralex91/Razzia/blob/5161eb7022144ee26d46a5f94cdbc714ec8b560d/docs/quiz.md)
and [validator](https://github.com/Ralex91/Razzia/blob/5161eb7022144ee26d46a5f94cdbc714ec8b560d/packages/common/src/validators/quizz.ts)
as the contract:

| Bank field | Razzia field | Conversion |
| --- | --- | --- |
| Module title and Live/Bonus set | `subject` | Prefer 18 quizzes: one five-question live quiz and one three-question bonus quiz per module. |
| Question text | `questions[].question` | Preserve text and Unicode; do not include the local `Q1` label. |
| Answer 1-4 | `answers` | Preserve order; omit empty trailing cells for true/false questions. |
| Correct answer number | `solutions` | Convert one-based positions to zero-based indices: answer 2 becomes `[1]`. |
| Time limit | `time` | Preserve the row's seconds; all current rows use 20. |
| Question kind | `type` | Use `"single"` for all current questions, including true/false. A future multiple-answer item needs `"multi"`. |
| Explanation and source in readable question section | `note` | Combine the corresponding `Why` and `Source` text; use plain text and a source URL rather than assuming rich Markdown rendering. |
| No bank equivalent | `cooldown` | Proposed value: `5` seconds, within the documented 3-15 range; confirm pacing in rehearsal. |
| No bank equivalent | `gameMode` | Explicitly use `"quiz"`. |

Do not shuffle again during conversion: the bank already shuffles answers.
Match explanations by **module and local question number**, since Q1-Q8 restart
in each module. A CSV export may omit explanations and sources, so keep the
Markdown as the canonical source even if CSV is used as an intermediate.

Keep the nine live quizzes separate for the deck's module breaks. A single
45-question quiz is possible, but changes the host workflow and leaderboard
continuity. Razzia's optional `category` field groups consecutive questions and
suppresses intermediate leaderboards within a category; leave it unset unless
that round behavior is intentional.

Illustrative JSON for the bank's first question (not a complete converted bank):

```json
{
  "gameMode": "quiz",
  "subject": "Module 1 - Anatomy of a turn - Live",
  "questions": [
    {
      "type": "single",
      "question": "In Copilot CLI, one iteration of the agent loop equals how many LLM API calls?",
      "answers": [
        "None if tools are cached",
        "Exactly one",
        "Two: plan, then act",
        "One per tool call"
      ],
      "solutions": [1],
      "cooldown": 5,
      "time": 20,
      "note": "Each loop iteration is exactly one LLM API call: one assistant.turn_start/turn_end pair in events.jsonl. Source: https://github.com/github/copilot-sdk/blob/main/docs/features/agent-loop.md"
    }
  ]
}
```

Import each converted JSON file through the manager's quiz import button, use
authenticated `POST /api/quizz`, or place files under the writable
`config/quizz` directory before starting the service. Do not invent quiz IDs:
Razzia manages them. See the [HTTP API](https://github.com/Ralex91/Razzia/blob/5161eb7022144ee26d46a5f94cdbc714ec8b560d/docs/http-api.md).

Before calling a conversion ready, verify exactly 18 files, 45 live and 27
bonus questions with no omissions or duplicates, 2-4 nonempty options, in-range
zero-based solutions, unchanged answer ordering, correct module/explanation
pairing, and per-question timers. Validate with the pinned upstream schema and
perform a manager import and reveal preview. The factual accuracy of the
supplied Copilot questions has not been independently re-audited here.

## Why Static Web Apps Free is insufficient

Microsoft's [API support documentation](https://learn.microsoft.com/en-us/azure/static-web-apps/apis-overview)
states that managed Azure Functions APIs are available on all plans,
bring-your-own linked backends require **Standard**, API requests have a
**45-second maximum**, and **WebSocket APIs are not supported**.

Free does not provide a place to run the existing container or an always-on
Node/Socket.IO process. Rewriting `/ws` to `/api` or enabling a SPA navigation
fallback does not create that process. Socket.IO's HTTP long-polling fallback
also still requires its stateful server; it does not make Razzia a collection
of stateless Azure Functions.

The [Free quotas](https://learn.microsoft.com/en-us/azure/static-web-apps/quotas)
include 100 GB monthly bandwidth per subscription, 250 MB storage per
environment, 500 MB across environments, and three preview environments.
These are static hosting quotas, not a writable runtime disk, room-state
store, or backend compute allocation.

| Architecture | Feasible? | Effort and cost implication |
| --- | --- | --- |
| Complete Razzia on SWA Free only | No, not as-is | Runtime, real-time transport, and writable storage are missing. |
| SWA Free frontend calling a separately hosted Razzia backend directly | Possible with changes | Update API **and session bootstrap** calls, Socket.IO origin, media/branding URLs, and backend CORS/preflight handling for bearer authorization. Add SPA deep-link fallback. Backend hosting/storage costs remain separate. This does not use SWA's Standard-only backend linking. |
| SWA Standard with linked backend | Not an as-is fix | Linking only supports the documented HTTP `/api` surface, not Razzia's `/ws`. The backend still needs hosting and direct socket connectivity or another proxy. |
| Whole upstream container on Container Apps Consumption | Yes, architecturally | Existing single-origin API/socket routing; compute grant may cover a short event, but storage and ancillary services can cost money. |
| Whole container on an existing Docker-capable host | Yes, architecturally | Lowest cloud dependency; participant network access, TLS where appropriate, and host availability must be rehearsed. |

Replacing Socket.IO with Azure Web PubSub or SignalR and moving games into
external state would be a redesign, not a deployment switch. It is not the
recommended path three days before the presentation.

## Proposed Azure event setup

This is a deployment outline, not provisioned infrastructure or a tested
deployment script.

1. Select the Azure subscription, region, expected peak player count, acceptable
   spend, and storage retention period. Check regional availability and quota
   before committing to this route.
2. Select a tested upstream container image and pin its digest. The upstream
   README publishes `ralex91/razzia` and `ghcr.io/ralex91/razzia`; do not assume
   their moving `latest` tags match the source commit inspected here.
3. Use a Consumption workload profile with external **HTTP ingress targeting
   port 3000**, HTTPS enforced, and no separate public socket port. Container
   Apps [HTTP ingress supports WebSockets and TLS termination](https://learn.microsoft.com/en-us/azure/container-apps/ingress-overview).
   Start sizing at 0.5 vCPU / 1 GiB only as a rehearsal candidate, not a
   measured capacity recommendation.
4. Configure one active revision and `minReplicas: 1`, `maxReplicas: 1` during
   rehearsal and the event. Independent replicas cannot share Razzia's
   in-memory game registry; sticky sessions alone do not synchronize a game
   between the manager and different players. Avoid deployments and restarts
   during a quiz.
5. Mount an Azure Files share read/write at `/app/config`, with quizzes seeded
   or imported before the session. [Container-local and replica-local storage
   are ephemeral](https://learn.microsoft.com/en-us/azure/container-apps/storage-mounts).
   Persistent files preserve content and saved results, **not an active game**.
6. Supply a strong `MANAGER_PASSWORD` and an independently generated
   `JWT_SECRET` of at least 32 characters through secret references. Do not
   put credentials in this repository, images, slides, or shell history.
   Do not add a blanket interactive Azure login gate that prevents students
   from joining; Razzia has its own manager/player session model.
7. Check `GET /api/health`, import the converted quizzes, sign in at `/manager`,
   create a game, and distribute the public HTTPS join URL and room code.
   Configure health probes conservatively and rehearse to avoid unintended
   restarts during a live room.
8. Back up quiz files and export completed results. After the event, stop
   running compute when no longer needed and explicitly review storage,
   logging, registry, and retention charges. Merely closing the browser does
   not stop resource billing.

### Cost envelope, not a free-tier promise

[Container Apps Consumption billing](https://learn.microsoft.com/en-us/azure/container-apps/billing)
currently includes monthly grants per subscription of **180,000 vCPU-seconds,
360,000 GiB-seconds, and two million HTTP requests**.

As an illustrative resource calculation, one 0.5-vCPU / 1-GiB replica allocated
for four hours represents **7,200 vCPU-seconds and 14,400 GiB-seconds**.
That is below those two grants if they have not already been consumed; it is
not a player-capacity estimate or a complete price quote. Rehearsals, idle
uptime, other workloads, and HTTP requests also matter. Azure Files, logging,
image storage, networking, and optional services may be billed separately.
Review the subscription's remaining grant and regional prices and set a budget
alert; an alert is not a hard spending cap.

## Event readiness and fallback

The project describes itself as suitable for smaller events; that is not a
published participant SLA or a verified maximum. Peak attendance is unknown.
Before relying on it on 31 October:

- Rehearse on the venue Wi-Fi and mobile networks with the expected concurrent
  players and host screen; exercise answer submission, leaderboard updates,
  an entire module, and a pause at least as long as a presentation segment.
- Verify HTTPS/WSS, mobile readability of the longest questions, true/false
  layouts, correct-answer reveals, explanation/source display, host pacing,
  and manager versus player permissions.
- Test browser refresh, network disconnect/reconnect, a late join, room
  locking, and completed-result export. Document that a backend restart
  requires starting a new game; persistent storage does not change this.
- Use a unique manager password, keep it off the projector, and restrict
  public exposure to the necessary event window. Upstream explicitly documents
  no manager-login rate limiting and enumerable six-digit room codes in its
  [HTTP API notes](https://github.com/Ralex91/Razzia/blob/5161eb7022144ee26d46a5f94cdbc714ec8b560d/docs/http-api.md).
  Generated nicknames and room locking can help with classroom moderation.
- Keep saved participant names/results out of Git and agree on retention.
  Keep the original Markdown available for a show-of-hands fallback and, if
  desired, prepare the bank's Kahoot workflow in advance.

**Go/no-go:** proceed with Razzia only after conversion, full participant-path
rehearsal, and cost review. Do not promise an SWA-Free-only live instance.
The remaining implementation work is JSON conversion, image selection,
deployment/storage configuration, and rehearsal; none is silently implied by
this research PR.
