import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDigest, renderDigest } from './digest.mjs';
import { seedData } from '../api/seed.mjs';

test('the digest for Tuesday 3 November counts what happens in each room', () => {
  const d = buildDigest(seedData(), { date: '2026-11-03' });
  assert.deepEqual(d.totals, { bookings: 3, hours: 7, attendees: 268, cancelled: 1 });
  assert.deepEqual(d.schedule.map((b) => b.id), ['bk-1001', 'bk-1002', 'bk-1003']);
  assert.deepEqual(d.busiest.map((r) => [r.roomId, r.hours, r.utilisation]), [['SU-G05', 3, 20], ['ENG-101', 2, 13], ['LIB-201', 2, 13]]);
  assert.deepEqual(d.idle, ['ENG-214', 'LIB-310', 'SU-112']);
  assert.deepEqual(d.events.map((e) => [e.id, e.roomId]), [['ev-201', 'ENG-101'], ['ev-202', 'SU-G05']]);
  assert.deepEqual(d.cancellations, [{ id: 'bk-1004', roomId: 'LIB-310', title: 'Thesis check-in' }]);
});

test('the rendered digest is stable plain text', () => {
  const text = renderDigest(buildDigest(seedData(), { date: '2026-11-03' }));
  assert.equal(text, [
    'CampusHub nightly digest for Tue 3 Nov 2026',
    '3 bookings, 7 room-hours, 268 people, 1 cancelled',
    '',
    'Schedule',
    '  09:00-11:00  LIB-201  Algorithms study group (8)',
    '  14:00-16:00  ENG-101  Guest lecture: designing accessible campuses (110)',
    '  17:00-20:00  SU-G05   Robotics Club demo night (150)',
    '',
    'Busiest rooms',
    '  SU-G05   Student Union hall          3 h  20%',
    '  ENG-101  Engineering lecture hall    2 h  13%',
    '  LIB-201  Library seminar room 2      2 h  13%',
    '',
    'Public events',
    '  14:00  Guest lecture: designing accessible campuses (ENG-101)',
    '  17:00  Robotics Club demo night (SU-G05)',
    '',
    'Cancelled',
    '  bk-1004  Thesis check-in (LIB-310)',
    '',
    'Idle rooms: ENG-214, LIB-310, SU-112',
    '',
  ].join('\n'));
});

test('a quiet day says so, and every room is idle', () => {
  const text = renderDigest(buildDigest(seedData(), { date: '2026-11-07' }));
  assert.match(text, /^CampusHub nightly digest for Sat 7 Nov 2026\n0 bookings, 0 room-hours, 0 people, 0 cancelled\n\nNo bookings\.\n/);
  assert.match(text, /Idle rooms: ENG-101, ENG-214, LIB-201, LIB-310, SU-112, SU-G05\n$/);
});

test('half hours, one booking and unknown rooms read well', () => {
  const data = {
    rooms: [],
    bookings: [{ id: 'bk-1', roomId: 'XYZ-1', title: 'Pop-up clinic', start: '2026-11-05T09:00:00Z', end: '2026-11-05T10:30:00Z', attendees: 1, status: 'confirmed' }],
  };
  const d = buildDigest(data, { date: '2026-11-05' });
  assert.deepEqual([d.busiest[0].name, d.busiest[0].hours, d.busiest[0].utilisation], ['XYZ-1', 1.5, 10]);
  assert.match(renderDigest(d), /^CampusHub nightly digest for Thu 5 Nov 2026\n1 booking, 1\.5 room-hours, 1 person, 0 cancelled\n/);
  assert.match(renderDigest(d), /Idle rooms: none\n$/);
});
