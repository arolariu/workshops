import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardPage, errorPage, eventsPage, roomPage, roomsPage } from './pages.mjs';

const now = new Date('2026-11-02T08:00:00Z');
const library = { id: 'LIB-201', name: 'Library seminar room 2', building: 'Library', capacity: 24, features: ['projector', 'whiteboard'], stepFree: true };
const odd = { id: 'SU-1&2', name: 'Tom & Jerry <script>alert(1)</script>', building: 'Student "Union"', capacity: 12, features: ['screen'], stepFree: false };
const booking = (id, start, end, over = {}) => ({ id, roomId: 'LIB-201', title: `Booking ${id}`, start, end, attendees: 4, status: 'confirmed', ...over });

test('the rooms page lists every room, escaped, with a link and its access', () => {
  const page = roomsPage([library, odd]);
  assert.match(page, /^<!doctype html>/);
  assert.match(page, /<title>Rooms · CampusHub<\/title>/);
  assert.match(page, /<a href="\/rooms\/LIB-201">Library seminar room 2<\/a>/);
  assert.match(page, /<a href="\/rooms\/SU-1%262">Tom &amp; Jerry &lt;script&gt;alert\(1\)&lt;\/script&gt;<\/a>/);
  assert.match(page, /Student &quot;Union&quot;/);
  assert.match(page, /projector, whiteboard/);
  assert.match(page, /Step-free[\s\S]*Stairs only/);
  assert.doesNotMatch(page, /<script>/);
});

test('the rooms page names its filter and has an empty state', () => {
  const page = roomsPage([], { building: 'Arts & Crafts' });
  assert.match(page, /<h1>Rooms in Arts &amp; Crafts<\/h1>/);
  assert.match(page, /No rooms match\./);
});

test('a room page groups its upcoming confirmed bookings by day', () => {
  const page = roomPage(library, [
    booking('b4', '2026-11-04T08:00:00Z', '2026-11-04T09:30:00Z', { title: 'Induction' }),
    booking('b1', '2026-11-03T09:00:00Z', '2026-11-03T11:00:00Z', { title: 'Algorithms <study> group', attendees: 8 }),
    booking('b2', '2026-11-03T10:00:00Z', '2026-11-03T10:30:00Z', { title: 'Thesis check-in', status: 'cancelled' }),
    booking('b3', '2026-11-02T06:00:00Z', '2026-11-02T07:30:00Z', { title: 'Early yoga' }),
  ], { now });
  assert.match(page, /<h1>Library seminar room 2<\/h1>/);
  assert.match(page, /Library · 24 seats · step-free access/);
  assert.match(page, /<h2>Tue 3 Nov<\/h2><ul><li>09:00–11:00 Algorithms &lt;study&gt; group \(8 people\)<\/li><\/ul><h2>Wed 4 Nov<\/h2>/);
  assert.doesNotMatch(page, /Thesis check-in|Early yoga/);
  assert.match(roomPage(odd, [], { now }), /No upcoming bookings\.[\s\S]*<\/main>/);
});

test('a room page shows the free ranges it is given', () => {
  const slot = (start, end) => ({ start: `2026-11-02T${start}:00.000Z`, end: `2026-11-02T${end}:00.000Z` });
  const page = roomPage(library, [], { now, free: { date: '2026-11-02', slots: [slot('07:00', '09:00'), slot('11:00', '22:00')] } });
  assert.match(page, /<h2>Free on Mon 2 Nov<\/h2>\s*<p>07:00–09:00, 11:00–22:00<\/p>/);
  assert.match(roomPage(library, [], { now, free: { date: '2026-11-02', slots: [] } }), /<p>Fully booked\.<\/p>/);
  assert.doesNotMatch(roomPage(library, [], { now }), /Free on/);
});

test('the board shows, per building, what is on now and what is next today', () => {
  const rooms = [library, { ...odd, id: 'SU-112', building: 'Student Union' }, { id: 'ENG-101', name: 'Lecture hall', building: 'Engineering' }];
  const at = (id, roomId, start, end, over = {}) => booking(id, `2026-11-03T${start}:00.000Z`, `2026-11-03T${end}:00.000Z`, { roomId, title: id, ...over });
  const page = boardPage(rooms, [
    at('Lecture', 'ENG-101', '14:00', '16:00'),
    at('Study group', 'LIB-201', '09:00', '11:00'),
    at('Cancelled talk', 'ENG-101', '10:00', '11:00', { status: 'cancelled' }),
    at('Breakfast', 'LIB-201', '07:00', '08:00'),
    booking('Tomorrow', '2026-11-04T09:00:00.000Z', '2026-11-04T10:00:00.000Z', { title: 'Tomorrow' }),
  ], { now: new Date('2026-11-03T09:30:00Z') });
  assert.match(page, /<h1>Today, Tue 3 Nov<\/h1>/);
  assert.match(page, /<h2>Engineering<\/h2>\s*<p>Nothing on now\.<\/p>\s*<p>Next: 14:00–16:00 Lecture \(Lecture hall\)<\/p>/);
  assert.match(page, /<h2>Library<\/h2>\s*<p>Now: 09:00–11:00 Study group \(Library seminar room 2\)<\/p>\s*<p>Nothing else today\.<\/p>/);
  assert.match(page, /<h2>Student Union<\/h2>/);
  assert.doesNotMatch(page, /Cancelled talk|Breakfast|Tomorrow/);
});

test('the events page shows upcoming events in order and marks cancellations', () => {
  const event = (id, start, end, over = {}) => ({ id, title: `Event ${id}`, description: '', tags: [], roomName: 'Student Union hall', start, end, status: 'scheduled', ...over });
  const page = eventsPage([
    event('e2', '2026-11-03T17:00:00Z', '2026-11-03T20:00:00Z', { title: 'Demo night', tags: ['club', 'robotics'], description: 'Pizza & robots' }),
    event('e1', '2026-11-03T14:00:00Z', '2026-11-03T16:00:00Z', { title: 'Guest lecture', status: 'cancelled' }),
    event('e0', '2026-11-01T14:00:00Z', '2026-11-01T16:00:00Z', { title: 'Last week' }),
  ], { now });
  assert.match(page, /<s>Guest lecture<\/s> <strong>Cancelled<\/strong>[\s\S]*<strong>Demo night<\/strong>/);
  assert.match(page, /Tue 3 Nov, 17:00–20:00 · Student Union hall/);
  assert.match(page, /Pizza &amp; robots<br><span class="tag">club<\/span><span class="tag">robotics<\/span>/);
  assert.doesNotMatch(page, /Last week/);
  assert.match(eventsPage([], { now }), /No upcoming events\./);
});

test('error pages say what went wrong, escaped', () => {
  assert.match(errorPage(404, 'There is no room <b>.'), /<h1>Not found<\/h1>\s*<p>There is no room &lt;b&gt;\.<\/p>/);
  assert.match(errorPage(400, 'Bad query'), /<h1>Something is wrong<\/h1>/);
});
