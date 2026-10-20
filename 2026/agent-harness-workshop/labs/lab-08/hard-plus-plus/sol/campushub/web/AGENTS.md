# AGENTS.md - web/

Server-rendered pages: pure functions from the API's data to HTML (`/`, `/rooms/:id`, `/events`, `/board`).
Owner: Student experience team, ioana.dobre. She reviews every change here.

## Commands
- Tests: `npm run test:web` (from the repository root)
- See the pages: `node api/server.mjs`, then open http://127.0.0.1:3080

## Conventions
- Every value goes into a page through the `html` tagged template (`html.mjs`), which escapes it.
- Dates and times go through `format.mjs`: UTC, spelled out by hand, so a page looks the same on every server.
- A page function takes data and returns a string: no I/O, no clock of its own (pass `now` in).

## Boundaries
- Never build HTML by joining strings: a room called "Tom & Jerry's room" broke the rooms page once (CH-111).
- Never use the server's local time or `toLocaleString()`.
- Never fetch data in a page: the API hands it over.
