import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateBooking, validateEvent, parseRoomQuery } from './validate.mjs';

const good = {
  roomId: 'LIB-201',
  title: 'Algorithms study group',
  bookedBy: 'ana.pop@campus.example',
  start: '2026-11-05T09:00:00Z',
  end: '2026-11-05T10:30:00Z',
  attendees: 8,
};
const fieldsOf = (body) => validateBooking(body).errors.map((e) => e.field);

test('a valid booking passes and is normalised', () => {
  const { value, errors } = validateBooking({ ...good, start: '2026-11-05T09:00Z', title: '  Algorithms study group ' });
  assert.deepEqual(errors, []);
  assert.equal(value.start, '2026-11-05T09:00:00.000Z');
  assert.equal(value.title, 'Algorithms study group');
});

test('a missing body or missing fields name every field', () => {
  assert.deepEqual(fieldsOf(undefined), ['body']);
  assert.deepEqual(fieldsOf({}), ['roomId', 'title', 'bookedBy', 'start', 'end', 'attendees']);
});

test('bad values are rejected with the field that is wrong', () => {
  assert.deepEqual(fieldsOf({ ...good, bookedBy: 'ana.pop' }), ['bookedBy']);
  assert.deepEqual(fieldsOf({ ...good, start: '5 Nov, 9am' }), ['start']);
  assert.deepEqual(fieldsOf({ ...good, end: '2026-11-05T09:00:00Z' }), ['end']);
  assert.deepEqual(fieldsOf({ ...good, start: '2026-11-05T09:10:00Z' }), ['start']);
  assert.deepEqual(fieldsOf({ ...good, end: '2026-11-05T13:15:00Z' }), ['end']);
  assert.deepEqual(fieldsOf({ ...good, start: '2026-11-05T06:30:00Z' }), ['start']);
  assert.deepEqual(fieldsOf({ ...good, start: '2026-11-05T21:00:00Z', end: '2026-11-05T22:30:00Z' }), ['end']);
  assert.deepEqual(fieldsOf({ ...good, attendees: 0 }), ['attendees']);
  assert.deepEqual(fieldsOf({ ...good, attendees: 501 }), ['attendees']);
  assert.deepEqual(fieldsOf({ ...good, attendees: 2.5 }), ['attendees']);
  assert.deepEqual(fieldsOf({ ...good, title: 'x'.repeat(81) }), ['title']);
});

test('events need a booking and a short title, and at most five tags', () => {
  assert.deepEqual(validateEvent({ bookingId: 'bk-1002', title: 'Talk' }).errors, []);
  const fields = (body) => validateEvent(body).errors.map((e) => e.field);
  assert.deepEqual(fields({}), ['bookingId', 'title']);
  assert.deepEqual(fields({ bookingId: 'bk-1', title: 'Talk', tags: ['a', 'b', 'c', 'd', 'e', 'f'] }), ['tags']);
  assert.deepEqual(fields({ bookingId: 'bk-1', title: 'Talk', description: 'x'.repeat(501) }), ['description']);
  assert.deepEqual(validateEvent({ bookingId: 'bk-1', title: 'Talk' }).value.tags, []);
});

test('room queries are parsed, and a bad capacity is an error', () => {
  const q = parseRoomQuery(new URLSearchParams('building=Library&minCapacity=20&feature=projector'));
  assert.deepEqual(q.value, { building: 'Library', minCapacity: 20, feature: 'projector' });
  assert.deepEqual(parseRoomQuery(new URLSearchParams('minCapacity=lots')).errors.map((e) => e.field), ['minCapacity']);
  assert.deepEqual(parseRoomQuery(new URLSearchParams('')).value, {});
});
