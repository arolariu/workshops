import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, overlaps } from './store.mjs';
import { seedData } from './seed.mjs';

const NOW = new Date('2026-11-02T08:00:00Z');
const fresh = () => createStore({ ...seedData(), now: () => NOW });
const booking = (over = {}) => ({
  roomId: 'LIB-201',
  title: 'Exam revision',
  bookedBy: 'ioana.dobre@campus.example',
  start: '2026-11-03T11:00:00Z',
  end: '2026-11-03T12:00:00Z',
  attendees: 10,
  ...over,
});
const rejects = (fn, status, code) => assert.throws(fn, (e) => e.status === status && e.code === code);

test('intervals are half-open: touching is not overlapping', () => {
  const a = { start: '2026-11-03T09:00:00Z', end: '2026-11-03T10:00:00Z' };
  assert.equal(overlaps(a, { start: '2026-11-03T09:30:00Z', end: '2026-11-03T10:30:00Z' }), true);
  assert.equal(overlaps(a, { start: '2026-11-03T10:00:00Z', end: '2026-11-03T11:00:00Z' }), false);
  assert.equal(overlaps(a, { start: '2026-11-03T08:00:00Z', end: '2026-11-03T12:00:00Z' }), true);
});

test('rooms filter by building, minimum capacity and feature', () => {
  const store = fresh();
  assert.equal(store.listRooms().length, 6);
  assert.deepEqual(store.listRooms({ building: 'library' }).map((r) => r.id), ['LIB-201', 'LIB-310']);
  assert.deepEqual(store.listRooms({ minCapacity: 100 }).map((r) => r.id), ['ENG-101', 'SU-G05']);
  assert.deepEqual(store.listRooms({ feature: 'projector', minCapacity: 20 }).map((r) => r.id), ['ENG-101', 'LIB-201']);
  assert.equal(store.getRoom('nope'), null);
});

test('a new booking gets the next id and is confirmed', () => {
  const store = fresh();
  const b = store.createBooking(booking());
  assert.equal(b.id, 'bk-1007');
  assert.equal(b.status, 'confirmed');
  assert.equal(b.createdAt, NOW.toISOString());
  assert.equal(store.createBooking(booking({ start: '2026-11-04T09:00:00Z', end: '2026-11-04T10:00:00Z' })).id, 'bk-1008');
  assert.equal(store.listBookings({ roomId: 'LIB-201', date: '2026-11-03' }).length, 2);
});

test('an overlapping booking is a conflict that names the other booking', () => {
  const store = fresh();
  assert.throws(() => store.createBooking(booking({ start: '2026-11-03T10:30:00Z', end: '2026-11-03T11:30:00Z' })),
    (e) => e.status === 409 && e.code === 'conflict' && e.details.bookingId === 'bk-1001');
});

test('back-to-back bookings are fine, and a cancelled booking no longer blocks', () => {
  const store = fresh();
  assert.doesNotThrow(() => store.createBooking(booking({ start: '2026-11-03T08:00:00Z', end: '2026-11-03T09:00:00Z' })));
  assert.doesNotThrow(() => store.createBooking(booking({ roomId: 'LIB-310', attendees: 2, start: '2026-11-03T10:00:00Z', end: '2026-11-03T10:30:00Z' })));
});

test('unknown rooms, too many people and the past are rejected', () => {
  const store = fresh();
  rejects(() => store.createBooking(booking({ roomId: 'LIB-999' })), 404, 'room-not-found');
  rejects(() => store.createBooking(booking({ roomId: 'LIB-310', attendees: 7 })), 422, 'over-capacity');
  rejects(() => store.createBooking(booking({ start: '2026-11-02T07:00:00Z', end: '2026-11-02T07:30:00Z' })), 422, 'in-the-past');
  rejects(() => store.createBooking({ ...booking(), end: undefined }), 400, 'invalid');
});

test('cancelling records when, and only works once and before the start', () => {
  const store = fresh();
  const b = store.cancelBooking('bk-1001');
  assert.equal(b.status, 'cancelled');
  assert.equal(b.cancelledAt, NOW.toISOString());
  rejects(() => store.cancelBooking('bk-1001'), 409, 'already-cancelled');
  rejects(() => store.cancelBooking('bk-404'), 404, 'booking-not-found');
  const late = createStore({ ...seedData(), now: () => new Date('2026-11-03T09:15:00Z') });
  rejects(() => late.cancelBooking('bk-1001'), 409, 'already-started');
});

test('bookings filter by status and date', () => {
  const store = fresh();
  assert.deepEqual(store.listBookings({ status: 'cancelled' }).map((b) => b.id), ['bk-1004']);
  assert.deepEqual(store.listBookings({ date: '2026-11-03' }).map((b) => b.id), ['bk-1001', 'bk-1004', 'bk-1002', 'bk-1003']);
});

test('events take their room and time from the booking, and follow its status', () => {
  const store = fresh();
  const [first] = store.listEvents();
  assert.deepEqual([first.id, first.roomId, first.roomName, first.start, first.status],
    ['ev-201', 'ENG-101', 'Engineering lecture hall', '2026-11-03T14:00:00.000Z', 'scheduled']);
  store.cancelBooking('bk-1003');
  assert.equal(store.listEvents().find((e) => e.id === 'ev-202').status, 'cancelled');
  assert.deepEqual(store.listEvents({ to: '2026-11-03T15:00:00Z' }).map((e) => e.id), ['ev-201']);
});

test('one event per confirmed booking', () => {
  const store = fresh();
  const ev = store.createEvent({ bookingId: 'bk-1001', title: 'Open study session', tags: ['study'] });
  assert.equal(ev.id, 'ev-203');
  assert.equal(ev.roomId, 'LIB-201');
  rejects(() => store.createEvent({ bookingId: 'bk-1001', title: 'Again' }), 409, 'duplicate-event');
  rejects(() => store.createEvent({ bookingId: 'bk-1004', title: 'Cancelled' }), 409, 'booking-cancelled');
  rejects(() => store.createEvent({ bookingId: 'bk-404', title: 'Nope' }), 404, 'booking-not-found');
});
