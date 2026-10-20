# Phase 5 · Task 10 · CampusHub (the Lab 08 hard++ level asset): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship **CampusHub**, the unfamiliar second codebase that Lab 08 · 💎 hard++ "Roll it out" hands the learner:
a small, plausible three-package repository (`api/`, `web/`, `jobs/`) with a fake ticket system and its own policy.

**Architecture:** Plain Node ESM (`.mjs`), no dependencies, one root `package.json`. `api/` is a `node:http` API over an
in-memory store; it renders HTML pages with `web/`'s pure page builders. `jobs/` is a nightly digest (a pure function
plus a CLI). `tickets/` is a JSON file and a tiny synchronous store that hard++ M3 wraps in an MCP server. The only
harness piece is CampusHub's own policy, `.github/hooks/policies/repo.json`, in the Lab 05 hard++ policy format.

**Tech Stack:** Node 22+ (tested on 24.19), `node:test`, `node:assert/strict`, `node:http`, `node:util` `parseArgs`.

**Spec:** `docs/superpowers/specs/2026-10-18-agent-harness-workshop-experience-design.md` §5.6 (hard++ M1–M6);
`docs/superpowers/plans/2026-10-19-phase-5-capstone.md` (Global Constraints, wave contracts, Task 10).

## Global Constraints

- Where: `labs/lab-08/hard-plus-plus/src/campushub/` and an identical copy in `labs/lab-08/hard-plus-plus/sol/campushub/`
  (byte for byte; the hard++ task changes `sol/` later). Nothing else in `labs/lab-08/`.
- About 1,500 lines of code and tests (`.mjs` + `deploy.sh`), counted honestly per package. Data and docs are reported
  separately.
- Unfamiliar domain: campus rooms, bookings and events. Not StudyBuddy's grades and deadlines.
- No dependencies, no network beyond `127.0.0.1`, fixed dates (`now` injected), deterministic tests.
  `node --test` from `campushub/` passes in both copies; so does `npm test`.
- `CAMPUSHUB_API_KEY` comes from the environment and is never logged.
- No harness of its own beyond the policy file: no `AGENTS.md`, skills, agents, hook configs, `.mcp.json`.
  Never a `.github/hooks/*.json` (Copilot loads those as hook configs): the policy lives in `.github/hooks/policies/`.
- Ticket text is inert (no instructions to an agent, no hostile content).
- Tests write files only inside the project (a scratch folder they create and remove), never in a temp directory.

## File structure

