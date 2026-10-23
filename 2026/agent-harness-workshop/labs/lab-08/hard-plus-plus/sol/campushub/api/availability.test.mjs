import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freeSlots } from './availability.mjs';
import { createStore } from './store.mjs';
import { seedData } from './seed.mjs';

const b = (start, end, status = 'confirmed') => ({ start: `2026-11-03T${start}:00.000Z`, end: `2026-11-03T${end}:00.000Z`, status });
const times = (slots) => slots.map((s) => `${s.start.slice(11, 16)}-${s.end.slice(11, 16)}`);

test('an empty day is free from opening to closing', () => {
  assert.deepEqual(freeSlots([], '2026-11-03'), [{ start: '2026-11-03T07:00:00.000Z', end: '2026-11-03T22:00:00.000Z', minutes: 900 }]);
});

test('bookings cut the day into free ranges; cancelled ones do not count', () => {
  const slots = freeSlots([b('14:00', '16:00'), b('09:00', '11:00'), b('11:00', '12:00'), b('12:00', '13:00', 'cancelled')], '2026-11-03');
  assert.deepEqual(times(slots), ['07:00-09:00', '12:00-14:00', '16:00-22:00']);
  assert.deepEqual(slots.map((s) => s.minutes), [120, 120, 360]);
});

test('bookings at the edges and on other days leave no empty ranges', () => {
  assert.deepEqual(times(freeSlots([b('07:00', '09:00'), b('20:00', '22:00')], '2026-11-03')), ['09:00-20:00']);
  const otherDays = [{ start: '2026-11-02T09:00:00Z', end: '2026-11-02T10:00:00Z', status: 'confirmed' }, { start: '2026-11-04T09:00:00Z', end: '2026-11-04T10:00:00Z', status: 'confirmed' }];
  assert.deepEqual(times(freeSlots(otherDays, '2026-11-03')), ['07:00-22:00']);
});

test('the store answers for one room, and knows unknown rooms', () => {
  const store = createStore({ ...seedData(), now: () => new Date('2026-11-02T08:00:00Z') });
  const a = store.availability('LIB-201', '2026-11-03');
  assert.deepEqual([a.roomId, a.date, times(a.slots)], ['LIB-201', '2026-11-03', ['07:00-09:00', '11:00-22:00']]);
  assert.deepEqual(times(store.availability('LIB-310', '2026-11-03').slots), ['07:00-22:00']);
  assert.throws(() => store.availability('LIB-999', '2026-11-03'), (e) => e.status === 404 && e.code === 'room-not-found');
});
