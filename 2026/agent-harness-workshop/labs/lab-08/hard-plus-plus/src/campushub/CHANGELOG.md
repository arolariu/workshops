# Changelog

Every release of CampusHub. Versions follow semantic versioning; each release is tagged `campushub-vX.Y.Z`.

## Unreleased

- jobs: one digest per building, mailed to that building's porters (CH-104, in progress).

## 1.3.0 · 2026-10-14

- api: `GET /api/rooms/:id/availability?date=…` lists a room's free time; the room page shows it.
- api: `GET /api/rooms?feature=…` returns only the rooms with that feature (CH-101).
- api: back-to-back bookings are no longer a conflict: bookings are half-open ranges (CH-102).
- api: bookings longer than 4 hours are rejected (CH-110).
- web: `/board`, the porters' screen: per building, what is on now and what comes next.
- web: cancelled events stay on the events page, struck through and marked Cancelled (CH-103).
- tests: the server test listens on port 0 (CH-112).

## 1.2.0 · 2026-09-08

- api: `POST /api/events` publishes a booking as a public event.
- web: every page builds its HTML with the escaping `html` helper (CH-111).
- jobs: the nightly digest lists cancellations and idle rooms.
