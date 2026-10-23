// Free time in a room on one day: the opening hours minus the room's confirmed bookings. Ranges are half-open, like
// bookings, and a gap shorter than one slot isn't free time anyone could book.
import { OPEN_FROM, OPEN_UNTIL, SLOT_MINUTES } from './validate.mjs';

const MINUTE = 60 * 1000;

/** The free ranges on `date` (YYYY-MM-DD) around one room's `bookings`: [{ start, end, minutes }]. */
export function freeSlots(bookings, date) {
  const day = Date.parse(`${date}T00:00:00Z`);
  const open = day + OPEN_FROM * 60 * MINUTE;
  const close = day + OPEN_UNTIL * 60 * MINUTE;
  const busy = bookings
    .filter((b) => b.status === 'confirmed')
    .map((b) => [Math.max(open, Date.parse(b.start)), Math.min(close, Date.parse(b.end))])
    .filter(([start, end]) => start < end)
    .sort((a, b) => a[0] - b[0]);
  const free = [];
  let cursor = open;
  for (const [start, end] of busy) {
    if (start - cursor >= SLOT_MINUTES * MINUTE) free.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  if (close - cursor >= SLOT_MINUTES * MINUTE) free.push([cursor, close]);
  return free.map(([start, end]) => ({ start: new Date(start).toISOString(), end: new Date(end).toISOString(), minutes: (end - start) / MINUTE }));
}
