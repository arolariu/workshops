# CampusHub

CampusHub is how the university books its rooms. Students and staff find a room and book a slot, clubs and
departments publish public events, and every night Facilities get a digest of the next day.

It is one repository with three small packages, plain Node.js 22 or later, ES modules (`.mjs`), no dependencies:

| Package | What it is | Owner |
|---|---|---|
| `api/` | The HTTP API (`node:http`) over an in-memory store of rooms, bookings and events. It also serves the web pages. | Platform team: mara.ionescu, andrei.stan |
| `web/` | Server-rendered pages: pure functions from the API's data to HTML. | Student experience team: ioana.dobre |
| `jobs/` | The nightly digest job for Facilities. | Data team: radu.matei |
| `tickets/` | The export of the team's ticket tracker, and a small store to read and update it. | Everyone |

## Run it

```sh
npm test                     # every package's tests (node:test)
npm run test:api             # one package: test:api, test:web, test:jobs, test:tickets
node api/server.mjs          # API and pages on http://127.0.0.1:3080, read-only
npm start                    # the same with the key from .env.campushub: writes on
npm run digest               # tomorrow's digest, printed, nothing written
npm run digest -- --date 2026-11-03   # a day of the demo week
```

All times are UTC. The buildings are open 07:00-22:00; a booking starts and ends on a 15-minute slot and lasts at
most 4 hours. `api/seed.mjs` holds the demo data: six rooms and the week of Monday 2 November 2026.

## The API

| Route | Key | Answer |
|---|---|---|
| `GET /api/health` | | `{ ok: true }` |
| `GET /api/rooms?building=&minCapacity=&feature=` | | `{ rooms }` |
| `GET /api/rooms/:id` | | `{ room }` or 404 |
| `GET /api/rooms/:id/availability?date=YYYY-MM-DD` | | `{ roomId, date, slots }`: the free time between bookings |
| `GET /api/bookings?roomId=&date=YYYY-MM-DD&status=confirmed\|cancelled` | | `{ bookings }` |
| `POST /api/bookings` | yes | 201 `{ booking }`; 400 invalid, 404 unknown room, 409 conflict, 422 over capacity or in the past |
| `POST /api/bookings/:id/cancel` | yes | `{ booking }`; 409 when already cancelled or started |
| `GET /api/events?from=&to=` | | `{ events }`, upcoming by default |
| `POST /api/events` | yes | 201 `{ event }` for a confirmed booking; one event per booking |
| `GET /`, `/rooms/:id`, `/events`, `/board` | | HTML pages (`/board` is the porters' screen: what is on now and next) |

Writes need the `x-api-key` header. Errors are JSON: `{ error: "<code>", message, details }`.

## Conventions

- **api/**: the store throws `ApiError(status, code, message, details)`; `createApp()` turns it into the answer.
  Validation lives in `validate.mjs`. The request log is one line per request (method, path, status): never the
  query, the headers or the body.
- **web/**: every value goes into a page through the `html` tagged template, which escapes it. Dates and times go
  through `format.mjs` (UTC, spelled out by hand, so a page looks the same on every server).
- **jobs/**: `buildDigest()` is pure; the CLI's `main(argv, io)` takes the clock, console and files as arguments, so
  the tests never touch the real ones. Try a change with `--dry-run` first.
- Tests sit next to the code (`store.mjs` → `store.test.mjs`), use `node:test` and `node:assert/strict`, inject a
  fixed clock and never use the network beyond `127.0.0.1`.

## Secrets

- The API key is `CAMPUSHUB_API_KEY`. The server reads it from the environment, and `npm start` loads it from
  `.env.campushub` (copy `.env.campushub.example`; git ignores the real file). Keys start with `chk_live_`
  (production) or `chk_test_` (staging) and live in the campus secret store.
- Never print the key, pass it on a command line, or put it in a file, a commit or a ticket. The tests use made-up
  keys.

## Tickets

`tickets/tickets.json` is the export of the team's tracker, ids `CH-101` and up. Read and change it only through
`tickets/store.mjs`:

```js
readTickets(file?)                // every ticket, in file order
listTickets({ status, assignee, label, text }, file?)
getTicket('CH-108', file?)        // or null
updateTicket('CH-108', { status, assignee, labels }, file?)
```

A ticket is `{ id, title, status, assignee, labels, body }`. The statuses are `open`, `in-progress`, `blocked`,
`done` and `closed`. Only the status, the assignee and the labels can change; a write replaces the file atomically.

## Releasing

1. Take the release ticket (label `release`, for example CH-108) and check its scope: every ticket in it is `done`.
2. Bump `version` in `package.json` (semver), and move the Unreleased notes in `CHANGELOG.md` under the new version
   with today's date.
3. Run `npm test`: it must be green.
4. Run `./deploy.sh --dry-run` and paste the plan into the release ticket.
5. A release approver (never the author) deploys from the release runner with `npm run deploy`.
6. Tag `campushub-vX.Y.Z`, then close the release ticket and the tickets it shipped.

## Deploying

In production, `npm run deploy` runs `deploy.sh` on the release runner, which copies `api/`, `web/` and `jobs/` to
the campus servers and restarts them. **In this lab copy both only print what they would do**: nothing is deployed,
and nothing leaves your machine.