| Path (under `campushub/`) | Responsibility |
|---|---|
| `package.json` | name `campushub`, private, version `1.3.0`, scripts `test` (globs for every package), `test:api`, `test:web`, `test:jobs`, `test:tickets`, `start`, `digest`, `deploy` (echo only) |
| `README.md` | what it is, packages and owners, how to run, the API routes, the ticket system, releasing, the deploy story |
| `CHANGELOG.md` | 1.2.0, 1.3.0 and an Unreleased section (material for the hard++ release skill) |
| `deploy.sh` | the ops deploy script: only echoes (`--dry-run` prints the plan) |
| `.env.campushub.example` | the variable names (`CAMPUSHUB_API_KEY=`, `PORT=3080`), no values |
| `.gitignore` | `.env.campushub`, `jobs/out/`, `*.tmp`, `.scratch-*/` |
| `.gitattributes` | `*.sh text eol=lf` (so `deploy.sh` runs in bash on a Windows checkout) |
| `.github/hooks/policies/repo.json` | CampusHub's own policy (Lab 05 hard++ format) |
| `api/errors.mjs` | `ApiError(status, code, message, details)` |
| `api/validate.mjs` | input validation for bookings and events, query parsing |
| `api/availability.mjs` | `freeSlots(bookings, date)`: a room's free time between opening and closing (added in the build, see notes) |
| `api/store.mjs` | the in-memory store: rooms, bookings (create, list, cancel, conflicts), events, availability |
| `api/seed.mjs` | `seedData()`: six rooms, six bookings, two events (week of Mon 2 Nov 2026) |
| `api/handlers.mjs` | `createApp({ store, apiKey, now, log })`: routes, auth, JSON and HTML responses |
| `api/server.mjs` | `createServer(app)`, `listen({ app, port, host })`, the main entry (reads the key from the env) |
| `api/*.test.mjs` | `validate`, `store`, `availability`, `handlers`, `server` (the only test that opens a socket: `127.0.0.1:0`) |
| `web/html.mjs` | `escapeHtml`, the `html` tagged template (escapes by default), `raw` |
| `web/format.mjs` | `formatDay`, `formatTime`, `formatRange` (UTC, no `Intl`, so output never depends on ICU) |
| `web/pages.mjs` | `layout`, `roomsPage`, `roomPage`, `boardPage`, `eventsPage`, `errorPage` |
| `web/*.test.mjs` | `html`, `pages` |
| `jobs/digest.mjs` | `buildDigest(data, { date })`, `renderDigest(digest)` |
| `jobs/nightly-digest.mjs` | the CLI: `--dry-run`, `--date`, `--out`, `--data`; `main(argv, io)` exported for tests |
| `jobs/*.test.mjs` | `digest`, `nightly-digest` (injected io, plus one spawn of the real CLI with `--dry-run`) |
| `tickets/tickets.json` | twelve tickets `CH-101` … `CH-112` |
| `tickets/store.mjs` | `readTickets`, `listTickets`, `getTicket`, `updateTicket` (atomic write), `STATUSES`, `TicketError` |
| `tickets/store.test.mjs` | the store, on a scratch copy inside `tickets/` |

Line budget (code + tests): api ≈ 680, web ≈ 300, jobs ≈ 280, tickets ≈ 180, `deploy.sh` ≈ 20: ≈ 1,460.

## Interfaces later work relies on

### The ticket store (`tickets/store.mjs`), for the hard++ MCP server

All functions are synchronous and take the file last (default: `tickets/tickets.json` next to the module).

```js
TICKETS_FILE                       // absolute path of tickets/tickets.json
STATUSES                           // ['open', 'in-progress', 'blocked', 'done', 'closed']
class TicketError extends Error    // .code: 'bad-file' | 'not-found' | 'not-editable'
                                   //        | 'bad-status' | 'bad-assignee' | 'bad-labels'
readTickets(file?)                 // → Ticket[] (file order)
listTickets(filter?, file?)        // filter { status, assignee, label, text } → Ticket[] by id
getTicket(id, file?)               // → Ticket | null (id is case-insensitive)
updateTicket(id, changes, file?)   // changes ⊆ { status, assignee, labels } → the new Ticket
```

`Ticket = { id: 'CH-101', title, status, assignee: string | null, labels: string[], body }`. The file is
`{ "project": "CampusHub", "prefix": "CH", "tickets": [Ticket…] }`; `updateTicket` keeps the other keys and writes a
temporary file next to the target, then renames it over the target (atomic on one volume).

### The API (`api/handlers.mjs`)

`createApp({ store, apiKey, now, log })` returns `{ handle({ method, url, headers, body }) → Promise<{ status, type:
'json' | 'html', body }> }`. JSON routes live under `/api`; writes need the `x-api-key` header.

| Route | Auth | Result |
|---|---|---|
| `GET /api/health` | no | `200 { ok: true }` |
| `GET /api/rooms?building&minCapacity&feature` | no | `200 { rooms }` |
| `GET /api/rooms/:id` | no | `200 { room }` or 404 |
| `GET /api/rooms/:id/availability?date` | no | `200 { roomId, date, slots }`; 400 without a date, 404 unknown room |
| `GET /api/bookings?roomId&date&status` | no | `200 { bookings }` |
| `POST /api/bookings` | yes | `201 { booking }`; 400 invalid, 404 room, 409 conflict, 422 over capacity or in the past |
| `POST /api/bookings/:id/cancel` | yes | `200 { booking }`; 404, 409 already cancelled or started |
| `GET /api/events?from&to` | no | `200 { events }` (upcoming by default) |
| `POST /api/events` | yes | `201 { event }`; 404 booking, 409 cancelled booking or duplicate |
| `GET /`, `/rooms/:id`, `/events`, `/board` | no | HTML pages from `web/` |

