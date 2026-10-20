# AGENTS.md - CampusHub

CampusHub books the university's rooms: an HTTP API, server-rendered pages and a nightly digest for Facilities.
Plain Node.js 22+, ES modules (`.mjs`), no dependencies. Read `README.md` for the API, the tickets and the release.

## Packages
Each package has its own rules, owners and test script: read its `AGENTS.md` before you change it.
- `api/AGENTS.md`: the HTTP API and the in-memory store (Platform team)
- `web/AGENTS.md`: the pages (Student experience team)
- `jobs/AGENTS.md`: the nightly digest (Data team)
- `tickets/`: the tracker export. Use the `tickets` MCP tools (`list_tickets`, `get_ticket`, `close_ticket`).

## Commands
- All tests: `npm test` (`node:test`, 55+ tests, about a second)
- One package: `npm run test:api`, `npm run test:web`, `npm run test:jobs`, `npm run test:tickets`
- The API and pages, read-only, without the key: `node api/server.mjs`
- A digest of the demo week: `npm run digest -- --date 2026-11-03`
- Release scope: `node .github/skills/campushub-release/scope.mjs CH-108`

## Boundaries
- Never print, pass, set or store `CAMPUSHUB_API_KEY`, and never read or load `.env.campushub` (its names are in
  `.env.campushub.example`). Never run `npm start`: it loads the real key.
- Never deploy: `npm run deploy` and `./deploy.sh` are a release approver's. `./deploy.sh --dry-run` is fine.
- Never edit `tickets/tickets.json`: tickets change only through the ticket tools. Closing one needs a human's
  approval (`tickets/approve.mjs`), which you never run or write yourself.
- Never add dependencies, and never change `package.json` without a reviewed pull request.
- The agent harness comes from StudyBuddy's package (`apm.yml`, `apm.lock.yaml`): don't edit installed files
  (`.github/agents/`, `.github/instructions/`, `.github/hooks/`, `.agents/skills/`). Ask the harness owner.

## Definition of done
- `npm test` is green, and new behaviour has a test next to the code (`x.mjs` → `x.test.mjs`).
- The package's own `AGENTS.md` rules are followed.
- Anything you couldn't do because a human must (deploy, approve, rotate a key) is listed at the end of your answer.
