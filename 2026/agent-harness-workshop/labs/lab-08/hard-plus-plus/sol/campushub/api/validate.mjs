// Input checks for the API. Every validator returns { value, errors }: `value` is the cleaned input and `errors`
// a list of { field, message }, empty when the input is fine. All times are UTC.

export const OPEN_FROM = 7;     // the buildings open at 07:00
export const OPEN_UNTIL = 22;   // and close at 22:00
export const MAX_HOURS = 4;
export const SLOT_MINUTES = 15;
export const MAX_ATTENDEES = 500;

const HOUR = 60 * 60 * 1000;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const text = (v, max) => (typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : null);
const onSlot = (d) => d.getTime() % (SLOT_MINUTES * 60 * 1000) === 0;
const closing = (d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), OPEN_UNTIL);

/** A UTC time like 2026-11-03T09:00:00Z as a Date, or null (no other formats, no impossible dates). */
export function parseInstant(v) {
  if (typeof v !== 'string' || !ISO_UTC.test(v)) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 16) !== v.slice(0, 16) ? null : d;
}

/** Checks a new booking: room, title, who books it, a slot inside opening hours, and the number of people. */
export function validateBooking(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { value: null, errors: [{ field: 'body', message: 'Send a JSON object.' }] };
  const errors = [];
  const bad = (field, message) => errors.push({ field, message });
  const roomId = text(body.roomId, 20);
  if (!roomId) bad('roomId', 'Give the room id, e.g. LIB-201.');
  const title = text(body.title, 80);
  if (!title) bad('title', 'Give a title of 1-80 characters.');
  const bookedBy = typeof body.bookedBy === 'string' && EMAIL.test(body.bookedBy.trim()) ? body.bookedBy.trim().toLowerCase() : null;
  if (!bookedBy) bad('bookedBy', 'Give the email address of the person who books.');
  const start = parseInstant(body.start);
  const end = parseInstant(body.end);
  if (!start) bad('start', 'Give the start as a UTC time, e.g. 2026-11-03T09:00:00Z.');
  else if (!onSlot(start)) bad('start', `Bookings start on a ${SLOT_MINUTES}-minute slot.`);
  else if (start.getUTCHours() < OPEN_FROM) bad('start', `The buildings open at ${OPEN_FROM}:00 UTC.`);
  if (!end) bad('end', 'Give the end as a UTC time, e.g. 2026-11-03T10:00:00Z.');
  else if (start && end <= start) bad('end', 'The end must be after the start.');
  else if (!onSlot(end)) bad('end', `Bookings end on a ${SLOT_MINUTES}-minute slot.`);
  else if (start && end - start > MAX_HOURS * HOUR) bad('end', `A booking lasts at most ${MAX_HOURS} hours.`);
  else if (start && end.getTime() > closing(start)) bad('end', `The buildings close at ${OPEN_UNTIL}:00 UTC.`);
  const attendees = body.attendees;
  if (!Number.isInteger(attendees) || attendees < 1 || attendees > MAX_ATTENDEES) bad('attendees', `Give the number of people, 1-${MAX_ATTENDEES}.`);
  const value = { roomId, title, bookedBy, start: start?.toISOString() ?? null, end: end?.toISOString() ?? null, attendees };
  return { value, errors };
}

/** Checks a new public event: the booking it uses, a title, an optional description and up to five tags. */
export function validateEvent(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { value: null, errors: [{ field: 'body', message: 'Send a JSON object.' }] };
  const errors = [];
  const bookingId = text(body.bookingId, 20);
  if (!bookingId) errors.push({ field: 'bookingId', message: 'Give the booking this event uses, e.g. bk-1002.' });
  const title = text(body.title, 80);
  if (!title) errors.push({ field: 'title', message: 'Give a title of 1-80 characters.' });
  const description = body.description === undefined ? '' : text(body.description, 500);
  if (description === null) errors.push({ field: 'description', message: 'A description has at most 500 characters.' });
  const tags = body.tags ?? [];
  if (!Array.isArray(tags) || tags.length > 5 || !tags.every((t) => text(t, 24))) errors.push({ field: 'tags', message: 'Give at most five tags of 1-24 characters.' });
  return { value: { bookingId, title, description, tags: Array.isArray(tags) ? tags.map((t) => String(t).trim().toLowerCase()) : [] }, errors };
}

/**
 * Reads query parameters by a spec: { name: 'text' | 'count' | 'date' | 'instant' | [allowed values] }.
 * Missing parameters are left out of `value`.
 */
export function parseQuery(params, spec) {
  const value = {};
  const errors = [];
  for (const [name, kind] of Object.entries(spec)) {
    const raw = params.get(name)?.trim();
    if (!raw) continue;
    const n = Number(raw);
    if (kind === 'text') value[name] = raw;
    else if (kind === 'count' && Number.isInteger(n) && n >= 0) value[name] = n;
    else if (kind === 'date' && DATE.test(raw) && parseInstant(`${raw}T00:00Z`)) value[name] = raw;
    else if (kind === 'instant' && parseInstant(raw)) value[name] = parseInstant(raw).toISOString();
    else if (Array.isArray(kind) && kind.includes(raw)) value[name] = raw;
    else errors.push({ field: name, message: `"${raw}" is not a valid ${name}.` });
  }
  return { value, errors };
}

export const parseRoomQuery = (params) => parseQuery(params, { building: 'text', minCapacity: 'count', feature: 'text' });
