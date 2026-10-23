import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './handlers.mjs';
import { createStore } from './store.mjs';
import { seedData } from './seed.mjs';

const KEY = 'test-key-for-handlers';
const now = () => new Date('2026-11-02T08:00:00Z');
function setup({ apiKey = KEY } = {}) {
  const lines = [];
  const app = createApp({ store: createStore({ ...seedData(), now }), apiKey, now, log: (l) => lines.push(l) });
  return { app, lines };
}
const get = (app, url) => app.handle({ method: 'GET', url, headers: {} });
const post = (app, url, body, key = KEY) => app.handle({ method: 'POST', url, headers: key ? { 'x-api-key': key } : {}, body });
const newBooking = {
  roomId: 'SU-112', title: 'Chess club', bookedBy: 'chess@campus.example',
  start: '2026-11-04T18:00:00Z', end: '2026-11-04T20:00:00Z', attendees: 10,
};

test('reads are public', async () => {
  const { app } = setup();
  assert.deepEqual(await get(app, '/api/health'), { status: 200, type: 'json', body: { ok: true } });
  const rooms = await get(app, '/api/rooms?building=Engineering');
  assert.deepEqual(rooms.body.rooms.map((r) => r.id), ['ENG-101', 'ENG-214']);
  assert.equal((await get(app, '/api/rooms/SU-G05')).body.room.capacity, 200);
  assert.equal((await get(app, '/api/bookings?status=cancelled')).body.bookings.length, 1);
  assert.equal((await get(app, '/api/events')).body.events.length, 2);
});

test('bad queries are 400 with the field', async () => {
  const { app } = setup();
  const r = await get(app, '/api/rooms?minCapacity=-3');
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'invalid');
  assert.equal(r.body.details[0].field, 'minCapacity');
  assert.equal((await get(app, '/api/bookings?status=maybe')).status, 400);
});

test('writes need the API key', async () => {
  const { app } = setup();
  assert.equal((await post(app, '/api/bookings', newBooking, null)).status, 401);
  assert.equal((await post(app, '/api/bookings', newBooking, 'wrong-key')).status, 401);
  const off = setup({ apiKey: '' }).app;
  const r = await post(off, '/api/bookings', newBooking);
  assert.deepEqual([r.status, r.body.error], [503, 'writes-disabled']);
});

test('book, clash, cancel: the round trip', async () => {
  const { app } = setup();
  const created = await post(app, '/api/bookings', newBooking);
  assert.equal(created.status, 201);
  const clash = await post(app, '/api/bookings', { ...newBooking, start: '2026-11-04T19:00:00Z', end: '2026-11-04T21:00:00Z' });
  assert.deepEqual([clash.status, clash.body.error, clash.body.details.bookingId], [409, 'conflict', created.body.booking.id]);
  const cancelled = await post(app, `/api/bookings/${created.body.booking.id}/cancel`, undefined);
  assert.equal(cancelled.body.booking.status, 'cancelled');
  assert.equal((await post(app, '/api/bookings', { ...newBooking, attendees: 'ten' })).status, 400);
});

test('events can be published for a booking', async () => {
  const { app } = setup();
  const r = await post(app, '/api/events', { bookingId: 'bk-1005', title: 'Lab induction', tags: ['safety'] });
  assert.deepEqual([r.status, r.body.event.roomId], [201, 'ENG-214']);
  assert.equal((await post(app, '/api/events', { bookingId: 'bk-1005', title: 'Again' })).status, 409);
});

test('availability needs a date and a known room', async () => {
  const { app } = setup();
  const r = await get(app, '/api/rooms/ENG-101/availability?date=2026-11-03');
  assert.deepEqual(r.body.slots.map((s) => s.minutes), [420, 360]);
  assert.equal((await get(app, '/api/rooms/ENG-101/availability')).body.details[0].field, 'date');
  assert.equal((await get(app, '/api/rooms/ENG-999/availability?date=2026-11-03')).status, 404);
});

test('pages are HTML and escaped', async () => {
  const { app } = setup();
  const home = await get(app, '/');
  assert.deepEqual([home.status, home.type], [200, 'html']);
  assert.match(home.body, /<a href="\/rooms\/LIB-201">Library seminar room 2<\/a>/);
  const room = (await get(app, '/rooms/SU-112')).body;
  assert.match(room, /Debate society committee/);
  assert.match(room, /<h2>Free on Mon 2 Nov<\/h2>\s*<p>07:00–18:00, 19:00–22:00<\/p>/);
  assert.match((await get(app, '/events')).body, /Robotics Club demo night/);
  assert.match((await get(app, '/board')).body, /<h2>Student Union<\/h2>[\s\S]*Next: 18:00–19:00 Debate society committee/);
  const missing = await get(app, '/rooms/%3Cb%3E');
  assert.equal(missing.status, 404);
  assert.match(missing.body, /&lt;b&gt;/);
});

test('unknown routes are 404 (JSON under /api), a wrong method is 405', async () => {
  const { app } = setup();
  const api = await get(app, '/api/nope');
  assert.deepEqual([api.status, api.type, api.body.error], [404, 'json', 'not-found']);
  const pageMissing = await get(app, '/nope');
  assert.deepEqual([pageMissing.status, pageMissing.type], [404, 'html']);
  const wrong = await app.handle({ method: 'DELETE', url: '/api/rooms', headers: {} });
  assert.deepEqual([wrong.status, wrong.body.error], [405, 'method-not-allowed']);
});

test('the log has one line per request and never the key', async () => {
  const { app, lines } = setup();
  await post(app, '/api/bookings', newBooking);
  await get(app, `/api/rooms?key=${KEY}`);
  assert.deepEqual(lines, ['POST /api/bookings → 201', 'GET /api/rooms → 200']);
  assert.ok(lines.every((l) => !l.includes(KEY)));
});