No key configured → writes answer 503 `writes-disabled`; a wrong or missing key → 401 `unauthorized`. The log gets one
line per request (`METHOD /path → status`, no query, no headers, no body), so the key can't reach it.

### CampusHub's policy (`.github/hooks/policies/repo.json`), for hard++ M2

Format: Lab 05 hard++ (`version: 1`, `default: "allow"`, rules `{ id, decision, severity, reason, match, override? }`,
match keys `tool`, `command`, `commandLine`, `path`, `text`; regexes are case-insensitive). Every id starts with
`campushub-`, none with `org-`, and none sets `layer`, so `effectivePolicy(org, repo)` accepts it.

| id | decision | what it matches |
|---|---|---|
| `campushub-no-api-key-literal` | deny · critical | a CampusHub key (`chk_live_…`, `chk_test_…`, 24+ characters) in any call's arguments (writes, shell, MCP tools) |
| `campushub-no-api-key-in-shell` | deny · high | a shell command that reads, prints, sets or greps `CAMPUSHUB_API_KEY` (`$CAMPUSHUB_API_KEY`, `${…}`, `$env:…`, `env:…`, `%…%`, `printenv …`, `export/set/setx …`, `CAMPUSHUB_API_KEY=…`, `process.env.CAMPUSHUB_API_KEY`, `GetEnvironmentVariable('CAMPUSHUB_API_KEY')`, `env \| grep campushub`) |
| `campushub-no-env-dump` | deny · high | listing every environment variable (`env`, `printenv`, `set`, `export -p`, `Get-ChildItem Env:`, `dir env:` …) |
| `campushub-no-env-file` | deny · high | any call that touches the path `.env.campushub` (a file tool's path, a shell argument, `--env-file=.env.campushub`); `.env.campushub.example` stays readable |
| `campushub-no-env-file-from-shell` | deny · high | a shell command that names `.env.campushub` anywhere (`node -e "…readFileSync('.env.campushub')"`, `< .env.campushub`) |
| `campushub-no-deploy` | deny · high | `npm run deploy` (any `npm/pnpm/yarn … run[-script] deploy…`, `yarn deploy`), `./deploy.sh`, `bash/sh … deploy.sh` |
| `campushub-allow-deploy-dry-run` | allow · override | exactly `./deploy.sh --dry-run` (or `bash/sh …/deploy.sh --dry-run`): an exception to CampusHub's own deploy deny |
| `campushub-no-ticket-file-edits` | deny · high | a write to `tickets/tickets.json` (tickets change through the ticket tools, where a human approves writes) |
| `campushub-no-ticket-file-edits-from-shell` | deny · high | a shell command that writes, moves or deletes `tickets/tickets.json` |
| `campushub-allow-force-push-preview` | allow · override | `git push --force origin preview` (and `-f`, `--force-with-lease`): the team's wish, which an organisation force-push deny must beat |

The last rule is on purpose: alone, CampusHub's policy allows a force-push of `preview`; merged under an organisation
baseline with a force-push deny (Lab 05 hard++ `org-no-force-push`), the organisation wins. That is hard++ M2's
"organisation denials can't be overridden", testable on the shipped asset.

---

### Task 1: The API package

**Files:** create `api/errors.mjs`, `api/validate.mjs`, `api/store.mjs`, `api/seed.mjs`, `api/handlers.mjs`,
`api/server.mjs`; tests `api/validate.test.mjs`, `api/store.test.mjs`, `api/handlers.test.mjs`, `api/server.test.mjs`.

**Interfaces:**
- Produces `ApiError(status, code, message, details?)`; `validateBooking(body) → { value, errors }`,
  `validateEvent(body) → { value, errors }`, `parseRoomQuery(params)`, `OPEN_FROM = 7`, `OPEN_UNTIL = 22`,
  `MAX_HOURS = 4`, `SLOT_MINUTES = 15`.
- Produces `createStore({ rooms, bookings, events, now })` with `listRooms`, `getRoom`, `listBookings`, `getBooking`,
  `createBooking`, `cancelBooking`, `listEvents`, `createEvent`, and `overlaps(a, b)` (half-open intervals).
- Produces `seedData() → { rooms, bookings, events }` (fresh copies on every call).
- Produces `createApp(...)` (routes above), `createServer(app, { maxBody })`, `listen({ app, port, host }) →
  { server, url, close }`.
- Consumes `web/pages.mjs` (Task 2) for the HTML routes.

- [ ] Step 1: write `validate.test.mjs`: a valid booking passes; missing fields, a bad email, `end <= start`, a start
  that isn't on a 15-minute slot, longer than 4 h, outside 07:00–22:00 UTC, attendees 0 or 501 each give an error
  naming the field; events need `bookingId` and a title of 1–80 characters, at most 5 tags.
- [ ] Step 2: write `store.test.mjs` (now = Mon 2 Nov 2026 08:00 UTC): rooms filter by building, minimum capacity and
  feature; a booking that overlaps a confirmed one is a 409 `conflict` naming the other booking; back-to-back is fine;
  a cancelled booking no longer blocks; over capacity is 422; in the past is 422; ids are `bk-1007`, `bk-1008`… after
  the seed; cancel sets `cancelledAt`, twice is 409, a started booking is 409; events join their booking's room and
  time, show `cancelled` when the booking is, one event per booking.
- [ ] Step 3: write `handlers.test.mjs`: public reads; writes need the key (401 without, 503 when none is configured);
  POST then cancel round trip; HTML routes return escaped pages; unknown routes are 404 (JSON under `/api`, HTML
  elsewhere); the log never contains the key.
- [ ] Step 4: write `server.test.mjs`: `listen({ port: 0 })` on `127.0.0.1`, GET `/api/health`, POST with the key,
  invalid JSON is 400, a body over `maxBody` is 413; close.
- [ ] Step 5: run `node --test api/` → fails (modules missing); implement the six modules; run → pass.

### Task 2: The web package

**Files:** create `web/html.mjs`, `web/format.mjs`, `web/pages.mjs`; tests `web/html.test.mjs`, `web/pages.test.mjs`.

**Interfaces:** produces `escapeHtml(v)`, `` html`…` `` → `SafeHtml` (values escaped, arrays joined, `SafeHtml`
kept), `raw(s)`; `formatDay('2026-11-03T09:00:00Z') === 'Tue 3 Nov'`, `formatTime(…) === '09:00'`,
`formatRange(start, end) === 'Tue 3 Nov, 09:00–11:00'`; `layout({ title, body })`, `roomsPage(rooms, { building })`,
`roomPage(room, bookings, { now, free })`, `boardPage(rooms, bookings, { now })`, `eventsPage(events, { now })`,
`errorPage(status, message)`, all returning strings.

- [ ] Step 1: tests: `<script>` and `"` and `&` in a room name are escaped everywhere; arrays render without commas;
  rooms page lists every room with a link `/rooms/<encoded id>`, a step-free marker, an empty state; room page shows
  upcoming confirmed bookings grouped by day and hides past and cancelled ones; events page sorts by start, marks a
  cancelled event, hides finished events.
- [ ] Step 2: run → fail; implement; run → pass.

### Task 3: The jobs package

**Files:** create `jobs/digest.mjs`, `jobs/nightly-digest.mjs`; tests `jobs/digest.test.mjs`,
`jobs/nightly-digest.test.mjs`.

**Interfaces:** produces `buildDigest({ rooms, bookings, events }, { date }) → { date, totals: { bookings, hours,
cancelled }, schedule, busiest, idle, events, cancellations }`, `renderDigest(digest) → string`; `main(argv, io) →
Promise<exit code>` with `io = { now, stdout, stderr, readFile, writeFile, mkdir }`. Consumes `api/seed.mjs`.

- [ ] Step 1: tests on the seed for Tue 3 Nov 2026: 3 confirmed bookings, 7 room-hours, 1 cancellation, the schedule in
  start order, the busiest room first, idle rooms listed, events of the day; rendering is stable text; an empty day
  says so. CLI: `--dry-run` prints and writes nothing; the default date is tomorrow (UTC) of `now`; without
  `--dry-run` it writes `jobs/out/digest-<date>.txt`; a bad `--date` or an unknown flag exits 2 with the usage;
  `--data` reads a JSON file; one spawn of `node jobs/nightly-digest.mjs --dry-run --date 2026-11-03` exits 0.
- [ ] Step 2: run → fail; implement; run → pass.

### Task 4: The ticket system

**Files:** create `tickets/tickets.json`, `tickets/store.mjs`, `tickets/store.test.mjs`.

**Interfaces:** the ticket store above.

- [ ] Step 1: tests on a scratch copy (`tickets/.scratch-*/tickets.json`, removed after): read returns 12 tickets;
  list filters by status, assignee, label and text (case-insensitive), sorted by id number; get is case-insensitive and
  returns null for an unknown id; update changes status/assignee/labels, keeps the other keys and tickets, leaves no
  `.tmp` file behind; unknown id, a non-editable field (`title`, `id`), a bad status, a bad assignee or labels throw a
  `TicketError` with the right code and leave the file unchanged; a file without a `tickets` list is `bad-file`.
- [ ] Step 2: run → fail; implement; run → pass.

### Task 5: The repository around it, the policy, the copy

**Files:** `package.json`, `README.md`, `CHANGELOG.md`, `deploy.sh`, `.env.campushub.example`, `.gitignore`,
`.gitattributes`, `.github/hooks/policies/repo.json`.

- [ ] Step 1: write them (rules as in the table above).
- [ ] Step 2: validate the policy with the Lab 05 hard++ engine from a scratch script outside the workshop tree (the
  session folder): `validatePolicy(repo)` is `[]`; `effectivePolicy(org, repo)` has no problems; a table of calls
  gives the expected decisions alone and merged (deny/allow, rule, layer), including the force-push case (allowed by
  CampusHub alone, denied by `org-no-force-push` merged) and the false-positive cases (`npm test`, `view
  .env.campushub.example`, `grep` tool for `CAMPUSHUB_API_KEY`, editing `api/server.mjs` with
  `process.env.CAMPUSHUB_API_KEY`, `cat deploy.sh`, `./deploy.sh --dry-run`).
- [ ] Step 3: `node --test` and `npm test` in `campushub/` → all pass; count lines per package.
- [ ] Step 4: copy `src/campushub` to `sol/campushub` byte for byte; `node --test` there; compare hashes of both trees.
- [ ] Step 5: check no forbidden file exists (`AGENTS.md`, `.github/hooks/*.json`, `.github/skills`, `.github/agents`,
  `.mcp.json`) and that nothing else in `labs/lab-08/` changed.

## Self-review

- Spec §5.6 M1 (three packages, ≈1,500 lines, a fake ticket system) → Tasks 1–4. M2 (CampusHub's own rules for API
  secrets and deploy commands; org denials can't be overridden) → Task 5 policy, with the force-push case as a built-in
  test. M3 (nested `AGENTS.md`, ticket MCP server, release skill) → material only: package owners and commands in the
  README, the store API (Task 4), the release process in the README and `CHANGELOG.md`. M4–M6 are the hard++ task's.
- Names: `createStore`, `createApp`, `listen`, `seedData`, `buildDigest`, `renderDigest`, `main`, `readTickets`,
  `listTickets`, `getTicket`, `updateTicket` are used the same way in every task.

## Implementation notes

Built 20 Oct 2026, test-first per package (each new test file was run and seen failing on a missing module or a
missing export before the code was written).

**What changed against the plan.**
- `notFoundPage(message)` became `errorPage(status, message)`: the HTML routes also answer 400 and 500.
- A known path with the wrong method answers 405 `method-not-allowed` (the plan said 404).
- The first build came to 1,318 lines of code and tests, 12% under the target. Instead of padding, two features the
  team would plausibly have: room **availability** (`api/availability.mjs`, `store.availability(roomId, date)`,
  `GET /api/rooms/:id/availability?date=`, and "Free on …" on the room page) and the porters' **board**
  (`boardPage`, `GET /board`: per building, what is on now and next today). CHANGELOG 1.3.0 lists both.
- The policy gained `campushub-no-env-dump` (`env`, `printenv`, `Get-ChildItem Env:` …): the key lives in the
  environment of any machine that runs the API, so listing every variable prints it.

**Line counts** (`Get-Content … | Measure-Object`, CRLF working tree):

| Package | Code | Tests | Total |
|---|---|---|---|
| `api/` | 428 | 326 | 754 |
| `web/` | 137 | 108 | 245 |
| `jobs/` | 135 | 133 | 268 |
| `tickets/` | 87 | 78 | 165 |
| `deploy.sh` | 16 | | 16 |
| **Code + tests** | | | **1,448** |

Data and docs, not counted above: `tickets/tickets.json` 136, `.github/hooks/policies/repo.json` 104, `README.md` 95,
`CHANGELOG.md` 23, `package.json` 19, `.gitignore` 8, `.env.campushub.example` 4, `.gitattributes` 2 (391).

**Results.**
- `node --test` and `npm test` in `src/campushub` and `sol/campushub`: 55 tests, 55 pass, about 0.3 s; five runs in a
  row green; green under `TZ=America/Los_Angeles`, `Asia/Tokyo` and `Pacific/Kiritimati` (TZ is honoured: the local
  time of the same instant changed).
- The two copies are identical: SHA-256 of all 32 files compared.
- Policy replay through the Lab 05 hard++ engine (`files/campushub-policy-replay.mjs` in the session folder):
  `validatePolicy` → no problems, `effectivePolicy(lab-05 org, campushub repo)` → no problems, 68/68 calls decided
  as expected alone and merged (secrets, deploy, ticket file, false-positive guards, and
  `git push --force origin preview`: allowed by CampusHub alone, denied by `org-no-force-push` merged).
- Smoke test of `node api/server.mjs` with `CAMPUSHUB_API_KEY` set and `PORT=0`: health 200, POST with the key 201,
  `/` is HTML, the key appears nowhere in the output (`files/campushub-server-smoke.mjs`).
- `npm run deploy` echoes (cmd and sh); `bash ./deploy.sh [--dry-run]` (Git Bash) only prints its plan.

**Facts learned on the way.**
- Node 24: `node --test web/` treats a folder argument as one file (1 failing "test"); use globs
  (`node --test "web/**/*.test.mjs"`), which is what the package scripts do.
- The create tool writes CRLF on this machine. `deploy.sh` was converted to LF, and `campushub/.gitattributes`
  (`*.sh text eol=lf`) keeps it LF in every checkout (`git check-attr eol -- deploy.sh` → `lf`).
- `sync-seeds --dry-run` does not list Lab 08 yet (Task 8 adds it to the chain): `campushub/` is a new hard++ starter
  folder, identical in `src/` and `sol/`.
