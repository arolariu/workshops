# AGENTS.md - api/

The HTTP API (`node:http`) over an in-memory store of rooms, bookings and events; it also serves the pages.
Owners: Platform team, mara.ionescu and andrei.stan. They review every change here.

## Commands
- Tests: `npm run test:api` (from the repository root)
- Run it read-only: `node api/server.mjs` (writes answer 401 without the key)

## Conventions
- The store throws `ApiError(status, code, message, details)`; `createApp()` turns it into the JSON answer.
- Validation lives in `validate.mjs`. Times are UTC, on 15-minute slots, 07:00-22:00, at most 4 hours.
- The request log is one line per request: method, path, status.
- Tests inject a fixed clock and a made-up key (`apiKey: 'test-key-…'`), and use only `127.0.0.1`.

## Boundaries
- Never log the query, the headers or the body: the `x-api-key` header would end up in the log.
- Never weaken the key check on writes, and never read the key anywhere but `server.mjs`.
- Never use a real key format (`chk_live_`, `chk_test_`) in code or tests.
